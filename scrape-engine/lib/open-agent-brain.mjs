const DEFAULT_BRAIN_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_AGENT_MODELS = {
  scout: "qwen2.5-coder:7b",
  feasibility: "qwen2.5:7b",
  builder: "qwen2.5-coder:14b",
  ops: "qwen2.5:7b"
};

export const OPEN_AGENT_BRAIN_POLICY = {
  provider: "ollama_or_openai_compatible_local",
  cost: "free_or_self_hosted_open_source",
  network: "no_private_data_to_third_party_by_default",
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

export function agentModelFor(agentId, env = process.env) {
  const explicit = env[`AGENT_MODEL_${String(agentId || "").toUpperCase()}`];
  return explicit || DEFAULT_AGENT_MODELS[agentId] || DEFAULT_AGENT_MODELS.ops;
}

export function brainBaseUrl(env = process.env) {
  return (env.AGENT_BRAIN_BASE_URL || DEFAULT_BRAIN_BASE_URL).replace(/\/$/, "");
}

export function isBrainEnabled(env = process.env) {
  return String(env.AGENT_BRAIN_ENABLED || "").toLowerCase() === "true";
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

export async function runAgentBrain({ agentId, record, task, env = process.env }) {
  if (!isBrainEnabled(env)) {
    return {
      enabled: false,
      decision: "brain_disabled",
      blockers: ["Set AGENT_BRAIN_ENABLED=true and AGENT_BRAIN_BASE_URL to enable the open-source brain adapter."]
    };
  }
  const prompt = buildAgentBrainPrompt({ agentId, record, task });
  const result = await callOllamaGenerate({ agentId, prompt, env });
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

