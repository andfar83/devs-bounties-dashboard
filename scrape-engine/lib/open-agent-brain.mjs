const PROVIDER_BASE_URLS = {
  ollama: "http://127.0.0.1:11434",
  openai_compatible: "",
  together: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1"
};

const LOCAL_AGENT_MODELS = {
  scout: "qwen2.5-coder:7b",
  feasibility: "qwen2.5:7b",
  builder: "qwen2.5-coder:14b",
  ops: "qwen2.5:7b"
};

const REMOTE_OPEN_AGENT_MODELS = {
  scout: "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
  feasibility: "deepseek-ai/DeepSeek-V3.1",
  builder: "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
  ops: "deepseek-ai/DeepSeek-V3.1"
};

export const OPEN_AGENT_BRAIN_POLICY = {
  provider: "open_weight_remote_or_self_hosted",
  cost: "remote_open_weight_api_or_self_hosted_gpu",
  network: "no_browser_secrets_all_calls_go_server_side",
  allowedTools: [
    "official_source_fetch",
    "local_package_reader",
    "static_analysis_oss",
    "test_runner",
    "evidence_writer"
  ],
  hardRules: [
    "Do not invent vulnerabilities.",
    "Do not mark submit-ready without source HTML, scope, PoC, evidence, and completed Sentinel checklist.",
    "Do not use exploit marketplaces, leaked data, paid-only datasets, or private credentials.",
    "Prefer official bounty pages, official docs, official repositories, and open-source security tools."
  ]
};

export function brainProvider(env = process.env) {
  return String(env.AGENT_BRAIN_PROVIDER || "ollama").trim().toLowerCase();
}

export function agentModelFor(agentId, env = process.env) {
  const explicit = env[`AGENT_MODEL_${String(agentId || "").toUpperCase()}`];
  if (explicit) {
    return explicit;
  }
  const defaults = brainProvider(env) === "ollama" ? LOCAL_AGENT_MODELS : REMOTE_OPEN_AGENT_MODELS;
  return defaults[agentId] || defaults.ops;
}

export function brainBaseUrl(env = process.env) {
  const provider = brainProvider(env);
  return (env.AGENT_BRAIN_BASE_URL || PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.openai_compatible).replace(/\/$/, "");
}

export function isBrainEnabled(env = process.env) {
  return String(env.AGENT_BRAIN_ENABLED || "").toLowerCase() === "true";
}

export function brainApiKey(env = process.env) {
  return (
    env.AGENT_BRAIN_API_KEY ||
    env.TOGETHER_API_KEY ||
    env.FIREWORKS_API_KEY ||
    env.GROQ_API_KEY ||
    env.OPENROUTER_API_KEY ||
    ""
  );
}

function safeJsonParse(text, fallback = {}) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function jsonResponseInstruction() {
  return "Return compact JSON only. Do not wrap it in Markdown.";
}

export function buildAgentBrainPrompt({ agentId, record, task }) {
  return [
    `You are ${agentId}, one agent in the AA Bounties Dashboard.`,
    `Policy: ${JSON.stringify(OPEN_AGENT_BRAIN_POLICY)}`,
    `Task: ${task}`,
    `Bounty: ${JSON.stringify({
      id: record?.id || record?.local_id,
      title: record?.title,
      platform: record?.site || record?.platform,
      sourceUrl: record?.siteUrl || record?.source_url,
      payoutUsd: record?.price || record?.payout_usd,
      stage: record?.stage,
      nextAction: record?.nextAction || record?.next_action,
      metadata: record?.metadata || {}
    })}`,
    "Return compact JSON only with: decision, confidence, blockers, requiredEvidence, nextActions, notes.",
    "If evidence is missing, decision must be blocked or needs_evidence."
  ].join("\n\n");
}

function buildHeaders(env) {
  const headers = { "content-type": "application/json" };
  const apiKey = brainApiKey(env);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
  }
  if (env.OPENROUTER_APP_NAME) {
    headers["X-Title"] = env.OPENROUTER_APP_NAME;
  }
  return headers;
}

export async function callOllamaGenerate({ agentId, prompt, env = process.env, fetchImpl = fetch }) {
  const baseUrl = brainBaseUrl(env);
  const model = agentModelFor(agentId, env);
  const response = await fetchImpl(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: Number(env.AGENT_BRAIN_TEMPERATURE || 0.2),
        num_ctx: Number(env.AGENT_BRAIN_CONTEXT || 8192)
      }
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Agent brain request failed: ${response.status} ${text.slice(0, 300)}`);
  }
  const payload = text ? JSON.parse(text) : {};
  return {
    provider: "ollama",
    model,
    response: payload.response || "",
    raw: payload
  };
}

export async function callOpenAICompatibleChat({ agentId, prompt, env = process.env, fetchImpl = fetch }) {
  const baseUrl = brainBaseUrl(env);
  if (!baseUrl) {
    throw new Error("AGENT_BRAIN_BASE_URL is required for remote OpenAI-compatible providers.");
  }
  if (!brainApiKey(env)) {
    throw new Error("AGENT_BRAIN_API_KEY is required for remote OpenAI-compatible providers.");
  }

  const model = agentModelFor(agentId, env);
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(env),
    body: JSON.stringify({
      model,
      temperature: Number(env.AGENT_BRAIN_TEMPERATURE || 0.15),
      max_tokens: Number(env.AGENT_BRAIN_MAX_TOKENS || 1200),
      messages: [
        {
          role: "system",
          content: [
            "You are an evidence-first security bounty operations agent.",
            "Do not invent vulnerabilities, proof, test results, source dates, payouts, or submission readiness.",
            jsonResponseInstruction()
          ].join(" ")
        },
        { role: "user", content: prompt }
      ]
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Agent brain request failed: ${response.status} ${text.slice(0, 300)}`);
  }
  const payload = safeJsonParse(text);
  return {
    provider: brainProvider(env),
    model,
    response: payload.choices?.[0]?.message?.content || "",
    raw: payload
  };
}

export async function callAgentBrain({ agentId, prompt, env = process.env, fetchImpl = fetch }) {
  if (brainProvider(env) === "ollama") {
    return callOllamaGenerate({ agentId, prompt, env, fetchImpl });
  }
  return callOpenAICompatibleChat({ agentId, prompt, env, fetchImpl });
}

export async function runAgentBrain({ agentId, record, task, env = process.env }) {
  if (!isBrainEnabled(env)) {
    return {
      enabled: false,
      decision: "brain_disabled",
      blockers: ["Set AGENT_BRAIN_ENABLED=true and configure AGENT_BRAIN_PROVIDER plus AGENT_BRAIN_BASE_URL/API key."]
    };
  }
  const prompt = buildAgentBrainPrompt({ agentId, record, task });
  const result = await callAgentBrain({ agentId, prompt, env });
  let parsed = null;
  try {
    parsed = JSON.parse(result.response);
  } catch {
    parsed = {
      decision: "needs_review",
      confidence: 0,
      blockers: ["Brain response was not valid JSON."],
      requiredEvidence: [],
      nextActions: [],
      notes: result.response
    };
  }
  return {
    enabled: true,
    provider: result.provider,
    model: result.model,
    ...parsed
  };
}
