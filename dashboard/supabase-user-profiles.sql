create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  latest_comment text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

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
