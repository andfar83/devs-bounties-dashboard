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

  const stage = candidate.stage || "discovered";
  if (!STAGES.has(stage)) {
    throw new Error(`Invalid candidate stage: ${stage}`);
  }

  const localId = candidate.id || candidate.localId || `${sourceKey}-${candidate.externalId || Date.now()}`;
  const dueDate = candidate.dueDate || candidate.deadline_utc || null;

  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    local_id: localId,
    external_id: candidate.externalId || candidate.external_id || localId,
    dedupe_key: makeDedupeKey(candidate),
    title: candidate.title || "Untitled bounty",
    platform: candidate.site || candidate.platform || sourceKey,
    source_url: candidate.siteUrl || candidate.source_url || "",
    bounty_type: candidate.type || candidate.bounty_type || "Unknown",
    stage,
    payout_usd: Number(candidate.price ?? candidate.payout_usd ?? 0),
    deadline_utc: dueDate ? new Date(`${String(dueDate).slice(0, 10)}T23:59:59Z`).toISOString() : null,
    retrieved_at: candidate.retrievedAt || candidate.retrieved_at || nowIso(),
    description: candidate.description || "",
    scope_statement: candidate.scope || candidate.scope_statement || "",
    fix_required: candidate.fixRequired || candidate.fix_required || "",
    scores: candidate.scores || {},
    red_flags: Array.isArray(candidate.redFlags) ? candidate.redFlags : candidate.red_flags || [],
    next_action: candidate.nextAction || candidate.next_action || "evaluate_now",
    confidence: candidate.confidence ?? null,
    metadata: {
      ...(candidate.metadata || {}),
      app_mode: appMode,
      source: sourceKey,
      requires_operator_review: true
    }
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
