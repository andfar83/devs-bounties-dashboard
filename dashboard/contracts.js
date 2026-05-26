import {
  AGENT_IDS,
  APP_MODE,
  ARTIFACT_TYPES,
  BOUNTY_STAGES,
  RUN_STATUS,
  STORAGE_BUCKETS,
  WORK_PACKAGE_FILES
} from "./config.js";
import {
  AGENT_DECISION_CONTRACTS,
  AGENT_KNOWLEDGE_PACKS,
  AGENT_TOOLBELTS,
  OPEN_SOURCE_KNOWLEDGE_SOURCES,
  QUALITY_GATES
} from "./agent-intelligence.js";

export const CONTRACT_VERSION = "2026-05-22.v1";

export function nowIso() {
  return new Date().toISOString();
}

export function makeDedupeKey(record) {
  const platform = record?.site || record?.platform || "unknown";
  const sourceUrl = record?.siteUrl || record?.source_url || "unknown";
  const externalId = record?.externalId || record?.external_id || record?.id || "unknown";
  return [platform, sourceUrl, externalId].map((part) => String(part).trim().toLowerCase()).join("::");
}

export function toBountyCandidate(record, userId = null) {
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    local_id: record.id,
    external_id: record.externalId || record.id,
    dedupe_key: makeDedupeKey(record),
    title: record.title,
    platform: record.site,
    source_url: record.siteUrl,
    bounty_type: record.type,
    stage: record.stage || BOUNTY_STAGES.DISCOVERED,
    payout_usd: record.price,
    deadline_utc: record.dueDate ? new Date(`${record.dueDate}T23:59:59Z`).toISOString() : null,
    retrieved_at: record.retrievedAt || nowIso(),
    description: record.description || "",
    scope_statement: record.scope || "",
    fix_required: record.fixRequired || "",
    scores: record.scores || {},
    red_flags: record.redFlags || [],
    next_action: record.nextAction || "evaluate_now",
    confidence: record.confidence ?? null,
    metadata: {
      ...(record.metadata || {}),
      app_mode: record.appRunMode || APP_MODE.SHADOW_REAL,
      source: record.metadata?.source || "operator_intake",
      package_status: record.packageStatus || record.metadata?.package_status || "",
      local_package_folder: record.metadata?.local_package_folder || "",
      quality_gate: record.qualityGate || null,
      agent_decision: record.agentDecision || null
    }
  };
}

export function fromBountyCandidate(row) {
  const metadata = row?.metadata || {};
  const deadline = row?.deadline_utc ? new Date(row.deadline_utc).toISOString().slice(0, 10) : "";
  const localId = row?.local_id || row?.external_id || `remote-${row?.id || Date.now()}`;

  return {
    id: localId,
    externalId: row?.external_id || localId,
    dedupeKey: row?.dedupe_key || "",
    site: row?.platform || "Unknown",
    siteUrl: row?.source_url || "",
    type: row?.bounty_type || "Unknown",
    title: row?.title || "Untitled bounty",
    description: row?.description || "",
    scope: row?.scope_statement || "",
    fixRequired: row?.fix_required || "",
    price: Number(row?.payout_usd || 0),
    stage: row?.stage || BOUNTY_STAGES.DISCOVERED,
    appRunMode: metadata.app_mode || APP_MODE.SHADOW_REAL,
    dueDate: deadline,
    retrievedAt: row?.retrieved_at || row?.created_at || nowIso(),
    confidence: row?.confidence ?? null,
    nextAction: row?.next_action || "evaluate_now",
    scores: row?.scores || {},
    redFlags: Array.isArray(row?.red_flags) ? row.red_flags : [],
    metadata,
    supabaseSyncStatus: "synced",
    packageStatus: metadata.package_status || ""
  };
}

export function toScrapeRun({ mode, status = RUN_STATUS.RUNNING, userId = null, stats = {}, message = "" }) {
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    source_key: stats.source_key || null,
    app_mode: stats.app_mode || APP_MODE.SHADOW_REAL,
    mode,
    status,
    started_at: stats.started_at || nowIso(),
    completed_at: stats.completed_at || null,
    source_count: stats.source_count || 0,
    created_count: stats.created_count || 0,
    updated_count: stats.updated_count || 0,
    rejected_count: stats.rejected_count || 0,
    error_message: message || null,
    metadata: stats.metadata || {}
  };
}

export function toAgentEvent({ record, agentId, action, fromStage = null, toStage = null, reason = "", userId = null }) {
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    bounty_local_id: record?.id || null,
    agent_id: agentId,
    action,
    from_stage: fromStage,
    to_stage: toStage,
    reason,
    created_at: nowIso(),
    metadata: {
      app_mode: record?.appRunMode || APP_MODE.SHADOW_REAL
    }
  };
}

export function toWorkPackage(record, userId = null, folderPath = "") {
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    bounty_local_id: record.id,
    stage: record.stage,
    local_folder_path: folderPath,
    storage_bucket: STORAGE_BUCKETS.BOUNTY_ARTIFACTS,
    status: "prepared",
    created_at: nowIso(),
    updated_at: nowIso(),
    metadata: {
      app_mode: record.appRunMode || APP_MODE.SHADOW_REAL
    }
  };
}

export function toWorkArtifacts(record, userId = null) {
  const base = {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    bounty_local_id: record.id,
    storage_bucket: STORAGE_BUCKETS.BOUNTY_ARTIFACTS
  };

  return [
    { ...base, artifact_type: ARTIFACT_TYPES.SOURCE, relative_path: WORK_PACKAGE_FILES.SOURCE_JSON },
    { ...base, artifact_type: ARTIFACT_TYPES.SOURCE, relative_path: WORK_PACKAGE_FILES.SOURCE_EVIDENCE },
    { ...base, artifact_type: ARTIFACT_TYPES.RULES, relative_path: WORK_PACKAGE_FILES.RULES_MD },
    { ...base, artifact_type: ARTIFACT_TYPES.RULES, relative_path: WORK_PACKAGE_FILES.AGENT_CONTRACTS },
    { ...base, artifact_type: ARTIFACT_TYPES.RULES, relative_path: WORK_PACKAGE_FILES.QUALITY_GATES },
    { ...base, artifact_type: ARTIFACT_TYPES.FEASIBILITY_REPORT, relative_path: WORK_PACKAGE_FILES.FEASIBILITY_REPORT },
    { ...base, artifact_type: ARTIFACT_TYPES.EFFORT_ESTIMATE, relative_path: WORK_PACKAGE_FILES.EFFORT_ESTIMATE },
    { ...base, artifact_type: ARTIFACT_TYPES.RISK_REGISTER, relative_path: WORK_PACKAGE_FILES.RISK_REGISTER },
    { ...base, artifact_type: ARTIFACT_TYPES.REPRO, relative_path: WORK_PACKAGE_FILES.REPRO },
    { ...base, artifact_type: ARTIFACT_TYPES.RESULTS, relative_path: WORK_PACKAGE_FILES.RESULTS },
    { ...base, artifact_type: ARTIFACT_TYPES.PATCH, relative_path: WORK_PACKAGE_FILES.PATCH },
    { ...base, artifact_type: ARTIFACT_TYPES.SUBMISSION_LOG, relative_path: WORK_PACKAGE_FILES.SUBMISSION_LOG },
    { ...base, artifact_type: ARTIFACT_TYPES.POST_SUBMIT_PLAN, relative_path: WORK_PACKAGE_FILES.POST_SUBMIT_PLAN }
  ];
}

function formatSourceDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().slice(0, 10);
}

function sourceCreatedLabel(record = {}) {
  const metadata = record.metadata || {};
  const label = metadata.source_date_label || (metadata.live_since ? "Live Since" : "Discovered");
  const rawDate = metadata.source_start_at || metadata.live_since || record.retrievedAt || "";
  return `${label}: ${formatSourceDate(rawDate) || "not published by source"}`;
}

function sourceExpirationLabel(record = {}) {
  const metadata = record.metadata || {};
  const rawDeadline = metadata.source_deadline_at || record.dueDate || "";
  if (rawDeadline) {
    return `Expires: ${formatSourceDate(rawDeadline)}`;
  }
  return `Expires: ${metadata.source_expiration_label || "no fixed date published by source; verify source page before execution."}`;
}

export function buildWorkPackageFiles(record) {
  const candidate = toBountyCandidate(record);
  const rewardRanges = Array.isArray(record.metadata?.reward_ranges) ? record.metadata.reward_ranges : [];
  const rewardSummary = rewardRanges.length
    ? rewardRanges.map((range) => `- ${range.category || "General"} ${range.threatLevel}: $${Number(range.minUsd || 0).toLocaleString("en-US")} - $${Number(range.maxUsd || 0).toLocaleString("en-US")}`).join("\n")
    : "- No structured reward ranges captured yet.";
  const programFlags = [
    record.metadata?.kyc_required ? "KYC required" : null,
    record.metadata?.poc_required ? "PoC required" : null,
    record.metadata?.vault_program ? "Vault program" : null,
    record.metadata?.ongoing_program ? "Ongoing program" : null
  ].filter(Boolean);
  const feasibilityReport = `# Feasibility Report - ${record.id}

Decision: conditional_go
Confidence: ${record.confidence ?? "unknown"}

## Reward Snapshot
Maximum Bounty: $${Number(record.price || 0).toLocaleString("en-US")}
Funds Available: $${Number(record.metadata?.funds_available_usd || 0).toLocaleString("en-US")}
Program Flags: ${programFlags.length ? programFlags.join(", ") : "none captured"}

${rewardSummary}

## Scope Statement
${record.scope}

## Acceptance Criteria
- Verify platform rules and payout terms.
- Produce reproducible evidence for the requested fix.
- Package final artifacts before submission.

## Risk Register
See risk_register.json.

## Execution Plan
1. Validate bounty rules and deadline.
2. Select one in-scope asset/impact to investigate.
3. Reproduce a valid vulnerability locally or on allowed environments only.
4. Build proof, mitigation notes, and evidence package.
5. Package for Ops review before any Immunefi submission.
`;

  const sourceEvidence = `# Source Evidence - ${record.id}

## Official Source
- Platform: ${record.site}
- Source URL: ${record.siteUrl}
- Retrieved At: ${candidate.retrieved_at}
- Created/Listed: ${sourceCreatedLabel(record)}
- Expiration/Deadline: ${sourceExpirationLabel(record)}
- Intake Source: ${record.metadata?.source || record.metadata?.web_source_key || "unknown"}
- Adapter: ${record.metadata?.intake_adapter || record.metadata?.adapter_strategy || "unknown"}
- Official Source Verified: ${record.metadata?.source_evidence?.official_source ? "yes" : "pending operator verification"}

## Extracted Problem Statement
${record.metadata?.source_evidence?.problem_statement || record.description || "No description extracted yet. Re-open the source URL before execution."}

## Extracted Scope / Rewards
${record.metadata?.source_evidence?.scope_excerpt || record.scope || "Scope not extracted yet. Operator/agent must verify scope directly from the source page."}

## Reward Ranges
${rewardSummary}

## Source Page Excerpt
${record.metadata?.source_evidence?.html_excerpt || "Raw source excerpt not attached yet. Re-run scraper with detail enrichment if needed."}

## Program Signals
- KYC Required: ${record.metadata?.kyc_required ? "yes" : "not detected"}
- PoC Required: ${record.metadata?.poc_required ? "yes" : "not detected"}
- Vault Program: ${record.metadata?.vault_program ? "yes" : "not detected"}
- Ongoing Program: ${record.metadata?.ongoing_program ? "yes" : "unknown"}
- Tags: ${Array.isArray(record.metadata?.program_tags) && record.metadata.program_tags.length ? record.metadata.program_tags.join(", ") : "none extracted"}

## Agent Knowledge Sources
${OPEN_SOURCE_KNOWLEDGE_SOURCES.map((source) => `- ${source.label} (${source.license}) - ${source.url}`).join("\n")}

## Agent Toolbelts
${Object.entries(AGENT_TOOLBELTS)
  .map(([agentId, tools]) => `- ${agentId}: ${tools.join(", ")}`)
  .join("\n")}

## Agent Superpowers
${AGENT_KNOWLEDGE_PACKS.map((pack) => `- ${pack.agentId}: ${pack.capabilities.join(", ")}`).join("\n")}
`;

  const effortEstimate = {
    optimistic_hours: null,
    realistic_hours: null,
    pessimistic_hours: null,
    expected_hours_formula: "E = (O + 4M + P) / 6",
    buffers: {
      coordination: "10-15%",
      integration_packaging: "10-20%",
      unknowns: "10-25%"
    },
    critical_path: [],
    slack_buffer: "unknown"
  };

  const riskRegister = [
    {
      id: "R-001",
      category: "Rule interpretation ambiguity",
      probability: "unknown",
      impact: "medium",
      owner: AGENT_IDS.FEASIBILITY,
      trigger: "Submission rules are incomplete or conflict with expected artifact format.",
      mitigation: "Validate Immunefi rules before execution, store source evidence, and avoid prohibited testing.",
      contingency: "Escalate to no_go or request clarification."
    },
    {
      id: "R-002",
      category: "Program compliance",
      probability: record.metadata?.kyc_required || record.metadata?.poc_required ? "known" : "unknown",
      impact: "high",
      owner: AGENT_IDS.OPS,
      trigger: "KYC, PoC, vault, safe harbor, or prohibited-activity requirements apply.",
      mitigation: "Keep all research inside program-approved local forks, sandboxes, or testnets and prepare inline PoC evidence.",
      contingency: "Do not submit until Sentinel confirms compliance."
    }
  ];

  return [
    {
      path: WORK_PACKAGE_FILES.SOURCE_JSON,
      content: JSON.stringify(candidate, null, 2)
    },
    {
      path: WORK_PACKAGE_FILES.SOURCE_EVIDENCE,
      content: sourceEvidence
    },
    {
      path: WORK_PACKAGE_FILES.RULES_MD,
      content: `# Rules Snapshot - ${record.id}

Platform: ${record.site}
Source URL: ${record.siteUrl}
Retrieved At: ${candidate.retrieved_at}
Created/Listed: ${sourceCreatedLabel(record)}
Expiration/Deadline: ${sourceExpirationLabel(record)}

## Known Scope
${record.scope}

## Fix Required
${record.fixRequired}

## Notes
This file is generated from the real scrape detail page when available. Review Immunefi directly before execution.
`
    },
    {
      path: WORK_PACKAGE_FILES.RETRIEVED_PAGE_HTML,
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Source Capture - ${record.id}</title>
  </head>
  <body>
    <h1>Source capture pending real engine attachment</h1>
    <p>The dashboard recorded the bounty source URL, but raw page capture has not been attached yet.</p>
    <p>When the scrape engine exports captured HTML, this file is replaced with the retrieved bounty detail page.</p>
    <p><strong>Source URL:</strong> <a href="${record.siteUrl}">${record.siteUrl}</a></p>
  </body>
</html>
`
    },
    {
      path: WORK_PACKAGE_FILES.AGENT_CONTRACTS,
      content: JSON.stringify(AGENT_DECISION_CONTRACTS, null, 2)
    },
    {
      path: WORK_PACKAGE_FILES.QUALITY_GATES,
      content: JSON.stringify({
        current_stage: record.stage,
        latest_result: record.qualityGate || null,
        gates: QUALITY_GATES
      }, null, 2)
    },
    {
      path: WORK_PACKAGE_FILES.FEASIBILITY_REPORT,
      content: feasibilityReport
    },
    {
      path: WORK_PACKAGE_FILES.EFFORT_ESTIMATE,
      content: JSON.stringify(effortEstimate, null, 2)
    },
    {
      path: WORK_PACKAGE_FILES.RISK_REGISTER,
      content: JSON.stringify(riskRegister, null, 2)
    },
    {
      path: WORK_PACKAGE_FILES.SOLUTION_README,
      content: `# Solution - ${record.id}

Status: pending real agent execution

## Challenge
${record.title}

## Target Reward
$${Number(record.price || 0).toLocaleString("en-US")}

## Working Rule
Builder must not invent a vulnerability. Start by validating scope, selecting a permitted asset, and building a reproducible local proof only if a real issue is found.

## Implementation Notes
Waiting for Builder execution output from the agent runtime.

## Important
This is a prepared work package. Treat it as solved only after a reproducible issue, evidence, and operator validation are recorded.
`
    },
    {
      path: WORK_PACKAGE_FILES.REPRO,
      content: `# Reproduction - ${record.id}

## Environment
- OS: pending agent capture
- Runtime: pending agent capture
- Dependencies: pending agent capture

## Steps
1. Capture baseline setup command.
2. Capture reproduction or validation command.
3. Capture expected and actual output.
`
    },
    {
      path: WORK_PACKAGE_FILES.RESULTS,
      content: `# Results - ${record.id}

Pending real execution results from Builder.
`
    },
    {
      path: WORK_PACKAGE_FILES.PATCH,
      content: `# Patch / PoC Diff - ${record.id}

Pending real Builder output.

This file should contain a real diff only after Builder confirms a valid issue and produces a reproducible fix or PoC.
`
    },
    {
      path: WORK_PACKAGE_FILES.OPS_CHECKLIST,
      content: `# Submission Checklist - ${record.id}

- [ ] Confirm platform eligibility and deadline
- [ ] Confirm Immunefi scope, KYC, PoC, and prohibited activities
- [ ] Validate fix with reproducible test steps
- [ ] Attach patch diff and implementation notes
- [ ] Attach benchmark/proof screenshots
- [ ] Prepare final submission text
- [ ] Submit on ${record.site}
`
    },
    {
      path: WORK_PACKAGE_FILES.SUBMISSION_LOG,
      content: `# Submission Log - ${record.id}

No external submission actions recorded yet.
`
    },
    {
      path: WORK_PACKAGE_FILES.POST_SUBMIT_PLAN,
      content: `# Post Submit Plan - ${record.id}

## Monitoring Cadence
- Track reviewer response windows.
- Log payout and KYC milestones.

## Response Notes
Keep reviewer responses factual, concise, and evidence-linked.
`
    }
  ];
}
