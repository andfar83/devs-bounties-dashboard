create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  latest_comment text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.user_profiles to authenticated;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);

create table if not exists public.user_comments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  comment text not null check (char_length(comment) <= 600),
  created_at timestamptz not null default now()
);

alter table public.user_comments enable row level security;

grant select, insert on public.user_comments to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "user_comments_select_own" on public.user_comments;
create policy "user_comments_select_own"
on public.user_comments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_comments_insert_own" on public.user_comments;
create policy "user_comments_insert_own"
on public.user_comments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create schema if not exists private;

create or replace function private.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  initial_comment text;
begin
  initial_comment := left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'initial_comment', '')), ''), 600);

  insert into public.user_profiles (id, email, latest_comment, created_at, last_login_at)
  values (new.id, new.email, initial_comment, now(), now())
  on conflict (id) do update
  set
    email = excluded.email,
    latest_comment = coalesce(excluded.latest_comment, public.user_profiles.latest_comment),
    last_login_at = now();

  if initial_comment is not null then
    insert into public.user_comments (user_id, email, comment)
    values (new.id, new.email, initial_comment);
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user_profile();
