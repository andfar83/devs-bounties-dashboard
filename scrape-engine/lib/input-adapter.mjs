import { readFile } from "node:fs/promises";
import { sep, resolve } from "node:path";

export const MANUAL_FIXTURE_SOURCE_KEY = "manual_fixture";
const DEFAULT_USER_AGENT = "AA-Bounties-Dashboard/0.1 (+https://aa-bounties-dashboard.vercel.app)";
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
  const sources = Array.isArray(sourcePayload) ? sourcePayload : sourcePayload.sources || [];
  if (!sources.length) {
    throw new Error(`Web adapter source file ${resolvedSourcesFile} has no sources.`);
  }

  const candidates = [];
  const sourceResults = [];
  for (const source of sources.filter((item) => item.enabled !== false)) {
    if (candidates.length >= maxCandidates) {
      break;
    }
    const result = await scrapeWebSource(source, maxCandidates - candidates.length);
    sourceResults.push(result.summary);
    candidates.push(...result.candidates);
  }

  return {
    adapter: "web",
    inputFile: resolvedSourcesFile,
    sourceResults,
    candidates: candidates.slice(0, maxCandidates)
  };
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
  const links = strategy === "immunefi_bounties" ? extractImmunefiBountyLinks(html, source.url) : extractGenericOpportunityLinks(html, source.url);
  const candidates = links.slice(0, limit).map((link) => linkToCandidate(link, source, scrapedAt));
  if (source.enrichDetailPages === false) {
    return candidates;
  }

  const enriched = [];
  for (const candidate of candidates) {
    enriched.push(await enrichCandidateFromDetailPage(candidate, source));
  }
  return enriched;
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

function extractGenericOpportunityLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const linkRegex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkRegex)) {
    const href = match[1];
    const text = stripHtml(match[2]);
    const absoluteUrl = new URL(href, baseUrl).toString();
    const haystack = `${href} ${text}`.toLowerCase();
    if (!/(bounty|bug-bounty|challenge|contest|competition|audit)/.test(haystack) || seen.has(absoluteUrl)) {
      continue;
    }
    seen.add(absoluteUrl);
    links.push({
      href: absoluteUrl,
      slug: slugFromUrl(absoluteUrl),
      title: text || titleFromSlug(slugFromUrl(absoluteUrl)),
      type: haystack.includes("audit") ? "Security" : "Unknown"
    });
  }
  return links;
}

function linkToCandidate(link, source, scrapedAt) {
  const sourceKey = source.key || "web";
  const localId = `${sourceKey}-${link.slug}`.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 96);
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
    price: 0,
    stage: "discovered",
    dueDate: "",
    retrievedAt: scrapedAt,
    confidence: Number(source.defaultConfidence ?? 0.68),
    nextAction: "evaluate_now",
    scores: {
      fit: 12,
      payoutQuality: 0,
      deadlineFeasibility: 6,
      winProbability: 8,
      strategicValue: 7,
      platformTrust: Number(source.platformTrust ?? 8)
    },
    redFlags: ["operator_must_verify_scope", "payout_not_extracted", "deadline_not_extracted"],
    metadata: {
      web_source_url: source.url,
      web_source_key: sourceKey,
      adapter_strategy: source.strategy || "generic_links",
      scraped_at: scrapedAt
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
        kyc_required: detail.kycRequired,
        poc_required: detail.pocRequired,
        vault_program: detail.vaultProgram,
        ongoing_program: true,
        program_tags: detail.tags,
        extracted_from_rewards_anchor: true
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

  return {
    title: title ? title.trim() : "",
    maximumBountyUsd,
    fundsAvailableUsd,
    liveSince: liveSince ? liveSince.trim() : "",
    lastUpdated: lastUpdated ? lastUpdated.trim() : "",
    overview: overview ? overview.trim().slice(0, 1800) : "",
    scopeSummary: rewardsBody ? `Rewards and scope extracted from Immunefi. ${rewardsBody.trim().slice(0, 1200)}` : "",
    rewardRanges,
    kycRequired: /KYC required/i.test(text),
    pocRequired: /PoC Required|Proof of Concept\s+Proof of concept is always required/i.test(text),
    vaultProgram: /Vault program|Immunefi vault program/i.test(text),
    tags: extractProgramTags(text)
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
