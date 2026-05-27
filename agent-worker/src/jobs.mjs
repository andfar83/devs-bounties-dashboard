import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";

import { fetchOfficialSource, preflightAgentTools, runProcess } from "../../scrape-engine/lib/agent-tool-runner.mjs";
import { runAgentBrain } from "../../scrape-engine/lib/open-agent-brain.mjs";
import { env } from "./env.mjs";
import { rest, uploadStorageObject } from "./supabase.mjs";

const CONTRACT_VERSION = "2026-05-26.worker.v1";
const TEXT_EXTENSIONS = new Set([".sol", ".js", ".ts", ".tsx", ".jsx", ".json", ".md", ".toml", ".rs", ".go", ".py", ".yaml", ".yml"]);

export async function createWorkerJob({ userId, bountyLocalId, jobType = "analyze_bounty", priority = 50, payload = {} }) {
  const rows = await rest("agent_worker_jobs", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: userId,
      contract_version: CONTRACT_VERSION,
      bounty_local_id: bountyLocalId,
      job_type: jobType,
      priority,
      max_attempts: Number(env("WORKER_MAX_ATTEMPTS", "2")),
      payload
    }
  });
  return rows?.[0] || null;
}

export async function claimNextJob(workerId) {
  const rows = await rest(
    `agent_worker_jobs?status=eq.queued&order=priority.desc,created_at.asc&limit=1&select=*`
  );
  const job = rows?.[0];
  if (!job) return null;
  const updated = await rest(`agent_worker_jobs?id=eq.${job.id}&status=eq.queued`, {
    method: "PATCH",
    prefer: "return=representation",
    body: {
      status: "running",
      locked_by: workerId,
      locked_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      attempts: Number(job.attempts || 0) + 1
    }
  });
  return updated?.[0] || null;
}

export async function processJob(job, { workerId = "agent-worker" } = {}) {
  const startedAt = Date.now();
  try {
    const result = await analyzeBountyJob(job, { workerId });
    const finalStatus = result.blocked ? "blocked" : "succeeded";
    await completeJob(job.id, finalStatus, result);
    return { status: finalStatus, result, durationMs: Date.now() - startedAt };
  } catch (error) {
    await failJob(job, error);
    return { status: "failed", error: error.message, durationMs: Date.now() - startedAt };
  }
}

async function analyzeBountyJob(job, { workerId }) {
  const userId = job.user_id;
  const bountyLocalId = job.bounty_local_id;
  const candidate = await loadCandidate(userId, bountyLocalId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${bountyLocalId}`);
  }

  const sourceUrl = job.payload?.sourceUrl || job.payload?.source_url || candidate.source_url || candidate.metadata?.detail_url || "";
  const workRoot = resolve(env("WORKER_WORKDIR", join(process.cwd(), "worker-data")));
  const jobDir = join(workRoot, `job-${job.id}-${safeName(bountyLocalId)}`);
  const evidenceDir = join(jobDir, "evidence");
  await mkdir(evidenceDir, { recursive: true });

  const toolPreflight = await preflightAgentTools();
  const artifacts = [];
  const toolRuns = [];
  let sourceEvidence = null;
  let repoInfo = null;
  let blocked = false;
  const blockers = [];

  if (!sourceUrl) {
    blocked = true;
    blockers.push("No official source URL is available for this bounty.");
  } else {
    sourceEvidence = await fetchOfficialSource(sourceUrl);
    artifacts.push(await writeJson(evidenceDir, "official-source-evidence.json", sourceEvidence));
    await recordToolRun({ job, agentId: "scout", toolId: "official_source_fetch", status: "ok", startedAt: Date.now(), metadata: { sourceUrl }, artifactPaths: ["official-source-evidence.json"] });
  }

  const repoUrl = sourceEvidence ? findRepositoryUrl(sourceEvidence.textExcerpt) : "";
  if (repoUrl) {
    repoInfo = await cloneRepository(repoUrl, jobDir);
    artifacts.push(await writeJson(evidenceDir, "repository-evidence.json", repoInfo));
  } else {
    blocked = true;
    blockers.push("No public GitHub repository URL was detected from the official source page. Builder cannot run code analysis yet.");
    await recordToolRun({ job, agentId: "builder", toolId: "repo_probe", status: "skipped", startedAt: Date.now(), metadata: { reason: "repo_url_not_detected" } });
  }

  if (repoInfo?.repoDir) {
    toolRuns.push(await runSemgrep(job, repoInfo.repoDir, evidenceDir));
    if (await hasFileWithExtension(repoInfo.repoDir, ".sol")) {
      toolRuns.push(await runSlither(job, repoInfo.repoDir, evidenceDir));
      if (existsSync(join(repoInfo.repoDir, "foundry.toml"))) {
        toolRuns.push(await runForge(job, repoInfo.repoDir, evidenceDir));
      } else {
        await recordToolRun({ job, agentId: "builder", toolId: "foundry_test", status: "skipped", startedAt: Date.now(), metadata: { reason: "foundry.toml_not_found" } });
      }
    } else {
      await recordToolRun({ job, agentId: "builder", toolId: "slither_scan", status: "skipped", startedAt: Date.now(), metadata: { reason: "no_solidity_files" } });
      await recordToolRun({ job, agentId: "builder", toolId: "foundry_test", status: "skipped", startedAt: Date.now(), metadata: { reason: "no_solidity_files" } });
    }
  }

  const brainResult = await maybeRunBrain({ job, candidate, sourceEvidence, repoInfo, toolRuns, blockers });
  if (brainResult) {
    artifacts.push(await writeJson(evidenceDir, "brain-analysis.json", brainResult));
  }

  const summary = buildSummary({ job, candidate, sourceEvidence, repoInfo, toolRuns, blockers, brainResult });
  artifacts.push(await writeMarkdown(evidenceDir, "ANALYSIS_SUMMARY.md", summary.markdown));
  artifacts.push(await writeJson(evidenceDir, "analysis-result.json", summary.result));

  const uploaded = [];
  for (const artifact of artifacts) {
    uploaded.push(await uploadArtifact({ userId, bountyLocalId, jobId: job.id, artifact }));
  }

  await upsertWorkPackage({ userId, bountyLocalId, stage: candidate.stage || "shortlisted", status: blocked ? "tracked" : "uploaded", metadata: summary.result });
  await insertAgentEvent({ userId, bountyLocalId, action: blocked ? "worker_analysis_blocked" : "worker_analysis_completed", reason: summary.result.nextAction, metadata: summary.result });
  await writeMemory({ userId, bountyLocalId, summary: summary.result.nextAction, evidence: summary.result });

  return {
    blocked,
    blockers,
    sourceUrl,
    repoUrl: repoInfo?.repoUrl || null,
    toolRuns: toolRuns.map((run) => ({ toolId: run.toolId, status: run.status, exitCode: run.exitCode ?? null })),
    artifacts: uploaded,
    nextAction: summary.result.nextAction,
    evidenceStatus: summary.result.evidenceStatus,
    workerId
  };
}

async function loadCandidate(userId, bountyLocalId) {
  const rows = await rest(
    `bounty_candidates?user_id=eq.${encodeURIComponent(userId)}&local_id=eq.${encodeURIComponent(bountyLocalId)}&select=*`
  );
  return rows?.[0] || null;
}

async function cloneRepository(repoUrl, jobDir) {
  const repoDir = join(jobDir, "repo", safeName(basename(repoUrl).replace(/\.git$/, "") || "repo"));
  await mkdir(join(jobDir, "repo"), { recursive: true });
  const startedAt = Date.now();
  const result = await runProcess("git", ["clone", "--depth", "1", repoUrl, repoDir], { timeoutMs: 180000, rejectOnExit: false });
  return {
    repoUrl,
    repoDir: result.exitCode === 0 ? repoDir : null,
    status: result.exitCode === 0 ? "cloned" : "clone_failed",
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, 4000),
    stderr: result.stderr.slice(0, 4000),
    durationMs: Date.now() - startedAt
  };
}

async function runSemgrep(job, repoDir, evidenceDir) {
  const startedAt = Date.now();
  const result = await runProcess("semgrep", ["--config", "auto", "--json", repoDir], { timeoutMs: 240000, rejectOnExit: false });
  const status = [0, 1].includes(result.exitCode) ? "ok" : "failed";
  const artifact = await writeText(evidenceDir, "semgrep-output.json", result.stdout || result.stderr || "");
  await recordToolRun({ job, agentId: "builder", toolId: "semgrep_scan", status, startedAt, command: "semgrep --config auto --json <repo>", exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, artifactPaths: [basename(artifact)] });
  return { toolId: "semgrep_scan", status, exitCode: result.exitCode, artifact };
}

async function runSlither(job, repoDir, evidenceDir) {
  const startedAt = Date.now();
  const outputPath = join(evidenceDir, "slither-output.json");
  const result = await runProcess("slither", [repoDir, "--json", outputPath], { timeoutMs: 240000, rejectOnExit: false });
  const status = [0, 255].includes(result.exitCode) ? "ok" : "failed";
  const artifact = existsSync(outputPath) ? outputPath : await writeText(evidenceDir, "slither-output.txt", `${result.stdout}\n${result.stderr}`);
  await recordToolRun({ job, agentId: "builder", toolId: "slither_scan", status, startedAt, command: "slither <repo> --json slither-output.json", exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, artifactPaths: [basename(artifact)] });
  return { toolId: "slither_scan", status, exitCode: result.exitCode, artifact };
}

async function runForge(job, repoDir, evidenceDir) {
  const startedAt = Date.now();
  const result = await runProcess("forge", ["test", "-vvv"], { cwd: repoDir, timeoutMs: 300000, rejectOnExit: false });
  const status = result.exitCode === 0 ? "ok" : "failed";
  const artifact = await writeText(evidenceDir, "forge-test-output.txt", `${result.stdout}\n${result.stderr}`);
  await recordToolRun({ job, agentId: "builder", toolId: "foundry_test", status, startedAt, command: "forge test -vvv", exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, artifactPaths: [basename(artifact)] });
  return { toolId: "foundry_test", status, exitCode: result.exitCode, artifact };
}

async function maybeRunBrain({ job, candidate, sourceEvidence, repoInfo, toolRuns, blockers }) {
  if (String(process.env.AGENT_BRAIN_ENABLED || "").toLowerCase() !== "true") return null;
  const result = await runAgentBrain({
    agentId: "builder",
    record: candidate,
    task: JSON.stringify({
      objective: "Review official source evidence and tool output summary. Do not claim solved. Decide next evidence step.",
      sourceTitle: sourceEvidence?.title,
      repoStatus: repoInfo?.status,
      toolRuns: toolRuns.map((run) => ({ toolId: run.toolId, status: run.status, exitCode: run.exitCode })),
      blockers
    })
  });
  await recordToolRun({ job, agentId: "builder", toolId: "brain_gateway", status: result.enabled ? "ok" : "skipped", startedAt: Date.now(), metadata: result });
  return result;
}

function buildSummary({ job, candidate, sourceEvidence, repoInfo, toolRuns, blockers, brainResult }) {
  const evidenceStatus = blockers.length ? "blocked_needs_source_or_repo" : "analysis_completed_needs_human_review";
  const nextAction = blockers.length
    ? `Blocked: ${blockers.join(" ")}`
    : "Analysis artifacts created. Human security review required before any submission-ready claim.";
  const result = {
    contractVersion: CONTRACT_VERSION,
    jobId: job.id,
    bountyLocalId: job.bounty_local_id,
    title: candidate.title,
    sourceUrl: sourceEvidence?.url || candidate.source_url || null,
    sourceTitle: sourceEvidence?.title || null,
    repo: repoInfo ? { repoUrl: repoInfo.repoUrl, status: repoInfo.status } : null,
    toolRuns: toolRuns.map((run) => ({ toolId: run.toolId, status: run.status, exitCode: run.exitCode ?? null })),
    blockers,
    brainDecision: brainResult || null,
    evidenceStatus,
    nextAction,
    generatedAt: new Date().toISOString()
  };
  const markdown = [
    `# Agent Worker Analysis`,
    ``,
    `- Bounty: ${candidate.title}`,
    `- ID: ${job.bounty_local_id}`,
    `- Source: ${result.sourceUrl || "missing"}`,
    `- Source title: ${result.sourceTitle || "unknown"}`,
    `- Repo: ${result.repo?.repoUrl || "not detected"}`,
    `- Evidence status: ${evidenceStatus}`,
    ``,
    `## Tool Runs`,
    ...(result.toolRuns.length ? result.toolRuns.map((run) => `- ${run.toolId}: ${run.status} (exit ${run.exitCode ?? "n/a"})`) : ["- No repository tool runs executed."]),
    ``,
    `## Blockers`,
    ...(blockers.length ? blockers.map((item) => `- ${item}`) : ["- None from automated collection. Human validation is still required."]),
    ``,
    `## Next Action`,
    nextAction,
    ``,
    `## Safety`,
    `This worker does not mark a bounty as solved. Sentinel/manual review must confirm a real issue, reproducible PoC, impact, scope, and responsible disclosure requirements.`
  ].join("\n");
  return { result, markdown };
}

async function recordToolRun({ job, agentId, toolId, status, startedAt, command = "", exitCode = null, stdout = "", stderr = "", metadata = {}, artifactPaths = [] }) {
  const completedAt = Date.now();
  const rows = await rest("tool_runs", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: job.user_id,
      contract_version: CONTRACT_VERSION,
      job_id: job.id,
      bounty_local_id: job.bounty_local_id,
      agent_id: agentId,
      tool_id: toolId,
      status,
      started_at: new Date(startedAt).toISOString(),
      completed_at: new Date(completedAt).toISOString(),
      duration_ms: completedAt - startedAt,
      command,
      exit_code: exitCode,
      stdout_excerpt: String(stdout || "").slice(0, 8000),
      stderr_excerpt: String(stderr || "").slice(0, 8000),
      artifact_paths: artifactPaths,
      metadata
    }
  });
  return rows?.[0] || null;
}

async function completeJob(jobId, status, result) {
  await rest(`agent_worker_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    body: {
      status,
      result,
      completed_at: new Date().toISOString(),
      last_error: null
    }
  });
}

async function failJob(job, error) {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.max_attempts || env("WORKER_MAX_ATTEMPTS", "2"));
  const finalStatus = attempts >= maxAttempts ? "failed" : "queued";
  await rest(`agent_worker_jobs?id=eq.${job.id}`, {
    method: "PATCH",
    body: {
      status: finalStatus,
      last_error: error.message,
      locked_by: null,
      locked_at: null,
      completed_at: finalStatus === "failed" ? new Date().toISOString() : null
    }
  });
  await rest("failure_events", {
    method: "POST",
    body: {
      user_id: job.user_id,
      contract_version: CONTRACT_VERSION,
      bounty_local_id: job.bounty_local_id,
      agent_id: "integration",
      failure_type: "package_failure",
      severity: finalStatus === "failed" ? "critical" : "warning",
      message: error.message,
      recovery_action: finalStatus === "failed" ? "manual_review" : "retry_worker_job",
      status: "open",
      metadata: { job_id: job.id, attempts, maxAttempts }
    }
  });
}

async function uploadArtifact({ userId, bountyLocalId, jobId, artifact }) {
  const content = await readFile(artifact, isTextArtifact(artifact) ? "utf8" : undefined);
  const relative = basename(artifact);
  const objectPath = `${userId}/${bountyLocalId}/worker/job-${jobId}/${relative}`;
  const contentType = contentTypeFor(artifact);
  await uploadStorageObject(env("WORKER_STORAGE_BUCKET", "bounty-artifacts"), objectPath, content, contentType);
  const checksum = createHash("sha256").update(content).digest("hex");
  await rest("work_artifacts?on_conflict=user_id,bounty_local_id,relative_path", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      user_id: userId,
      contract_version: CONTRACT_VERSION,
      bounty_local_id: bountyLocalId,
      artifact_type: "worker_evidence",
      relative_path: `worker/job-${jobId}/${relative}`,
      storage_bucket: env("WORKER_STORAGE_BUCKET", "bounty-artifacts"),
      storage_path: objectPath,
      checksum_sha256: checksum,
      metadata: { job_id: jobId, generated_by: "agent-worker" }
    }
  });
  return { relativePath: `worker/job-${jobId}/${relative}`, storagePath: objectPath, checksumSha256: checksum };
}

async function upsertWorkPackage({ userId, bountyLocalId, stage, status, metadata }) {
  await rest("work_packages?on_conflict=user_id,bounty_local_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      user_id: userId,
      contract_version: CONTRACT_VERSION,
      bounty_local_id: bountyLocalId,
      stage,
      status,
      storage_bucket: env("WORKER_STORAGE_BUCKET", "bounty-artifacts"),
      metadata: { worker_analysis: metadata }
    }
  });
}

async function insertAgentEvent({ userId, bountyLocalId, action, reason, metadata }) {
  await rest("agent_events", {
    method: "POST",
    body: {
      user_id: userId,
      contract_version: CONTRACT_VERSION,
      bounty_local_id: bountyLocalId,
      agent_id: "integration",
      action,
      reason,
      metadata
    }
  });
}

async function writeMemory({ userId, bountyLocalId, summary, evidence }) {
  await rest("agent_memory?on_conflict=user_id,agent_id,memory_key", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      user_id: userId,
      contract_version: CONTRACT_VERSION,
      agent_id: "builder",
      memory_key: `worker-analysis-${bountyLocalId}`,
      memory_type: "operator_note",
      summary: String(summary || "Worker analysis completed.").slice(0, 500),
      evidence,
      confidence: 0.75,
      last_used_at: new Date().toISOString()
    }
  });
}

function findRepositoryUrl(text = "") {
  const candidates = [...String(text).matchAll(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?/g)]
    .map((match) => match[0].replace(/\.git$/, ""))
    .filter((url) => !/github\.com\/(features|pricing|login|signup|marketplace|topics)\b/i.test(url));
  return [...new Set(candidates)][0] || "";
}

async function hasFileWithExtension(dir, extension) {
  for await (const file of walk(dir)) {
    if (extname(file).toLowerCase() === extension) return true;
  }
  return false;
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if ([".git", "node_modules", "dist", "build", "cache", "out"].includes(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else yield fullPath;
  }
}

async function writeJson(dir, name, payload) {
  const file = join(dir, name);
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

async function writeMarkdown(dir, name, text) {
  const file = join(dir, name);
  await writeFile(file, text, "utf8");
  return file;
}

async function writeText(dir, name, text) {
  const file = join(dir, name);
  await writeFile(file, String(text || ""), "utf8");
  return file;
}

function safeName(value) {
  return String(value || "item").replace(/[^a-z0-9_.-]+/gi, "-").slice(0, 96);
}

function isTextArtifact(file) {
  return TEXT_EXTENSIONS.has(extname(file).toLowerCase()) || [".txt", ".log"].includes(extname(file).toLowerCase());
}

function contentTypeFor(file) {
  const ext = extname(file).toLowerCase();
  if (ext === ".json") return "application/json";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

