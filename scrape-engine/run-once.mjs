import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { pathToFileURL } from "node:url";

import {
  agentDecisionRow,
  agentEventRow,
  APP_MODES,
  cooperationEventRow,
  normalizeCandidate,
  qualityGateResultRow,
  scrapeIntakeQueueRow,
  scrapeRunRow
} from "./lib/contracts.mjs";
import {
  assertInputWriteAllowed,
  assertSourceWriteAllowed,
  loadAdapterCandidates,
  MANUAL_FIXTURE_SOURCE_KEY
} from "./lib/input-adapter.mjs";

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

function publicInputFileLabel(inputFile) {
  if (!inputFile) {
    return "";
  }
  const relativePath = relative(process.cwd(), inputFile).replace(/\\/g, "/");
  if (relativePath && !relativePath.startsWith("..") && !/^[a-zA-Z]:/.test(relativePath)) {
    return relativePath;
  }
  return String(inputFile).split(/[\\/]/).pop();
}

async function getSourceState({ userId, sourceKey }) {
  const rows = await rest(
    `scrape_source_state?user_id=eq.${encodeURIComponent(userId)}&source_key=eq.${encodeURIComponent(sourceKey)}&select=*`
  );
  return rows?.[0] || null;
}

async function getExistingCandidateDedupeKeys({ userId }) {
  const rows = await rest(`bounty_candidates?user_id=eq.${encodeURIComponent(userId)}&select=dedupe_key`);
  return new Set((rows || []).map((row) => row.dedupe_key).filter(Boolean));
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

async function updateSourceState({ userId, sourceKey, status, errorMessage = "", previousState = null }) {
  const isError = Boolean(errorMessage);
  const consecutiveErrors = isError ? Number(previousState?.consecutive_errors || 0) + 1 : 0;
  const nextAllowedAt = isError ? new Date(Date.now() + Number(env("SCRAPE_CIRCUIT_COOLDOWN_MINUTES", "30")) * 60000).toISOString() : null;
  await rest("scrape_source_state?on_conflict=user_id,source_key", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      user_id: userId,
      source_key: sourceKey,
      status,
      last_success_at: isError ? previousState?.last_success_at || null : new Date().toISOString(),
      last_error_at: isError ? new Date().toISOString() : null,
      next_allowed_at: nextAllowedAt,
      consecutive_errors: consecutiveErrors,
      metadata: {
        last_error: errorMessage || null
      }
    }
  });
}

export async function runOnce({ print = true } = {}) {
  await loadEnvFile(env("SCRAPE_ENV_FILE", DEFAULT_ENV_FILE));

  const appMode = env("SCRAPE_ENGINE_MODE", "shadow_real");
  const sourceKey = env("SCRAPE_SOURCE_KEY", MANUAL_FIXTURE_SOURCE_KEY);
  const userId = requireEnv("SUPABASE_TARGET_USER_ID");
  const dryRun = boolEnv("SCRAPE_DRY_RUN", true);
  const mode = env("SCRAPE_MODE", "fast");
  const adapter = env("SCRAPE_ADAPTER", "file");
  const inputFile = env("SCRAPE_INPUT_FILE", "./fixtures/sample-candidates.json");
  const maxCandidates = Number(env("SCRAPE_MAX_CANDIDATES", "25"));
  const maxConsecutiveErrors = Number(env("SCRAPE_MAX_CONSECUTIVE_ERRORS", "3"));

  if (!APP_MODES.has(appMode)) {
    throw new Error(`Invalid SCRAPE_ENGINE_MODE: ${appMode}`);
  }
  if (appMode === "live_real" && !boolEnv("ALLOW_LIVE_REAL", false)) {
    throw new Error("live_real is blocked until ALLOW_LIVE_REAL=true is set explicitly.");
  }
  assertSourceWriteAllowed({
    sourceKey,
    dryRun,
    allowManualFixtureWrite: boolEnv("ALLOW_MANUAL_FIXTURE_WRITE", false)
  });
  assertInputWriteAllowed({
    inputFile,
    dryRun,
    allowFixtureInputWrite: boolEnv("ALLOW_FIXTURE_INPUT_WRITE", false)
  });

  let sourceState = null;
  if (!dryRun) {
    sourceState = await getSourceState({ userId, sourceKey });
    assertSourceAllowed(sourceState, { maxConsecutiveErrors });
  }

  const adapterResult = await loadAdapterCandidates({ adapter, inputFile, maxCandidates });
  const inputFileLabel = publicInputFileLabel(adapterResult.inputFile);
  const rawCandidates = adapterResult.candidates;
  const candidates = rawCandidates.map((candidate) => normalizeCandidate(candidate, { userId, appMode, sourceKey }));
  const acceptedCandidates = candidates.filter((candidate) => candidate.metadata?.quality_gate?.passed !== false);
  const rejectedCandidates = candidates.filter((candidate) => candidate.metadata?.quality_gate?.passed === false);
  const existingDedupeKeys = dryRun ? new Set() : await getExistingCandidateDedupeKeys({ userId });
  const newAcceptedCandidates = acceptedCandidates.filter((candidate) => !existingDedupeKeys.has(candidate.dedupe_key));
  const updatedAcceptedCandidates = acceptedCandidates.filter((candidate) => existingDedupeKeys.has(candidate.dedupe_key));
  const intakeRows = rawCandidates.map((rawCandidate, index) =>
    scrapeIntakeQueueRow({ userId, appMode, sourceKey, rawCandidate, normalizedCandidate: candidates[index] })
  );
  const gateRows = newAcceptedCandidates.map((candidate) => qualityGateResultRow({ userId, normalizedCandidate: candidate })).filter(Boolean);
  const decisionRows = newAcceptedCandidates.map((candidate) => agentDecisionRow({ userId, normalizedCandidate: candidate })).filter(Boolean);
  const cooperationRows = newAcceptedCandidates.map((candidate) => cooperationEventRow({ userId, normalizedCandidate: candidate }));

  if (dryRun) {
    const result = {
      dryRun,
      appMode,
      sourceKey,
      adapter: adapterResult.adapter,
      inputFile: inputFileLabel,
      sourceResults: adapterResult.sourceResults || [],
      count: candidates.length,
      accepted: acceptedCandidates.length,
      created: newAcceptedCandidates.length,
      updated: updatedAcceptedCandidates.length,
      rejected: rejectedCandidates.length,
      candidates,
      intakeRows,
      gateRows,
      decisionRows,
      cooperationRows
    };
    if (print) {
      console.log(JSON.stringify(result, null, 2));
    }
    return result;
  }

  const startedAt = new Date().toISOString();
  try {
    await rest("scrape_intake_queue?on_conflict=user_id,dedupe_key", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: intakeRows
    });
    if (gateRows.length) {
      await rest("quality_gate_results", {
        method: "POST",
        body: gateRows
      });
    }
    if (decisionRows.length) {
      await rest("agent_decisions", {
        method: "POST",
        body: decisionRows
      });
    }
    if (newAcceptedCandidates.length) {
      await rest("bounty_candidates?on_conflict=user_id,dedupe_key", {
        method: "POST",
        prefer: "resolution=merge-duplicates",
        body: newAcceptedCandidates
      });
    }
    if (cooperationRows.length) {
      await rest("agent_cooperation_events", {
        method: "POST",
        body: cooperationRows
      });
    }
    if (newAcceptedCandidates.length) {
      await rest("agent_events", {
        method: "POST",
        body: newAcceptedCandidates.map((candidate) =>
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
    }
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
          created_count: newAcceptedCandidates.length,
          updated_count: updatedAcceptedCandidates.length,
          rejected_count: rejectedCandidates.length,
          metadata: {
            runner: "scrape-engine/run-once.mjs",
            adapter: adapterResult.adapter,
            input_file: inputFileLabel,
            source_results: adapterResult.sourceResults || [],
            quality_gates: {
              accepted: acceptedCandidates.length,
              created: newAcceptedCandidates.length,
              updated: updatedAcceptedCandidates.length,
              rejected: rejectedCandidates.length
            }
          }
        }
      })
    });
    await updateSourceState({ userId, sourceKey, status: "enabled", previousState: sourceState });
    const result = {
      ok: true,
      dryRun,
      appMode,
      sourceKey,
      sourceResults: adapterResult.sourceResults || [],
      accepted: acceptedCandidates.length,
      created: newAcceptedCandidates.length,
      updated: updatedAcceptedCandidates.length,
      rejected: rejectedCandidates.length,
      queued: intakeRows.length
    };
    if (print) {
      console.log(JSON.stringify(result, null, 2));
    }
    return result;
  } catch (error) {
    await updateSourceState({ userId, sourceKey, status: "circuit_open", errorMessage: error.message, previousState: sourceState });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOnce().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
