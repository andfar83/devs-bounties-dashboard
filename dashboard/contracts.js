import {
  AGENT_IDS,
  APP_MODE,
  ARTIFACT_TYPES,
  BOUNTY_STAGES,
  RUN_STATUS,
  STORAGE_BUCKETS,
  WORK_PACKAGE_FILES
} from "./config.js";

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
      app_mode: APP_MODE.SIMULATION,
      source: "dashboard-sim"
    }
  };
}

export function toScrapeRun({ mode, status = RUN_STATUS.RUNNING, userId = null, stats = {}, message = "" }) {
  return {
    contract_version: CONTRACT_VERSION,
    user_id: userId,
    mode,
    status,
    started_at: stats.started_at || nowIso(),
    completed_at: stats.completed_at || null,
    source_count: stats.source_count || 0,
    created_count: stats.created_count || 0,
    updated_count: stats.updated_count || 0,
    rejected_count: stats.rejected_count || 0,
    error_message: message || null,
    metadata: {
      app_mode: APP_MODE.SIMULATION
    }
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
      app_mode: APP_MODE.SIMULATION
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
      app_mode: APP_MODE.SIMULATION
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
    { ...base, artifact_type: ARTIFACT_TYPES.RULES, relative_path: WORK_PACKAGE_FILES.RULES_MD },
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

export function buildWorkPackageFiles(record) {
  const candidate = toBountyCandidate(record);
  const feasibilityReport = `# Feasibility Report - ${record.id}

Decision: conditional_go
Confidence: unknown

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
2. Reproduce or define baseline.
3. Build minimum winning artifact.
4. Package evidence for Ops review.
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
      mitigation: "Validate rules before execution and store source evidence.",
      contingency: "Escalate to no_go or request clarification."
    }
  ];

  return [
    {
      path: WORK_PACKAGE_FILES.SOURCE_JSON,
      content: JSON.stringify(candidate, null, 2)
    },
    {
      path: WORK_PACKAGE_FILES.RULES_MD,
      content: `# Rules Snapshot - ${record.id}

Platform: ${record.site}
Source URL: ${record.siteUrl}
Retrieved At: ${candidate.retrieved_at}

## Known Scope
${record.scope}

## Fix Required
${record.fixRequired}

## Notes
This file is a placeholder until the real scrape engine stores source rules and page captures.
`
    },
    {
      path: WORK_PACKAGE_FILES.RETRIEVED_PAGE_HTML,
      content: `<!-- Source capture placeholder for ${record.id}. Real scraper should store raw retrieved HTML here. -->`
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

Status: not started

## Challenge
${record.title}

## Implementation Notes
Add solution notes here once Builder starts execution.
`
    },
    {
      path: WORK_PACKAGE_FILES.REPRO,
      content: `# Reproduction - ${record.id}

## Environment
- OS: unknown
- Runtime: unknown
- Dependencies: unknown

## Steps
1. Add baseline setup command.
2. Add validation command.
3. Add expected output.
`
    },
    {
      path: WORK_PACKAGE_FILES.RESULTS,
      content: `# Results - ${record.id}

No benchmark results recorded yet.
`
    },
    {
      path: WORK_PACKAGE_FILES.PATCH,
      content: ""
    },
    {
      path: WORK_PACKAGE_FILES.OPS_CHECKLIST,
      content: `# Submission Checklist - ${record.id}

- [ ] Confirm platform eligibility and deadline
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

No submission actions recorded yet.
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
