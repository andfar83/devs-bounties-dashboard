import { randomUUID } from "node:crypto";
import { loadEnvFile, env } from "./env.mjs";
import { claimNextJob, processJob } from "./jobs.mjs";

await loadEnvFile(".env");
await loadEnvFile(".env.local");

const workerId = env("WORKER_ID", `worker-${randomUUID()}`);
const intervalMs = Number(env("WORKER_POLL_INTERVAL_MS", "10000"));

console.log(JSON.stringify({ ok: true, workerId, mode: "poll_loop", intervalMs }));

while (true) {
  try {
    const job = await claimNextJob(workerId);
    if (job) {
      const result = await processJob(job, { workerId });
      console.log(JSON.stringify({ jobId: job.id, ...result }));
    }
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
