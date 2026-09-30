// GitHub REST calls with the phone's fine-grained token (Contents: read/write
// on the coach repo; Actions: read/write only for "build today's plan").

const API = "https://api.github.com";

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

export class GhError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function check(res, what) {
  if (res.ok) return res;
  let msg = "";
  try { msg = (await res.json()).message || ""; } catch { /* body not JSON */ }
  const hint = {
    401: "token rejected — expired or mistyped (Settings)",
    403: "token lacks permission for this — check its repository permissions",
    404: "not found — the token can't see the repo, or the file doesn't exist yet",
  }[res.status] || "";
  throw new GhError(res.status, `${what}: ${res.status}${hint ? " — " + hint : ""}${msg ? ` (${msg})` : ""}`);
}

export async function fetchPlan(s) {
  const res = await fetch(`${API}/repos/${s.repo}/contents/out/app/plan.json?ref=${s.branch}`, {
    headers: headers(s.token, { Accept: "application/vnd.github.raw+json" }),
    cache: "no-store",
  });
  await check(res, "Loading the plan");
  return res.json();
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function existingSha(s, path) {
  const res = await fetch(`${API}/repos/${s.repo}/contents/${path}?ref=${s.branch}`, {
    headers: headers(s.token, { Accept: "application/vnd.github+json" }), cache: "no-store",
  });
  if (res.status === 404) return null;
  await check(res, "Checking the log file");
  return (await res.json()).sha;
}

// Commit one session log to app-logs/<id>.json (creates or replaces).
export async function putLog(s, log) {
  const path = `app-logs/${log.id}.json`;
  const body = { message: `app log ${log.id}`, content: b64(JSON.stringify(log, null, 1)), branch: s.branch };
  const sha = await existingSha(s, path);
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/repos/${s.repo}/contents/${path}`, {
    method: "PUT", headers: headers(s.token, { Accept: "application/vnd.github+json" }),
    body: JSON.stringify(body),
  });
  await check(res, "Saving the session");
  return true;
}

// Kick the morning run (it no-ops if today's briefing already went out).
export async function dispatchDaily(s) {
  const res = await fetch(`${API}/repos/${s.repo}/actions/workflows/daily.yml/dispatches`, {
    method: "POST", headers: headers(s.token, { Accept: "application/vnd.github+json" }),
    body: JSON.stringify({ ref: s.branch }),
  });
  await check(res, "Starting the morning run");
  return true;
}

// Commit any JSON document (creates or replaces) — op batches and requests.
export async function putJSON(s, path, obj, message) {
  const body = { message: message || `app ${path}`, content: b64(JSON.stringify(obj, null, 1)), branch: s.branch };
  const sha = await existingSha(s, path);
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/repos/${s.repo}/contents/${path}`, {
    method: "PUT", headers: headers(s.token, { Accept: "application/vnd.github+json" }),
    body: JSON.stringify(body),
  });
  await check(res, "Saving");
  return true;
}

async function raw(s, path) {
  const res = await fetch(`${API}/repos/${s.repo}/contents/${path}?ref=${s.branch}`, {
    headers: headers(s.token, { Accept: "application/vnd.github.raw+json" }), cache: "no-store",
  });
  if (res.status === 404) return null;
  await check(res, "Loading");
  return res;
}

// A JSON file from the repo, or null if it isn't there yet (a pending answer).
export async function getJSON(s, path) {
  const res = await raw(s, path);
  return res ? res.json() : null;
}

export async function getText(s, path) {
  const res = await raw(s, path);
  return res ? res.text() : null;
}
