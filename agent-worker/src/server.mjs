import http from "node:http";
import { randomUUID } from "node:crypto";

import { loadEnvFile, env, boolEnv } from "./env.mjs";
import { createWorkerJob, claimNextJob, processJob } from "./jobs.mjs";
import { preflightAgentTools } from "../../scrape-engine/lib/agent-tool-runner.mjs";
import { brainBaseUrl, brainProvider } from "../../scrape-engine/lib/open-agent-brain.mjs";

await loadEnvFile(".env");
await loadEnvFile(".env.local");

const workerId = env("WORKER_ID", `worker-${randomUUID()}`);
const port = Number(env("PORT", "8080"));
let processing = false;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function requireWorkerAuth(req) {
  const expected = env("WORKER_API_KEY");
  if (!expected) return;
  const provided = req.headers["x-worker-key"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    const error = new Error("Unauthorized worker request.");
    error.statusCode = 401;
    throw error;
  }
}

async function runOneQueuedJob() {
  if (processing) return null;
  processing = true;
  try {
    const job = await claimNextJob(workerId);
    if (!job) return null;
    return await processJob(job, { workerId });
  } finally {
    processing = false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        workerId,
        pollEnabled: boolEnv("WORKER_POLL_ENABLED", true),
        brain: {
          provider: brainProvider(),
          baseUrl: brainBaseUrl(),
          enabled: String(process.env.AGENT_BRAIN_ENABLED || "false").toLowerCase() === "true"
        },
        time: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/tools") {
      sendJson(res, 200, await preflightAgentTools());
      return;
    }

    if (req.method === "POST" && url.pathname === "/jobs/analyze") {
      requireWorkerAuth(req);
      const body = await readBody(req);
      if (!body.userId || !body.bountyLocalId) {
        sendJson(res, 400, { ok: false, error: "userId and bountyLocalId are required." });
        return;
      }
      const job = await createWorkerJob({
        userId: body.userId,
        bountyLocalId: body.bountyLocalId,
        jobType: body.jobType || "analyze_bounty",
        priority: Number(body.priority || 50),
        payload: body.payload || {}
      });
      if (body.runNow === true) {
        const result = await processJob(job, { workerId });
        sendJson(res, 200, { ok: true, job, result });
        return;
      }
      sendJson(res, 202, { ok: true, job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/jobs/run-next") {
      requireWorkerAuth(req);
      const result = await runOneQueuedJob();
      sendJson(res, 200, { ok: true, result });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found." });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
});

server.listen(port, () => {
  console.log(JSON.stringify({ ok: true, service: "aa-bounties-agent-worker", workerId, port }));
});

if (boolEnv("WORKER_POLL_ENABLED", true)) {
  const intervalMs = Number(env("WORKER_POLL_INTERVAL_MS", "10000"));
  setInterval(() => {
    runOneQueuedJob().catch((error) => console.error("worker_poll_failed", error.message));
  }, intervalMs).unref();
}
