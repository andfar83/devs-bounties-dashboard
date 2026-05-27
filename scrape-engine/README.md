# Scrape Engine Preflight

This folder is the safe bridge between real scrape adapters and the deployed dashboard.

The dashboard should stay in `shadow_real` while adapters are being connected. In that mode, candidates are written to Supabase and shown in the Candidate Review Queue, but downstream execution still requires operator review.

## Safety Defaults

- `SCRAPE_DRY_RUN=true` by default.
- `SCRAPE_ENGINE_MODE=shadow_real` by default.
- `live_real` is blocked unless `ALLOW_LIVE_REAL=true`.
- `manual_fixture` writes are blocked unless `ALLOW_MANUAL_FIXTURE_WRITE=true`.
- Files from `fixtures/` are blocked from writes unless `ALLOW_FIXTURE_INPUT_WRITE=true`.
- Supabase writes use `user_id,dedupe_key` upsert conflict handling.
- Repeated scrape runs are idempotent: existing candidates update in place and do not duplicate quality gates, decisions, cooperation events, or agent events.
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
$env:ALLOW_MANUAL_FIXTURE_WRITE='true'
$env:ALLOW_FIXTURE_INPUT_WRITE='true'
node .\run-once.mjs
```

Then open the dashboard, switch `Engine Mode` to `Shadow Real`, and the Candidate Review Queue should load the records from Supabase.

For production adapter tests, do not enable `ALLOW_MANUAL_FIXTURE_WRITE`. Set `SCRAPE_SOURCE_KEY` to the real adapter key and point `SCRAPE_INPUT_FILE` or the adapter bridge to real normalized scraper output.

## Real Adapter Bridge

The first production bridge is file-based on purpose: your scraper writes JSON, JSONL, or an object with a `candidates`, `items`, `results`, `data`, or `bounties` array, then this runner validates and ingests it.

```powershell
$env:SCRAPE_DRY_RUN='true'
$env:SCRAPE_ADAPTER='file'
$env:SCRAPE_SOURCE_KEY='real_scraper_v1'
$env:SCRAPE_INPUT_FILE='C:\path\to\scraper-output.json'
node .\run-once.mjs
```

If the dry run looks correct, write in `shadow_real`:

```powershell
$env:SCRAPE_DRY_RUN='false'
$env:SCRAPE_SOURCE_KEY='real_scraper_v1'
$env:SCRAPE_INPUT_FILE='C:\path\to\scraper-output.json'
node .\run-once.mjs
```

Expected candidate fields:

- `id` or `externalId`
- `title`
- `site` or `platform`
- `siteUrl` or `source_url`
- `type` or `bounty_type`
- `price` or `payout_usd`
- `dueDate` or `deadline_utc`
- `description`
- `scope` or `scope_statement`
- `fixRequired` or `fix_required`
- `scores`
- `confidence`

## Built-in Web Adapter

For the first real scrape pass, the engine can read configured public web sources. The current source file includes Immunefi's public bug bounty directory.

Dry run:

```powershell
$env:SCRAPE_DRY_RUN='true'
$env:SCRAPE_ADAPTER='web'
$env:SCRAPE_SOURCE_KEY='immunefi_web'
$env:SCRAPE_INPUT_FILE='.\sources\bounty-sources.json'
node .\run-once.mjs
```

Shadow write:

```powershell
$env:SCRAPE_DRY_RUN='false'
$env:SCRAPE_ADAPTER='web'
$env:SCRAPE_SOURCE_KEY='immunefi_web'
$env:SCRAPE_INPUT_FILE='.\sources\bounty-sources.json'
node .\run-once.mjs
```

The web adapter only extracts fields it can support from the public page. Missing payout/deadline values remain explicit (`0`/empty) and are flagged with red flags for operator verification.

Deadline-based sources are filtered before they can enter Supabase. A candidate must be open, have at least 14 days before its deadline, and be no more than 30 days old when a start/listing date can be inferred. Closed, completed, ended, overdue, or near-deadline contests are skipped. Ongoing live programs are allowed only when the source policy explicitly allows ongoing programs, and the package records whether the source published a fixed expiration date or only a live/open status.

Atlas now scrapes a broader official pool before selecting review candidates. Fast collects about 24 raw candidates, Deep about 32, and Full about 48, then ranks and interleaves the best 10 across sources so the queue is not dominated by one portal.

## Agent Tools, Brain, Memory, and Reasoning

The agents now have a project-level tool layer:

- Eyes: official source fetcher, public URL evidence capture, repo probe.
- Hands: external command runner for Git, Semgrep, Slither, Foundry, Node tests, and future tools.
- Brain: provider-configurable gateway for local Ollama or remote OpenAI-compatible open-weight APIs.
- Memory: local package memory/evidence writer for later Supabase sync.
- Reasoning: deterministic quality gates, decision contracts, and evidence-first policies.

Preflight the toolbelt:

```powershell
node .\tools-preflight.mjs --doctor
```

From the repo root, PowerShell may block `npm.ps1`. Use either direct Node scripts or `npm.cmd`:

```powershell
npm.cmd run tools:doctor
npm.cmd run brain:preflight
```

Missing external tools do not crash the dashboard. They are reported as `missing`, and the app must not mark a package
evidence-ready if the required analysis tool for that bounty type did not run.

## Open-Source Agent Brain Adapter

The production dashboard can use a free/open-source brain through an Ollama-compatible endpoint. This keeps bounty data away from paid third-party model APIs by default.

Recommended local/self-hosted setup:

```powershell
# Example local models. Adjust model sizes to your machine.
ollama pull qwen2.5:7b
ollama pull qwen2.5-coder:7b
ollama pull qwen2.5-coder:14b

$env:AGENT_BRAIN_ENABLED="true"
$env:AGENT_BRAIN_BASE_URL="http://127.0.0.1:11434"
$env:AGENT_MODEL_SCOUT="qwen2.5-coder:7b"
$env:AGENT_MODEL_FEASIBILITY="qwen2.5:7b"
$env:AGENT_MODEL_BUILDER="qwen2.5-coder:14b"
$env:AGENT_MODEL_OPS="qwen2.5:7b"

node .\brain-preflight.mjs
```

Remote open-weight setup example:

```powershell
$env:AGENT_BRAIN_ENABLED="true"
$env:AGENT_BRAIN_PROVIDER="together"
$env:AGENT_BRAIN_BASE_URL="https://api.together.xyz/v1"
$env:AGENT_BRAIN_API_KEY="<server-side-key>"
$env:AGENT_MODEL_SCOUT="Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8"
$env:AGENT_MODEL_FEASIBILITY="deepseek-ai/DeepSeek-V3.1"
$env:AGENT_MODEL_BUILDER="Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8"
$env:AGENT_MODEL_OPS="deepseek-ai/DeepSeek-V3.1"
node .\brain-preflight.mjs
```

Supported provider presets:

- `ollama`: local or self-hosted Ollama, `/api/generate`.
- `together`: `https://api.together.xyz/v1`.
- `fireworks`: `https://api.fireworks.ai/inference/v1`.
- `groq`: `https://api.groq.com/openai/v1`.
- `openrouter`: `https://openrouter.ai/api/v1`.
- `openai_compatible`: any compatible `/chat/completions` endpoint.

Important deployment note: Vercel cannot call `127.0.0.1` on your computer. For deployed production, use a remote HTTPS brain endpoint and set `AGENT_BRAIN_PROVIDER`, `AGENT_BRAIN_BASE_URL`, `AGENT_BRAIN_API_KEY`, and the per-agent model IDs in Vercel. If no endpoint is configured, the adapter stays disabled and the app keeps using deterministic safety gates instead of inventing agent output.

Every web run stores public source labels and source URLs only. It does not write private local file paths to Supabase metadata.

## Vercel API Bridge

The deployed dashboard calls `POST /api/scrape-run` when `Shadow Real` or `Live Real` starts a cadence cycle. The endpoint:

- Requires a valid Supabase session token from the signed-in dashboard user.
- Verifies the session user matches `SUPABASE_TARGET_USER_ID`.
- Runs this scrape engine server-side with the service role key.
- Writes candidates, intake rows, gates, decisions, events, source state, and scrape run records to Supabase.
- Keeps `SUPABASE_SERVICE_ROLE_KEY` off the browser.

Required Vercel Production env vars:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_TARGET_USER_ID
SCRAPE_ADAPTER=web
SCRAPE_SOURCE_KEY=immunefi_web
SCRAPE_INPUT_FILE=./scrape-engine/sources/bounty-sources.json
```

If the source JSON is not bundled by the deployment, the web adapter falls back to the built-in `immunefi_web` source so 
Shadow Real keeps running instead of failing with a missing-file error.

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

The reset clears app runtime tables such as candidates, scrape runs, intake queue, agent decisions, quality gates, failures, cooperation events, work packages, artifacts metadata, source state, and agent memory. It does not delete `auth.users`, `user_profiles`, `user_comments`, table definitions, policies, or the `bounty-artifacts` bucket.
By default it preserves `agent_knowledge`, because those 4 rows are factory knowledge packs for Atlas, Prism, Forge, and Sentinel. To wipe them too, use:

```powershell
node .\reset-supabase-factory.mjs --confirm --include-knowledge
```

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
