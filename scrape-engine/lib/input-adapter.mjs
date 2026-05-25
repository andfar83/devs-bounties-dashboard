import { readFile } from "node:fs/promises";
import { sep, resolve } from "node:path";

export const MANUAL_FIXTURE_SOURCE_KEY = "manual_fixture";
const DEFAULT_USER_AGENT = "AA-Bounties-Dashboard/0.1 (+https://aa-bounties-dashboard.vercel.app)";

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
  const sourcePayload = JSON.parse(await readFile(resolvedSourcesFile, "utf8"));
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
    : htmlToCandidates(text, source, limit, startedAt);

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

function htmlToCandidates(html, source, limit, scrapedAt) {
  const strategy = source.strategy || "generic_links";
  const links = strategy === "immunefi_bounties" ? extractImmunefiBountyLinks(html, source.url) : extractGenericOpportunityLinks(html, source.url);
  return links.slice(0, limit).map((link) => linkToCandidate(link, source, scrapedAt));
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
