import { readFile } from "node:fs/promises";
import { sep, resolve } from "node:path";

export const MANUAL_FIXTURE_SOURCE_KEY = "manual_fixture";
const DEFAULT_USER_AGENT = "AA-Bounties-Dashboard/0.1 (+https://aa-bounties-dashboard.vercel.app)";
const DEFAULT_INTAKE_POLICY = {
  minDaysUntilDeadline: 14,
  maxAgeDays: 30,
  requireOpen: true,
  allowOngoing: false
};
const DEFAULT_WEB_SOURCES = [
  {
    key: "immunefi_web",
    label: "Immunefi Bug Bounty Directory",
    platform: "Immunefi",
    url: "https://immunefi.com/bug-bounty/",
    strategy: "immunefi_bounties",
    defaultType: "Security",
    defaultConfidence: 0.72,
    platformTrust: 9,
    enrichDetailPages: true,
    official: true,
    trustTier: "primary",
    extracts: ["program_detail_url", "maximum_bounty_usd", "reward_ranges", "program_overview"],
    intakePolicy: {
      ...DEFAULT_INTAKE_POLICY,
      allowOngoing: true
    },
    enabled: true
  },
  {
    key: "code4rena_audits",
    label: "Code4rena Audits",
    platform: "Code4rena",
    url: "https://code4rena.com/audits",
    strategy: "generic_links",
    defaultType: "Security",
    defaultConfidence: 0.68,
    platformTrust: 8,
    enrichDetailPages: false,
    includePatterns: ["https://code4rena\\.com/audits/[0-9]{4}-[0-9]{2}-"],
    excludePatterns: ["#", "/competitive-audit$"],
    official: true,
    trustTier: "primary",
    extracts: ["audit_page_url", "project_name", "prize_pool_when_available"],
    intakePolicy: DEFAULT_INTAKE_POLICY,
    enabled: true
  },
  {
    key: "code4rena_bounties",
    label: "Code4rena Live Bounties",
    platform: "Code4rena",
    url: "https://code4rena.com/bounties",
    strategy: "generic_links",
    defaultType: "Security",
    defaultConfidence: 0.7,
    platformTrust: 8,
    enrichDetailPages: false,
    includePatterns: ["https://code4rena\\.com/bounties/[^#?\\s\"]+"],
    excludePatterns: ["#", "/reports", "/help", "/login"],
    official: true,
    trustTier: "primary",
    extracts: ["bounty_page_url", "project_name", "max_bounty_when_available"],
    intakePolicy: {
      ...DEFAULT_INTAKE_POLICY,
      allowOngoing: true
    },
    enabled: true
  },
  {
    key: "sherlock_audits",
    label: "Sherlock Audit Contests",
    platform: "Sherlock",
    url: "https://audits.sherlock.xyz/contests",
    strategy: "generic_links",
    defaultType: "Security",
    defaultConfidence: 0.66,
    platformTrust: 8,
    enrichDetailPages: false,
    includePatterns: ["https://audits\\.sherlock\\.xyz/(contests|bug-bounties)(/|$)"],
    excludePatterns: ["_next/", "favicon", "leaderboards"],
    official: true,
    trustTier: "primary",
    extracts: ["contest_url", "project_name", "contest_status_when_available"],
    intakePolicy: DEFAULT_INTAKE_POLICY,
    enabled: true
  },
  {
    key: "sherlock_bounties",
    label: "Sherlock Bug Bounties",
    platform: "Sherlock",
    url: "https://audits.sherlock.xyz/bug-bounties",
    strategy: "generic_links",
    defaultType: "Security",
    defaultConfidence: 0.68,
    platformTrust: 8,
    enrichDetailPages: false,
    includePatterns: ["https://audits\\.sherlock\\.xyz/bug-bounties/\\d+"],
    excludePatterns: ["leaderboards", "/contests$"],
    official: true,
    trustTier: "primary",
    extracts: ["bug_bounty_url", "project_name", "last_updated", "payout"],
    intakePolicy: {
      ...DEFAULT_INTAKE_POLICY,
      allowOngoing: true
    },
    enabled: true
  },
  {
    key: "cantina_competitions",
    label: "Cantina Competitions",
    platform: "Cantina",
    url: "https://cantina.xyz/competitions",
    strategy: "generic_links",
    defaultType: "Security",
    defaultConfidence: 0.66,
    platformTrust: 8,
    enrichDetailPages: false,
    includePatterns: ["https://cantina\\.xyz/competitions/[0-9a-f-]{20,}"],
    excludePatterns: ["/opportunities", "/ended"],
    official: true,
    trustTier: "primary",
    extracts: ["competition_url", "project_name", "competition_status_when_available"],
    intakePolicy: DEFAULT_INTAKE_POLICY,
    enabled: true
  },
  {
    key: "cantina_bounties",
    label: "Cantina Live Bounties",
    platform: "Cantina",
    url: "https://cantina.xyz/opportunities/bounties",
    strategy: "generic_links",
    defaultType: "Security",
    defaultConfidence: 0.68,
    platformTrust: 8,
    enrichDetailPages: false,
    includePatterns: ["https://cantina\\.xyz/bounties/[0-9a-f-]{20,}"],
    excludePatterns: ["/ended", "/contact"],
    official: true,
    trustTier: "primary",
    extracts: ["bounty_url", "project_name", "started_on", "max_bounty_when_available"],
    intakePolicy: {
      ...DEFAULT_INTAKE_POLICY,
      allowOngoing: true
    },
    enabled: true
  },
  {
    key: "intigriti_programs",
    label: "Intigriti Public Programs",
    platform: "Intigriti",
    url: "https://www.intigriti.com/researchers/bug-bounty-programs",
    strategy: "generic_links",
    defaultType: "Security",
    defaultConfidence: 0.62,
    platformTrust: 7,
    enrichDetailPages: false,
    includePatterns: ["https://app\\.intigriti\\.com/programs/[^#?\\s\"]+"],
    excludePatterns: ["newsletter", "calculator", "product"],
    official: true,
    trustTier: "primary",
    extracts: ["program_url", "program_name", "public_program_listing"],
    intakePolicy: {
      ...DEFAULT_INTAKE_POLICY,
      allowOngoing: true,
      maxAgeDays: 0
    },
    enabled: true
  },
  {
    key: "hats_vaults",
    label: "Hats Finance Bounty Vaults",
    platform: "Hats Finance",
    url: "https://app.hats.finance/vaults",
    strategy: "generic_links",
    defaultType: "Security",
    defaultConfidence: 0.62,
    platformTrust: 7,
    enrichDetailPages: false,
    includePatterns: ["https://app\\.hats\\.finance/(vaults|vault)/"],
    excludePatterns: ["_next/", "static/"],
    official: true,
    trustTier: "primary",
    extracts: ["vault_url", "protocol_name", "vault_reward_when_available"],
    intakePolicy: {
      ...DEFAULT_INTAKE_POLICY,
      allowOngoing: true
    },
    enabled: true
  }
];

function parseJsonOrJsonLines(text, inputFile) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  try {
    return JSON.parse(trimmed);
  } catch (jsonError) {
    const rows = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (lineError) {
          throw new Error(`Invalid JSONL at ${inputFile}:${index + 1}: ${lineError.message}`);
        }
      });
    return rows;
  }
}

function unwrapCandidatePayload(payload, inputFile) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    for (const key of ["candidates", "items", "results", "data", "bounties"]) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }
  }

  throw new Error(`Adapter input ${inputFile} must be an array or contain candidates/items/results/data/bounties array.`);
}

export function assertSourceWriteAllowed({ sourceKey, dryRun, allowManualFixtureWrite }) {
  if (!dryRun && sourceKey === MANUAL_FIXTURE_SOURCE_KEY && !allowManualFixtureWrite) {
    throw new Error(
      "manual_fixture writes are blocked. Set SCRAPE_SOURCE_KEY to a real adapter key, or set ALLOW_MANUAL_FIXTURE_WRITE=true only for intentional fixture tests."
    );
  }
}

export function assertInputWriteAllowed({ inputFile, dryRun, allowFixtureInputWrite }) {
  const normalized = resolve(inputFile).split(/[\\/]+/).join(sep);
  if (!dryRun && normalized.includes(`${sep}fixtures${sep}`) && !allowFixtureInputWrite) {
    throw new Error("Fixture input writes are blocked. Point SCRAPE_INPUT_FILE to real scraper output, or set ALLOW_FIXTURE_INPUT_WRITE=true only for intentional fixture tests.");
  }
}

export async function loadAdapterCandidates({ adapter = "file", inputFile, maxCandidates = 25 }) {
  if (adapter === "file") {
    const resolvedInputFile = resolve(inputFile);
    const text = await readFile(resolvedInputFile, "utf8");
    const payload = parseJsonOrJsonLines(text, resolvedInputFile);
    const candidates = unwrapCandidatePayload(payload, resolvedInputFile).slice(0, maxCandidates);

    return {
      adapter,
      inputFile: resolvedInputFile,
      candidates
    };
  }

  if (adapter === "web") {
    return loadWebCandidates({ inputFile, maxCandidates });
  }

  throw new Error(`Unsupported SCRAPE_ADAPTER: ${adapter}. Supported adapters: "file", "web".`);
}

async function loadWebCandidates({ inputFile, maxCandidates }) {
  const resolvedSourcesFile = resolve(inputFile || "./sources/bounty-sources.json");
  let sourcePayload = null;
  try {
    sourcePayload = JSON.parse(await readFile(resolvedSourcesFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    sourcePayload = {
      sources: DEFAULT_WEB_SOURCES,
      fallbackReason: `Source file not bundled: ${resolvedSourcesFile}`
    };
  }
  const configuredSources = Array.isArray(sourcePayload) ? sourcePayload : sourcePayload.sources || [];
  const sources = mergeDefaultWebSources(configuredSources);
  if (!sources.length) {
    throw new Error(`Web adapter source file ${resolvedSourcesFile} has no sources.`);
  }

  const candidates = [];
  const sourceResults = [];
  const enabledSources = sources.filter((item) => item.enabled !== false);
  const requestedPoolSize = Number(process.env.SCRAPE_POOL_SIZE || maxCandidates * 3);
  const poolSize = Math.max(maxCandidates, requestedPoolSize);
  const perSourceLimit = Math.max(6, Math.ceil(poolSize / Math.max(1, enabledSources.length)) + 3);

  for (const source of enabledSources) {
    try {
      const result = await scrapeWebSource(source, perSourceLimit);
      sourceResults.push(result.summary);
      candidates.push(...result.candidates);
    } catch (error) {
      sourceResults.push({
        source_key: source.key,
        url: source.url,
        status: "error",
        found: 0,
        error: error.message,
        scraped_at: new Date().toISOString()
      });
    }
  }

  const dedupedCandidates = dedupeCandidatesBySource(candidates);

  return {
    adapter: "web",
    inputFile: resolvedSourcesFile,
    sourceResults,
    candidates: selectTopCandidates(dedupedCandidates, maxCandidates)
  };
}

function mergeDefaultWebSources(configuredSources) {
  const merged = new Map();
  for (const source of DEFAULT_WEB_SOURCES) {
    merged.set(source.key, source);
  }
  for (const source of configuredSources || []) {
    if (!source?.key) {
      continue;
    }
    merged.set(source.key, { ...merged.get(source.key), ...source });
  }
  return [...merged.values()];
}

function dedupeCandidatesBySource(candidates) {
  const seen = new Set();
  const deduped = [];
  for (const candidate of candidates) {
    const key = String(candidate.siteUrl || candidate.source_url || candidate.externalId || candidate.id || "").toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function selectTopCandidates(candidates, maxCandidates) {
  const sorted = [...candidates].sort((a, b) => candidateRankScore(b) - candidateRankScore(a));
  return interleaveCandidatesBySource(sorted, maxCandidates);
}

function candidateRankScore(candidate) {
  const scores = candidate.scores || {};
  const scoreTotal = Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);
  const payout = Number(candidate.price || candidate.metadata?.maximum_bounty_usd || 0);
  const sourceStart = parseIsoDate(candidate.metadata?.source_start_at || "");
  const freshness = sourceStart ? Math.max(0, 30 - ((Date.now() - sourceStart.getTime()) / 86400000)) : 10;
  const ongoing = candidate.metadata?.ongoing_program ? 4 : 0;
  const sourceTrust = Number(scores.platformTrust || 0);
  return scoreTotal + Math.min(25, Math.log10(Math.max(1, payout)) * 4) + freshness + ongoing + sourceTrust;
}

function interleaveCandidatesBySource(candidates, maxCandidates) {
  const buckets = new Map();
  for (const candidate of candidates) {
    const sourceKey = candidate.metadata?.web_source_key || candidate.metadata?.source || candidate.site || "unknown";
    if (!buckets.has(sourceKey)) {
      buckets.set(sourceKey, []);
    }
    buckets.get(sourceKey).push(candidate);
  }

  const output = [];
  const sourceKeys = [...buckets.keys()];
  while (output.length < maxCandidates && sourceKeys.some((key) => buckets.get(key)?.length)) {
    for (const key of sourceKeys) {
      const next = buckets.get(key)?.shift();
      if (next) {
        output.push(next);
      }
      if (output.length >= maxCandidates) {
        break;
      }
    }
  }
  return output;
}

async function scrapeWebSource(source, limit) {
  const startedAt = new Date().toISOString();
  const response = await fetch(source.url, {
    headers: {
      "user-agent": source.userAgent || DEFAULT_USER_AGENT,
      accept: "text/html,application/json;q=0.9,*/*;q=0.8"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Source ${source.key || source.url} failed: ${response.status} ${text.slice(0, 160)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const candidates = contentType.includes("application/json")
    ? jsonPayloadToCandidates(JSON.parse(text), source, limit, startedAt)
    : await htmlToCandidates(text, source, limit, startedAt);

  return {
    candidates,
    summary: {
      source_key: source.key,
      url: source.url,
      status: response.status,
      content_type: contentType,
      found: candidates.length,
      scraped_at: startedAt
    }
  };
}

function jsonPayloadToCandidates(payload, source, limit, scrapedAt) {
  return unwrapCandidatePayload(payload, source.url).slice(0, limit).map((item, index) => ({
    ...item,
    id: item.id || item.externalId || `${source.key || "web"}-${index + 1}`,
    site: item.site || item.platform || source.platform || source.key || "Web Source",
    siteUrl: item.siteUrl || item.source_url || item.url || source.url,
    type: item.type || item.bounty_type || source.defaultType || "Unknown",
    retrievedAt: item.retrievedAt || item.retrieved_at || scrapedAt,
    metadata: {
      ...(item.metadata || {}),
      web_source_url: source.url,
      web_source_key: source.key || null,
      adapter_strategy: "web_json"
    }
  }));
}

async function htmlToCandidates(html, source, limit, scrapedAt) {
  const strategy = source.strategy || "generic_links";
  const links = strategy === "immunefi_bounties" ? extractImmunefiBountyLinks(html, source.url) : extractGenericOpportunityLinks(html, source);
  const candidateLinks = strategy === "immunefi_bounties" ? links.slice(0, limit) : links;
  const candidates = candidateLinks.map((link) => linkToCandidate(link, source, scrapedAt));
  if (source.enrichDetailPages === false) {
    return candidates.filter((candidate) => passesIntakeTimePolicy(candidate, source, scrapedAt)).slice(0, limit);
  }

  const enriched = [];
  for (const candidate of candidates) {
    enriched.push(await enrichCandidateFromDetailPage(candidate, source));
  }
  return enriched.filter((candidate) => passesIntakeTimePolicy(candidate, source, scrapedAt)).slice(0, limit);
}

function extractImmunefiBountyLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const regex = /href="(\/bug-bounty\/([^/"]+)\/(?:information|scope)\/?)"/g;
  for (const match of html.matchAll(regex)) {
    const href = match[1];
    const slug = match[2];
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    links.push({
      href: new URL(href, baseUrl).toString(),
      slug,
      title: titleFromSlug(slug),
      type: "Security"
    });
  }
  return links;
}

function extractGenericOpportunityLinks(html, source) {
  const baseUrl = source.url;
  const links = [];
  const seen = new Map();
  const includePatterns = (source.includePatterns || []).map((pattern) => new RegExp(pattern, "i"));
  const excludePatterns = (source.excludePatterns || []).map((pattern) => new RegExp(pattern, "i"));
  const linkRegex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkRegex)) {
    const href = match[1];
    const text = stripHtml(match[2]);
    const absoluteUrl = new URL(href, baseUrl).toString();
    const haystack = `${href} ${text}`.toLowerCase();
    const filterTarget = `${absoluteUrl} ${text}`;
    const isIncluded = includePatterns.length ? includePatterns.some((pattern) => pattern.test(filterTarget)) : /(bounty|bug-bounty|challenge|contest|competition|audit)/.test(haystack);
    const isExcluded = excludePatterns.some((pattern) => pattern.test(filterTarget)) || /\.(css|js|woff2?|ttf|ico|png|jpg|jpeg|svg)(\?|$)/i.test(absoluteUrl);
    if (!isIncluded || isExcluded) {
      continue;
    }
    const slugTitle = titleFromSlug(slugFromUrl(absoluteUrl));
    const title = !text || /^(view|open|learn more|program)$/i.test(text.trim()) || /^view program$/i.test(text.trim())
      ? slugTitle
      : text;
    const link = {
      href: absoluteUrl,
      slug: slugFromUrl(absoluteUrl),
      title,
      type: haystack.includes("audit") ? "Security" : "Unknown"
    };
    if (seen.has(absoluteUrl)) {
      const index = seen.get(absoluteUrl);
      if (linkEvidenceScore(link) > linkEvidenceScore(links[index])) {
        links[index] = link;
      }
      continue;
    }
    seen.set(absoluteUrl, links.length);
    links.push(link);
  }
  return links;
}

function linkEvidenceScore(link) {
  const title = String(link?.title || "");
  return title.length + (extractMaxMoney(title) > 0 ? 120 : 0) + (/(last updated|started on|end date|ends)/i.test(title) ? 80 : 0);
}

function linkToCandidate(link, source, scrapedAt) {
  const sourceKey = source.key || "web";
  const localId = `${sourceKey}-${link.slug}`.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 96);
  const payoutUsd = extractMaxMoney(link.title);
  const timeline = extractTimelineFromText(link.title, link.href, scrapedAt);
  const hasDeadline = Boolean(timeline.deadlineIso);
  const policy = sourceIntakePolicy(source);
  const isOngoingProgram = policy.allowOngoing && !hasDeadline && timeline.status !== "closed";
  const payoutQuality = payoutQualityScore(payoutUsd);
  const redFlags = new Set(["operator_must_verify_scope"]);
  if (!payoutUsd) {
    redFlags.add("payout_not_extracted");
  }
  if (isOngoingProgram) {
    redFlags.add("ongoing_program");
  } else if (!hasDeadline) {
    redFlags.add("deadline_not_extracted");
  }
  if (timeline.status === "closed") {
    redFlags.add("closed_or_overdue");
  }

  return {
    id: localId,
    externalId: link.href,
    site: source.platform || source.label || sourceKey,
    siteUrl: link.href,
    type: link.type || source.defaultType || "Unknown",
    title: link.title,
    description: `Real web scrape discovery from ${source.label || sourceKey}. Review source page before action.`,
    scope: "Source page discovered by web adapter. Operator must review scope, rules, and eligibility before packaging.",
    fixRequired: "Review bounty requirements and capture reproducible evidence before submission.",
    price: payoutUsd,
    stage: "discovered",
    dueDate: timeline.deadlineIso ? timeline.deadlineIso.slice(0, 10) : "",
    retrievedAt: scrapedAt,
    confidence: payoutUsd ? Math.max(Number(source.defaultConfidence ?? 0.68), 0.72) : Number(source.defaultConfidence ?? 0.68),
    nextAction: "evaluate_now",
    scores: {
      fit: 12,
      payoutQuality,
      deadlineFeasibility: 6,
      winProbability: 8,
      strategicValue: 7,
      platformTrust: Number(source.platformTrust ?? 8)
    },
    redFlags: [...redFlags],
    metadata: {
      web_source_url: source.url,
      web_source_key: sourceKey,
      adapter_strategy: source.strategy || "generic_links",
      scraped_at: scrapedAt,
      status_from_source: timeline.status,
      source_date_label: timeline.startLabel || (timeline.startIso ? "Source listed/updated" : "Discovered by scraper"),
      source_expiration_label: hasDeadline ? "Source deadline" : isOngoingProgram ? "No fixed expiration published by source; currently listed as live/open." : "Deadline not extracted",
      source_start_at: timeline.startIso || null,
      source_deadline_at: timeline.deadlineIso || null,
      ongoing_program: isOngoingProgram,
      min_days_until_deadline: source.intakePolicy?.minDaysUntilDeadline ?? DEFAULT_INTAKE_POLICY.minDaysUntilDeadline,
      max_age_days: source.intakePolicy?.maxAgeDays ?? DEFAULT_INTAKE_POLICY.maxAgeDays,
      maximum_bounty_usd: payoutUsd || null,
      payout_extracted_from: payoutUsd ? "source_link_text" : null
    }
  };
}

async function enrichCandidateFromDetailPage(candidate, source) {
  try {
    const response = await fetch(candidate.siteUrl, {
      headers: {
        "user-agent": source.userAgent || DEFAULT_USER_AGENT,
        accept: "text/html,*/*;q=0.8"
      }
    });
    const html = await response.text();
    if (!response.ok) {
      return withDetailFailure(candidate, `detail_fetch_${response.status}`);
    }

    const detail = extractImmunefiProgramDetail(html);
    const payoutUsd = detail.maximumBountyUsd || candidate.price || 0;
    const hasPayout = payoutUsd > 0;
    const redFlags = new Set(candidate.redFlags || []);
    if (hasPayout) {
      redFlags.delete("payout_not_extracted");
    }
    if (detail.kycRequired) {
      redFlags.add("kyc_required");
    }
    if (detail.pocRequired) {
      redFlags.add("poc_required");
    }
    if (detail.vaultProgram) {
      redFlags.add("vault_program");
    }
    redFlags.delete("deadline_not_extracted");
    redFlags.add("ongoing_program");
    if (!detail.scopeSummary) {
      redFlags.add("scope_requires_manual_review");
    }

    return {
      ...candidate,
      title: detail.title || candidate.title,
      description: detail.overview || candidate.description,
      scope: detail.scopeSummary || candidate.scope,
      fixRequired: detail.problemStatement || candidate.fixRequired,
      price: payoutUsd,
      confidence: hasPayout ? Math.max(Number(candidate.confidence || 0), 0.82) : candidate.confidence,
      nextAction: hasPayout && payoutUsd >= 10000 ? "evaluate_now" : candidate.nextAction,
      scores: {
        ...candidate.scores,
        fit: hasPayout ? 14 : candidate.scores.fit,
        payoutQuality: payoutQualityScore(payoutUsd),
        deadlineFeasibility: detail.pocRequired ? 8 : candidate.scores.deadlineFeasibility,
        winProbability: detail.pocRequired ? 10 : candidate.scores.winProbability,
        strategicValue: payoutUsd >= 50000 ? 15 : candidate.scores.strategicValue
      },
      redFlags: [...redFlags],
      metadata: {
        ...candidate.metadata,
        detail_enriched: true,
        detail_url: candidate.siteUrl,
        maximum_bounty_usd: detail.maximumBountyUsd || null,
        reward_ranges: detail.rewardRanges,
        funds_available_usd: detail.fundsAvailableUsd || null,
        live_since: detail.liveSince || null,
        last_updated: detail.lastUpdated || null,
        source_date_label: detail.liveSince ? "Live Since" : candidate.metadata?.source_date_label || "Discovered by scraper",
        source_expiration_label: "No fixed expiration published by source; currently listed as live/open.",
        source_start_at: parseLooseDate(detail.liveSince)?.toISOString() || candidate.metadata?.source_start_at || null,
        source_deadline_at: null,
        kyc_required: detail.kycRequired,
        poc_required: detail.pocRequired,
        vault_program: detail.vaultProgram,
        ongoing_program: true,
        program_tags: detail.tags,
        extracted_from_rewards_anchor: true,
        source_evidence: {
          official_source: true,
          source_url: candidate.siteUrl,
          scraped_at: new Date().toISOString(),
          title: detail.title || candidate.title,
          problem_statement: detail.problemStatement || detail.overview || "",
          rewards_excerpt: detail.rewardsExcerpt || "",
          scope_excerpt: detail.scopeSummary || "",
          html_excerpt: detail.textExcerpt || ""
        }
      }
    };
  } catch (error) {
    return withDetailFailure(candidate, error.message);
  }
}

function withDetailFailure(candidate, reason) {
  return {
    ...candidate,
    redFlags: [...new Set([...(candidate.redFlags || []), "detail_fetch_failed"])],
    metadata: {
      ...candidate.metadata,
      detail_enriched: false,
      detail_error: reason
    }
  };
}

function sourceIntakePolicy(source) {
  return {
    ...DEFAULT_INTAKE_POLICY,
    ...(source.intakePolicy || {})
  };
}

function passesIntakeTimePolicy(candidate, source, scrapedAt) {
  const policy = sourceIntakePolicy(source);
  const now = new Date(scrapedAt || Date.now());
  const metadata = candidate.metadata || {};
  const redFlags = new Set(candidate.redFlags || []);
  const status = String(metadata.status_from_source || "").toLowerCase();
  const deadline = parseIsoDate(metadata.source_deadline_at || candidate.dueDate || "");
  const start = parseIsoDate(metadata.source_start_at || "");
  const ongoing = Boolean(metadata.ongoing_program || redFlags.has("ongoing_program"));

  if (policy.requireOpen && /(closed|ended|completed|past|overdue)/i.test(status)) {
    return false;
  }

  if (deadline) {
    const daysUntilDeadline = (deadline.getTime() - now.getTime()) / 86400000;
    if (daysUntilDeadline < Number(policy.minDaysUntilDeadline || 0)) {
      return false;
    }
  } else if (!(policy.allowOngoing && ongoing)) {
    return false;
  }

  if (start && Number(policy.maxAgeDays || 0) > 0) {
    const ageDays = (now.getTime() - start.getTime()) / 86400000;
    if (ageDays > Number(policy.maxAgeDays)) {
      return false;
    }
  }

  return true;
}

function extractImmunefiProgramDetail(html) {
  const text = stripHtml(html);
  const title = firstMatch(text, /Back to Explore\s+(.+?)\s+\|/) || firstMatch(text, /^(.+?)\s+\|/);
  const maximumBountyUsd = moneyAfter(text, /Maximum Bounty\s+/i);
  const fundsAvailableUsd = moneyAfter(text, /Funds available\s+/i);
  const liveSince = firstMatch(text, /Live Since\s+(.+?)\s+Last Updated/i);
  const lastUpdated = firstMatch(text, /Last Updated\s+(.+?)(?:\s+\*|\s+Submit a Bug|\s+Information)/i);
  const overview = firstMatch(text, /Program Overview\s+([\s\S]+?)(?:\s+Audits\s+|\s+KYC required\s+|\s+Proof of Concept\s+)/i);
  const rewardsBody = firstMatch(text, /Rewards\s+([\s\S]+?)(?:\s+View impacts in scope|\s+Program Overview\s+)/i);
  const rewardRanges = extractRewardRanges(text);
  const problemStatement = overview
    ? `Investigate this official Immunefi program for valid, in-scope security impact. ${overview.trim().slice(0, 900)}`
    : "Investigate this official Immunefi program for valid, in-scope security impact according to the source page.";

  return {
    title: title ? title.trim() : "",
    maximumBountyUsd,
    fundsAvailableUsd,
    liveSince: liveSince ? liveSince.trim() : "",
    lastUpdated: lastUpdated ? lastUpdated.trim() : "",
    overview: overview ? overview.trim().slice(0, 1800) : "",
    problemStatement,
    scopeSummary: rewardsBody ? `Rewards and scope extracted from Immunefi. ${rewardsBody.trim().slice(0, 1200)}` : "",
    rewardsExcerpt: rewardsBody ? rewardsBody.trim().slice(0, 1500) : "",
    rewardRanges,
    kycRequired: /KYC required/i.test(text),
    pocRequired: /PoC Required|Proof of Concept\s+Proof of concept is always required/i.test(text),
    vaultProgram: /Vault program|Immunefi vault program/i.test(text),
    tags: extractProgramTags(text),
    textExcerpt: text.slice(0, 3500)
  };
}

function extractRewardRanges(text) {
  const ranges = [];
  const regex = /(Smart Contract|Blockchain\/DLT|Websites and Applications|Websites\/Apps|Critical|High|Medium|Low)\s+(Critical|High|Medium|Low)?\s*Max:\s*(\$[\d,]+(?:\.\d+)?)\s+Min:\s*(\$[\d,]+(?:\.\d+)?)/gi;
  for (const match of text.matchAll(regex)) {
    ranges.push({
      category: match[2] ? match[1].trim() : "",
      threatLevel: (match[2] || match[1]).trim(),
      maxUsd: parseMoney(match[3]),
      minUsd: parseMoney(match[4])
    });
  }
  return ranges;
}

function extractProgramTags(text) {
  const tags = [];
  for (const tag of ["Arbitrum", "ETH", "Blockchain", "Infrastructure", "Services", "Staking", "Go", "Rust", "Solidity", "Typescript"]) {
    if (new RegExp(`\\b${tag}\\b`, "i").test(text)) {
      tags.push(tag);
    }
  }
  return tags;
}

function payoutQualityScore(value) {
  if (value >= 100000) return 20;
  if (value >= 50000) return 18;
  if (value >= 25000) return 16;
  if (value >= 10000) return 14;
  if (value > 0) return 10;
  return 0;
}

function moneyAfter(text, prefixRegex) {
  const prefixMatch = text.match(prefixRegex);
  if (!prefixMatch) {
    return 0;
  }
  const after = text.slice(prefixMatch.index + prefixMatch[0].length);
  const money = after.match(/\$[\d,]+(?:\.\d+)?/);
  return money ? parseMoney(money[0]) : 0;
}

function extractTimelineFromText(text = "", href = "", scrapedAt = new Date().toISOString()) {
  const normalized = stripHtml(text);
  const lower = normalized.toLowerCase();
  const now = new Date(scrapedAt || Date.now());
  const inferredYear = inferYearFromUrl(href) || now.getUTCFullYear();
  const closedStatus = /\b(completed|ended|closed|past|report in progress|judging)\b/i.test(normalized) ? "closed" : "";

  const explicitEnd =
    firstMatch(normalized, /\b(?:End date|Ends|Ended on)\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i) ||
    firstMatch(normalized, /\b(?:End date|Ends|Ended on)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  const explicitStart =
    firstMatch(normalized, /\b(?:Start date|Starts|Started on)\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i) ||
    firstMatch(normalized, /\b(?:Start date|Starts|Started on)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  const lastUpdated =
    firstMatch(normalized, /\bLast Updated\s*[•:-]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i) ||
    firstMatch(normalized, /\bLast Updated\s*[•:-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);

  let startLabel = explicitStart ? "Source start date" : lastUpdated ? "Last updated" : "";
  let startDate = parseLooseDate(explicitStart || lastUpdated, inferredYear);
  let deadline = parseLooseDate(explicitEnd, inferredYear);

  if (!deadline) {
    const range = normalized.match(/\b(\d{1,2}\s+[A-Za-z]{3,9})(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?\s*-\s*(\d{1,2}\s+[A-Za-z]{3,9})(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?/i);
    if (range) {
      startDate = parseLooseDate(`${range[1]} ${inferredYear}`, inferredYear);
      deadline = parseLooseDate(`${range[2]} ${inferredYear}`, inferredYear);
      if (startDate && deadline && deadline < startDate) {
        deadline.setUTCFullYear(deadline.getUTCFullYear() + 1);
      }
    }
  }

  if (!startDate) {
    const urlMonth = inferMonthStartFromUrl(href);
    if (urlMonth) {
      startDate = urlMonth;
      startLabel = "Inferred from source URL";
    }
  }

  let status = closedStatus || "open";
  if (deadline) {
    const minSafeDeadline = new Date(now.getTime() + DEFAULT_INTAKE_POLICY.minDaysUntilDeadline * 86400000);
    if (deadline < minSafeDeadline) {
      status = "closed";
    }
  }
  if (/\b(upcoming|ongoing|open|active|live)\b/i.test(lower) && status !== "closed") {
    status = "open";
  }

  return {
    status,
    startLabel,
    startIso: startDate ? startDate.toISOString() : "",
    deadlineIso: deadline ? deadline.toISOString() : ""
  };
}

function inferYearFromUrl(value = "") {
  const match = String(value).match(/\/(20\d{2})[-/]/);
  return match ? Number(match[1]) : null;
}

function inferMonthStartFromUrl(value = "") {
  const match = String(value).match(/\/(20\d{2})-(\d{2})[-/]/);
  if (!match) {
    return null;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 0, 0, 0));
}

function parseLooseDate(value = "", fallbackYear = new Date().getUTCFullYear()) {
  const raw = String(value || "").replace(/,/g, "").trim();
  if (!raw) {
    return null;
  }

  const withYear = /\b20\d{2}\b/.test(raw) ? raw : `${raw} ${fallbackYear}`;
  const dayFirst = withYear.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})$/i);
  const monthFirst = withYear.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(20\d{2})$/i);
  const monthMap = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11
  };

  const parts = dayFirst
    ? { day: Number(dayFirst[1]), month: monthMap[dayFirst[2].toLowerCase()], year: Number(dayFirst[3]) }
    : monthFirst
      ? { day: Number(monthFirst[2]), month: monthMap[monthFirst[1].toLowerCase()], year: Number(monthFirst[3]) }
      : null;
  if (!parts || !Number.isFinite(parts.month)) {
    return null;
  }
  return new Date(Date.UTC(parts.year, parts.month, parts.day, 23, 59, 59));
}

function parseIsoDate(value = "") {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractMaxMoney(text = "") {
  const values = [
    ...String(text).matchAll(/\$\s*([0-9][0-9,]*(?:\.\d+)?)(?:\s*(k|m|K|M))?/g),
    ...String(text).matchAll(/\b([0-9][0-9,]*(?:\.\d+)?)(?:\s*(k|m|K|M))?\s+(?:USD|USDC|USDG|DOLA|USDT)\b/gi)
  ]
    .map((match) => {
      const base = parseMoney(match[1]);
      const suffix = String(match[2] || "").toLowerCase();
      if (suffix === "m") return base * 1000000;
      if (suffix === "k") return base * 1000;
      return base;
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

function parseMoney(value = "") {
  const number = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match?.[1] || "";
}

function titleFromSlug(slug = "") {
  return String(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugFromUrl(value = "") {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.at(-1) || url.hostname.replace(/^www\./, "");
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
