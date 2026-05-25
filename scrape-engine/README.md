# Scrape Engine Preflight

This folder is the safe bridge between real scrape adapters and the deployed dashboard.

The dashboard should stay in `shadow_real` while adapters are being connected. In that mode, candidates are written to Supabase and shown in the Candidate Review Queue, but downstream execution still requires operator review.

## Safety Defaults

- `SCRAPE_DRY_RUN=true` by default.
- `SCRAPE_ENGINE_MODE=shadow_real` by default.
- `live_real` is blocked unless `ALLOW_LIVE_REAL=true`.
- Supabase writes use `user_id,dedupe_key` upsert conflict handling.
- Source health is tracked in `public.scrape_source_state`.
- Every incoming candidate now passes through the real scrape intake adapter before it becomes a dashboard candidate.
- Intake writes quality gate results, agent decisions, and cooperation events before downstream stages can act.
- Secrets stay server-side only. Never put `SUPABASE_SERVICE_ROLE_KEY` in dashboard frontend code.

## Setup

Create a local env file from the template:

```powershell
Copy-Item .env.example .env.local
```

Fill:

```txt
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_TARGET_USER_ID=
```

`SUPABASE_TARGET_USER_ID` is the Auth user id that owns the dashboard rows.

## Dry Run

```powershell
node .\run-once.mjs
```

This validates normalization and prints the rows that would be written.

## Shadow Real Write

```powershell
$env:SCRAPE_DRY_RUN='false'
node .\run-once.mjs
```

Then open the dashboard, switch `Engine Mode` to `Shadow Real`, and the Candidate Review Queue should load the records from Supabase.

## Folder Output

Local project folders are still created by the browser after the operator connects:

```txt
<private-operator-archive>\bounty-<id>\
```

The scrape engine writes metadata and events. The dashboard/operator decides when a work package folder is created.

## Supabase Factory Reset Before Production Intake

Use this only when you want to clear test/simulation/fixture runtime data for the configured `SUPABASE_TARGET_USER_ID` while keeping schema, Auth users, profiles, RLS policies, grants, and buckets intact.

Preview what would be cleared:

```powershell
node .\reset-supabase-factory.mjs
```

Create a local backup in `output/` and delete runtime rows:

```powershell
node .\reset-supabase-factory.mjs --confirm
```

The reset clears app runtime tables such as candidates, scrape runs, intake queue, agent decisions, quality gates, failures, cooperation events, work packages, artifacts metadata, source state, agent knowledge, and agent memory. It does not delete `auth.users`, `user_profiles`, `user_comments`, table definitions, policies, or the `bounty-artifacts` bucket.

## Pre-Scraper Intelligence Layer

The runner and dashboard share these preflight concepts:

- `agent_knowledge`: seeded knowledge packs for Scout, Feasibility, Builder, and Ops.
- `agent_memory`: durable lessons, platform reputation, preferences, failure patterns, and successful strategies.
- `agent_decisions`: every agent decision with confidence, score, rationale, and gate status.
- `quality_gate_results`: stage-specific pass/warn/block checks.
- `failure_events`: retry/circuit-breaker and manual-review recovery trail.
- `agent_cooperation_events`: handoffs between agents.
- `scrape_intake_queue`: raw and normalized scrape payloads before candidate acceptance.

Candidates with critical quality gate failures stay in the intake queue as rejected/blocked instead of entering the active bounty pipeline.
