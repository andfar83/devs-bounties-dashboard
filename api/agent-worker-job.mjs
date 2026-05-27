const CONTRACT_VERSION = "2026-05-26.worker.v1";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

async function verifySupabaseUser(request) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetUserId = process.env.SUPABASE_TARGET_USER_ID;
  const authorization = request.headers.authorization || "";

  if (!supabaseUrl || !serviceRoleKey || !targetUserId) throw new Error("Worker API is missing Supabase server environment variables.");
  if (!authorization.startsWith("Bearer ")) {
    const error = new Error("Missing Supabase session token.");
    error.statusCode = 401;
    throw error;
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: authorization }
  });
  const user = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !user?.id) {
    const error = new Error("Invalid Supabase session token.");
    error.statusCode = 401;
    throw error;
  }
  if (user.id !== targetUserId) {
    const error = new Error("This account is not authorized to create worker jobs.");
    error.statusCode = 403;
    throw error;
  }
  return user;
}

async function rest(path, { method = "GET", body, prefer = "" } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${text.slice(0, 300)}`);
  return payload;
}

async function notifyWorker(job) {
  const baseUrl = process.env.AGENT_WORKER_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) return { notified: false, reason: "AGENT_WORKER_BASE_URL not configured" };
  const response = await fetch(`${baseUrl}/jobs/run-next`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.AGENT_WORKER_API_KEY ? { "x-worker-key": process.env.AGENT_WORKER_API_KEY } : {})
    },
    body: JSON.stringify({ jobId: job.id })
  });
  const payload = await response.json().catch(() => ({}));
  return { notified: response.ok, status: response.status, payload };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const user = await verifySupabaseUser(request);
    const body = await readJsonBody(request);
    if (!body.bountyLocalId) {
      sendJson(response, 400, { ok: false, error: "bountyLocalId is required." });
      return;
    }

    const rows = await rest("agent_worker_jobs", {
      method: "POST",
      prefer: "return=representation",
      body: {
        user_id: user.id,
        contract_version: CONTRACT_VERSION,
        bounty_local_id: body.bountyLocalId,
        job_type: body.jobType || "analyze_bounty",
        priority: Number(body.priority || 50),
        payload: body.payload || {}
      }
    });
    const job = rows?.[0];
    const notification = body.notify === false ? { notified: false, reason: "notify=false" } : await notifyWorker(job);
    sendJson(response, 202, { ok: true, job, notification });
  } catch (error) {
    sendJson(response, error.statusCode || 500, { ok: false, error: error.message || "Worker job failed." });
  }
}
