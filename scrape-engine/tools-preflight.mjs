import { preflightAgentTools } from "./lib/agent-tool-runner.mjs";

const result = await preflightAgentTools();

if (process.argv.includes("--doctor")) {
  console.log("Agent tool preflight");
  console.log("====================");
  for (const tool of result.tools) {
    const marker = tool.status === "ready" ? "OK" : "MISSING";
    const version = tool.version ? ` - ${tool.version}` : "";
    console.log(`${marker.padEnd(7)} ${tool.id.padEnd(24)} ${tool.category.padEnd(10)} ${tool.description}${version}`);
  }
  if (result.missing.length) {
    console.log("");
    console.log(`Missing optional external tools: ${result.missing.join(", ")}`);
    console.log("The app will not mark evidence-ready if a required analysis tool is missing for that bounty type.");
  }
} else {
  console.log(JSON.stringify(result, null, 2));
}

