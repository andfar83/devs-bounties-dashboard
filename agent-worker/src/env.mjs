import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export async function loadEnvFile(path = ".env") {
  if (!existsSync(path)) return;
  const text = await readFile(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").trim();
  }
}

export function env(name, fallback = "") {
  return process.env[name] || fallback;
}

export function boolEnv(name, fallback = false) {
  const value = env(name, fallback ? "true" : "false").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function requireEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
