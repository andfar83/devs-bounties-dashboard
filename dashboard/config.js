export const APP_MODE = {
  SIMULATION: "simulation",
  SHADOW_REAL: "shadow_real",
  LIVE_REAL: "live_real"
};

export const AGENT_IDS = {
  SCOUT: "scout",
  FEASIBILITY: "feasibility",
  BUILDER: "builder",
  OPS: "ops",
  INTEGRATION: "integration"
};

export const BOUNTY_STAGES = {
  DISCOVERED: "discovered",
  SHORTLISTED: "shortlisted",
  SUBMITTED: "submitted",
  WON: "won",
  PAID: "paid"
};

export const SCRAPE_MODES = {
  FAST: "fast",
  DEEP: "deep",
  FULL: "full"
};

export const RUN_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  DONE: "done",
  RETRY: "retry",
  FAILED: "failed"
};

export const ARTIFACT_TYPES = {
  SOURCE: "source",
  RULES: "rules",
  FEASIBILITY_REPORT: "feasibility_report",
  EFFORT_ESTIMATE: "effort_estimate",
  RISK_REGISTER: "risk_register",
  REPRO: "repro",
  RESULTS: "results",
  PATCH: "patch",
  SUBMISSION_PACKET: "submission_packet",
  SUBMISSION_LOG: "submission_log",
  POST_SUBMIT_PLAN: "post_submit_plan"
};

export const STORAGE_BUCKETS = {
  BOUNTY_ARTIFACTS: "bounty-artifacts"
};

export const LOCAL_TRACKING_CONFIG = {
  RECOMMENDED_ROOT: "C:\\Users\\andre\\APPS\\AA-STUDIO\\BOUNTY_WORK_PACKAGES",
  PACKAGE_PREFIX: "bounty-"
};

export const SCRAPE_ENGINE_PREFLIGHT = {
  DEFAULT_SOURCE_KEY: "manual_fixture",
  MAX_CANDIDATES_PER_PULL: 400,
  MAX_CONSECUTIVE_ERRORS: 3,
  CIRCUIT_COOLDOWN_MINUTES: 30,
  SHADOW_REAL_REQUIRES_REVIEW: true,
  LIVE_REAL_REQUIRES_EXPLICIT_APPROVAL: true
};

export const LOCAL_PACKAGE_FOLDERS = {
  CHALLENGE: "challenge",
  FEASIBILITY: "feasibility",
  SOLUTION: "solution",
  OPS: "ops",
  OPS_PACKET: "ops/submission_packet",
  CHALLENGE_SCREENSHOTS: "challenge/screenshots",
  SOLUTION_ARTIFACTS: "solution/artifacts"
};

export const WORK_PACKAGE_FILES = {
  SOURCE_JSON: "challenge/source.json",
  RULES_MD: "challenge/rules.md",
  RETRIEVED_PAGE_HTML: "challenge/retrieved-page.html",
  FEASIBILITY_REPORT: "feasibility/feasibility_report.md",
  EFFORT_ESTIMATE: "feasibility/effort_estimate.json",
  RISK_REGISTER: "feasibility/risk_register.json",
  SOLUTION_README: "solution/README.md",
  REPRO: "solution/REPRO.md",
  RESULTS: "solution/RESULTS.md",
  PATCH: "solution/patch.diff",
  OPS_CHECKLIST: "ops/submission-checklist.md",
  SUBMISSION_LOG: "ops/submission_log.md",
  POST_SUBMIT_PLAN: "ops/post_submit_plan.md"
};

export const SUPABASE_CONFIG = {
  URL: "https://mwniqoxghjquriybjdjs.supabase.co",
  PUBLISHABLE_KEY: "sb_publishable_nsSUN_oXLl9VfFWCBglN-w_Pp_vcBb5",
  AUTH_EMAIL_REDIRECT_TO: "https://aa-dashboard-bounties.vercel.app"
};
