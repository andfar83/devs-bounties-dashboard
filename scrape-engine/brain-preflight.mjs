import { agentModelFor, brainBaseUrl, OPEN_AGENT_BRAIN_POLICY } from "./lib/open-agent-brain.mjs";

const agents = ["scout", "feasibility", "builder", "ops"];

async function main() {
  const baseUrl = brainBaseUrl();
  const result = {
    ok: false,
    baseUrl,
    policy: OPEN_AGENT_BRAIN_POLICY,
    models: Object.fromEntries(agents.map((agentId) => [agentId, agentModelFor(agentId)])),
    checks: []
  };

  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${text.slice(0, 200)}`);
    }
    const payload = text ? JSON.parse(text) : {};
    const installed = new Set((payload.models || []).map((model) => model.name));
    result.checks = agents.map((agentId) => {
      const model = agentModelFor(agentId);
      return {
        agentId,
        model,
        installed: installed.has(model)
      };
    });
    result.ok = result.checks.every((check) => check.installed);
  } catch (error) {
    result.error = error.message;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

