# Bounties Dashboard Documentation

## What This App Is

Bounties Dashboard is an authenticated operations dashboard for managing a bounty pipeline from discovery to payout.

The app coordinates four agent roles:

- `Atlas` / Scout: finds and ranks bounty opportunities.
- `Prism` / Feasibility: decides whether an opportunity is worth pursuing.
- `Forge` / Builder: prepares the execution and solution package.
- `Sentinel` / Ops: tracks submission, evidence, deadlines, and payout closure.

The dashboard currently runs with a live simulator and is prepared for a real scrape engine through `simulation`, `shadow_real`, and `live_real` modes.

## Who Can Use It

The app is protected by Supabase email/password authentication.

Intended users:

- The bounty operator or founder who controls which opportunities move forward.
- Builders or agents reviewing active work packages.
- Ops users responsible for submission, evidence, and payout tracking.
- Future automation workers that write scrape results and agent events into Supabase.

Users must have an account in the Supabase project `DEV-BOUNTIES`.

## What It Is For

The dashboard exists to avoid working blindly on bounty opportunities.

It helps answer:

- What opportunities have been discovered?
- Which ones are worth evaluating?
- Which ones already have work packages?
- What did the agents do, and when?
- What needs operator approval before automation proceeds?
- Which submissions are won, paid, or still open?
- Are local copies and Supabase metadata staying in sync?

## Current Deployment

Production URL:

```txt
https://aa-bounties-dashboard.vercel.app
```

Supabase project:

```txt
DEV-BOUNTIES
Project ref: mwniqoxghjquriybjdjs
```

## Authentication

The app uses Supabase Auth with email/password.

Implemented behavior:

- Sign in with email and password.
- Create account from the auth gate.
- Required comment on signup.
- Email confirmation support if enabled in Supabase.
- Resend confirmation email.
- Sign out from the dashboard header.
- User profile chip in the header with avatar/image fallback and email.

Auth profile storage:

- `public.user_profiles`
- `public.user_comments`

SQL setup file:

```txt
dashboard/supabase-user-profiles.sql
```

## Main Views

### Agent Cards

Shows the four current agent roles.

Each card includes:

- Queue count.
- Completed count.
- Reliability score.
- Runtime state: `Off`, `Standby`, or `Working`.
- Hover tooltip with role functions and face asset.

### Flow View

Shows pipeline throughput:

- Scout / discovered.
- Feasibility / shortlisted.
- Builder / submitted.
- Ops / won.

It also shows Scout cadence and next scheduled scrape.

### Control Tower

This is the main operating control surface before connecting the real scrape engine.

Implemented controls:

- `Simulation`: current simulated pipeline.
- `Shadow Real`: intended for real scrape ingestion without automatic downstream movement.
- `Live Real`: intended for future live automation after shadow mode is proven.
- `Start Engine`: the single launch/stop control for whichever mode is selected.
- Cadence buttons: required pre-start selection for Fast Poll, Deep Scan, or Full Refresh.
- `Project Archive`: connects the local work-package folder before Shadow/Live runs.
- `Kill Switch`: stops the active engine loop and scrape engine state immediately.

Changing modes arms behavior only. It does not run a scrape by itself.
Shadow Real and Live Real require a connected project archive before the engine starts.
The engine also requires an explicit cadence selection before it starts.

Health tiles show:

- Last scrape run.
- Created count.
- Updated count.
- Rejected count.
- Review queue size.
- Package coverage.
- Sync errors.
- Engine on/off state.

### Candidate Review Queue

Shows discovered candidates that still need an operator decision.

Implemented actions:

- `Reject`: marks the candidate as discarded.
- `Monitor`: keeps the candidate visible as monitored.
- `Evaluate`: moves the candidate to `shortlisted`.
- `Package`: prepares a work package without necessarily approving downstream work.

This view is important for `shadow_real`: real scrape results should land here first.

### Work Package Center

Shows bounties that have a package signal.

A bounty appears here when:

- It reaches `shortlisted` or later.
- A package is manually requested.
- A local folder package is created.

Columns:

- ID.
- Stage.
- Local folder status.
- Supabase sync status.
- Artifact count.
- Last event.
- Next action.

### Funding Funnel

Shows the pipeline stages:

- `discovered`
- `shortlisted`
- `submitted`
- `won`
- `paid`

Each stage expands into a detail table with:

- Source site.
- Bounty title.
- Type.
- Price.
- Won status.
- Overdue status.
- Due date.

Selecting a row opens a disclosure panel.

### Active Jobs

Shows current simulated agent jobs with:

- Job title.
- Agent owner.
- State.
- ETA.
- Expected value.

The agent filter can isolate jobs by owner.

### Solved Bounties

Tracks won bounties and local folder archival status:

- `pending`
- `tracked`
- `failed`

### Audit Trail

Records in-session operator and agent events.

Examples:

- Mode changed.
- Candidate rejected.
- Candidate monitored.
- Candidate approved.
- Package requested.
- Stage promoted.
- Kill switch used.

This is currently an in-browser session trail. Agent events are also written to Supabase when the user is authenticated.

## Work Package Storage

The dashboard supports local work package creation through `Connect Track Folder`.

Because a deployed browser app cannot write to an arbitrary local folder without user permission, the user selects a folder manually.

Recommended local archive root:

```txt
C:\Users\andre\APPS\AA-STUDIO\BOUNTY_WORK_PACKAGES
```

This folder already exists on the operator machine and contains a local `README.md`.
When the operator clicks `Connect Track Folder`, they should select this exact folder.

Package folder format:

```txt
bounty-<id>/
  challenge/
    source.json
    rules.md
    retrieved-page.html
    screenshots/
  feasibility/
    feasibility_report.md
    effort_estimate.json
    risk_register.json
  solution/
    README.md
    REPRO.md
    RESULTS.md
    patch.diff
    artifacts/
  ops/
    submission-checklist.md
    submission_log.md
    post_submit_plan.md
    submission_packet/
```

Current package generation writes 13 files.

The files include placeholders where the real scrape engine or Builder agent should later add source captures, benchmarks, patches, reproduction commands, and final submission evidence.

## Supabase Workflow Tables

The workflow schema is defined in:

```txt
dashboard/supabase-bounty-workflow.sql
```

Implemented tables:

- `public.bounty_candidates`
- `public.scrape_runs`
- `public.agent_events`
- `public.work_packages`
- `public.work_artifacts`
- `public.submission_logs`

Storage bucket:

```txt
bounty-artifacts
```

Security:

- RLS enabled on all workflow tables.
- Authenticated users can access only their own rows.
- Storage policies restrict objects to paths beginning with the authenticated user ID.
- Table grants are restricted to the minimum needed operations.

## Data Contracts

Contracts live in:

```txt
dashboard/config.js
dashboard/contracts.js
```

Defined constants:

- App modes.
- Agent IDs.
- Bounty stages.
- Scrape modes.
- Run statuses.
- Artifact types.
- Storage bucket names.
- Local package paths.
- Supabase config.

Contract builders:

- Bounty candidate rows.
- Scrape run rows.
- Agent event rows.
- Work package rows.
- Work artifact rows.
- Local work package files.

## Current Operating Modes

### Simulation

Current default mode.

The app generates simulated bounty records and moves them through the funnel.

### Shadow Real

Prepared but not yet connected to a real scrape backend.

Expected behavior for the next phase:

- Real scraper writes candidates into Supabase.
- Candidates appear in the review queue.
- No automatic downstream execution happens without operator approval.

Implemented preflight behavior:

- `shadow_real` reads candidate rows from Supabase instead of generating simulated rows.
- The candidate review queue remains the manual gate before evaluation/package work.
- Scrape source health, rate-limit, and circuit-breaker state is stored in `public.scrape_source_state`.
- The local `scrape-engine/` runner is dry-run by default and blocks `live_real` unless explicitly approved.

### Live Real

Prepared as a future mode.

This should only be used after Shadow Real has proven:

- Deduplication works.
- Source evidence is reliable.
- Rate limiting is safe.
- Audit trail is clear.
- Kill switch behavior is verified.

## What Is Implemented Now

- Supabase auth gate.
- User profile chip in dashboard header.
- Live simulation loop.
- Scout cadence scheduler.
- Manual cadence triggers.
- Agent cards and runtime indicators.
- Flow view.
- Funding funnel.
- Candidate disclosure.
- Report generation and Excel download.
- Local track folder connection.
- Full local work package generation.
- Solved bounties tracking.
- Control Tower.
- Mode switch.
- Health panel.
- Kill switch.
- Candidate review actions.
- Work Package Center.
- Audit Trail.
- Supabase workflow schema.
- RLS and Storage bucket.
- Shadow Real Supabase ingestion.
- Scrape engine dry-run/preflight runner.
- Source health/circuit-breaker table.
- Production Vercel deployment.

## What Is Not Connected Yet

The real scrape engine is not connected yet.

Still pending:

- Backend scrape worker.
- Platform-specific scraping adapters.
- Real source capture.
- Deduplication against real external IDs.
- Rate limit/backoff/circuit breaker runtime.
- Supabase Storage uploads for heavy artifacts.
- Persistent audit replay from Supabase on page reload.

## Recommended Next Step

Connect the first real scrape adapter in `shadow_real` mode.

The first adapter should:

- Pull a small controlled batch.
- Write to `bounty_candidates`.
- Write a `scrape_runs` row.
- Store source URL and retrieval timestamp.
- Avoid automatic downstream stage promotion.
- Let the operator approve candidates in the review queue.

This keeps the system useful and safe while real data starts flowing.
