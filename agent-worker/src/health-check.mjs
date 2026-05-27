import { loadEnvFile } from "./env.mjs";
import { preflightAgentTools } from "../../scrape-engine/lib/agent-tool-runner.mjs";
import { brainBaseUrl, brainProvider } from "../../scrape-engine/lib/open-agent-brain.mjs";

await loadEnvFile(".env");
await loadEnvFile(".env.local");

console.log(JSON.stringify({
  ok: true,
  tools: await preflightAgentTools(),
  brain: {
    provider: brainProvider(),
    baseUrl: brainBaseUrl(),
    enabled: String(process.env.AGENT_BRAIN_ENABLED || "false").toLowerCase() === "true"
  }
}, null, 2));
