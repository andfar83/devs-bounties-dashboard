import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { AGENT_TOOL_CATEGORIES, AGENT_TOOLS } from "./agent-tool-registry.mjs";

const DEFAULT_TIMEOUT_MS = 120000;

function augmentedEnv(env = process.env) {
  const extraPaths = [
    env.APPDATA ? join(env.APPDATA, "Python", "Python314", "Scripts") : "",
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs", "FoundryPortable") : "",
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs", "OllamaPortable") : "",
    "/opt/agent-tools/bin",
    "/opt/foundry"
  ].filter((item) => item && existsSync(item));
  const delimiter = process.platform === "win32" ? ";" : ":";
  return {
    ...env,
    Path: [...extraPaths, env.Path || env.PATH || ""].filter(Boolean).join(delimiter),
    PATH: [...extraPaths, env.PATH || env.Path || ""].filter(Boolean).join(delimiter)
  };
}

export async function commandAvailable(command) {
  const lookupCommand = process.platform === "win32" ? "where.exe" : "sh";
  const lookupArgs = process.platform === "win32" ? [command] : ["-c", `command -v ${shellQuote(command)}`];
  const result = await runProcess(lookupCommand, lookupArgs, { timeoutMs: 10000, rejectOnExit: false });
  return result.exitCode === 0;
}

export async function runProcess(command, args = [], { cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env, rejectOnExit = true } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: augmentedEnv(env),
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      const error = new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`);
      error.stdout = stdout;
      error.stderr = stderr;
      rejectPromise(error);
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (rejectOnExit) {
        rejectPromise(error);
      } else {
        resolvePromise({ exitCode: 127, stdout, stderr: error.message });
      }
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const result = { exitCode, stdout, stderr };
      if (rejectOnExit && exitCode !== 0) {
        const error = new Error(`Command failed (${exitCode}): ${command} ${args.join(" ")}`);
        error.result = result;
        rejectPromise(error);
        return;
      }
      resolvePromise(result);
    });
  });
}

export async function preflightAgentTools({ env = process.env } = {}) {
  const tools = [];
  for (const tool of AGENT_TOOLS) {
    if (tool.type === "internal") {
      tools.push({
        ...tool,
        installed: true,
        status: "ready"
      });
      continue;
    }

    const installed = await commandAvailable(tool.command);
    let version = "";
    if (installed) {
      const result = await runProcess(tool.command, tool.args || ["--version"], { timeoutMs: 20000, rejectOnExit: false, env });
      version = (result.stdout || result.stderr || "").trim().split(/\r?\n/)[0] || "";
    }
    tools.push({
      ...tool,
      installed,
      version,
      status: installed ? "ready" : "missing"
    });
  }

  return {
    ok: tools.every((tool) => tool.type === "internal" || tool.installed || tool.optional !== false),
    categories: AGENT_TOOL_CATEGORIES,
    tools,
    missing: tools.filter((tool) => tool.status === "missing").map((tool) => tool.id)
  };
}

export async function fetchOfficialSource(url, { timeoutMs = 30000, fetchImpl = fetch } = {}) {
  if (!/^https:\/\//i.test(String(url || ""))) {
    throw new Error("official_source_fetch requires an https URL.");
  }
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "AA-Bounties-AgentTools/0.1 (+https://aa-bounties-dashboard.vercel.app)",
      accept: "text/html,application/json;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${text.slice(0, 160)}`);
  }
  return {
    url,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    title: firstMatch(text, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s+/g, " ").trim(),
    textExcerpt: stripHtml(text).slice(0, 6000),
    fetchedAt: new Date().toISOString()
  };
}

export async function writeAgentArtifact(filePath, payload) {
  const resolved = resolve(filePath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return resolved;
}

export async function writeMemoryNote({ packageDir, agentId, kind = "memory", payload }) {
  if (!packageDir) {
    throw new Error("packageDir is required.");
  }
  const safeAgent = String(agentId || "agent").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const safeKind = String(kind || "memory").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const filePath = join(packageDir, "agent-memory", `${safeAgent}-${safeKind}.json`);
  return writeAgentArtifact(filePath, {
    agentId,
    kind,
    writtenAt: new Date().toISOString(),
    payload
  });
}

export async function runToolById(toolId, options = {}) {
  const tool = AGENT_TOOLS.find((item) => item.id === toolId);
  if (!tool) {
    throw new Error(`Unknown agent tool: ${toolId}`);
  }
  if (tool.type === "internal") {
    throw new Error(`Internal tool ${toolId} must be called through its specific helper.`);
  }
  if (!(await commandAvailable(tool.command))) {
    return {
      toolId,
      status: "missing",
      command: tool.command,
      message: `${tool.command} is not installed or not available in PATH.`
    };
  }
  const result = await runProcess(tool.command, options.args || tool.args || [], {
    cwd: options.cwd || process.cwd(),
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    env: options.env || process.env,
    rejectOnExit: false
  });
  return {
    toolId,
    status: result.exitCode === 0 ? "ok" : "failed",
    command: tool.command,
    args: options.args || tool.args || [],
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, 20000),
    stderr: result.stderr.slice(0, 20000)
  };
}

function firstMatch(text, regex) {
  return String(text || "").match(regex)?.[1] || "";
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
