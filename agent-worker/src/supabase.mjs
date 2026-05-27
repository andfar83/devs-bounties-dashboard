import { requireEnv } from "./env.mjs";

export function supabaseConfig() {
  return {
    url: requireEnv("SUPABASE_URL").replace(/\/$/, ""),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  };
}

export async function rest(path, { method = "GET", body, prefer = "", headers = {} } = {}) {
  const { url, serviceRoleKey } = supabaseConfig();
  const requestHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...headers
  };
  if (prefer) requestHeaders.Prefer = prefer;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return payload;
}

export async function uploadStorageObject(bucket, objectPath, content, contentType = "application/json") {
  const { url, serviceRoleKey } = supabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "true"
    },
    body: content
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Storage upload failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}
