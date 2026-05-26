import { runOnce } from "../scrape-engine/run-once.mjs";

const MODE_LIMITS = {
  fast: 10,
  deep: 10,
  full: 10
};

const MODE_POOL_LIMITS = {
  fast: 24,
  deep: 32,
  full: 48
};

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

async function verifySupabaseUser(request) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetUserId = process.env.SUPABASE_TARGET_USER_ID;
  const authorization = request.headers.authorization || "";

  if (!supabaseUrl || !serviceRoleKey || !targetUserId) {
    throw new Error("Scrape API is missing Supabase server environment variables.");
  }
  if (!authorization.startsWith("Bearer ")) {
    const error = new Error("Missing Supabase session token.");
    error.statusCode = 401;
    throw error;
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: authorization
    }
  });
  const user = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !user?.id) {
    const error = new Error("Invalid Supabase session token.");
    error.statusCode = 401;
    throw error;
  }
  if (user.id !== targetUserId) {
    const error = new Error("This account is not authorized to run the scrape engine.");
    error.statusCode = 403;
    throw error;
  }

  return user;
}

function configureScrapeEnvironment({ mode, appMode }) {
  process.env.SCRAPE_ENGINE_MODE = appMode === "live_real" ? "live_real" : "shadow_real";
  process.env.SCRAPE_DRY_RUN = "false";
  process.env.SCRAPE_MODE = mode;
  process.env.SCRAPE_ADAPTER = "web";
  process.env.SCRAPE_SOURCE_KEY = "multi_source_web";
  process.env.SCRAPE_INPUT_FILE = "./scrape-engine/sources/bounty-sources.json";
  process.env.SCRAPE_MAX_CANDIDATES = String(MODE_LIMITS[mode] || MODE_LIMITS.fast);
  process.env.SCRAPE_POOL_SIZE = String(MODE_POOL_LIMITS[mode] || MODE_POOL_LIMITS.fast);
  process.env.ALLOW_MANUAL_FIXTURE_WRITE = "false";
  process.env.ALLOW_FIXTURE_INPUT_WRITE = "false";
}

export default async function handler(request, response) {
  const startedAt = Date.now();
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  try {
    console.info("[scrape-run] request_started", {
      method: request.method,
      hasAuthorization: Boolean(request.headers.authorization)
    });
    await verifySupabaseUser(request);
    const body = await readJsonBody(request);
    const mode = MODE_LIMITS[body.mode] ? body.mode : "fast";
    configureScrapeEnvironment({ mode, appMode: body.appMode });

    const result = await runOnce({ print: false });
    console.info("[scrape-run] request_done", {
      mode,
      sourceKey: result?.sourceKey,
      sourceResults: result?.sourceResults,
      accepted: result?.accepted,
      created: result?.created,
      updated: result?.updated,
      durationMs: Date.now() - startedAt
    });
    sendJson(response, 200, {
      ok: true,
      mode,
      result
    });
  } catch (error) {
    console.error("[scrape-run] request_failed", {
      statusCode: error.statusCode || 500,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 4).join(" | "),
      durationMs: Date.now() - startedAt
    });
    sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Scrape engine failed."
    });
  }
}
