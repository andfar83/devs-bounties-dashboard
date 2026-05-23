import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { APP_MODE, BOUNTY_STAGES, LOCAL_TRACKING_CONFIG, SCRAPE_MODES, SUPABASE_CONFIG } from "./config.js";
import {
  buildWorkPackageFiles,
  toAgentEvent,
  toBountyCandidate,
  toScrapeRun,
  toWorkArtifacts,
  toWorkPackage
} from "./contracts.js";

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
let scrapeEngineButtonFocused = false;
let scoutWorkingUntil = 0;
let lastScrapeModeKey = null;
let reportsDirHandle = null;
let generatedReportData = null;
let trackDirHandle = null;
let selectedBountyId = null;
const archivedBountyIds = new Set();
const archiveInFlightIds = new Set();
const trackedPackageIds = new Set();
const packageInFlightIds = new Set();
let solvedBounties = [];
const agentWorkStartedAt = new Map();
let appRunMode = APP_MODE.SIMULATION;
let auditEvents = [];
let scrapeRunHistory = [];
let lastEngineError = "";
let scrapeSchedule = {
  nextFastAt: null,
  nextDeepAt: null,
  nextFullAt: null,
  lastRunMode: "none"
};
let supabaseClient = null;
let authSubscription = null;
let currentAuthUser = null;

const HARDWIRED_SUPABASE_URL = SUPABASE_CONFIG.URL;
const HARDWIRED_SUPABASE_PUBLISHABLE_KEY = SUPABASE_CONFIG.PUBLISHABLE_KEY;
const AUTH_EMAIL_REDIRECT_TO = SUPABASE_CONFIG.AUTH_EMAIL_REDIRECT_TO;

const appShell = document.getElementById("app-shell");
const authGate = document.getElementById("auth-gate");
const topbar = document.querySelector(".topbar");
const signInEmailInput = document.getElementById("signin-email");
const signInPasswordInput = document.getElementById("signin-password");
const signInPasswordToggleBtn = document.getElementById("signin-password-toggle");
const signUpEmailInput = document.getElementById("signup-email");
const signUpPasswordInput = document.getElementById("signup-password");
const signUpPasswordConfirmInput = document.getElementById("signup-password-confirm");
const signUpPasswordToggleBtn = document.getElementById("signup-password-toggle");
const signUpPasswordConfirmToggleBtn = document.getElementById("signup-password-confirm-toggle");
const signUpCommentInput = document.getElementById("signup-comment");
const authSignInBtn = document.getElementById("auth-signin-btn");
const authSignUpBtn = document.getElementById("auth-signup-btn");
const authResendBtn = document.getElementById("auth-resend-btn");
const authStatus = document.getElementById("auth-status");
const signOutBtn = document.getElementById("signout-btn");
const userProfile = document.getElementById("user-profile");
const userAvatarImage = document.getElementById("user-avatar-image");
const userAvatarFallback = document.getElementById("user-avatar-fallback");
const userDisplayName = document.getElementById("user-display-name");
const userDisplayEmail = document.getElementById("user-display-email");
let pendingVerificationEmail = "";
const PENDING_SIGNUP_COMMENT_KEY = "bounty_ops_pending_signup_comments";

const agentGrid = document.getElementById("agent-grid");
const jobsBody = document.getElementById("jobs-body");
const filterSelect = document.getElementById("agent-filter");
const simBtn = document.getElementById("sim-btn");
const scrapeEngineBtn = document.getElementById("scrape-engine-btn");
const scrapeFastBtn = document.getElementById("scrape-fast-btn");
const scrapeDeepBtn = document.getElementById("scrape-deep-btn");
const scrapeFullBtn = document.getElementById("scrape-full-btn");
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
const trackFolderPath = document.getElementById("track-folder-path");
const packagePrefixLabel = document.getElementById("package-prefix-label");
const bountyDisclosure = document.getElementById("bounty-disclosure");
const solvedBody = document.getElementById("solved-body");
const solvedMeta = document.getElementById("solved-meta");
const controlModeMeta = document.getElementById("control-mode-meta");
const modeSwitch = document.getElementById("mode-switch");
const healthGrid = document.getElementById("health-grid");
const killSwitchBtn = document.getElementById("kill-switch-btn");
const safetyStatus = document.getElementById("safety-status");
const reviewMeta = document.getElementById("review-meta");
const reviewQueue = document.getElementById("review-queue");
const packageMeta = document.getElementById("package-meta");
const packageBody = document.getElementById("package-body");
const auditMeta = document.getElementById("audit-meta");
const auditList = document.getElementById("audit-list");

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

function prettifyHandle(handle) {
  const normalized = (handle || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  return normalized
    .split(" ")
    .map((part) => (part ? part.slice(0, 1).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function resolveDisplayName(user, emailFallback = "") {
  const meta = user?.user_metadata || {};
  const candidates = [meta.full_name, meta.name, meta.preferred_username, meta.user_name, meta.nickname];
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) {
      return value;
    }
  }

  const email = (user?.email || emailFallback || "").trim().toLowerCase();
  if (email.includes("@")) {
    const handle = email.split("@")[0];
    const pretty = prettifyHandle(handle);
    if (pretty) {
      return pretty;
    }
  }
  return "User";
}

function resolveAvatarUrl(user) {
  const meta = user?.user_metadata || {};
  const candidates = [meta.avatar_url, meta.picture, meta.profile_image, meta.photo_url];
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) {
      return value;
    }
  }
  return "";
}

function getAvatarInitial(name, email = "") {
  const fromName = (name || "").trim();
  if (fromName) {
    const token = fromName.split(/\s+/)[0] || "";
    const first = token.slice(0, 1);
    if (first) {
      return first.toUpperCase();
    }
  }

  const fromEmail = (email || "").trim();
  const first = fromEmail.slice(0, 1);
  return first ? first.toUpperCase() : "U";
}

function renderUserProfile(user = null, emailFallback = "") {
  if (!userProfile || !userAvatarImage || !userAvatarFallback || !userDisplayName || !userDisplayEmail) {
    return;
  }

  const email = (user?.email || emailFallback || "").trim().toLowerCase();
  if (!user && !email) {
    userProfile.hidden = true;
    userDisplayName.textContent = "User";
    userDisplayEmail.textContent = "--";
    userAvatarFallback.textContent = "U";
    userAvatarFallback.hidden = false;
    userAvatarImage.hidden = true;
    userAvatarImage.removeAttribute("src");
    return;
  }

  const name = resolveDisplayName(user, email);
  const avatarUrl = resolveAvatarUrl(user);
  const avatarInitial = getAvatarInitial(name, email);

  userProfile.hidden = false;
  userDisplayName.textContent = name;
  userDisplayEmail.textContent = email || "No email";
  userAvatarFallback.textContent = avatarInitial;

  if (avatarUrl) {
    userAvatarImage.src = avatarUrl;
    userAvatarImage.hidden = false;
    userAvatarFallback.hidden = true;
  } else {
    userAvatarImage.hidden = true;
    userAvatarImage.removeAttribute("src");
    userAvatarFallback.hidden = false;
  }
}

function setAccessState(isAuthenticated, email = "", user = null) {
  currentAuthUser = isAuthenticated ? user : null;
  appShell.hidden = !isAuthenticated;
  authGate.hidden = isAuthenticated;
  // Defensive visibility control: some CSS display rules can override [hidden].
  // Force explicit display state so auth overlay cannot mask the dashboard.
  appShell.style.display = isAuthenticated ? "" : "none";
  authGate.style.display = isAuthenticated ? "none" : "";
  if (!isAuthenticated) {
    renderUserProfile(null);
    setAuthStatus("Not signed in.");
    return;
  }
  renderUserProfile(user, email);
  setAuthStatus(`Signed in as ${email || "user"}.`, "ok");
}

function applySignedInState(user, emailFallback = "") {
  const resolvedEmail = user?.email || emailFallback || "";
  setAccessState(true, resolvedEmail, user || null);
}

function getSignInValues() {
  return {
    email: (signInEmailInput?.value || "").trim().toLowerCase(),
    password: signInPasswordInput?.value || ""
  };
}

function getSignUpValues() {
  return {
    email: (signUpEmailInput?.value || "").trim().toLowerCase(),
    password: signUpPasswordInput?.value || "",
    confirmPassword: signUpPasswordConfirmInput?.value || "",
    comment: (signUpCommentInput?.value || "").trim()
  };
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
    applySignedInState(session.user, email);
    void persistAuthUserProfile(session.user);
    void persistPendingSignupComment(session.user);
  });
  authSubscription = data.subscription;
  return supabaseClient;
}

function getPendingSignupComments() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_SIGNUP_COMMENT_KEY) || "{}");
  } catch (error) {
    console.warn("pending signup comment read failed:", error.message);
    return {};
  }
}

function savePendingSignupComment(email, comment) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanComment = (comment || "").trim().slice(0, 600);
  if (!cleanEmail || !cleanComment) {
    return;
  }

  const pendingComments = getPendingSignupComments();
  pendingComments[cleanEmail] = cleanComment;
  localStorage.setItem(PENDING_SIGNUP_COMMENT_KEY, JSON.stringify(pendingComments));
}

function removePendingSignupComment(email) {
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail) {
    return;
  }

  const pendingComments = getPendingSignupComments();
  if (!Object.prototype.hasOwnProperty.call(pendingComments, cleanEmail)) {
    return;
  }

  delete pendingComments[cleanEmail];
  localStorage.setItem(PENDING_SIGNUP_COMMENT_KEY, JSON.stringify(pendingComments));
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

  const { error: profileError } = await supabaseClient.from("user_profiles").upsert(
    {
      id: user.id,
      email: user.email || null,
      latest_comment: cleanComment,
      last_login_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );
  if (profileError) {
    console.warn("user_profiles latest_comment update failed:", profileError.message);
  }
}

async function persistPendingSignupComment(user) {
  const email = (user?.email || "").trim().toLowerCase();
  if (!email) {
    return;
  }

  const pendingComment = getPendingSignupComments()[email];
  if (!pendingComment) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("user_profiles")
    .select("latest_comment")
    .eq("id", user.id)
    .maybeSingle();
  if (!error && data?.latest_comment === pendingComment) {
    removePendingSignupComment(email);
    return;
  }

  await persistAuthComment(user, pendingComment);
  removePendingSignupComment(email);
}

async function bootstrapAuth() {
  try {
    ensureSupabaseClient();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      throw error;
    }

    if (!data?.session) {
      setAccessState(false);
      setAuthStatus("Session not found. Sign in to continue.");
      return;
    }

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      await supabaseClient.auth.signOut({ scope: "local" });
      setAccessState(false);
      setAuthStatus("Session expired or account was reset. Sign in to continue.", "error");
      return;
    }

    applySignedInState(userData.user);
    await persistAuthUserProfile(userData.user);
    await persistPendingSignupComment(userData.user);
  } catch (error) {
    supabaseClient = null;
    setAccessState(false);
    setAuthStatus(`Auth init failed: ${error.message}`, "error");
  }
}

async function handleSignIn() {
  const { email, password } = getSignInValues();
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
    await persistPendingSignupComment(data?.user);
    applySignedInState(data?.user || null, email);
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
  const { email, password, confirmPassword, comment } = getSignUpValues();
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
    const cleanComment = comment.trim().slice(0, 600);
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: AUTH_EMAIL_REDIRECT_TO,
        data: {
          initial_comment: cleanComment
        }
      }
    });
    if (error) {
      throw error;
    }
    savePendingSignupComment(email, cleanComment);
    if (data.session) {
      await persistAuthUserProfile(data.user);
      await persistAuthComment(data.user, cleanComment);
      removePendingSignupComment(email);
      applySignedInState(data.user || null, email);
      if (signUpCommentInput) {
        signUpCommentInput.value = "";
      }
      if (signUpPasswordConfirmInput) {
        signUpPasswordConfirmInput.value = "";
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
  const email = (signUpEmailInput?.value || pendingVerificationEmail || "").trim().toLowerCase();
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

function normalizeModeLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusText(value) {
  return String(value || "--").replace(/_/g, " ");
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

function currentUserId() {
  return currentAuthUser?.id || null;
}

function recordAuditEvent({ record = null, agentId = "system", action, fromStage = null, toStage = null, reason = "" }) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    bountyLocalId: record?.id || null,
    title: record?.title || "",
    agentId,
    action,
    fromStage,
    toStage,
    reason,
    createdAt: new Date()
  };
  auditEvents.unshift(event);
  auditEvents = auditEvents.slice(0, 80);
  return event;
}

async function persistTableRow(tableName, row, options = {}) {
  if (!supabaseClient || !currentUserId()) {
    return { skipped: true };
  }

  const query = supabaseClient.from(tableName).upsert(row, options);
  const { error } = await query;
  if (error) {
    console.warn(`${tableName} persist failed:`, error.message);
    return { error };
  }
  return { ok: true };
}

async function persistBountyCandidate(record) {
  record.appRunMode = appRunMode;
  record.supabaseSyncStatus = "pending";
  const row = toBountyCandidate(record, currentUserId());
  const result = await persistTableRow("bounty_candidates", row, { onConflict: "user_id,dedupe_key" });
  record.supabaseSyncStatus = result.ok ? "synced" : result.skipped ? "local_only" : "failed";
  return result;
}

async function persistWorkPackageRecords(record, folderPath = "") {
  const userId = currentUserId();
  if (!supabaseClient || !userId) {
    return;
  }

  await persistTableRow("work_packages", toWorkPackage(record, userId, folderPath), {
    onConflict: "user_id,bounty_local_id"
  });

  const artifacts = toWorkArtifacts(record, userId);
  const { error } = await supabaseClient.from("work_artifacts").upsert(artifacts, {
    onConflict: "user_id,bounty_local_id,relative_path"
  });
  if (error) {
    console.warn("work_artifacts persist failed:", error.message);
  }
}

async function persistAgentEvent(event) {
  recordAuditEvent(event);
  if (!supabaseClient || !currentUserId()) {
    return;
  }
  const { error } = await supabaseClient.from("agent_events").insert(toAgentEvent({ ...event, userId: currentUserId() }));
  if (error) {
    console.warn("agent_events insert failed:", error.message);
  }
}

async function persistScrapeRun(mode, stats) {
  scrapeRunHistory.unshift({ mode, app_mode: appRunMode, ...stats, createdAt: new Date() });
  scrapeRunHistory = scrapeRunHistory.slice(0, 20);
  if (!supabaseClient || !currentUserId()) {
    return;
  }
  const { error } = await supabaseClient.from("scrape_runs").insert(
    toScrapeRun({
      mode,
      status: stats.status,
      userId: currentUserId(),
      stats: { ...stats, app_mode: appRunMode },
      message: stats.error_message || ""
    })
  );
  if (error) {
    console.warn("scrape_runs insert failed:", error.message);
  }
}

async function getDirectoryByPath(rootHandle, pathParts) {
  let currentHandle = rootHandle;
  for (const part of pathParts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
  }
  return currentHandle;
}

async function writeTextFile(rootHandle, relativePath, content) {
  const parts = relativePath.split("/").filter(Boolean);
  const fileName = parts.pop();
  const directoryHandle = await getDirectoryByPath(rootHandle, parts);
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeWorkPackage(record, reason = "Pipeline package prepared") {
  if (!record || !trackDirHandle || trackedPackageIds.has(record.id) || packageInFlightIds.has(record.id)) {
    return false;
  }

  packageInFlightIds.add(record.id);
  try {
    const folderName = `${LOCAL_TRACKING_CONFIG.PACKAGE_PREFIX}${record.id}`;
    const folderHandle = await trackDirHandle.getDirectoryHandle(folderName, { create: true });
    const files = buildWorkPackageFiles(record);
    for (const file of files) {
      await writeTextFile(folderHandle, file.path, file.content);
    }
    trackedPackageIds.add(record.id);
    record.packageStatus = "tracked";
    await persistWorkPackageRecords(record, folderName);
    trackStatus.textContent = `${reason}: ${folderName}`;
    return true;
  } catch (error) {
    console.warn("work package write failed:", error.message);
    record.packageStatus = "failed";
    trackStatus.textContent = `Could not write package for ${record.id}.`;
    return false;
  } finally {
    packageInFlightIds.delete(record.id);
  }
}

function trackPipelinePackage(record, reason = "Prepared bounty package") {
  if (!record) {
    return;
  }
  void persistBountyCandidate(record);
  if (!trackDirHandle) {
    record.packageStatus = record.packageStatus || "folder_needed";
    return;
  }
  void writeWorkPackage(record, reason);
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

const scheduleNextByMode = {
  [SCRAPE_MODES.FAST]: scheduleNextFast,
  [SCRAPE_MODES.DEEP]: scheduleNextDeep,
  [SCRAPE_MODES.FULL]: scheduleNextFull
};

function scheduleNextForMode(mode, baseTime = Date.now()) {
  const scheduler = scheduleNextByMode[mode];
  if (!scheduler) {
    return;
  }
  scheduler(baseTime);
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
  agentWorkStartedAt.clear();
  archivedBountyIds.clear();
  archiveInFlightIds.clear();
  trackedPackageIds.clear();
  packageInFlightIds.clear();
  solvedBounties = [];
  auditEvents = [];
  scrapeRunHistory = [];
  lastEngineError = "";
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

function formatAgentWorkTime(startedAt) {
  if (!startedAt) {
    return "00:00";
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function agentLoaderMarkup(agentId, isWorking) {
  if (!isWorking) {
    agentWorkStartedAt.delete(agentId);
    return "";
  }

  if (!agentWorkStartedAt.has(agentId)) {
    agentWorkStartedAt.set(agentId, Date.now());
  }

  return `
    <div class="agent-work-indicator" aria-label="Agent working">
      <div class="spinner" aria-hidden="true">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
      <span class="agent-work-time">${formatAgentWorkTime(agentWorkStartedAt.get(agentId))}</span>
    </div>
  `;
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
    const isWorking = runtime.label === "Working";
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
        <div class="agent-head-tools">
          ${agentLoaderMarkup(agent.id, isWorking)}
          <span class="pill">${agent.mood}</span>
        </div>
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

function renderControlTower() {
  if (controlModeMeta) {
    controlModeMeta.textContent = `Mode: ${statusText(appRunMode)}`;
  }

  if (modeSwitch) {
    for (const btn of modeSwitch.querySelectorAll("[data-mode]")) {
      btn.classList.toggle("is-active", btn.dataset.mode === appRunMode);
    }
  }

  const lastRun = scrapeRunHistory[0] || null;
  const pendingReview = bountyRecords.filter((record) => record.stage === BOUNTY_STAGES.DISCOVERED && record.nextAction !== "discard").length;
  const packageCount = bountyRecords.filter(hasWorkPackageSignal).length;
  const trackedCount = bountyRecords.filter((record) => trackedPackageIds.has(record.id)).length;
  const syncFailed = bountyRecords.filter((record) => record.supabaseSyncStatus === "failed").length;

  if (healthGrid) {
    healthGrid.innerHTML = `
      <div class="health-tile"><span>Last run</span><strong>${lastRun ? normalizeModeLabel(lastRun.mode) : "--"}</strong></div>
      <div class="health-tile"><span>Created</span><strong>${lastRun?.created_count ?? 0}</strong></div>
      <div class="health-tile"><span>Updated</span><strong>${lastRun?.updated_count ?? 0}</strong></div>
      <div class="health-tile"><span>Rejected</span><strong>${lastRun?.rejected_count ?? 0}</strong></div>
      <div class="health-tile"><span>Review</span><strong>${pendingReview}</strong></div>
      <div class="health-tile"><span>Packages</span><strong>${trackedCount}/${packageCount}</strong></div>
      <div class="health-tile"><span>Sync errors</span><strong>${syncFailed}</strong></div>
      <div class="health-tile"><span>Engine</span><strong>${scrapeEngineRunning ? "On" : "Off"}</strong></div>
    `;
  }

  if (safetyStatus) {
    safetyStatus.textContent = lastEngineError || (scrapeEngineRunning ? "Engine running." : "Engine safety ready.");
  }
}

function reviewActionButtons(record) {
  if (record.nextAction === "monitor") {
    return `
      <button class="btn btn-secondary btn-mini" data-review-action="evaluate" data-bounty-id="${record.id}" type="button">Evaluate</button>
      <button class="btn btn-secondary btn-mini" data-review-action="package" data-bounty-id="${record.id}" type="button">Package</button>
      <button class="btn btn-secondary btn-mini" data-review-action="reject" data-bounty-id="${record.id}" type="button">Reject</button>
    `;
  }

  return `
    <button class="btn btn-secondary btn-mini" data-review-action="reject" data-bounty-id="${record.id}" type="button">Reject</button>
    <button class="btn btn-secondary btn-mini" data-review-action="monitor" data-bounty-id="${record.id}" type="button">Monitor</button>
    <button class="btn btn-secondary btn-mini" data-review-action="evaluate" data-bounty-id="${record.id}" type="button">Evaluate</button>
    <button class="btn btn-secondary btn-mini" data-review-action="package" data-bounty-id="${record.id}" type="button">Package</button>
  `;
}

function renderCandidateReviewQueue() {
  const candidates = bountyRecords
    .filter((record) => record.stage === BOUNTY_STAGES.DISCOVERED && record.nextAction !== "discard")
    .slice(0, 8);

  if (reviewMeta) {
    reviewMeta.textContent = candidates.length ? `${candidates.length} pending` : "No pending candidates.";
  }

  if (!reviewQueue) {
    return;
  }

  if (!candidates.length) {
    reviewQueue.innerHTML = `<p class="report-empty">No candidates waiting for review.</p>`;
    return;
  }

  reviewQueue.innerHTML = candidates
    .map((record) => {
      const scoreTotal = record.scores
        ? Object.values(record.scores).reduce((sum, value) => sum + Number(value || 0), 0)
        : 0;
      return `
        <article class="review-card">
          <div>
            <p class="review-title">${record.id} - ${record.title}</p>
            <p class="review-meta">${record.site} | ${record.type} | ${fmtMoney(record.price)} | due ${formatDate(record.dueDate)}</p>
          </div>
          <div class="review-score">
            <span>Score</span>
            <strong>${scoreTotal}</strong>
          </div>
          <div class="review-actions">
            ${reviewActionButtons(record)}
          </div>
        </article>
      `;
    })
    .join("");
}

function lastAuditForBounty(bountyId) {
  return auditEvents.find((event) => event.bountyLocalId === bountyId) || null;
}

function hasWorkPackageSignal(record) {
  return stageRank[record.stage] >= stageRank.shortlisted || trackedPackageIds.has(record.id) || Boolean(record.packageStatus);
}

function renderWorkPackageCenter() {
  const packageRecords = bountyRecords.filter(hasWorkPackageSignal);

  if (packageMeta) {
    const trackedCount = packageRecords.filter((record) => trackedPackageIds.has(record.id)).length;
    packageMeta.textContent = packageRecords.length ? `${trackedCount}/${packageRecords.length} tracked` : "No packages yet.";
  }

  if (!packageBody) {
    return;
  }

  if (!packageRecords.length) {
    packageBody.innerHTML = `<tr><td colspan="7">No work packages yet.</td></tr>`;
    return;
  }

  packageBody.innerHTML = packageRecords
    .map((record) => {
      const folderStatus = trackedPackageIds.has(record.id) ? "tracked" : record.packageStatus || "folder_needed";
      const syncStatus = record.supabaseSyncStatus || "pending";
      const lastEvent = lastAuditForBounty(record.id);
      const nextAction = record.nextAction || (stageRank[record.stage] >= stageRank.submitted ? "ops_review" : "evaluate_now");
      return `
        <tr>
          <td>${record.id}</td>
          <td>${record.stage}</td>
          <td><span class="status ${folderStatus === "tracked" ? "status-ready" : "status-review"}">${statusText(folderStatus)}</span></td>
          <td><span class="status ${syncStatus === "failed" ? "status-blocked" : "status-ready"}">${statusText(syncStatus)}</span></td>
          <td>13 files</td>
          <td>${lastEvent ? `${lastEvent.agentId}: ${statusText(lastEvent.action)}` : "--"}</td>
          <td>${statusText(nextAction)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAuditTrail() {
  if (auditMeta) {
    auditMeta.textContent = auditEvents.length ? `${auditEvents.length} events` : "No events yet.";
  }

  if (!auditList) {
    return;
  }

  if (!auditEvents.length) {
    auditList.innerHTML = `<p class="report-empty">No audit events recorded in this session.</p>`;
    return;
  }

  auditList.innerHTML = auditEvents
    .slice(0, 12)
    .map((event) => {
      return `
        <div class="audit-item">
          <span class="audit-dot"></span>
          <div>
            <p class="audit-title">${event.bountyLocalId || "system"} | ${event.agentId} | ${statusText(event.action)}</p>
            <p class="audit-meta">${event.fromStage || "--"} -> ${event.toStage || "--"} | ${event.reason || "No reason"} | ${event.createdAt.toLocaleTimeString("en-US")}</p>
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
    stage: BOUNTY_STAGES.DISCOVERED,
    appRunMode,
    dueDate,
    retrievedAt: new Date().toISOString(),
    confidence: Number((0.62 + Math.random() * 0.25).toFixed(2)),
    nextAction: "evaluate_now",
    scores: {
      fit: randInt(14, 24),
      payoutQuality: randInt(10, 19),
      deadlineFeasibility: randInt(8, 15),
      winProbability: randInt(8, 18),
      strategicValue: randInt(4, 9),
      platformTrust: randInt(6, 10)
    },
    redFlags: []
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
  const previousStage = target.stage;
  target.stage = toStage;
  void persistBountyCandidate(target);
  void persistAgentEvent({
    record: target,
    agentId: toStage === BOUNTY_STAGES.SHORTLISTED ? "scout" : "feasibility",
    action: "stage_promoted",
    fromStage: previousStage,
    toStage,
    reason: "Simulation pipeline promotion"
  });
  if (stageRank[toStage] >= stageRank.shortlisted) {
    trackPipelinePackage(target, "Prepared pipeline bounty package");
  }
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
    const wrotePackage = await writeWorkPackage(record, "Tracked solved bounty");
    if (!wrotePackage && !trackedPackageIds.has(record.id)) {
      throw new Error("Package write failed");
    }
    setSolvedFolderStatus(record.id, "tracked", "Project package created");
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
    trackStatus.textContent = `Tracking folder connected: ${trackDirHandle.name}. Packages save as ${LOCAL_TRACKING_CONFIG.PACKAGE_PREFIX}<id>.`;
    for (const record of bountyRecords.filter((item) => stageRank[item.stage] >= stageRank.shortlisted)) {
      await writeWorkPackage(record, "Prepared active bounty package");
    }
    for (const row of solvedBounties.filter((item) => item.folderStatus !== "tracked")) {
      await archiveSolvedBounty(row.snapshot);
    }
  } catch (error) {
    trackStatus.textContent = "Tracking folder connection canceled.";
  }
}

function renderTrackFolderConfig() {
  if (trackFolderPath) {
    trackFolderPath.textContent = LOCAL_TRACKING_CONFIG.RECOMMENDED_ROOT;
  }
  if (packagePrefixLabel) {
    packagePrefixLabel.textContent = `${LOCAL_TRACKING_CONFIG.PACKAGE_PREFIX}<id>`;
  }
  if (trackStatus && !trackDirHandle) {
    trackStatus.textContent = `Tracking folder not connected. Select ${LOCAL_TRACKING_CONFIG.RECOMMENDED_ROOT}.`;
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
    [SCRAPE_MODES.FAST]: { label: "Fast Poll", minFound: 1, maxFound: 2, shortlistChance: 0.35 },
    [SCRAPE_MODES.DEEP]: { label: "Deep Scan", minFound: 1, maxFound: 4, shortlistChance: 0.55 },
    [SCRAPE_MODES.FULL]: { label: "Full Refresh", minFound: 2, maxFound: 7, shortlistChance: 0.75 }
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
    const created = createRandomBounty();
    bountyRecords.push(created);
    void persistBountyCandidate(created);
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
  void persistScrapeRun(mode, {
    status: "done",
    started_at: new Date(Date.now() - 1000).toISOString(),
    completed_at: new Date().toISOString(),
    source_count: foundCount,
    created_count: foundCount,
    updated_count: 0,
    rejected_count: 0
  });
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

  const dueChecks = [
    { mode: "fast", dueAt: scrapeSchedule.nextFastAt },
    { mode: "deep", dueAt: scrapeSchedule.nextDeepAt },
    { mode: "full", dueAt: scrapeSchedule.nextFullAt }
  ];

  for (const check of dueChecks) {
    if (!check.dueAt || now < check.dueAt) {
      continue;
    }
    runScrapeMode(check.mode);
    scheduleNextForMode(check.mode, now);
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
  renderControlTower();
  renderCandidateReviewQueue();
  renderWorkPackageCenter();
  renderAuditTrail();
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

function syncLaunchButtonStates() {
  simBtn.textContent = simRunning ? "Stop Live Sim" : "Start Live Sim";
  scrapeEngineBtn.textContent = scrapeEngineRunning ? "Stop Scrape Engine" : "Start Scrape Engine";
  simBtn.classList.toggle("btn-launch-active", simRunning && !scrapeEngineButtonFocused);
  scrapeEngineBtn.classList.toggle("btn-launch-active", scrapeEngineButtonFocused);
}

function setSimButtonState() {
  syncLaunchButtonStates();
}

function setScrapeButtonState() {
  syncLaunchButtonStates();
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
    scrapeEngineButtonFocused = false;
    seedScrapeSchedule(Date.now());
    scrapeSchedule.lastRunMode = "Scheduled";
    setScrapeButtonState();
  }

  runScrapeMode(mode);
  scheduleNextForMode(mode, Date.now());
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

function clearScoutWorkState() {
  scrapeEngineButtonFocused = false;
  scoutWorkingUntil = 0;
  lastScrapeModeKey = null;
  setModeButtonActive(null);
}

function toggleScrapeEngine() {
  if (!simRunning) {
    scrapeSchedule.lastRunMode = "Engine blocked (start live sim first)";
    renderAll();
    return;
  }

  scrapeEngineRunning = !scrapeEngineRunning;
  scrapeEngineButtonFocused = scrapeEngineRunning;
  if (scrapeEngineRunning) {
    seedScrapeSchedule(Date.now());
    scrapeSchedule.lastRunMode = "Scheduled";
    runScrapeMode("fast");
    scheduleNextForMode("fast", Date.now());
  } else {
    scrapeSchedule.lastRunMode = "Stopped";
    clearScoutWorkState();
  }
  setScrapeButtonState();
  setCadenceButtonsEnabled();
  renderAll();
}

function resetDashboard() {
  simRunning = false;
  scrapeEngineRunning = false;
  clearScoutWorkState();
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

function applyEngineMode(mode) {
  if (!Object.values(APP_MODE).includes(mode)) {
    return;
  }
  appRunMode = mode;
  recordAuditEvent({
    action: "mode_changed",
    fromStage: null,
    toStage: mode,
    reason: "Operator changed engine mode"
  });
  if (mode !== APP_MODE.SIMULATION) {
    scrapeSchedule.lastRunMode = `${normalizeModeLabel(mode)} armed`;
  }
  renderAll();
}

function stopAllEngines(reason = "Kill switch engaged") {
  simRunning = false;
  scrapeEngineRunning = false;
  clearScoutWorkState();
  stopSimulation();
  lastCycleAt = null;
  for (const agent of agents) {
    agent.mood = "Standby";
  }
  lastEngineError = reason;
  recordAuditEvent({ action: "kill_switch", reason });
  setSimButtonState();
  setScrapeButtonState();
  setCadenceButtonsEnabled();
  renderAll();
}

function rejectCandidate(record) {
  record.nextAction = "discard";
  record.redFlags = [...(record.redFlags || []), "operator_rejected"];
  void persistBountyCandidate(record);
  void persistAgentEvent({
    record,
    agentId: "scout",
    action: "candidate_rejected",
    fromStage: record.stage,
    toStage: record.stage,
    reason: "Operator rejected candidate"
  });
}

function monitorCandidate(record) {
  record.nextAction = "monitor";
  void persistBountyCandidate(record);
  void persistAgentEvent({
    record,
    agentId: "scout",
    action: "candidate_monitored",
    fromStage: record.stage,
    toStage: record.stage,
    reason: "Operator moved candidate to monitor"
  });
}

function evaluateCandidate(record) {
  const previousStage = record.stage;
  record.stage = BOUNTY_STAGES.SHORTLISTED;
  record.nextAction = "evaluate_now";
  void persistBountyCandidate(record);
  void persistAgentEvent({
    record,
    agentId: "scout",
    action: "candidate_approved",
    fromStage: previousStage,
    toStage: record.stage,
    reason: "Operator approved candidate for feasibility"
  });
  trackPipelinePackage(record, "Prepared approved bounty package");
}

function packageCandidate(record) {
  record.nextAction = "package_only";
  record.packageStatus = trackDirHandle ? record.packageStatus || "pending" : "folder_needed";
  void persistBountyCandidate(record);
  void writeWorkPackage(record, "Prepared manual candidate package");
  void persistAgentEvent({
    record,
    agentId: "ops",
    action: "package_requested",
    fromStage: record.stage,
    toStage: record.stage,
    reason: "Operator requested work package"
  });
}

function handleReviewAction(action, bountyId) {
  const record = bountyRecords.find((item) => item.id === bountyId);
  if (!record) {
    return;
  }

  if (action === "reject") {
    rejectCandidate(record);
  } else if (action === "monitor") {
    monitorCandidate(record);
  } else if (action === "evaluate") {
    evaluateCandidate(record);
  } else if (action === "package") {
    packageCandidate(record);
  }

  renderAll();
}

let lastScrollY = window.scrollY;
let scrollTicking = false;

function updateTopbarVisibility() {
  if (!topbar) {
    return;
  }

  const currentScrollY = Math.max(0, window.scrollY);
  const delta = currentScrollY - lastScrollY;
  const isNearTop = currentScrollY < 80;

  if (isNearTop || delta < -8) {
    topbar.classList.remove("topbar-hidden");
  } else if (delta > 8 && currentScrollY > 140) {
    topbar.classList.add("topbar-hidden");
  }

  lastScrollY = currentScrollY;
  scrollTicking = false;
}

function handleWindowScroll() {
  if (scrollTicking) {
    return;
  }
  scrollTicking = true;
  window.requestAnimationFrame(updateTopbarVisibility);
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

resetBtn.addEventListener("click", resetDashboard);
if (modeSwitch) {
  modeSwitch.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-mode]");
    if (!btn) {
      return;
    }
    applyEngineMode(btn.dataset.mode);
  });
}
if (killSwitchBtn) {
  killSwitchBtn.addEventListener("click", () => {
    stopAllEngines();
  });
}
if (reviewQueue) {
  reviewQueue.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-review-action]");
    if (!btn) {
      return;
    }
    handleReviewAction(btn.dataset.reviewAction, btn.dataset.bountyId);
  });
}
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
    clearScoutWorkState();
    stopSimulation();
    lastCycleAt = null;
    for (const agent of agents) {
      agent.mood = "Standby";
    }
    setScrapeButtonState();
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
if (signInPasswordToggleBtn && signInPasswordInput) {
  signInPasswordToggleBtn.addEventListener("click", () => {
    togglePasswordVisible(signInPasswordInput, signInPasswordToggleBtn);
  });
}
if (signUpPasswordToggleBtn && signUpPasswordInput) {
  signUpPasswordToggleBtn.addEventListener("click", () => {
    togglePasswordVisible(signUpPasswordInput, signUpPasswordToggleBtn);
  });
}
if (signUpPasswordConfirmToggleBtn && signUpPasswordConfirmInput) {
  signUpPasswordConfirmToggleBtn.addEventListener("click", () => {
    togglePasswordVisible(signUpPasswordConfirmInput, signUpPasswordConfirmToggleBtn);
  });
}
if (signInPasswordInput) {
  signInPasswordInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    await handleSignIn();
  });
}
if (userAvatarImage && userAvatarFallback) {
  userAvatarImage.addEventListener("error", () => {
    userAvatarImage.hidden = true;
    userAvatarImage.removeAttribute("src");
    userAvatarFallback.hidden = false;
  });
}
window.addEventListener("scroll", handleWindowScroll, { passive: true });

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
setPasswordVisible(signInPasswordInput, signInPasswordToggleBtn, false);
setPasswordVisible(signUpPasswordInput, signUpPasswordToggleBtn, false);
setPasswordVisible(signUpPasswordConfirmInput, signUpPasswordConfirmToggleBtn, false);
renderTrackFolderConfig();
bootstrapAuth();


