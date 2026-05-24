create table if not exists public.bounty_candidates (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  local_id text not null,
  external_id text,
  dedupe_key text not null,
  title text not null,
  platform text not null,
  source_url text,
  bounty_type text,
  stage text not null default 'discovered' check (stage in ('discovered', 'shortlisted', 'submitted', 'won', 'paid')),
  payout_usd numeric(12, 2) not null default 0 check (payout_usd >= 0),
  deadline_utc timestamptz,
  retrieved_at timestamptz not null default now(),
  description text,
  scope_statement text,
  fix_required text,
  scores jsonb not null default '{}'::jsonb,
  red_flags jsonb not null default '[]'::jsonb,
  next_action text not null default 'evaluate_now',
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table if not exists public.scrape_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  source_key text,
  app_mode text not null default 'simulation' check (app_mode in ('simulation', 'shadow_real', 'live_real')),
  mode text not null check (mode in ('fast', 'deep', 'full')),
  status text not null check (status in ('queued', 'running', 'done', 'retry', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_count integer not null default 0 check (source_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  bounty_local_id text,
  agent_id text not null check (agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration')),
  action text not null,
  from_stage text,
  to_stage text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.work_packages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  bounty_local_id text not null,
  stage text not null check (stage in ('discovered', 'shortlisted', 'submitted', 'won', 'paid')),
  local_folder_path text,
  storage_bucket text not null default 'bounty-artifacts',
  status text not null default 'prepared' check (status in ('prepared', 'tracked', 'uploaded', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bounty_local_id)
);

create table if not exists public.work_artifacts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  bounty_local_id text not null,
  artifact_type text not null,
  relative_path text not null,
  storage_bucket text not null default 'bounty-artifacts',
  storage_path text,
  checksum_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, bounty_local_id, relative_path)
);

create table if not exists public.submission_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  bounty_local_id text not null,
  status text not null default 'draft',
  confirmation_id text,
  submitted_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bounty_candidates_user_stage_idx on public.bounty_candidates (user_id, stage);
create index if not exists bounty_candidates_deadline_idx on public.bounty_candidates (deadline_utc);
create index if not exists bounty_candidates_user_platform_external_idx
on public.bounty_candidates (user_id, platform, external_id)
where external_id is not null;
create index if not exists bounty_candidates_user_source_url_idx
on public.bounty_candidates (user_id, source_url)
where source_url is not null;
create index if not exists scrape_runs_user_started_idx on public.scrape_runs (user_id, started_at desc);
create index if not exists scrape_runs_user_app_mode_idx on public.scrape_runs (user_id, app_mode, started_at desc);
create index if not exists agent_events_bounty_idx on public.agent_events (user_id, bounty_local_id, created_at desc);
create index if not exists work_packages_user_bounty_idx on public.work_packages (user_id, bounty_local_id);
create index if not exists work_artifacts_user_bounty_idx on public.work_artifacts (user_id, bounty_local_id);

alter table public.scrape_runs
add column if not exists source_key text,
add column if not exists app_mode text not null default 'simulation';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scrape_runs_app_mode_check'
      and conrelid = 'public.scrape_runs'::regclass
  ) then
    alter table public.scrape_runs
    add constraint scrape_runs_app_mode_check
    check (app_mode in ('simulation', 'shadow_real', 'live_real'));
  end if;
end;
$$;

create table if not exists public.scrape_source_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  source_key text not null,
  status text not null default 'enabled' check (status in ('enabled', 'paused', 'rate_limited', 'circuit_open')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  next_allowed_at timestamptz,
  consecutive_errors integer not null default 0 check (consecutive_errors >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, source_key)
);

create table if not exists public.agent_knowledge (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  agent_id text not null check (agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration', 'system')),
  knowledge_key text not null,
  version text not null,
  status text not null default 'active' check (status in ('active', 'retired', 'draft')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agent_id, knowledge_key, version)
);

create table if not exists public.agent_memory (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  agent_id text not null check (agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration', 'system')),
  memory_key text not null,
  memory_type text not null default 'lesson' check (memory_type in ('lesson', 'preference', 'platform_reputation', 'failure_pattern', 'successful_strategy', 'operator_note')),
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agent_id, memory_key)
);

create table if not exists public.agent_decisions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  bounty_local_id text,
  agent_id text not null check (agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration', 'system')),
  decision text not null,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  score numeric(8, 2),
  from_stage text,
  to_stage text,
  gate_status text not null default 'not_run' check (gate_status in ('not_run', 'passed', 'warning', 'blocked')),
  rationale text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.quality_gate_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  bounty_local_id text,
  agent_id text not null check (agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration', 'system')),
  stage text not null check (stage in ('discovered', 'shortlisted', 'submitted', 'won', 'paid')),
  status text not null check (status in ('passed', 'warning', 'blocked')),
  critical_failures integer not null default 0 check (critical_failures >= 0),
  checks jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.failure_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  bounty_local_id text,
  agent_id text not null check (agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration', 'system')),
  failure_type text not null check (failure_type in ('source_failure', 'quality_gate_failure', 'package_failure', 'sync_failure', 'submission_failure', 'unknown')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  message text not null,
  recovery_action text,
  status text not null default 'open' check (status in ('open', 'retrying', 'resolved', 'ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.agent_cooperation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  bounty_local_id text,
  from_agent_id text not null check (from_agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration', 'system')),
  to_agent_id text not null check (to_agent_id in ('scout', 'feasibility', 'builder', 'ops', 'integration', 'system')),
  trigger text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'accepted', 'blocked', 'done')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create table if not exists public.scrape_intake_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version text not null,
  source_key text not null,
  app_mode text not null default 'shadow_real' check (app_mode in ('simulation', 'shadow_real', 'live_real')),
  external_id text,
  dedupe_key text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  quality_gate_status text not null default 'not_run' check (quality_gate_status in ('not_run', 'passed', 'warning', 'blocked')),
  status text not null default 'queued' check (status in ('queued', 'accepted', 'rejected', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (user_id, dedupe_key)
);

create index if not exists scrape_source_state_next_allowed_idx
on public.scrape_source_state (user_id, status, next_allowed_at);
create index if not exists agent_knowledge_user_agent_idx on public.agent_knowledge (user_id, agent_id, status);
create index if not exists agent_memory_user_agent_type_idx on public.agent_memory (user_id, agent_id, memory_type);
create index if not exists agent_decisions_user_bounty_idx on public.agent_decisions (user_id, bounty_local_id, created_at desc);
create index if not exists quality_gate_results_user_bounty_idx on public.quality_gate_results (user_id, bounty_local_id, created_at desc);
create index if not exists failure_events_user_status_idx on public.failure_events (user_id, status, severity, created_at desc);
create index if not exists agent_cooperation_events_user_bounty_idx on public.agent_cooperation_events (user_id, bounty_local_id, created_at desc);
create index if not exists scrape_intake_queue_user_status_idx on public.scrape_intake_queue (user_id, status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists bounty_candidates_set_updated_at on public.bounty_candidates;
create trigger bounty_candidates_set_updated_at
before update on public.bounty_candidates
for each row execute function public.set_updated_at();

drop trigger if exists work_packages_set_updated_at on public.work_packages;
create trigger work_packages_set_updated_at
before update on public.work_packages
for each row execute function public.set_updated_at();

drop trigger if exists submission_logs_set_updated_at on public.submission_logs;
create trigger submission_logs_set_updated_at
before update on public.submission_logs
for each row execute function public.set_updated_at();

drop trigger if exists scrape_source_state_set_updated_at on public.scrape_source_state;
create trigger scrape_source_state_set_updated_at
before update on public.scrape_source_state
for each row execute function public.set_updated_at();

drop trigger if exists agent_knowledge_set_updated_at on public.agent_knowledge;
create trigger agent_knowledge_set_updated_at
before update on public.agent_knowledge
for each row execute function public.set_updated_at();

drop trigger if exists agent_memory_set_updated_at on public.agent_memory;
create trigger agent_memory_set_updated_at
before update on public.agent_memory
for each row execute function public.set_updated_at();

alter table public.bounty_candidates enable row level security;
alter table public.scrape_runs enable row level security;
alter table public.agent_events enable row level security;
alter table public.work_packages enable row level security;
alter table public.work_artifacts enable row level security;
alter table public.submission_logs enable row level security;
alter table public.scrape_source_state enable row level security;
alter table public.agent_knowledge enable row level security;
alter table public.agent_memory enable row level security;
alter table public.agent_decisions enable row level security;
alter table public.quality_gate_results enable row level security;
alter table public.failure_events enable row level security;
alter table public.agent_cooperation_events enable row level security;
alter table public.scrape_intake_queue enable row level security;

grant usage on schema public to authenticated;
revoke all on public.bounty_candidates from authenticated;
revoke all on public.scrape_runs from authenticated;
revoke all on public.agent_events from authenticated;
revoke all on public.work_packages from authenticated;
revoke all on public.work_artifacts from authenticated;
revoke all on public.submission_logs from authenticated;
revoke all on public.scrape_source_state from authenticated;
revoke all on public.agent_knowledge from authenticated;
revoke all on public.agent_memory from authenticated;
revoke all on public.agent_decisions from authenticated;
revoke all on public.quality_gate_results from authenticated;
revoke all on public.failure_events from authenticated;
revoke all on public.agent_cooperation_events from authenticated;
revoke all on public.scrape_intake_queue from authenticated;
grant select, insert, update on public.bounty_candidates to authenticated;
grant select, insert, update on public.scrape_runs to authenticated;
grant select, insert on public.agent_events to authenticated;
grant select, insert, update on public.work_packages to authenticated;
grant select, insert, update on public.work_artifacts to authenticated;
grant select, insert, update on public.submission_logs to authenticated;
grant select, insert, update on public.scrape_source_state to authenticated;
grant select, insert, update on public.agent_knowledge to authenticated;
grant select, insert, update on public.agent_memory to authenticated;
grant select, insert on public.agent_decisions to authenticated;
grant select, insert on public.quality_gate_results to authenticated;
grant select, insert, update on public.failure_events to authenticated;
grant select, insert, update on public.agent_cooperation_events to authenticated;
grant select, insert, update on public.scrape_intake_queue to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "bounty_candidates_select_own" on public.bounty_candidates;
create policy "bounty_candidates_select_own" on public.bounty_candidates
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "bounty_candidates_insert_own" on public.bounty_candidates;
create policy "bounty_candidates_insert_own" on public.bounty_candidates
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "bounty_candidates_update_own" on public.bounty_candidates;
create policy "bounty_candidates_update_own" on public.bounty_candidates
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "scrape_runs_select_own" on public.scrape_runs;
create policy "scrape_runs_select_own" on public.scrape_runs
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "scrape_runs_insert_own" on public.scrape_runs;
create policy "scrape_runs_insert_own" on public.scrape_runs
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "scrape_runs_update_own" on public.scrape_runs;
create policy "scrape_runs_update_own" on public.scrape_runs
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "agent_events_select_own" on public.agent_events;
create policy "agent_events_select_own" on public.agent_events
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "agent_events_insert_own" on public.agent_events;
create policy "agent_events_insert_own" on public.agent_events
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "work_packages_select_own" on public.work_packages;
create policy "work_packages_select_own" on public.work_packages
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "work_packages_insert_own" on public.work_packages;
create policy "work_packages_insert_own" on public.work_packages
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "work_packages_update_own" on public.work_packages;
create policy "work_packages_update_own" on public.work_packages
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "work_artifacts_select_own" on public.work_artifacts;
create policy "work_artifacts_select_own" on public.work_artifacts
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "work_artifacts_insert_own" on public.work_artifacts;
create policy "work_artifacts_insert_own" on public.work_artifacts
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "work_artifacts_update_own" on public.work_artifacts;
create policy "work_artifacts_update_own" on public.work_artifacts
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "submission_logs_select_own" on public.submission_logs;
create policy "submission_logs_select_own" on public.submission_logs
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "submission_logs_insert_own" on public.submission_logs;
create policy "submission_logs_insert_own" on public.submission_logs
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "submission_logs_update_own" on public.submission_logs;
create policy "submission_logs_update_own" on public.submission_logs
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "scrape_source_state_select_own" on public.scrape_source_state;
create policy "scrape_source_state_select_own" on public.scrape_source_state
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "scrape_source_state_insert_own" on public.scrape_source_state;
create policy "scrape_source_state_insert_own" on public.scrape_source_state
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "scrape_source_state_update_own" on public.scrape_source_state;
create policy "scrape_source_state_update_own" on public.scrape_source_state
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "agent_knowledge_select_own" on public.agent_knowledge;
create policy "agent_knowledge_select_own" on public.agent_knowledge
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "agent_knowledge_insert_own" on public.agent_knowledge;
create policy "agent_knowledge_insert_own" on public.agent_knowledge
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "agent_knowledge_update_own" on public.agent_knowledge;
create policy "agent_knowledge_update_own" on public.agent_knowledge
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "agent_memory_select_own" on public.agent_memory;
create policy "agent_memory_select_own" on public.agent_memory
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "agent_memory_insert_own" on public.agent_memory;
create policy "agent_memory_insert_own" on public.agent_memory
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "agent_memory_update_own" on public.agent_memory;
create policy "agent_memory_update_own" on public.agent_memory
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "agent_decisions_select_own" on public.agent_decisions;
create policy "agent_decisions_select_own" on public.agent_decisions
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "agent_decisions_insert_own" on public.agent_decisions;
create policy "agent_decisions_insert_own" on public.agent_decisions
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "quality_gate_results_select_own" on public.quality_gate_results;
create policy "quality_gate_results_select_own" on public.quality_gate_results
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "quality_gate_results_insert_own" on public.quality_gate_results;
create policy "quality_gate_results_insert_own" on public.quality_gate_results
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "failure_events_select_own" on public.failure_events;
create policy "failure_events_select_own" on public.failure_events
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "failure_events_insert_own" on public.failure_events;
create policy "failure_events_insert_own" on public.failure_events
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "failure_events_update_own" on public.failure_events;
create policy "failure_events_update_own" on public.failure_events
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "agent_cooperation_events_select_own" on public.agent_cooperation_events;
create policy "agent_cooperation_events_select_own" on public.agent_cooperation_events
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "agent_cooperation_events_insert_own" on public.agent_cooperation_events;
create policy "agent_cooperation_events_insert_own" on public.agent_cooperation_events
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "agent_cooperation_events_update_own" on public.agent_cooperation_events;
create policy "agent_cooperation_events_update_own" on public.agent_cooperation_events
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "scrape_intake_queue_select_own" on public.scrape_intake_queue;
create policy "scrape_intake_queue_select_own" on public.scrape_intake_queue
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "scrape_intake_queue_insert_own" on public.scrape_intake_queue;
create policy "scrape_intake_queue_insert_own" on public.scrape_intake_queue
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "scrape_intake_queue_update_own" on public.scrape_intake_queue;
create policy "scrape_intake_queue_update_own" on public.scrape_intake_queue
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('bounty-artifacts', 'bounty-artifacts', false)
on conflict (id) do nothing;

drop policy if exists "bounty_artifacts_select_own" on storage.objects;
create policy "bounty_artifacts_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'bounty-artifacts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "bounty_artifacts_insert_own" on storage.objects;
create policy "bounty_artifacts_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'bounty-artifacts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "bounty_artifacts_update_own" on storage.objects;
create policy "bounty_artifacts_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'bounty-artifacts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'bounty-artifacts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
