import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { agentEventRow, APP_MODES, normalizeCandidate, scrapeRunRow } from "./lib/contracts.mjs";

const DEFAULT_ENV_FILE = ".env.local";

async function loadEnvFile(path = DEFAULT_ENV_FILE) {
  if (!existsSync(path)) {
    return;
  }

  const text = await readFile(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = rest.join("=").trim();
    }
  }
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function boolEnv(name, fallback = false) {
  const value = env(name, fallback ? "true" : "false").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function requireEnv(name) {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function rest(path, { method = "GET", body, prefer = "" } = {}) {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
  if (prefer) {
    headers.Prefer = prefer;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
  }
  return payload;
}

async function getSourceState({ userId, sourceKey }) {
  const rows = await rest(
    `scrape_source_state?user_id=eq.${encodeURIComponent(userId)}&source_key=eq.${encodeURIComponent(sourceKey)}&select=*`
  );
  return rows?.[0] || null;
}

function assertSourceAllowed(sourceState, { maxConsecutiveErrors }) {
  if (!sourceState) {
    return;
  }
  if (sourceState.status === "paused" || sourceState.status === "circuit_open") {
    throw new Error(`Source ${sourceState.source_key} is ${sourceState.status}.`);
  }
  if (sourceState.next_allowed_at && new Date(sourceState.next_allowed_at) > new Date()) {
    throw new Error(`Source ${sourceState.source_key} is rate limited until ${sourceState.next_allowed_at}.`);
  }
  if (sourceState.consecutive_errors >= maxConsecutiveErrors) {
    throw new Error(`Source ${sourceState.source_key} reached ${sourceState.consecutive_errors} consecutive errors.`);
  }
}

async function updateSourceState({ userId, sourceKey, status, errorMessage = "" }) {
  const isError = Boolean(errorMessage);
  const nextAllowedAt = isError ? new Date(Date.now() + Number(env("SCRAPE_CIRCUIT_COOLDOWN_MINUTES", "30")) * 60000).toISOString() : null;
  await rest("scrape_source_state?on_conflict=user_id,source_key", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      user_id: userId,
      source_key: sourceKey,
      status,
      last_success_at: isError ? null : new Date().toISOString(),
      last_error_at: isError ? new Date().toISOString() : null,
      next_allowed_at: nextAllowedAt,
      consecutive_errors: isError ? 1 : 0,
      metadata: {
        last_error: errorMessage || null
      }
    }
  });
}

async function main() {
  await loadEnvFile(env("SCRAPE_ENV_FILE", DEFAULT_ENV_FILE));

  const appMode = env("SCRAPE_ENGINE_MODE", "shadow_real");
  const sourceKey = env("SCRAPE_SOURCE_KEY", "manual_fixture");
  const userId = requireEnv("SUPABASE_TARGET_USER_ID");
  const dryRun = boolEnv("SCRAPE_DRY_RUN", true);
  const mode = env("SCRAPE_MODE", "fast");
  const inputFile = resolve(env("SCRAPE_INPUT_FILE", "./fixtures/sample-candidates.json"));
  const maxCandidates = Number(env("SCRAPE_MAX_CANDIDATES", "25"));
  const maxConsecutiveErrors = Number(env("SCRAPE_MAX_CONSECUTIVE_ERRORS", "3"));

  if (!APP_MODES.has(appMode)) {
    throw new Error(`Invalid SCRAPE_ENGINE_MODE: ${appMode}`);
  }
  if (appMode === "live_real" && !boolEnv("ALLOW_LIVE_REAL", false)) {
    throw new Error("live_real is blocked until ALLOW_LIVE_REAL=true is set explicitly.");
  }

  if (!dryRun) {
    const sourceState = await getSourceState({ userId, sourceKey });
    assertSourceAllowed(sourceState, { maxConsecutiveErrors });
  }

  const rawCandidates = JSON.parse(await readFile(inputFile, "utf8"));
  const candidates = rawCandidates.slice(0, maxCandidates).map((candidate) =>
    normalizeCandidate(candidate, { userId, appMode, sourceKey })
  );

  if (dryRun) {
    console.log(JSON.stringify({ dryRun, appMode, sourceKey, count: candidates.length, candidates }, null, 2));
    return;
  }

  const startedAt = new Date().toISOString();
  try {
    await rest("bounty_candidates?on_conflict=user_id,dedupe_key", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: candidates
    });
    await rest("scrape_runs", {
      method: "POST",
      body: scrapeRunRow({
        userId,
        appMode,
        sourceKey,
        mode,
        status: "done",
        counts: {
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          source_count: candidates.length,
          created_count: candidates.length,
          updated_count: 0,
          rejected_count: 0,
          metadata: { runner: "scrape-engine/run-once.mjs" }
        }
      })
    });
    await rest("agent_events", {
      method: "POST",
      body: candidates.map((candidate) =>
        agentEventRow({
          userId,
          appMode,
          sourceKey,
          bountyLocalId: candidate.local_id,
          action: "candidate_discovered",
          reason: "Scrape engine preflight ingestion"
        })
      )
    });
    await updateSourceState({ userId, sourceKey, status: "enabled" });
    console.log(JSON.stringify({ ok: true, dryRun, appMode, sourceKey, inserted: candidates.length }, null, 2));
  } catch (error) {
    await updateSourceState({ userId, sourceKey, status: "circuit_open", errorMessage: error.message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
