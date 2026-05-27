create table if not exists public.agent_worker_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null default '2026-05-26.worker.v1',
  bounty_local_id text not null,
  job_type text not null default 'analyze_bounty' check (job_type in ('analyze_bounty', 'verify_package', 'refresh_evidence')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'blocked', 'failed', 'cancelled')),
  priority integer not null default 50 check (priority >= 0 and priority <= 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 2 check (max_attempts >= 1),
  locked_by text,
  locked_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.tool_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null default '2026-05-26.worker.v1',
  job_id bigint references public.agent_worker_jobs (id) on delete set null,
  bounty_local_id text not null,
  agent_id text not null check (agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration', 'system')),
  tool_id text not null,
  status text not null check (status in ('queued', 'running', 'ok', 'blocked', 'failed', 'missing', 'skipped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  command text,
  exit_code integer,
  stdout_excerpt text,
  stderr_excerpt text,
  artifact_paths jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_worker_jobs_user_status_idx
on public.agent_worker_jobs (user_id, status, priority desc, created_at asc);

create index if not exists agent_worker_jobs_bounty_idx
on public.agent_worker_jobs (user_id, bounty_local_id, created_at desc);

create index if not exists tool_runs_user_bounty_idx
on public.tool_runs (user_id, bounty_local_id, created_at desc);

create index if not exists tool_runs_job_idx
on public.tool_runs (job_id, created_at desc);

drop trigger if exists agent_worker_jobs_set_updated_at on public.agent_worker_jobs;
create trigger agent_worker_jobs_set_updated_at
before update on public.agent_worker_jobs
for each row execute function public.set_updated_at();

alter table public.agent_worker_jobs enable row level security;
alter table public.tool_runs enable row level security;

revoke all on public.agent_worker_jobs from authenticated;
revoke all on public.tool_runs from authenticated;
grant select, insert, update on public.agent_worker_jobs to authenticated;
grant select, insert on public.tool_runs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "agent_worker_jobs_select_own" on public.agent_worker_jobs;
create policy "agent_worker_jobs_select_own" on public.agent_worker_jobs
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "agent_worker_jobs_insert_own" on public.agent_worker_jobs;
create policy "agent_worker_jobs_insert_own" on public.agent_worker_jobs
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "agent_worker_jobs_update_own" on public.agent_worker_jobs;
create policy "agent_worker_jobs_update_own" on public.agent_worker_jobs
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "tool_runs_select_own" on public.tool_runs;
create policy "tool_runs_select_own" on public.tool_runs
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "tool_runs_insert_own" on public.tool_runs;
create policy "tool_runs_insert_own" on public.tool_runs
for insert to authenticated with check ((select auth.uid()) = user_id);
