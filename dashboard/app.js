import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LIVE_TICK_MS = 2200;
const FAST_POLL_MIN_MS = 5 * 60 * 1000;
const FAST_POLL_MAX_MS = 15 * 60 * 1000;
const DEEP_SCAN_MIN_MS = 30 * 60 * 1000;
const DEEP_SCAN_MAX_MS = 60 * 60 * 1000;
const FULL_REFRESH_MIN_MS = 6 * 60 * 60 * 1000;
const FULL_REFRESH_MAX_MS = 24 * 60 * 60 * 1000;
const MAX_BOUNTY_RECORDS = 400;
const SCOPE_BY_TYPE = {
  Security: "Identify, reproduce, and patch vulnerability with minimal blast radius.",
  Rendering: "Improve visual quality and performance while preserving scene fidelity.",
  "AI/ML": "Improve model quality, reproducibility, and inference reliability.",
  "Game Dev": "Implement gameplay/system fix with deterministic behavior and tests.",
  Data: "Improve data pipeline quality, schema validity, and metric integrity.",
  Optimization: "Reduce latency/cost with measurable benchmark improvement."
};
const FIX_BY_TYPE = {
  Security: "Root cause analysis, patch diff, exploit repro, and regression proof.",
  Rendering: "Algorithmic fix, benchmark screenshots, and frame-time comparison.",
  "AI/ML": "Training/inference patch, metric uplift report, and reproducible scripts.",
  "Game Dev": "Gameplay or backend fix, test scenario, and edge-case validation.",
  Data: "Validation pipeline fix, data quality checks, and audit report.",
  Optimization: "Profiling evidence, tuned implementation, and before/after metrics."
};

const stageOrder = ["discovered", "shortlisted", "submitted", "won", "paid"];
const stageRank = {
  discovered: 0,
  shortlisted: 1,
  submitted: 2,
  won: 3,
  paid: 4
};

const funnelStages = [
  { key: "discovered", label: "Discovered", className: "bar-discovered", money: false },
  { key: "shortlisted", label: "Shortlisted", className: "bar-shortlisted", money: false },
  { key: "submitted", label: "Submitted", className: "bar-submitted", money: false },
  { key: "won", label: "Won", className: "bar-won", money: false },
  { key: "paid", label: "Paid (USD)", className: "bar-paid", money: true }
];

const sourceSites = ["Gitcoin", "HackerOne", "Code4rena", "Topcoder", "Devpost", "Kaggle", "Immunefi"];
const siteUrls = {
  Gitcoin: "https://www.gitcoin.co/",
  HackerOne: "https://www.hackerone.com/",
  Code4rena: "https://code4rena.com/",
  Topcoder: "https://www.topcoder.com/challenges",
  Devpost: "https://devpost.com/",
  Kaggle: "https://www.kaggle.com/competitions",
  Immunefi: "https://immunefi.com/"
};
const bountyTypes = ["Security", "Rendering", "AI/ML", "Game Dev", "Data", "Optimization"];

const initialAgents = [
  {
    id: "scout",
    name: "Atlas",
    role: "Scout Agent",
    face: "./assets/faces/atlas.svg",
    functions: [
      "Scans bounty platforms and filters high-trust opportunities",
      "Ranks opportunities by fit, payout quality, and deadline feasibility",
      "Feeds qualified leads into the feasibility queue"
    ],
    color: "#2ec4b6",
    mood: "Standby",
    queue: 0,
    completed: 0,
    reliability: 97
  },
  {
    id: "feasibility",
    name: "Prism",
    role: "Feasibility Agent",
    face: "./assets/faces/prism.svg",
    functions: [
      "Runs go/no-go analysis with risk and effort scoring",
      "Defines acceptance criteria and execution boundaries",
      "Escalates blockers and rejects low-EV opportunities"
    ],
    color: "#ff9f1c",
    mood: "Standby",
    queue: 0,
    completed: 0,
    reliability: 95
  },
  {
    id: "builder",
    name: "Forge",
    role: "Builder Agent",
    face: "./assets/faces/forge.svg",
    functions: [
      "Implements technical solutions and experiment loops",
      "Benchmarks outputs against baseline and target metrics",
      "Packages reproducible artifacts for submission"
    ],
    color: "#4cc9f0",
    mood: "Standby",
    queue: 0,
    completed: 0,
    reliability: 93
  },
  {
    id: "ops",
    name: "Sentinel",
    role: "Ops Agent",
    face: "./assets/faces/sentinel.svg",
    functions: [
      "Manages deadlines, submission packets, and confirmations",
      "Monitors reviewer feedback and response windows",
      "Tracks payout workflows and post-submit reliability"
    ],
    color: "#ff6b6b",
    mood: "Standby",
    queue: 0,
    completed: 0,
    reliability: 98
  }
];

let agents = [];
let jobs = [];
let bountyRecords = [];
let funnel = {};
let activeFunnelStage = "discovered";

let simTimer = null;
let simRunning = false;
let lastCycleAt = null;
let scrapeEngineRunning = false;
let scoutWorkingUntil = 0;
let lastScrapeModeKey = null;
let reportsDirHandle = null;
let generatedReportData = null;
let trackDirHandle = null;
let selectedBountyId = null;
const archivedBountyIds = new Set();
const archiveInFlightIds = new Set();
let solvedBounties = [];
let scrapeSchedule = {
  nextFastAt: null,
  nextDeepAt: null,
  nextFullAt: null,
  lastRunMode: "none"
};
let supabaseClient = null;
let authSubscription = null;

const HARDWIRED_SUPABASE_URL = "https://mwniqoxghjquriybjdjs.supabase.co";
const HARDWIRED_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nsSUN_oXLl9VfFWCBglN-w_Pp_vcBb5";
const AUTH_EMAIL_REDIRECT_TO = window.location.origin;

const appShell = document.getElementById("app-shell");
const authGate = document.getElementById("auth-gate");
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const authPasswordConfirmInput = document.getElementById("auth-password-confirm");
const authPasswordToggleBtn = document.getElementById("auth-password-toggle");
const authPasswordConfirmToggleBtn = document.getElementById("auth-password-confirm-toggle");
const authCommentInput = document.getElementById("auth-comment");
const authSignInBtn = document.getElementById("auth-signin-btn");
const authSignUpBtn = document.getElementById("auth-signup-btn");
const authResendBtn = document.getElementById("auth-resend-btn");
const authStatus = document.getElementById("auth-status");
const signOutBtn = document.getElementById("signout-btn");
let pendingVerificationEmail = "";

const agentGrid = document.getElementById("agent-grid");
const jobsBody = document.getElementById("jobs-body");
const filterSelect = document.getElementById("agent-filter");
const simBtn = document.getElementById("sim-btn");
const scrapeEngineBtn = document.getElementById("scrape-engine-btn");
const scrapeFastBtn = document.getElementById("scrape-fast-btn");
const scrapeDeepBtn = document.getElementById("scrape-deep-btn");
const scrapeFullBtn = document.getElementById("scrape-full-btn");
const tickBtn = document.getElementById("tick-btn");
const resetBtn = document.getElementById("reset-btn");
const lastUpdate = document.getElementById("last-update");
const scoutStatus = document.getElementById("scout-status");
const scrapeCadence = document.getElementById("scrape-cadence");
const scrapeNext = document.getElementById("scrape-next");
const flowTrack = document.getElementById("flow-track");
const funnelAccordion = document.getElementById("funnel-accordion");
const createReportBtn = document.getElementById("create-report-btn");
const reportOutput = document.getElementById("report-output");
const downloadReportBtn = document.getElementById("download-report-btn");
const reportSaveStatus = document.getElementById("report-save-status");
const connectTrackBtn = document.getElementById("connect-track-btn");
const trackStatus = document.getElementById("track-status");
const bountyDisclosure = document.getElementById("bounty-disclosure");
const solvedBody = document.getElementById("solved-body");
const solvedMeta = document.getElementById("solved-meta");

function setAuthStatus(message, kind = "") {
  authStatus.textContent = message;
  authStatus.classList.remove("is-error", "is-ok");
  if (kind === "error") {
    authStatus.classList.add("is-error");
  }
  if (kind === "ok") {
    authStatus.classList.add("is-ok");
  }
}

function setAuthLoading(isLoading) {
  authSignInBtn.disabled = isLoading;
  authSignUpBtn.disabled = isLoading;
  if (authResendBtn) {
    authResendBtn.disabled = isLoading;
  }
}

function setAccessState(isAuthenticated, email = "") {
  appShell.hidden = !isAuthenticated;
  authGate.hidden = isAuthenticated;
  if (!isAuthenticated) {
    setAuthStatus("Not signed in.");
    return;
  }
  setAuthStatus(`Signed in as ${email || "user"}.`, "ok");
}

function getAuthFormValues() {
  const email = (authEmailInput.value || "").trim().toLowerCase();
  const password = authPasswordInput.value || "";
  const confirmPassword = authPasswordConfirmInput ? authPasswordConfirmInput.value || "" : "";
  const comment = authCommentInput ? (authCommentInput.value || "").trim() : "";
  return { email, password, confirmPassword, comment };
}

function setResendVisible(isVisible, email = "") {
  if (!authResendBtn) {
    return;
  }
  authResendBtn.hidden = !isVisible;
  if (isVisible && email) {
    pendingVerificationEmail = email;
  }
  if (!isVisible) {
    pendingVerificationEmail = "";
  }
}

function isEmailNotConfirmedError(error) {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes("email not confirmed");
}

function setPasswordVisible(input, btn, visible) {
  if (!input || !btn) {
    return;
  }
  input.type = visible ? "text" : "password";
  btn.textContent = visible ? "Hide" : "Show";
  btn.setAttribute("aria-pressed", visible ? "true" : "false");
}

function togglePasswordVisible(input, btn) {
  const nextVisible = input.type === "password";
  setPasswordVisible(input, btn, nextVisible);
}

function ensureSupabaseClient() {
  if (!HARDWIRED_SUPABASE_URL || !HARDWIRED_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase configuration is missing.");
  }
  supabaseClient = createClient(HARDWIRED_SUPABASE_URL, HARDWIRED_SUPABASE_PUBLISHABLE_KEY);

  if (authSubscription) {
    authSubscription.unsubscribe();
  }

  const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
    const email = session?.user?.email || "";
    if (event === "SIGNED_OUT" || !session) {
      setAccessState(false);
      return;
    }
    setAccessState(true, email);
    void persistAuthUserProfile(session.user);
  });
  authSubscription = data.subscription;
  return supabaseClient;
}

async function persistAuthUserProfile(user) {
  if (!supabaseClient || !user?.id) {
    return;
  }

  const profileRow = {
    id: user.id,
    email: user.email || null,
    last_login_at: new Date().toISOString()
  };

  const { error } = await supabaseClient.from("user_profiles").upsert(profileRow, { onConflict: "id" });
  if (error) {
    console.warn("user_profiles upsert failed:", error.message);
  }
}

async function persistAuthComment(user, comment) {
  if (!supabaseClient || !user?.id || !comment) {
    return;
  }

  const cleanComment = comment.trim().slice(0, 600);
  if (!cleanComment) {
    return;
  }

  const { error: commentError } = await supabaseClient.from("user_comments").insert({
    user_id: user.id,
    email: user.email || null,
    comment: cleanComment
  });
  if (commentError) {
    console.warn("user_comments insert failed:", commentError.message);
  }

  const { error: profileError } = await supabaseClient
    .from("user_profiles")
    .update({ latest_comment: cleanComment, last_login_at: new Date().toISOString() })
    .eq("id", user.id);
  if (profileError) {
    console.warn("user_profiles latest_comment update failed:", profileError.message);
  }
}

async function bootstrapAuth() {
  try {
    ensureSupabaseClient();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      throw error;
    }
    const email = data?.session?.user?.email || "";
    setAccessState(Boolean(data?.session), email);
    if (data?.session?.user) {
      await persistAuthUserProfile(data.session.user);
    }
    if (!data?.session) {
      setAuthStatus("Session not found. Sign in to continue.");
    }
  } catch (error) {
    supabaseClient = null;
    setAccessState(false);
    setAuthStatus(`Auth init failed: ${error.message}`, "error");
  }
}

async function handleSignIn() {
  const { email, password, comment } = getAuthFormValues();
  if (!email || !password) {
    setAuthStatus("Email and password are required.", "error");
    return;
  }

  try {
    setAuthLoading(true);
    setResendVisible(false);
    const client = ensureSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    await persistAuthUserProfile(data?.user);
    if (comment) {
      await persistAuthComment(data?.user, comment);
    }
    setAccessState(true, data?.user?.email || email);
    if (authCommentInput) {
      authCommentInput.value = "";
    }
    if (authPasswordConfirmInput) {
      authPasswordConfirmInput.value = "";
    }
  } catch (error) {
    if (isEmailNotConfirmedError(error)) {
      setResendVisible(true, email);
      setAuthStatus("Email not confirmed yet. Check your inbox or click 'Resend Confirmation Email'.", "error");
    } else {
      setAuthStatus(`Sign in failed: ${error.message}`, "error");
    }
  } finally {
    setAuthLoading(false);
  }
}

async function handleSignUp() {
  const { email, password, confirmPassword, comment } = getAuthFormValues();
  if (!email || !password) {
    setAuthStatus("Email and password are required.", "error");
    return;
  }
  if (!confirmPassword) {
    setAuthStatus("Please confirm your password.", "error");
    return;
  }
  if (password !== confirmPassword) {
    setAuthStatus("Password and confirmation do not match.", "error");
    return;
  }
  if (!comment) {
    setAuthStatus("Please leave a comment before entering.", "error");
    return;
  }

  try {
    setAuthLoading(true);
    setResendVisible(false);
    const client = ensureSupabaseClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: AUTH_EMAIL_REDIRECT_TO
      }
    });
    if (error) {
      throw error;
    }
    if (data.session) {
      await persistAuthUserProfile(data.user);
      await persistAuthComment(data.user, comment);
      setAccessState(true, data.user?.email || email);
      if (authCommentInput) {
        authCommentInput.value = "";
      }
      if (authPasswordConfirmInput) {
        authPasswordConfirmInput.value = "";
      }
      return;
    }
    setResendVisible(true, email);
    setAuthStatus("Account created. Check your email to verify, then sign in.", "ok");
  } catch (error) {
    setAuthStatus(`Sign up failed: ${error.message}`, "error");
  } finally {
    setAuthLoading(false);
  }
}

async function handleResendConfirmation() {
  const email = (authEmailInput.value || pendingVerificationEmail || "").trim().toLowerCase();
  if (!email) {
    setAuthStatus("Enter your email first so we can resend confirmation.", "error");
    return;
  }

  try {
    setAuthLoading(true);
    const client = ensureSupabaseClient();
    const { error } = await client.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: AUTH_EMAIL_REDIRECT_TO
      }
    });
    if (error) {
      throw error;
    }
    setResendVisible(true, email);
    setAuthStatus("Confirmation email re-sent. Check inbox/spam, confirm, then sign in.", "ok");
  } catch (error) {
    setAuthStatus(`Could not resend confirmation: ${error.message}`, "error");
  } finally {
    setAuthLoading(false);
  }
}

async function handleSignOut() {
  if (!supabaseClient) {
    setAccessState(false);
    return;
  }

  const { error } = await supabaseClient.auth.signOut({ scope: "local" });
  if (error) {
    setAuthStatus(`Sign out failed: ${error.message}`, "error");
    return;
  }
  setAccessState(false);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomMs(minMs, maxMs) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

function fmtMoney(num) {
  return `$${num.toLocaleString("en-US")}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function disclosureHtml(record) {
  if (!record) {
    return `<p class="report-empty">Select a bounty row to view disclosure.</p>`;
  }

  return `
    <div class="report-head">
      <p class="report-title">${record.id} - ${record.title}</p>
      <p class="report-stamp">${record.site}</p>
    </div>
    <div class="report-grid">
      <div class="report-kpi"><p class="kpi-label">Type</p><p class="kpi-value">${record.type}</p></div>
      <div class="report-kpi"><p class="kpi-label">Stage</p><p class="kpi-value">${record.stage}</p></div>
      <div class="report-kpi"><p class="kpi-label">Price</p><p class="kpi-value">${fmtMoney(record.price)}</p></div>
      <div class="report-kpi"><p class="kpi-label">Due</p><p class="kpi-value">${formatDate(record.dueDate)}</p></div>
    </div>
    <div class="report-section">
      <h3>Scope</h3>
      <p>${record.scope}</p>
    </div>
    <div class="report-section">
      <h3>Description</h3>
      <p>${record.description}</p>
    </div>
    <div class="report-section">
      <h3>Fix Required</h3>
      <p>${record.fixRequired}</p>
    </div>
  `;
}

function renderBountyDisclosure(record) {
  bountyDisclosure.innerHTML = disclosureHtml(record);
}

function upsertSolvedBounty(record) {
  if (!record) {
    return null;
  }

  let entry = solvedBounties.find((row) => row.id === record.id);
  if (!entry) {
    entry = {
      id: record.id,
      title: record.title,
      site: record.site,
      price: record.price,
      stage: record.stage,
      folderStatus: trackDirHandle ? "pending" : "pending",
      solvedAt: new Date(),
      note: trackDirHandle ? "Waiting for archive" : "Tracking folder not connected",
      snapshot: { ...record }
    };
    solvedBounties.unshift(entry);
    return entry;
  }

  entry.title = record.title;
  entry.site = record.site;
  entry.price = record.price;
  entry.stage = record.stage;
  entry.snapshot = { ...record };
  return entry;
}

function setSolvedFolderStatus(id, folderStatus, note) {
  const row = solvedBounties.find((entry) => entry.id === id);
  if (!row) {
    return;
  }
  row.folderStatus = folderStatus;
  row.note = note || row.note;
}

function renderSolvedBounties() {
  if (!solvedBounties.length) {
    solvedBody.innerHTML = "";
    solvedMeta.textContent = "No solved bounties yet.";
    return;
  }

  solvedMeta.textContent = `${solvedBounties.length} solved | ${
    solvedBounties.filter((row) => row.folderStatus === "tracked").length
  } tracked`;

  const statusClassByState = {
    pending: "status-review",
    tracked: "status-ready",
    failed: "status-blocked"
  };

  solvedBody.innerHTML = solvedBounties
    .map((row) => {
      const statusClass = statusClassByState[row.folderStatus] || "status-review";
      return `
        <tr>
          <td>${row.id}</td>
          <td>${row.title}</td>
          <td>${row.site}</td>
          <td>${fmtMoney(row.price)}</td>
          <td>${row.stage}</td>
          <td><span class="status ${statusClass}" title="${row.note || ""}">${row.folderStatus}</span></td>
          <td>${row.solvedAt.toLocaleString("en-US")}</td>
        </tr>
      `;
    })
    .join("");
}

function syncSolvedRowsWithLiveRecords() {
  for (const solved of solvedBounties) {
    const live = bountyRecords.find((r) => r.id === solved.id);
    if (!live) {
      continue;
    }
    solved.stage = live.stage;
    solved.price = live.price;
    solved.snapshot = { ...live };
  }
}

function formatCountdown(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function scheduleNextFast(baseTime = Date.now()) {
  scrapeSchedule.nextFastAt = baseTime + randomMs(FAST_POLL_MIN_MS, FAST_POLL_MAX_MS);
}

function scheduleNextDeep(baseTime = Date.now()) {
  scrapeSchedule.nextDeepAt = baseTime + randomMs(DEEP_SCAN_MIN_MS, DEEP_SCAN_MAX_MS);
}

function scheduleNextFull(baseTime = Date.now()) {
  scrapeSchedule.nextFullAt = baseTime + randomMs(FULL_REFRESH_MIN_MS, FULL_REFRESH_MAX_MS);
}

function seedScrapeSchedule(baseTime = Date.now()) {
  scheduleNextFast(baseTime);
  scheduleNextDeep(baseTime);
  scheduleNextFull(baseTime);
}

function isAnyScrapeDue(now) {
  if (!scrapeEngineRunning) {
    return false;
  }
  return (
    (scrapeSchedule.nextFastAt && now >= scrapeSchedule.nextFastAt) ||
    (scrapeSchedule.nextDeepAt && now >= scrapeSchedule.nextDeepAt) ||
    (scrapeSchedule.nextFullAt && now >= scrapeSchedule.nextFullAt)
  );
}

function nextScrapeSummary(now) {
  const nextEvents = [
    { label: "Fast", at: scrapeSchedule.nextFastAt },
    { label: "Deep", at: scrapeSchedule.nextDeepAt },
    { label: "Full", at: scrapeSchedule.nextFullAt }
  ].filter((item) => item.at);

  if (!nextEvents.length) {
    return "--";
  }

  nextEvents.sort((a, b) => a.at - b.at);
  const soonest = nextEvents[0];
  const msLeft = soonest.at - now;
  return `${soonest.label} in ${formatCountdown(msLeft)}`;
}

function isOverdue(record) {
  const now = new Date();
  const due = new Date(record.dueDate);
  return due < now && stageRank[record.stage] < stageRank.won;
}

function isWon(record) {
  return stageRank[record.stage] >= stageRank.won;
}

function computeFunnelSummary(records) {
  return {
    discovered: records.length,
    shortlisted: records.filter((r) => stageRank[r.stage] >= stageRank.shortlisted).length,
    submitted: records.filter((r) => stageRank[r.stage] >= stageRank.submitted).length,
    won: records.filter((r) => stageRank[r.stage] >= stageRank.won).length,
    paid: records.filter((r) => r.stage === "paid").reduce((sum, r) => sum + r.price, 0)
  };
}

function getRecordsForStage(stageKey) {
  if (stageKey === "paid") {
    return bountyRecords.filter((r) => r.stage === "paid");
  }
  return bountyRecords.filter((r) => stageRank[r.stage] >= stageRank[stageKey]);
}

function initState() {
  clearStateForSimulation();
}

function pruneBountyRecords() {
  if (bountyRecords.length <= MAX_BOUNTY_RECORDS) {
    return;
  }

  // Prefer keeping active pipeline items; discard oldest completed first.
  const paid = bountyRecords.filter((r) => r.stage === "paid");
  const active = bountyRecords.filter((r) => r.stage !== "paid");
  const overflow = bountyRecords.length - MAX_BOUNTY_RECORDS;

  if (paid.length >= overflow) {
    bountyRecords = [...active, ...paid.slice(overflow)];
    return;
  }

  const remainingOverflow = overflow - paid.length;
  bountyRecords = [...active.slice(remainingOverflow)];
}

function clearStateForSimulation() {
  agents = deepClone(initialAgents).map((agent) => {
    return { ...agent, mood: "Standby", queue: 0, completed: 0 };
  });
  jobs = [];
  bountyRecords = [];
  funnel = computeFunnelSummary(bountyRecords);
  activeFunnelStage = "discovered";
  selectedBountyId = null;
  archivedBountyIds.clear();
  archiveInFlightIds.clear();
  solvedBounties = [];
  scrapeSchedule = { nextFastAt: null, nextDeepAt: null, nextFullAt: null, lastRunMode: "none" };
  renderBountyDisclosure(null);
  renderEmptyReport();
  renderSolvedBounties();
}

function stateClass(state) {
  return {
    running: "status-running",
    review: "status-review",
    blocked: "status-blocked",
    ready: "status-ready"
  }[state] || "status-review";
}

function renderFilter() {
  filterSelect.innerHTML = `<option value="all">All Agents</option>`;
  for (const agent of agents) {
    const opt = document.createElement("option");
    opt.value = agent.id;
    opt.textContent = `${agent.name} (${agent.role})`;
    filterSelect.appendChild(opt);
  }
}

function getAgentRuntimeState(agent) {
  if (!simRunning) {
    return { label: "Off", lightClass: "light-off" };
  }

  if (!scrapeEngineRunning) {
    return { label: "Standby", lightClass: "light-standby" };
  }

  const liveStats = getAgentStats(agent.id);

  if (agent.id === "scout") {
    if (Date.now() < scoutWorkingUntil) {
      return { label: "Working", lightClass: "light-working" };
    }
    if (liveStats.queue > 0) {
      return { label: "Working", lightClass: "light-working" };
    }
    return { label: "Standby", lightClass: "light-standby" };
  }

  if (liveStats.queue > 0) {
    return { label: "Working", lightClass: "light-working" };
  }

  return { label: "Standby", lightClass: "light-standby" };
}

function getAgentStats(agentId) {
  const discovered = funnel.discovered || 0;
  const shortlisted = funnel.shortlisted || 0;
  const submitted = funnel.submitted || 0;
  const won = funnel.won || 0;

  if (agentId === "scout") {
    return { queue: Math.max(0, discovered - shortlisted), done: discovered };
  }
  if (agentId === "feasibility") {
    return { queue: Math.max(0, shortlisted - submitted), done: shortlisted };
  }
  if (agentId === "builder") {
    return { queue: Math.max(0, submitted - won), done: submitted };
  }
  if (agentId === "ops") {
    return { queue: Math.max(0, won - bountyRecords.filter((r) => r.stage === "paid").length), done: won };
  }

  return { queue: 0, done: 0 };
}

function renderAgents() {
  agentGrid.innerHTML = "";
  for (const agent of agents) {
    const runtime = getAgentRuntimeState(agent);
    const functionMarkup = agent.functions.map((item) => `<li>${item}</li>`).join("");
    const stats = getAgentStats(agent.id);
    const card = document.createElement("article");
    card.className = "agent-card";
    card.tabIndex = 0;
    card.style.setProperty("--accent", agent.color);
    card.innerHTML = `
      <div class="agent-head">
        <div>
          <p class="agent-name">${agent.name}</p>
          <p class="agent-role">${agent.role}</p>
        </div>
        <span class="pill">${agent.mood}</span>
      </div>
      <p class="agent-runtime">
        <span class="agent-light ${runtime.lightClass}"></span>
        <span>${runtime.label}</span>
      </p>
      <div class="stat-row">
        <div class="stat">
          <p class="label">Queue</p>
          <p class="value">${stats.queue}</p>
        </div>
        <div class="stat">
          <p class="label">Done</p>
          <p class="value">${stats.done}</p>
        </div>
        <div class="stat">
          <p class="label">Reliability</p>
          <p class="value">${agent.reliability}%</p>
        </div>
      </div>
      <div class="agent-tooltip">
        <div class="tooltip-head">
          <img src="${agent.face}" alt="${agent.name} face" class="tooltip-face" />
          <div>
            <p class="tooltip-name">${agent.name}</p>
            <p class="tooltip-role">${agent.role}</p>
          </div>
        </div>
        <p class="tooltip-title">Functions</p>
        <ul class="tooltip-list">
          ${functionMarkup}
        </ul>
      </div>
    `;
    agentGrid.appendChild(card);
  }
}

function renderJobs() {
  const selected = filterSelect.value;
  jobsBody.innerHTML = "";
  const visible = selected === "all" ? jobs : jobs.filter((j) => j.agent === selected);

  for (const job of visible) {
    const agent = agents.find((a) => a.id === job.agent);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${job.title}</td>
      <td>${agent ? agent.name : job.agent}</td>
      <td><span class="status ${stateClass(job.state)}">${job.state}</span></td>
      <td>${job.eta}</td>
      <td>${job.ev}</td>
    `;
    jobsBody.appendChild(row);
  }
}

function renderFlow() {
  const flow = {
    scout: funnel.discovered || 0,
    feasibility: funnel.shortlisted || 0,
    builder: funnel.submitted || 0,
    ops: funnel.won || 0
  };

  const scoutStats = getAgentStats("scout");
  const feasStats = getAgentStats("feasibility");
  const buildStats = getAgentStats("builder");
  const opsStats = getAgentStats("ops");
  const hasLiveWork =
    simRunning &&
    scrapeEngineRunning &&
    (Date.now() < scoutWorkingUntil ||
      scoutStats.queue > 0 ||
      feasStats.queue > 0 ||
      buildStats.queue > 0 ||
      opsStats.queue > 0);

  if (flowTrack) {
    flowTrack.classList.toggle("is-active", hasLiveWork);
  }

  document.getElementById("flow-scout").textContent = flow.scout;
  document.getElementById("flow-feas").textContent = flow.feasibility;
  document.getElementById("flow-build").textContent = flow.builder;
  document.getElementById("flow-ops").textContent = flow.ops;
}

function detailTableMarkup(records) {
  if (!records.length) {
    return `<p class="detail-empty">No bounties in this stage.</p>`;
  }

  const rows = records
    .map((record) => {
      return `
        <tr data-bounty-id="${record.id}" class="bounty-row">
          <td>${record.id}</td>
          <td><a href="${record.siteUrl || "#"}" target="_blank" rel="noopener noreferrer">${record.site}</a></td>
          <td>${record.title}</td>
          <td>${record.type}</td>
          <td>${fmtMoney(record.price)}</td>
          <td>${isWon(record) ? "Yes" : "No"}</td>
          <td>${isOverdue(record) ? "Yes" : "No"}</td>
          <td>${formatDate(record.dueDate)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="detail-table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Site</th>
            <th>Bounty</th>
            <th>Type</th>
            <th>Price</th>
            <th>Won</th>
            <th>Overdue</th>
            <th>Due Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderFunnel() {
  funnel = computeFunnelSummary(bountyRecords);

  funnelAccordion.innerHTML = funnelStages
    .map((stage) => {
      const value = stage.money ? fmtMoney(funnel[stage.key]) : funnel[stage.key];
      const records = getRecordsForStage(stage.key);
      const overdueCount = records.filter(isOverdue).length;
      const isOpen = activeFunnelStage === stage.key;

      return `
        <div class="funnel-item">
          <button class="bar ${stage.className}" data-stage="${stage.key}" aria-expanded="${isOpen}">
            <span class="bar-left">
              <span class="bar-caret">&#9656;</span>
              <span>${stage.label}</span>
            </span>
            <strong>${value}</strong>
          </button>
          <div class="funnel-detail" ${isOpen ? "" : "hidden"}>
            <div class="detail-header">
              <span>Records: ${records.length}</span>
              <span>Overdues: ${overdueCount}</span>
            </div>
            ${detailTableMarkup(records)}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderScoutStatus() {
  const scout = agents.find((a) => a.id === "scout");

  if (!simRunning) {
    scoutStatus.textContent = "Scout status: Off";
    if (scout) scout.mood = "Standby";
    setModeButtonActive(null);
  } else if (!scrapeEngineRunning) {
    scoutStatus.textContent = "Scout status: Standby (Scrape engine off)";
    if (scout) scout.mood = "Standby";
    setModeButtonActive(null);
  } else if (Date.now() < scoutWorkingUntil) {
    scoutStatus.textContent = `Scout status: Working (${scrapeSchedule.lastRunMode})`;
    if (scout) scout.mood = scrapeSchedule.lastRunMode.split(":")[0];
    setModeButtonActive(lastScrapeModeKey);
  } else {
    scoutStatus.textContent = "Scout status: Standby (waiting next cadence)";
    if (scout) scout.mood = "Standby";
    setModeButtonActive(null);
  }

  scrapeCadence.textContent = "Cadence: Fast 5-15m | Deep 30-60m | Full 6-24h";

  if (!scrapeEngineRunning) {
    scrapeNext.textContent = "Next scrape: --";
    return;
  }

  scrapeNext.textContent = `Next scrape: ${nextScrapeSummary(Date.now())}`;
}

function stampUpdate() {
  const now = new Date();
  lastUpdate.textContent = `Last update: ${now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })}`;
}

function timestampStamp(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
}

function buildReportDataset() {
  const now = new Date();
  const overdueAll = bountyRecords.filter(isOverdue);
  const wonAll = bountyRecords.filter(isWon);
  const openValue = bountyRecords.filter((r) => stageRank[r.stage] < stageRank.won).reduce((sum, r) => sum + r.price, 0);
  const avgTicket = bountyRecords.length
    ? Math.round(bountyRecords.reduce((sum, r) => sum + r.price, 0) / bountyRecords.length)
    : 0;
  const winRate = funnel.discovered ? Math.round((wonAll.length / funnel.discovered) * 100) : 0;

  return {
    generatedAt: now,
    kpis: {
      discovered: funnel.discovered,
      submitted: funnel.submitted,
      won: funnel.won,
      paid: funnel.paid,
      overdues: overdueAll.length,
      winRate,
      openValue,
      avgTicket
    },
    rows: bountyRecords.map((r) => {
      return {
        id: r.id,
        site: r.site,
        siteUrl: r.siteUrl,
        type: r.type,
        price: r.price,
        stage: r.stage,
        won: isWon(r) ? "Yes" : "No",
        overdue: isOverdue(r) ? "Yes" : "No",
        dueDate: r.dueDate
      };
    })
  };
}

function reportToSheetRows(reportData) {
  const rows = [
    ["Funding Funnel Report"],
    ["Generated At", reportData.generatedAt.toLocaleString("en-US")],
    [],
    ["KPI", "Value"],
    ["Discovered", reportData.kpis.discovered],
    ["Submitted", reportData.kpis.submitted],
    ["Won", reportData.kpis.won],
    ["Paid USD", reportData.kpis.paid],
    ["Overdues", reportData.kpis.overdues],
    ["Win Rate %", reportData.kpis.winRate],
    ["Open Value USD", reportData.kpis.openValue],
    ["Average Ticket USD", reportData.kpis.avgTicket],
    [],
    ["ID", "Site", "Site URL", "Type", "Price USD", "Stage", "Won", "Overdue", "Due Date"]
  ];

  for (const row of reportData.rows) {
    rows.push([row.id, row.site, row.siteUrl, row.type, row.price, row.stage, row.won, row.overdue, row.dueDate]);
  }
  return rows;
}

function toWorkbookBytes(reportData) {
  if (!window.XLSX) {
    return null;
  }

  const wb = window.XLSX.utils.book_new();
  const sheet = window.XLSX.utils.aoa_to_sheet(reportToSheetRows(reportData));
  window.XLSX.utils.book_append_sheet(wb, sheet, "Funding Report");
  return window.XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

function renderEmptyReport() {
  reportOutput.innerHTML = `<p class="report-empty">No report generated yet.</p>`;
  generatedReportData = null;
  downloadReportBtn.disabled = true;
  reportSaveStatus.textContent = "Generate a report first.";
}

function renderReport() {
  generatedReportData = buildReportDataset();
  const now = generatedReportData.generatedAt;
  const rows = generatedReportData.rows
    .map((r) => {
      return `
        <tr>
          <td>${r.id}</td>
          <td><a href="${r.siteUrl || "#"}" target="_blank" rel="noopener noreferrer">${r.site}</a></td>
          <td>${r.type}</td>
          <td>${fmtMoney(Number(r.price || 0))}</td>
          <td>${r.stage}</td>
          <td>${r.won}</td>
          <td>${r.overdue}</td>
        </tr>
      `;
    })
    .join("");

  reportOutput.innerHTML = `
    <div class="report-head">
      <p class="report-title">Funding Funnel Report</p>
      <p class="report-stamp">${now.toLocaleString("en-US")}</p>
    </div>
    <div class="report-grid">
      <div class="report-kpi"><p class="kpi-label">Discovered</p><p class="kpi-value">${generatedReportData.kpis.discovered}</p></div>
      <div class="report-kpi"><p class="kpi-label">Submitted</p><p class="kpi-value">${generatedReportData.kpis.submitted}</p></div>
      <div class="report-kpi"><p class="kpi-label">Won</p><p class="kpi-value">${generatedReportData.kpis.won}</p></div>
      <div class="report-kpi"><p class="kpi-label">Paid</p><p class="kpi-value">${fmtMoney(generatedReportData.kpis.paid)}</p></div>
    </div>
    <div class="report-grid">
      <div class="report-kpi"><p class="kpi-label">Overdues</p><p class="kpi-value">${generatedReportData.kpis.overdues}</p></div>
      <div class="report-kpi"><p class="kpi-label">Win Rate</p><p class="kpi-value">${generatedReportData.kpis.winRate}%</p></div>
      <div class="report-kpi"><p class="kpi-label">Open Value</p><p class="kpi-value">${fmtMoney(generatedReportData.kpis.openValue)}</p></div>
      <div class="report-kpi"><p class="kpi-label">Avg Ticket</p><p class="kpi-value">${fmtMoney(generatedReportData.kpis.avgTicket)}</p></div>
    </div>
    <div class="report-section">
      <h3>Bounty Detail</h3>
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Site</th>
              <th>Type</th>
              <th>Price</th>
              <th>Stage</th>
              <th>Won</th>
              <th>Overdue</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  downloadReportBtn.disabled = false;
  reportSaveStatus.textContent = "Report ready. Click Download Excel Report.";
}

function createRandomBounty() {
  const id = `B-${1000 + bountyRecords.length + Math.floor(Math.random() * 200)}`;
  const site = sourceSites[Math.floor(Math.random() * sourceSites.length)];
  const type = bountyTypes[Math.floor(Math.random() * bountyTypes.length)];
  const price = 700 + Math.floor(Math.random() * 4200);
  const daysAhead = 7 + Math.floor(Math.random() * 45);
  const dueDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    id,
    site,
    siteUrl: siteUrls[site],
    type,
    title: `${type} challenge`,
    description: `Bounty from ${site} requiring a production-ready ${type.toLowerCase()} implementation.`,
    scope: SCOPE_BY_TYPE[type],
    fixRequired: FIX_BY_TYPE[type],
    price,
    stage: "discovered",
    dueDate
  };
}

function promoteRandomRecord(fromStage, toStage, chance) {
  if (Math.random() > chance) {
    return null;
  }
  const candidates = bountyRecords.filter((r) => r.stage === fromStage);
  if (!candidates.length) {
    return null;
  }
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  target.stage = toStage;
  return target;
}

function projectCopyText(record) {
  return `# ${record.id} - ${record.title}

Platform: ${record.site}
Type: ${record.type}
Stage: ${record.stage}
Price: ${fmtMoney(record.price)}
Due Date: ${record.dueDate}
Source URL: ${record.siteUrl}

## Scope
${record.scope}

## Description
${record.description}

## Fix Required
${record.fixRequired}
`;
}

async function archiveSolvedBounty(record) {
  if (!record) {
    return;
  }

  const solved = upsertSolvedBounty(record);
  if (!solved) {
    return;
  }

  if (!trackDirHandle) {
    setSolvedFolderStatus(record.id, "pending", "Tracking folder not connected");
    return;
  }

  if (archivedBountyIds.has(record.id)) {
    setSolvedFolderStatus(record.id, "tracked", "Already archived");
    return;
  }

  if (archiveInFlightIds.has(record.id)) {
    return;
  }

  archiveInFlightIds.add(record.id);
  archivedBountyIds.add(record.id);
  setSolvedFolderStatus(record.id, "pending", "Writing project copy");

  try {
    const folderHandle = await trackDirHandle.getDirectoryHandle(`bounty-${record.id}`, { create: true });
    const disclosureHandle = await folderHandle.getFileHandle("disclosure.md", { create: true });
    const disclosureWritable = await disclosureHandle.createWritable();
    await disclosureWritable.write(projectCopyText(record));
    await disclosureWritable.close();

    const checklistHandle = await folderHandle.getFileHandle("submission-checklist.md", { create: true });
    const checklistWritable = await checklistHandle.createWritable();
    await checklistWritable.write(
      `# Submission Checklist - ${record.id}

- [ ] Confirm platform eligibility and deadline
- [ ] Validate fix with reproducible test steps
- [ ] Attach patch diff and implementation notes
- [ ] Attach benchmark/proof screenshots
- [ ] Prepare final submission text
- [ ] Submit on ${record.site}
`
    );
    await checklistWritable.close();
    setSolvedFolderStatus(record.id, "tracked", "Project copy and checklist created");
    trackStatus.textContent = `Tracked solved bounty ${record.id} in connected folder.`;
  } catch (error) {
    archivedBountyIds.delete(record.id);
    setSolvedFolderStatus(record.id, "failed", "Folder write failed");
    trackStatus.textContent = `Could not track ${record.id}: folder write failed.`;
  } finally {
    archiveInFlightIds.delete(record.id);
  }
}

async function connectTrackFolder() {
  try {
    if (!("showDirectoryPicker" in window)) {
      trackStatus.textContent = "Folder API unavailable in this browser.";
      return;
    }
    trackDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    trackStatus.textContent = "Tracking folder connected.";
    for (const row of solvedBounties.filter((item) => item.folderStatus !== "tracked")) {
      await archiveSolvedBounty(row.snapshot);
    }
  } catch (error) {
    trackStatus.textContent = "Tracking folder connection canceled.";
  }
}

function runScrapeMode(mode) {
  if (!simRunning) {
    scrapeSchedule.lastRunMode = "Scrape blocked (start live sim)";
    return;
  }
  if (!scrapeEngineRunning) {
    scrapeSchedule.lastRunMode = "Scrape blocked (start scrape engine)";
    return;
  }

  const scout = agents.find((a) => a.id === "scout");
  if (!scout) {
    return;
  }
  const feasibility = agents.find((a) => a.id === "feasibility");
  const builder = agents.find((a) => a.id === "builder");
  const ops = agents.find((a) => a.id === "ops");

  const modeConfig = {
    fast: { label: "Fast Poll", minFound: 1, maxFound: 2, shortlistChance: 0.35 },
    deep: { label: "Deep Scan", minFound: 1, maxFound: 4, shortlistChance: 0.55 },
    full: { label: "Full Refresh", minFound: 2, maxFound: 7, shortlistChance: 0.75 }
  }[mode];

  if (!modeConfig) {
    return;
  }

  scout.mood = modeConfig.label;
  scoutWorkingUntil = Date.now() + 90 * 1000;
  lastScrapeModeKey = mode;
  setModeButtonActive(mode);

  const foundCount = randInt(modeConfig.minFound, modeConfig.maxFound);
  if (foundCount === 0) {
    if (feasibility) feasibility.mood = "Standby";
    if (builder) builder.mood = "Standby";
    if (ops) ops.mood = "Standby";
    scrapeSchedule.lastRunMode = `${modeConfig.label}: no new`;
    return;
  }

  for (let i = 0; i < foundCount; i += 1) {
    bountyRecords.push(createRandomBounty());
  }
  pruneBountyRecords();

  // Guarantee at least one handoff to feasibility on each successful scrape.
  promoteRandomRecord("discovered", "shortlisted", 1);
  for (let i = 1; i < foundCount; i += 1) {
    promoteRandomRecord("discovered", "shortlisted", modeConfig.shortlistChance);
  }

  if (feasibility) feasibility.mood = "Reviewing";
  if (builder) builder.mood = "Queued";
  if (ops) ops.mood = "Standby";

  if (!jobs.some((job) => job.agent === "scout")) {
    jobs.push({
      title: `${modeConfig.label} review queue`,
      agent: "scout",
      state: "running",
      eta: "00:25",
      ev: `$${randInt(800, 5200).toLocaleString("en-US")}`
    });
  }

  scrapeSchedule.lastRunMode = `${modeConfig.label}: +${foundCount}`;
}

function triggerFallbackDownload(bytes, filename) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveExcelReport() {
  if (!generatedReportData) {
    reportSaveStatus.textContent = "Generate a report first.";
    return;
  }

  const workbookBytes = toWorkbookBytes(generatedReportData);
  if (!workbookBytes) {
    reportSaveStatus.textContent = "Excel library not loaded. Falling back to browser download.";
    const fallbackCsv = reportToSheetRows(generatedReportData).map((row) => row.join(",")).join("\n");
    const blob = new Blob([fallbackCsv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `funding-funnel-report-${timestampStamp()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  const filename = `funding-funnel-report-${timestampStamp()}.xlsx`;

  try {
    if (!("showDirectoryPicker" in window)) {
      triggerFallbackDownload(workbookBytes, filename);
      reportSaveStatus.textContent = "Downloaded to browser default folder (directory API unavailable).";
      return;
    }

    if (!reportsDirHandle) {
      reportSaveStatus.textContent = "Pick dashboard/reports folder to save report files.";
      reportsDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    }

    const fileHandle = await reportsDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(workbookBytes);
    await writable.close();
    reportSaveStatus.textContent = `Saved in selected folder as ${filename}`;
  } catch (error) {
    triggerFallbackDownload(workbookBytes, filename);
    reportSaveStatus.textContent = `Could not write to folder. Downloaded ${filename} instead.`;
  }
}

function processScheduledScrapes(now) {
  if (!scrapeEngineRunning) {
    return;
  }

  if (scrapeSchedule.nextFastAt && now >= scrapeSchedule.nextFastAt) {
    runScrapeMode("fast");
    scheduleNextFast(now);
  }
  if (scrapeSchedule.nextDeepAt && now >= scrapeSchedule.nextDeepAt) {
    runScrapeMode("deep");
    scheduleNextDeep(now);
  }
  if (scrapeSchedule.nextFullAt && now >= scrapeSchedule.nextFullAt) {
    runScrapeMode("full");
    scheduleNextFull(now);
  }
}

function updateNonScoutCycles() {
  const hasPipelineWork = bountyRecords.some((r) => stageRank[r.stage] >= stageRank.shortlisted);
  const feasibility = agents.find((a) => a.id === "feasibility");
  const builder = agents.find((a) => a.id === "builder");
  const ops = agents.find((a) => a.id === "ops");

  if (!hasPipelineWork) {
    if (feasibility) feasibility.mood = "Standby";
    if (builder) builder.mood = "Standby";
    if (ops) ops.mood = "Standby";
    return;
  }

  for (const agent of agents.filter((a) => a.id !== "scout")) {
    agent.reliability = Math.max(88, Math.min(99, agent.reliability + (Math.random() > 0.8 ? -1 : 0)));
  }

  promoteRandomRecord("shortlisted", "submitted", 0.45);
  const solved = promoteRandomRecord("submitted", "won", 0.32);
  if (solved) {
    archiveSolvedBounty(solved);
  }
  promoteRandomRecord("won", "paid", 0.18);

  const nextFunnel = computeFunnelSummary(bountyRecords);

  if (feasibility) feasibility.mood = nextFunnel.shortlisted > nextFunnel.submitted ? "Reviewing" : "Standby";
  if (builder) builder.mood = nextFunnel.submitted > nextFunnel.won ? "Shipping" : "Standby";
  if (ops) ops.mood = nextFunnel.won > 0 ? "Coordinating" : "Standby";
}

function updateJobStates() {
  const statsByAgent = {
    scout: getAgentStats("scout"),
    feasibility: getAgentStats("feasibility"),
    builder: getAgentStats("builder"),
    ops: getAgentStats("ops")
  };

  if (!simRunning || !scrapeEngineRunning) {
    for (const job of jobs) {
      job.state = "ready";
    }
    return;
  }

  const ensureJob = (agentId, title, eta, ev) => {
    if (jobs.some((job) => job.agent === agentId)) {
      return;
    }
    jobs.push({ title, agent: agentId, state: "ready", eta, ev });
  };

  ensureJob("scout", "Scout queue processing", "00:25", `$${randInt(800, 5200).toLocaleString("en-US")}`);
  ensureJob("feasibility", "Feasibility review", "00:35", "$0");
  ensureJob("builder", "Implementation execution", "01:40", "$0");
  ensureJob("ops", "Submission packet prep", "00:30", "$0");

  for (const job of jobs) {
    if (job.agent === "scout") {
      job.state = Date.now() < scoutWorkingUntil || statsByAgent.scout.queue > 0 ? "running" : "ready";
      continue;
    }
    if (job.agent === "feasibility") {
      job.state = statsByAgent.feasibility.queue > 0 ? "review" : "ready";
      continue;
    }
    if (job.agent === "builder") {
      job.state = statsByAgent.builder.queue > 0 ? "running" : "ready";
      continue;
    }
    if (job.agent === "ops") {
      job.state = statsByAgent.ops.queue > 0 ? "running" : "ready";
      continue;
    }
    job.state = "ready";
  }
}

function updateCycle() {
  if (!simRunning || !scrapeEngineRunning) {
    return;
  }
  updateNonScoutCycles();
  updateJobStates();
  funnel = computeFunnelSummary(bountyRecords);
}

function renderAll() {
  funnel = computeFunnelSummary(bountyRecords);
  syncSolvedRowsWithLiveRecords();
  updateJobStates();
  renderAgents();
  renderJobs();
  renderFlow();
  renderFunnel();
  renderBountyDisclosure(bountyRecords.find((r) => r.id === selectedBountyId) || null);
  renderSolvedBounties();
  renderScoutStatus();
  stampUpdate();
}

function stopSimulation() {
  if (simTimer) {
    clearInterval(simTimer);
    simTimer = null;
  }
}

function startSimulationTimer() {
  stopSimulation();
  lastCycleAt = Date.now();
  simTimer = setInterval(runScheduler, 1000);
}

function setSimButtonState() {
  if (simRunning) {
    simBtn.textContent = "Stop Live Sim";
    simBtn.classList.remove("btn-primary");
    simBtn.classList.add("btn-secondary");
    return;
  }

  simBtn.textContent = "Start Live Sim";
  simBtn.classList.remove("btn-secondary");
  simBtn.classList.add("btn-primary");
}

function setScrapeButtonState() {
  if (scrapeEngineRunning) {
    scrapeEngineBtn.textContent = "Stop Scrape Engine";
    scrapeEngineBtn.classList.remove("btn-primary");
    scrapeEngineBtn.classList.add("btn-secondary");
    return;
  }

  scrapeEngineBtn.textContent = "Start Scrape Engine";
  scrapeEngineBtn.classList.remove("btn-secondary");
  scrapeEngineBtn.classList.add("btn-primary");
}

function setCadenceButtonsEnabled() {
  const enabled = simRunning;
  scrapeFastBtn.disabled = !enabled;
  scrapeDeepBtn.disabled = !enabled;
  scrapeFullBtn.disabled = !enabled;
}

function runCadenceClick(mode) {
  if (!simRunning) {
    scrapeSchedule.lastRunMode = "Cadence blocked (start live sim first)";
    renderAll();
    return;
  }

  if (!scrapeEngineRunning) {
    scrapeEngineRunning = true;
    seedScrapeSchedule(Date.now());
    scrapeSchedule.lastRunMode = "Scheduled";
    setScrapeButtonState();
  }

  runScrapeMode(mode);
  if (mode === "fast") {
    scheduleNextFast(Date.now());
  } else if (mode === "deep") {
    scheduleNextDeep(Date.now());
  } else if (mode === "full") {
    scheduleNextFull(Date.now());
  }
  setCadenceButtonsEnabled();
  renderAll();
}

function setModeButtonActive(modeKey = null) {
  const modeButtons = {
    fast: scrapeFastBtn,
    deep: scrapeDeepBtn,
    full: scrapeFullBtn
  };

  for (const [key, btn] of Object.entries(modeButtons)) {
    if (!btn) {
      continue;
    }
    if (key === modeKey) {
      btn.classList.add("btn-mode-active");
    } else {
      btn.classList.remove("btn-mode-active");
    }
  }
}

function pulseModeButton(btn) {
  if (!btn) {
    return;
  }
  btn.classList.add("btn-mode-active");
  setTimeout(() => {
    if (!scrapeEngineRunning || Date.now() >= scoutWorkingUntil) {
      btn.classList.remove("btn-mode-active");
    }
  }, 500);
}

function toggleScrapeEngine() {
  if (!simRunning) {
    scrapeSchedule.lastRunMode = "Engine blocked (start live sim first)";
    renderAll();
    return;
  }

  scrapeEngineRunning = !scrapeEngineRunning;
  if (scrapeEngineRunning) {
    seedScrapeSchedule(Date.now());
    scrapeSchedule.lastRunMode = "Scheduled";
    runScrapeMode("fast");
    scheduleNextFast(Date.now());
  } else {
    scrapeSchedule.lastRunMode = "Stopped";
    scoutWorkingUntil = 0;
    lastScrapeModeKey = null;
    setModeButtonActive(null);
  }
  setScrapeButtonState();
  setCadenceButtonsEnabled();
  renderAll();
}

function resetDashboard() {
  simRunning = false;
  scrapeEngineRunning = false;
  scoutWorkingUntil = 0;
  lastScrapeModeKey = null;
  stopSimulation();
  lastCycleAt = null;
  clearStateForSimulation();
  renderFilter();
  renderAll();
  setSimButtonState();
  setScrapeButtonState();
  setCadenceButtonsEnabled();
  setModeButtonActive(null);
}

function runScheduler() {
  if (!simRunning) {
    return;
  }

  const now = Date.now();
  if (!lastCycleAt) {
    lastCycleAt = now;
  }

  processScheduledScrapes(now);

  const elapsed = now - lastCycleAt;
  const pendingCycles = Math.floor(elapsed / LIVE_TICK_MS);
  if (pendingCycles <= 0) {
    renderAll();
    return;
  }

  const safeCycles = Math.min(pendingCycles, 30);
  for (let i = 0; i < safeCycles; i += 1) {
    updateCycle();
  }

  lastCycleAt += safeCycles * LIVE_TICK_MS;
  renderAll();
}

filterSelect.addEventListener("change", renderJobs);

tickBtn.addEventListener("click", () => {
  updateCycle();
  renderAll();
});

resetBtn.addEventListener("click", resetDashboard);
scrapeEngineBtn.addEventListener("click", toggleScrapeEngine);
connectTrackBtn.addEventListener("click", async () => {
  await connectTrackFolder();
});
scrapeFastBtn.addEventListener("click", () => {
  pulseModeButton(scrapeFastBtn);
  runCadenceClick("fast");
});
scrapeDeepBtn.addEventListener("click", () => {
  pulseModeButton(scrapeDeepBtn);
  runCadenceClick("deep");
});
scrapeFullBtn.addEventListener("click", () => {
  pulseModeButton(scrapeFullBtn);
  runCadenceClick("full");
});

simBtn.addEventListener("click", () => {
  simRunning = !simRunning;
  if (simRunning) {
    startSimulationTimer();
    updateCycle();
    renderAll();
  } else {
    scrapeEngineRunning = false;
    scoutWorkingUntil = 0;
    lastScrapeModeKey = null;
    stopSimulation();
    lastCycleAt = null;
    for (const agent of agents) {
      agent.mood = "Standby";
    }
    setScrapeButtonState();
    setModeButtonActive(null);
    renderAll();
  }
  setSimButtonState();
  setCadenceButtonsEnabled();
});

funnelAccordion.addEventListener("click", (event) => {
  const row = event.target.closest(".bounty-row");
  if (row) {
    const bountyId = row.dataset.bountyId;
    selectedBountyId = bountyId;
    const selected = bountyRecords.find((r) => r.id === bountyId) || null;
    renderBountyDisclosure(selected);
    return;
  }

  const btn = event.target.closest(".bar");
  if (!btn) {
    return;
  }
  const clickedStage = btn.dataset.stage;
  activeFunnelStage = activeFunnelStage === clickedStage ? "" : clickedStage;
  renderFunnel();
});

createReportBtn.addEventListener("click", () => {
  renderReport();
});

downloadReportBtn.addEventListener("click", async () => {
  await saveExcelReport();
});
authSignInBtn.addEventListener("click", async () => {
  await handleSignIn();
});
authSignUpBtn.addEventListener("click", async () => {
  await handleSignUp();
});
if (authResendBtn) {
  authResendBtn.addEventListener("click", async () => {
    await handleResendConfirmation();
  });
}
signOutBtn.addEventListener("click", async () => {
  await handleSignOut();
});
if (authPasswordToggleBtn && authPasswordInput) {
  authPasswordToggleBtn.addEventListener("click", () => {
    togglePasswordVisible(authPasswordInput, authPasswordToggleBtn);
  });
}
if (authPasswordConfirmToggleBtn && authPasswordConfirmInput) {
  authPasswordConfirmToggleBtn.addEventListener("click", () => {
    togglePasswordVisible(authPasswordConfirmInput, authPasswordConfirmToggleBtn);
  });
}
authPasswordInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  await handleSignIn();
});

window.addEventListener("beforeunload", () => {
  simRunning = false;
  stopSimulation();
  if (authSubscription) {
    authSubscription.unsubscribe();
  }
});

initState();
renderFilter();
renderAll();
setSimButtonState();
setScrapeButtonState();
setCadenceButtonsEnabled();
setModeButtonActive(null);
setResendVisible(false);
setPasswordVisible(authPasswordInput, authPasswordToggleBtn, false);
setPasswordVisible(authPasswordConfirmInput, authPasswordConfirmToggleBtn, false);
bootstrapAuth();


