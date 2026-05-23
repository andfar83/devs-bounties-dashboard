# Scrape Engine Preflight

This folder is the safe bridge between real scrape adapters and the deployed dashboard.

The dashboard should stay in `shadow_real` while adapters are being connected. In that mode, candidates are written to Supabase and shown in the Candidate Review Queue, but downstream execution still requires operator review.

## Safety Defaults

- `SCRAPE_DRY_RUN=true` by default.
- `SCRAPE_ENGINE_MODE=shadow_real` by default.
- `live_real` is blocked unless `ALLOW_LIVE_REAL=true`.
- Supabase writes use `user_id,dedupe_key` upsert conflict handling.
- Source health is tracked in `public.scrape_source_state`.
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
C:\Users\andre\APPS\AA-STUDIO\BOUNTY_WORK_PACKAGES\bounty-<id>\
```

The scrape engine writes metadata and events. The dashboard/operator decides when a work package folder is created.
