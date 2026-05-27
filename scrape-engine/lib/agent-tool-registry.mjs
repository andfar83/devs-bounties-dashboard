export const AGENT_TOOL_CATEGORIES = {
  eyes: "Read public sources, repos, package files, and evidence.",
  hands: "Run safe local analysis commands and tests.",
  brain: "Call a remote or self-hosted open-weight reasoning model.",
  memory: "Persist lessons, run notes, evidence summaries, and decisions.",
  reasoning: "Apply decision contracts, quality gates, and evidence gates."
};

export const AGENT_TOOLS = [
  {
    id: "official_source_fetch",
    category: "eyes",
    agents: ["scout", "feasibility", "builder", "ops"],
    type: "internal",
    description: "Fetch an official public URL and capture text/title/source evidence."
  },
  {
    id: "repo_probe",
    category: "eyes",
    agents: ["builder"],
    type: "external",
    command: "git",
    args: ["--version"],
    description: "Verify Git is available for official repository inspection."
  },
  {
    id: "semgrep_scan",
    category: "hands",
    agents: ["builder"],
    type: "external",
    command: "semgrep",
    args: ["--version"],
    description: "Static analysis for many languages. Optional but recommended."
  },
  {
    id: "slither_scan",
    category: "hands",
    agents: ["builder"],
    type: "external",
    command: "slither",
    args: ["--version"],
    description: "Solidity static analyzer. Optional for smart-contract bounties."
  },
  {
    id: "foundry_test",
    category: "hands",
    agents: ["builder"],
    type: "external",
    command: "forge",
    args: ["--version"],
    description: "Foundry test/fork tooling for Ethereum smart-contract repos."
  },
  {
    id: "node_test_runner",
    category: "hands",
    agents: ["builder"],
    type: "external",
    command: "node",
    args: ["--version"],
    description: "Node runtime for JS/TS package tests and internal scripts."
  },
  {
    id: "brain_gateway",
    category: "brain",
    agents: ["scout", "feasibility", "builder", "ops"],
    type: "internal",
    description: "Provider-configurable brain adapter for Ollama or OpenAI-compatible remote open-weight APIs."
  },
  {
    id: "memory_writer",
    category: "memory",
    agents: ["scout", "feasibility", "builder", "ops"],
    type: "internal",
    description: "Write local memory/evidence notes into a package folder for later Supabase sync."
  },
  {
    id: "evidence_writer",
    category: "memory",
    agents: ["builder", "ops"],
    type: "internal",
    description: "Write reproducibility evidence and gate status into package artifacts."
  },
  {
    id: "quality_gate_checker",
    category: "reasoning",
    agents: ["scout", "feasibility", "builder", "ops"],
    type: "internal",
    description: "Run deterministic decision contracts and evidence gates before stage promotion."
  }
];

export function toolsForAgent(agentId) {
  return AGENT_TOOLS.filter((tool) => tool.agents.includes(agentId));
}

