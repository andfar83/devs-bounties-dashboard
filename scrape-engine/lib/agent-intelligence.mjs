export const AGENT_KNOWLEDGE_PACKS = [
  {
    agentId: "scout",
    name: "Atlas Scout Knowledge",
    version: "2026-05-23.pre-scraper",
    scope: "discovery_triage",
    capabilities: ["source_evidence", "ev_scoring", "platform_trust", "dedupe", "watchlist_routing"],
    rules: [
      "Every candidate needs a source URL and retrieval timestamp.",
      "Reject ambiguous payout or suspicious organizer signals.",
      "Score fit, payout quality, deadline feasibility, win probability, strategic value, and platform trust.",
      "Never infer missing fields silently; mark unknown explicitly."
    ],
    kpis: ["qualified_opportunities", "shortlist_pass_rate", "false_positive_rate", "time_to_shortlist"]
  },
  {
    agentId: "feasibility",
    name: "Prism Feasibility Knowledge",
    version: "2026-05-23.pre-scraper",
    scope: "go_no_go_decisions",
    capabilities: ["rules_clarity", "effort_estimation", "risk_register", "acceptance_criteria", "economic_gate"],
    rules: [
      "No go decision without measurable acceptance criteria.",
      "Use three-point estimates with coordination, packaging, and unknown buffers.",
      "Critical risks need mitigation and contingency.",
      "Conditional go requires a resolvable blocker and fallback strategy."
    ],
    kpis: ["on_time_go_rate", "estimation_error", "risk_realization_rate", "time_to_decision"]
  },
  {
    agentId: "builder",
    name: "Forge Builder Knowledge",
    version: "2026-05-23.pre-scraper",
    scope: "implementation_quality",
    capabilities: ["baseline_repro", "incremental_build", "benchmarking", "artifact_packaging", "regression_control"],
    rules: [
      "No unverifiable claims, fake benchmarks, or hidden manual steps.",
      "Record baseline, environment, commands, final metrics, and variance context.",
      "Preserve a known-good path and document fallback strategy.",
      "Submission package must pass a dry run before Ops."
    ],
    kpis: ["quality_gate_pass_rate", "metric_uplift", "fresh_repro_success", "critical_bug_escape_rate"]
  },
  {
    agentId: "ops",
    name: "Sentinel Ops Knowledge",
    version: "2026-05-23.pre-scraper",
    scope: "submission_operations",
    capabilities: ["deadline_safety", "compliance_audit", "submission_log", "reviewer_followup", "payout_closure"],
    rules: [
      "Never schedule first submission close to cutoff.",
      "Capture proof of submission and confirmation IDs.",
      "Reviewer responses must be factual, concise, respectful, and evidence-linked.",
      "Every incident needs root cause, corrective action, and preventive action."
    ],
    kpis: ["on_time_submission_rate", "compliance_defect_rate", "first_pass_acceptance", "payout_closure_time"]
  }
];

export const AGENT_DECISION_CONTRACTS = {
  scout: {
    input: ["title", "platform", "source_url", "deadline_utc", "payout_usd", "scores", "confidence"],
    output: ["decision", "next_action", "score", "red_flags", "evidence"],
    allowedDecisions: ["discard", "monitor", "evaluate_now"],
    minConfidence: 0.6
  },
  feasibility: {
    input: ["rules", "scope_statement", "deadline_utc", "scores", "risk_register"],
    output: ["decision", "confidence", "acceptance_criteria", "risk_register", "effort_estimate"],
    allowedDecisions: ["no_go", "conditional_go", "go"],
    minConfidence: 0.7
  },
  builder: {
    input: ["feasibility_report", "acceptance_criteria", "work_package", "baseline"],
    output: ["implementation_status", "repro_steps", "results", "artifacts", "known_risks"],
    allowedDecisions: ["blocked", "in_progress", "package_ready"],
    minConfidence: 0.75
  },
  ops: {
    input: ["submission_packet", "deadline_utc", "compliance_checklist", "proof"],
    output: ["submission_status", "confirmation_id", "followup_plan", "payout_status"],
    allowedDecisions: ["blocked", "ready_to_submit", "submitted", "paid"],
    minConfidence: 0.8
  }
};

export const QUALITY_GATES = {
  discovered: [
    { id: "source_url_present", label: "Source URL present", severity: "critical", test: (record) => Boolean(record.siteUrl || record.source_url) },
    { id: "title_present", label: "Title present", severity: "critical", test: (record) => Boolean(record.title) },
    { id: "payout_non_negative", label: "Payout is valid", severity: "critical", test: (record) => Number(record.price ?? record.payout_usd ?? 0) >= 0 },
    { id: "deadline_present", label: "Deadline captured", severity: "warning", test: (record) => Boolean(record.dueDate || record.deadline_utc) },
    { id: "confidence_calibrated", label: "Confidence calibrated", severity: "warning", test: (record) => Number(record.confidence ?? 0) >= 0.6 }
  ],
  shortlisted: [
    { id: "scope_statement_present", label: "Scope statement present", severity: "critical", test: (record) => Boolean(record.scope || record.scope_statement) },
    { id: "fix_required_present", label: "Fix required present", severity: "critical", test: (record) => Boolean(record.fixRequired || record.fix_required) },
    { id: "score_components_present", label: "Score components present", severity: "warning", test: (record) => Object.keys(record.scores || {}).length >= 4 },
    { id: "red_flags_reviewed", label: "Red flags reviewed", severity: "warning", test: (record) => Array.isArray(record.redFlags || record.red_flags || []) }
  ],
  submitted: [
    { id: "package_status_present", label: "Package status present", severity: "critical", test: (record) => Boolean(record.packageStatus || record.package_status) },
    { id: "artifact_scope_present", label: "Artifact scope present", severity: "warning", test: (record) => Boolean(record.scope || record.scope_statement) }
  ],
  won: [
    { id: "submission_signal_present", label: "Submission signal present", severity: "warning", test: (record) => Boolean(record.nextAction || record.next_action) },
    { id: "ops_followup_ready", label: "Ops follow-up ready", severity: "warning", test: (record) => Boolean(record.metadata?.ops_followup_ready || record.stage === "won") }
  ],
  paid: [
    { id: "payout_value_valid", label: "Payout value valid", severity: "critical", test: (record) => Number(record.price ?? record.payout_usd ?? 0) >= 0 }
  ]
};

export const FAILURE_RECOVERY_POLICIES = {
  source_failure: {
    maxConsecutiveErrors: 3,
    cooldownMinutes: 30,
    action: "open_circuit",
    escalation: "ops"
  },
  quality_gate_failure: {
    maxCriticalFailures: 0,
    action: "block_stage_transition",
    escalation: "feasibility"
  },
  package_failure: {
    maxRetries: 2,
    action: "retry_then_manual_review",
    escalation: "ops"
  },
  sync_failure: {
    maxRetries: 3,
    action: "mark_failed_keep_local",
    escalation: "integration"
  }
};

export const COOPERATION_RULES = [
  { fromAgent: "scout", toAgent: "feasibility", trigger: "candidate_approved", payload: ["candidate", "scores", "red_flags", "source_evidence"] },
  { fromAgent: "feasibility", toAgent: "builder", trigger: "conditional_go", payload: ["scope", "acceptance_criteria", "risk_register", "effort_estimate"] },
  { fromAgent: "builder", toAgent: "ops", trigger: "package_ready", payload: ["artifacts", "repro_steps", "results", "known_risks"] },
  { fromAgent: "ops", toAgent: "builder", trigger: "submission_defect", payload: ["defect", "deadline", "severity", "requested_fix"] },
  { fromAgent: "ops", toAgent: "scout", trigger: "platform_feedback", payload: ["platform", "outcome", "payout_status", "lesson"] }
];

const SCORE_KEYS = ["fit", "payoutQuality", "deadlineFeasibility", "winProbability", "strategicValue", "platformTrust"];

export function computeCandidateScore(record = {}) {
  const scores = record.scores || {};
  return SCORE_KEYS.reduce((sum, key) => sum + Number(scores[key] || 0), 0);
}

export function evaluateQualityGates(record = {}, stage = record.stage || "discovered") {
  const gates = QUALITY_GATES[stage] || [];
  const checks = gates.map((gate) => {
    let passed = false;
    try {
      passed = Boolean(gate.test(record));
    } catch (error) {
      passed = false;
    }
    return {
      gateId: gate.id,
      label: gate.label,
      severity: gate.severity,
      passed
    };
  });
  const failed = checks.filter((check) => !check.passed);
  const criticalFailures = failed.filter((check) => check.severity === "critical").length;
  return {
    stage,
    status: criticalFailures ? "blocked" : failed.length ? "warning" : "passed",
    passed: criticalFailures === 0,
    criticalFailures,
    checks
  };
}

export function buildAgentDecision(record = {}, { agentId = "scout", action = "evaluate", fromStage = null, toStage = null } = {}) {
  const score = computeCandidateScore(record);
  const contract = AGENT_DECISION_CONTRACTS[agentId] || AGENT_DECISION_CONTRACTS.scout;
  const gateResult = evaluateQualityGates(record, toStage || record.stage || "discovered");
  const confidence = Number(record.confidence ?? 0);
  let decision = action;

  if (!gateResult.passed) {
    decision = "blocked";
  } else if (agentId === "scout") {
    decision = confidence >= contract.minConfidence && score >= 60 ? "evaluate_now" : "monitor";
  } else if (agentId === "feasibility") {
    decision = confidence >= contract.minConfidence ? "conditional_go" : "no_go";
  } else if (agentId === "builder") {
    decision = gateResult.status === "passed" ? "package_ready" : "in_progress";
  } else if (agentId === "ops") {
    decision = gateResult.status === "passed" ? "ready_to_submit" : "blocked";
  }

  return {
    agentId,
    bountyLocalId: record.id || record.local_id || null,
    decision,
    confidence,
    score,
    fromStage: fromStage || record.stage || null,
    toStage: toStage || record.stage || null,
    gateStatus: gateResult.status,
    gateResult,
    contractVersion: contract.version || "2026-05-23.pre-scraper",
    rationale: buildDecisionRationale({ agentId, decision, score, confidence, gateResult })
  };
}

export function buildDecisionRationale({ agentId, decision, score, confidence, gateResult }) {
  const failedLabels = (gateResult.checks || []).filter((check) => !check.passed).map((check) => check.label);
  const base = `${agentId} decision ${decision} with score ${score} and confidence ${confidence}.`;
  if (!failedLabels.length) {
    return `${base} Quality gates passed.`;
  }
  return `${base} Needs attention: ${failedLabels.join("; ")}.`;
}

export function buildCooperationEvent({ record = {}, fromAgent = "scout", toAgent = "feasibility", trigger = "handoff", payload = {} } = {}) {
  return {
    bountyLocalId: record.id || record.local_id || null,
    fromAgent,
    toAgent,
    trigger,
    payload: {
      bounty_id: record.id || record.local_id || null,
      stage: record.stage || null,
      title: record.title || null,
      ...payload
    }
  };
}

export function normalizeScrapeIntake(raw = {}, { appMode = "shadow_real", sourceKey = "unknown" } = {}) {
  const localId = raw.id || raw.localId || raw.local_id || raw.externalId || raw.external_id || `${sourceKey}-${Date.now()}`;
  const scores = raw.scores || {};
  const record = {
    id: localId,
    externalId: raw.externalId || raw.external_id || localId,
    dedupeKey: raw.dedupeKey || raw.dedupe_key || "",
    site: raw.site || raw.platform || sourceKey,
    siteUrl: raw.siteUrl || raw.source_url || "",
    type: raw.type || raw.bounty_type || "Unknown",
    title: raw.title || "Untitled bounty",
    description: raw.description || "",
    scope: raw.scope || raw.scope_statement || "",
    fixRequired: raw.fixRequired || raw.fix_required || "",
    price: Number(raw.price ?? raw.payout_usd ?? 0),
    stage: raw.stage || "discovered",
    appRunMode: raw.appRunMode || raw.app_mode || appMode,
    dueDate: raw.dueDate || raw.deadline_utc || "",
    retrievedAt: raw.retrievedAt || raw.retrieved_at || new Date().toISOString(),
    confidence: raw.confidence ?? null,
    nextAction: raw.nextAction || raw.next_action || "evaluate_now",
    scores,
    redFlags: Array.isArray(raw.redFlags) ? raw.redFlags : raw.red_flags || [],
    metadata: {
      ...(raw.metadata || {}),
      source: sourceKey,
      app_mode: appMode,
      intake_adapter: "real_scrape_preflight"
    }
  };
  record.qualityGate = evaluateQualityGates(record, record.stage);
  record.agentDecision = buildAgentDecision(record, { agentId: "scout", action: record.nextAction });
  return record;
}
