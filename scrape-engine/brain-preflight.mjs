import { agentModelFor, brainApiKey, brainBaseUrl, brainProvider, OPEN_AGENT_BRAIN_POLICY } from "./lib/open-agent-brain.mjs";

const agents = ["scout", "feasibility", "builder", "ops"];

function headersForProvider() {
  const headers = { "content-type": "application/json" };
  const apiKey = brainApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (process.env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  }
  return headers;
}

function hasModel(installed, model) {
  if (!installed.size) {
    return false;
  }
  return installed.has(model) || installed.has(model.toLowerCase());
}

async function main() {
  const provider = brainProvider();
  const baseUrl = brainBaseUrl();
  const result = {
    ok: false,
    provider,
    baseUrl,
    apiKeyConfigured: Boolean(brainApiKey()),
    policy: OPEN_AGENT_BRAIN_POLICY,
    models: Object.fromEntries(agents.map((agentId) => [agentId, agentModelFor(agentId)])),
    checks: []
  };

  try {
    if (!baseUrl) {
      throw new Error("AGENT_BRAIN_BASE_URL is required for this provider.");
    }
    if (provider !== "ollama" && !brainApiKey()) {
      throw new Error("AGENT_BRAIN_API_KEY is required for remote providers.");
    }

    const modelsUrl = provider === "ollama" ? `${baseUrl}/api/tags` : `${baseUrl}/models`;
    const response = await fetch(modelsUrl, { headers: provider === "ollama" ? undefined : headersForProvider() });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${text.slice(0, 200)}`);
    }
    const payload = text ? JSON.parse(text) : {};
    const modelRows = provider === "ollama" ? payload.models || [] : payload.data || payload.models || [];
    const installed = new Set(
      modelRows
        .flatMap((model) => [model.name, model.id])
        .filter(Boolean)
        .flatMap((name) => [name, String(name).toLowerCase()])
    );
    result.checks = agents.map((agentId) => {
      const model = agentModelFor(agentId);
      return {
        agentId,
        model,
        installed: hasModel(installed, model)
      };
    });
    result.ok = provider === "ollama" ? result.checks.every((check) => check.installed) : result.apiKeyConfigured;
    if (provider !== "ollama") {
      result.note = "Remote providers may expose aliases differently; ok means the endpoint and API key responded. Model checks are advisory.";
    }
  } catch (error) {
    result.error = error.message;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
