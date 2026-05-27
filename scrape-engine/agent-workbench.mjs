import { fetchOfficialSource, preflightAgentTools, runToolById, writeMemoryNote } from "./lib/agent-tool-runner.mjs";

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const command = process.argv[2] || "preflight";

if (command === "preflight") {
  console.log(JSON.stringify(await preflightAgentTools(), null, 2));
} else if (command === "fetch-source") {
  const url = argValue("url");
  console.log(JSON.stringify(await fetchOfficialSource(url), null, 2));
} else if (command === "tool") {
  const id = argValue("id");
  const cwd = argValue("cwd", process.cwd());
  const args = process.argv.filter((arg) => arg.startsWith("--arg=")).map((arg) => arg.slice("--arg=".length));
  console.log(JSON.stringify(await runToolById(id, { cwd, args: args.length ? args : undefined }), null, 2));
} else if (command === "memory") {
  const packageDir = argValue("package-dir");
  const agentId = argValue("agent", "system");
  const kind = argValue("kind", "note");
  const note = argValue("note", "");
  const file = await writeMemoryNote({ packageDir, agentId, kind, payload: { note } });
  console.log(JSON.stringify({ ok: true, file }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}

