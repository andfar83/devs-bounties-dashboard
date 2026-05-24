import { buildCooperationEvent, normalizeScrapeIntake } from "./agent-intelligence.mjs";

export const CONTRACT_VERSION = "2026-05-22.v1";

export const APP_MODES = new Set(["simulation", "shadow_real", "live_real"]);
export const STAGES = new Set(["discovered", "shortlisted", "submitted", "won", "paid"]);

export function nowIso() {
  return new Date().toISOString();
}

export function makeDedupeKey(candidate) {
  const platform = candidate.site || candidate.platform || "unknown";
  const sourceUrl = candidate.siteUrl || candidate.source_url || "unknown";
  const externalId = candidate.externalId || candidate.external_id || candidate.id || "unknown";
  return [platform, sourceUrl, externalId].map((part) => String(part).trim().toLowerCase()).join("::");
}

export function normalizeCandidate(candidate, { userId, appMode, sourceKey }) {
  if (!userId) {
    throw new Error("SUPABASE_TARGET_USER_ID is required.");
  }

  const intake = normalizeScrapeIntake(candidate, { appMode, sourceKey });
  const stage = intake.stage || "discovered";
  if (!STAGES.has(stage)) {
    throw new Error(`Invalid candidate stage: ${stage}`);
  }

  const localId = intake.id || intake.localId || `${sourceKey}-${intake.externalId || Date.now()}`;
  const dueDate = intake.dueDate || intake.deadline_utc || null;

  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    local_id: localId,
    external_id: intake.externalId || intake.external_id || localId,
    dedupe_key: makeDedupeKey(intake),
    title: intake.title || "Untitled bounty",
    platform: intake.site || intake.platform || sourceKey,
    source_url: intake.siteUrl || intake.source_url || "",
    bounty_type: intake.type || intake.bounty_type || "Unknown",
    stage,
    payout_usd: Number(intake.price ?? intake.payout_usd ?? 0),
    deadline_utc: dueDate ? new Date(`${String(dueDate).slice(0, 10)}T23:59:59Z`).toISOString() : null,
    retrieved_at: intake.retrievedAt || intake.retrieved_at || nowIso(),
    description: intake.description || "",
    scope_statement: intake.scope || intake.scope_statement || "",
    fix_required: intake.fixRequired || intake.fix_required || "",
    scores: intake.scores || {},
    red_flags: Array.isArray(intake.redFlags) ? intake.redFlags : intake.red_flags || [],
    next_action: intake.nextAction || intake.next_action || "evaluate_now",
    confidence: intake.confidence ?? null,
    metadata: {
      ...(intake.metadata || {}),
      app_mode: appMode,
      source: sourceKey,
      requires_operator_review: true,
      quality_gate: intake.qualityGate,
      agent_decision: intake.agentDecision
    }
  };
}

export function scrapeIntakeQueueRow({ userId, appMode, sourceKey, rawCandidate, normalizedCandidate }) {
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    source_key: sourceKey,
    app_mode: appMode,
    external_id: normalizedCandidate.external_id || normalizedCandidate.local_id,
    dedupe_key: normalizedCandidate.dedupe_key,
    raw_payload: rawCandidate,
    normalized_payload: normalizedCandidate,
    quality_gate_status: normalizedCandidate.metadata?.quality_gate?.status || "not_run",
    status: normalizedCandidate.metadata?.quality_gate?.passed === false ? "rejected" : "accepted",
    error_message: normalizedCandidate.metadata?.quality_gate?.passed === false ? "Quality gate blocked intake" : null,
    processed_at: nowIso()
  };
}

export function qualityGateResultRow({ userId, normalizedCandidate }) {
  const gate = normalizedCandidate.metadata?.quality_gate || null;
  if (!gate) {
    return null;
  }
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    bounty_local_id: normalizedCandidate.local_id,
    agent_id: "scout",
    stage: normalizedCandidate.stage,
    status: gate.status,
    critical_failures: gate.criticalFailures || 0,
    checks: gate.checks || [],
    metadata: {
      app_mode: normalizedCandidate.metadata?.app_mode,
      source: normalizedCandidate.metadata?.source
    }
  };
}

export function agentDecisionRow({ userId, normalizedCandidate }) {
  const decision = normalizedCandidate.metadata?.agent_decision || null;
  if (!decision) {
    return null;
  }
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    bounty_local_id: normalizedCandidate.local_id,
    agent_id: decision.agentId || "scout",
    decision: decision.decision,
    confidence: decision.confidence ?? null,
    score: decision.score ?? null,
    from_stage: decision.fromStage,
    to_stage: decision.toStage,
    gate_status: decision.gateStatus || "not_run",
    rationale: decision.rationale || "",
    metadata: {
      app_mode: normalizedCandidate.metadata?.app_mode,
      source: normalizedCandidate.metadata?.source,
      gate_result: decision.gateResult
    }
  };
}

export function cooperationEventRow({ userId, normalizedCandidate }) {
  const event = buildCooperationEvent({
    record: {
      id: normalizedCandidate.local_id,
      stage: normalizedCandidate.stage,
      title: normalizedCandidate.title,
      scores: normalizedCandidate.scores,
      redFlags: normalizedCandidate.red_flags
    },
    fromAgent: "scout",
    toAgent: "feasibility",
    trigger: "candidate_discovered",
    payload: {
      source: normalizedCandidate.metadata?.source,
      quality_gate_status: normalizedCandidate.metadata?.quality_gate?.status || "not_run"
    }
  });
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    bounty_local_id: event.bountyLocalId,
    from_agent_id: event.fromAgent,
    to_agent_id: event.toAgent,
    trigger: event.trigger,
    payload: event.payload,
    status: "queued"
  };
}

export function scrapeRunRow({ userId, appMode, sourceKey, mode, status, counts = {}, message = "" }) {
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    source_key: sourceKey,
    app_mode: appMode,
    mode,
    status,
    started_at: counts.started_at || nowIso(),
    completed_at: counts.completed_at || null,
    source_count: counts.source_count || 0,
    created_count: counts.created_count || 0,
    updated_count: counts.updated_count || 0,
    rejected_count: counts.rejected_count || 0,
    error_message: message || null,
    metadata: counts.metadata || {}
  };
}

export function agentEventRow({ userId, appMode, sourceKey, bountyLocalId = null, action, reason = "" }) {
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    bounty_local_id: bountyLocalId,
    agent_id: "scout",
    action,
    from_stage: null,
    to_stage: null,
    reason,
    metadata: {
      app_mode: appMode,
      source: sourceKey
    }
  };
}
