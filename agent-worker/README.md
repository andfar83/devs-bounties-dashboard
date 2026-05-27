# AA Bounties Agent Worker

This worker is the remote body for Atlas, Prism, Forge, and Sentinel. Vercel remains the dashboard/orchestrator. The worker runs heavier jobs: official source fetches, repo probes, Semgrep, Slither, Foundry, evidence writing, and optional remote open-weight brain calls.

## Endpoints

- `GET /health`: worker health and brain provider summary.
- `GET /tools`: installed tool preflight.
- `POST /jobs/analyze`: create an analysis job. Requires `x-worker-key` when `WORKER_API_KEY` is set.
- `POST /jobs/run-next`: process the next queued Supabase job. Requires `x-worker-key` when `WORKER_API_KEY` is set.

## Required Server Env

```txt
PORT=8080
WORKER_API_KEY=<strong shared secret>
WORKER_POLL_ENABLED=true
SUPABASE_URL=<project url>
SUPABASE_SERVICE_ROLE_KEY=<service role key, server only>
SUPABASE_TARGET_USER_ID=<dashboard owner auth user id>
WORKER_STORAGE_BUCKET=bounty-artifacts
```

## Optional Remote Open-Weight Brain

```txt
AGENT_BRAIN_ENABLED=true
AGENT_BRAIN_PROVIDER=together
AGENT_BRAIN_BASE_URL=https://api.together.xyz/v1
AGENT_BRAIN_API_KEY=<provider key>
AGENT_MODEL_SCOUT=Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8
AGENT_MODEL_FEASIBILITY=deepseek-ai/DeepSeek-V3.1
AGENT_MODEL_BUILDER=Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8
AGENT_MODEL_OPS=deepseek-ai/DeepSeek-V3.1
```

## Local Docker Test

From repo root:

```powershell
docker build -f .\agent-worker\Dockerfile -t aa-bounties-agent-worker .
docker run --rm -p 8080:8080 --env-file .\agent-worker\.env aa-bounties-agent-worker
```

Then:

```powershell
curl http://localhost:8080/health
curl http://localhost:8080/tools
```

## Supabase Schema

Apply `agent-worker/sql/agent-worker-schema.sql` before using the worker. It creates:

- `public.agent_worker_jobs`
- `public.tool_runs`

Both tables use RLS for authenticated dashboard users. The worker uses `SUPABASE_SERVICE_ROLE_KEY` server-side only.

## Safety

The worker does not mark a bounty as solved. It writes evidence and blockers. Sentinel/manual review must still confirm a real issue, reproducible PoC, impact, scope, and responsible disclosure requirements before submission.
