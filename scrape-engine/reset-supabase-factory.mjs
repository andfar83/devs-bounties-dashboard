import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_ENV_FILE = resolve(__dirname, ".env.local");
const CONFIRM_FLAG = "--confirm";

const runtimeTables = [
  "scrape_intake_queue",
  "agent_cooperation_events",
  "failure_events",
  "quality_gate_results",
  "agent_decisions",
  "agent_events",
  "work_artifacts",
  "submission_logs",
  "work_packages",
  "scrape_source_state",
  "agent_memory",
  "agent_knowledge",
  "scrape_runs",
  "bounty_candidates"
];

async function loadEnvFile(path = DEFAULT_ENV_FILE) {
  if (!existsSync(path)) {
    return;
  }

  const text = await readFile(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = rest.join("=").trim();
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function createClient() {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const userId = requireEnv("SUPABASE_TARGET_USER_ID");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };

  async function rest(table, query = "", options = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
      method: options.method || "GET",
      headers: { ...headers, ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${options.method || "GET"} ${table}${query} failed: ${response.status} ${text}`);
    }
    return { response, payload };
  }

  async function listStorage(prefix) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/list/bounty-artifacts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prefix,
        limit: 1000,
        offset: 0,
        sortBy: { column: "name", order: "asc" }
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Storage list failed: ${response.status} ${text}`);
    }
    return text ? JSON.parse(text) : [];
  }

  return { userId, rest, listStorage };
}

async function fetchRows(rest, userId, table) {
  const { payload } = await rest(table, `?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  return payload || [];
}

async function countTable(rest, userId, table) {
  const { response } = await rest(table, `?select=user_id&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "HEAD",
    headers: { Prefer: "count=exact", Range: "0-0" }
  });
  const contentRange = response.headers.get("content-range") || "*/0";
  const total = Number(contentRange.split("/").pop() || 0);
  return Number.isFinite(total) ? total : 0;
}

async function main() {
  await loadEnvFile(process.env.SCRAPE_ENV_FILE || DEFAULT_ENV_FILE);
  const confirmed = process.argv.includes(CONFIRM_FLAG);
  const { userId, rest, listStorage } = createClient();

  const snapshot = {
    exportedAt: new Date().toISOString(),
    targetUserId: userId,
    tables: {}
  };
  const before = {};

  for (const table of runtimeTables) {
    const rows = await fetchRows(rest, userId, table);
    snapshot.tables[table] = rows;
    before[table] = rows.length;
  }

  const storageUserPrefix = await listStorage(userId);
  const storageUserSlashPrefix = await listStorage(`${userId}/`);

  if (!confirmed) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          message: `No rows deleted. Re-run with ${CONFIRM_FLAG} to create a backup and reset runtime data.`,
          targetUser: `${userId.slice(0, 8)}...`,
          counts: before,
          storage: {
            bucket: "bounty-artifacts",
            userPrefixCount: storageUserPrefix.length,
            userSlashPrefixCount: storageUserSlashPrefix.length
          }
        },
        null,
        2
      )
    );
    return;
  }

  await mkdir(resolve(repoRoot, "output"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const backupPath = resolve(repoRoot, "output", `supabase-factory-reset-backup-${stamp}.json`);
  await writeFile(backupPath, JSON.stringify(snapshot, null, 2), "utf8");

  const deleted = {};
  for (const table of runtimeTables) {
    if (before[table] === 0) {
      deleted[table] = 0;
      continue;
    }
    await rest(table, `?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    deleted[table] = before[table];
  }

  const after = {};
  for (const table of runtimeTables) {
    after[table] = await countTable(rest, userId, table);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        targetUser: `${userId.slice(0, 8)}...`,
        backupPath,
        before,
        deleted,
        after,
        storage: {
          bucket: "bounty-artifacts",
          userPrefixCount: storageUserPrefix.length,
          userSlashPrefixCount: storageUserSlashPrefix.length
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
