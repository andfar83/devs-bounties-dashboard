import { readFile } from "node:fs/promises";
import { sep, resolve } from "node:path";

export const MANUAL_FIXTURE_SOURCE_KEY = "manual_fixture";

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
  if (adapter !== "file") {
    throw new Error(`Unsupported SCRAPE_ADAPTER: ${adapter}. Current bridge supports "file".`);
  }

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
