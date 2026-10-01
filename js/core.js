// Shared state and plumbing for every tab: the plan, the pending-ops overlay,
// the sync queues, the action registry, and the one overlay sheet.
import * as L from "./logic.js";
import * as store from "./store.js";
import * as ghApi from "./gh.js";
import * as T from "./timer.js";
import { applyOps } from "./ops.js";

export { L, store, T };
export const gh = { ...ghApi };
export const root = document.getElementById("app");
export const bar = document.getElementById("timerbar");
export const overlay = document.getElementById("overlay");
export const tabbar = document.getElementById("tabbar");

// Local testing only: http://localhost…/?dev=dev/plan.json reads a plan file and
// keeps everything the app would commit in localStorage instead of calling GitHub.
export const DEV = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("dev");
if (DEV) {
  gh.fetchPlan = async () => (await fetch(DEV, { cache: "no-store" })).json();
  gh.putJSON = async (s, path, obj) => {
    store.set("dev:" + path, obj); console.log("DEV put", path, obj);
    if (path.startsWith("app-requests/")) setTimeout(() => store.set(`dev:out/app/responses/${obj.id}.json`, devAnswer(obj)), 2500);
    return true;
  };
  const devAnswer = (req) => (req.kind === "swap"
    ? { id: req.id, kind: "swap", status: "done", result: { note: "Dev answer — nothing was asked.", options: [
        { title: "Ribeye, rice and broccoli", what: "8 oz ribeye (pantry), 1½ cups rice, 2 cups broccoli", how: ["Sear 3 min a side", "Rest 5 min", "Plate over rice"],
          kcal: 980, protein: 62, carbs: 118, fat: 30, uses: {}, pantry_used: ["ribeye"], why: "Uses the steak; a little more fat than the chili." },
        { title: "Salmon plate + extra rice", what: "Salmon plate (Recipe 5) + 1 cup rice", how: ["Thaw 15 min", "Roast 10 + 8 min"],
          kcal: 850, protein: 50, carbs: 113, fat: 22, uses: { salmon: 1 }, pantry_used: [], why: "Lighter; fish for the week." }] } }
    : req.kind === "ask" ? { id: req.id, kind: "ask", status: "done", result: {
        question: req.text, about: req.about || null, ops: /hers/i.test(req.text) ? [{ op: "company", date: req.date, slot: "dinner", who: "away" }] : [],
        answer: "Dev answer: the tendon shot is the collagen in the OJ — the rice cakes and honey stay. Eat them right after the LIC.", flag: "" } }
    : req.kind === "correct" ? { id: req.id, kind: "correct", status: "done", result: {
        ops: [{ op: "report_sleep", date: req.date, hours: 7.5 }], understood: "Dev answer: logged 7.5 h of sleep for last night.", not_done: "" } }
    : { id: req.id, kind: req.kind, status: "done", result: { menu_id: "dev-draft", name: "Dev draft menu", summary: "A pretend draft.", problems: [], cards: {}, recipes: [], haul_est: 600 } });
  gh.getJSON = async (s, path) => {
    if (path.startsWith("out/app/responses/")) return store.get("dev:" + path) || (await fetch("dev/" + path.split("/").pop(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return store.get("dev:" + path);
  };
  gh.getText = async () => "(dev) writeup";
  gh.putLog = async (s, log) => { store.set("devlogs", [...store.get("devlogs", []), log]); console.log("DEV log", log); return true; };
  gh.dispatchDaily = async () => true;
  gh.dispatchWorkflow = async () => true;
}

export const S = {
  settings: DEV ? { ...store.settings(), token: "dev" } : store.settings(),
  plan: store.get("plan"),
  planError: null,
  loading: false,
  tab: store.get("tab") || "today",
  view: null,              // an overlay view on top of the tabs: session | finish | settings | cook | recipe | cycle | draft
  viewArg: null,
  active: store.get("active"),
  sheet: null,
  flash: null,
  syncMsg: null,
  fuelDate: null,          // the day the Fuel tab is showing (null = today)
  kitchenTab: store.get("kitchenTab") || "stock",
};
if (S.active) S.view = "session";
T.setPrefs({ sound: S.settings.sound, vibrate: S.settings.vibrate });

// ------------------------------------------------------------------ helpers
export const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const today = () => L.localISO();
export const save = () => store.set("active", S.active);
export const policy = () => S.plan?.policy || {};
export const queue = () => store.get("queue", []);
export const doneLog = () => store.get("done", {});
export const fmtNum = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
export const uid = (p = "") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let renderer = () => {};
export function setRenderer(fn) { renderer = fn; }
export function render() { renderer(); }

export function flash(msg, level = "info") { S.flash = { msg, level }; render(); }
export function flashHTML() {
  return S.flash ? `<div class="flash ${S.flash.level}" data-a="clearflash">${esc(S.flash.msg)}</div>` : "";
}
export function header(title, sub, left = "", right = "") {
  return `<header class="top"><div class="lft">${left}</div><div class="ttl"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div><div class="rgt">${right}</div></header>`;
}
export function go(view, arg = null) { S.view = view; S.viewArg = arg; render(); window.scrollTo(0, 0); }

// ------------------------------------------------------------ action registry
export const A = {};
export const INPUTS = {};
export const SHEETS = {};           // type -> () => html for S.sheet
export function renderSheet() {
  const sh = S.sheet;
  const fn = sh && SHEETS[sh.type];
  if (!fn) { overlay.className = "overlay"; overlay.innerHTML = ""; return; }
  overlay.className = "overlay show";
  overlay.innerHTML = fn(sh);
}
export function sheet(obj) { S.sheet = obj; renderSheet(); }

// ------------------------------------------------------- the ops the app sends
// A batch is {id, at, ops}. "ops" = not yet committed; "sent" = committed, waiting
// for the coach to apply it (the plan's applied_ops says when). Until then the
// batch is replayed over the plan so the screen already shows the change.
const pendingBatches = () => [...store.get("sent", []), ...store.get("ops", [])];
let fuelMemo = { key: null, value: null };

export function fuel() {
  const p = S.plan;
  if (!p?.fuel) return null;
  const applied = new Set(p.applied_ops || []);
  const batches = pendingBatches().filter((b) => !applied.has(b.id));
  const key = `${p.generated}|${batches.map((b) => b.id).join(",")}`;
  if (fuelMemo.key !== key) {
    const copy = JSON.parse(JSON.stringify(p.fuel));
    applyOps(copy, batches.flatMap((b) => b.ops), { today: today() });
    fuelMemo = { key, value: copy };
  }
  return fuelMemo.value;
}
export const pendingOps = () => {
  const applied = new Set(S.plan?.applied_ops || []);
  return pendingBatches().filter((b) => !applied.has(b.id)).flatMap((b) => b.ops);
};
export const pendingCount = () => {
  const applied = new Set(S.plan?.applied_ops || []);
  return pendingBatches().filter((b) => !applied.has(b.id)).length;
};

export function send(ops) {
  const list = (Array.isArray(ops) ? ops : [ops]).filter(Boolean);
  if (!list.length) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  store.set("ops", [...store.get("ops", []), { id: uid(stamp + "-"), at: new Date().toISOString(), ops: list }]);
  render();
  flushSoon();
}

// Each commit starts a sync run on GitHub, so a burst of taps (checking off a
// morning's meals) waits for a quiet spell and goes out as ONE commit. Leaving
// the app sends whatever is waiting straight away (app.js, visibilitychange).
let flushTimer = null;
export function flushSoon(ms = 8000) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushAll, ms);
}

let flushing = false;
export async function flushAll() {
  if (flushing || !S.settings.token) return;
  flushing = true;
  let err = null, sentSessions = 0, sentOps = 0;
  try {
    const left = [];
    for (const log of queue()) {
      try { await gh.putLog(S.settings, log); sentSessions++; } catch (e) { left.push(log); err = e.message; }
    }
    store.set("queue", left);
    const ops = store.get("ops", []);
    if (ops.length && !err) {
      const merged = { id: ops[ops.length - 1].id, at: new Date().toISOString(), ops: ops.flatMap((b) => b.ops) };
      try {
        await gh.putJSON(S.settings, `app-logs/ops/${merged.id}.json`, merged, `app ops ${merged.id}`);
        const done = new Set(ops.map((b) => b.id));
        store.set("ops", store.get("ops", []).filter((b) => !done.has(b.id)));     // taps made meanwhile stay queued
        store.set("sent", [...store.get("sent", []).slice(-20), merged]);
        sentOps = merged.ops.length;
      } catch (e) { err = e.message; }
    }
    for (const req of store.get("requests", []).filter((r) => r.state === "queued")) {
      try {
        await gh.putJSON(S.settings, `app-requests/${req.id}.json`, req.body, `app request ${req.body.kind}`);
        updateRequest(req.id, { state: "sent", sentAt: Date.now() });
      } catch (e) { err = e.message; }
    }
  } finally { flushing = false; }
  const waiting = queue().length + store.get("ops", []).length;
  if (err) S.syncMsg = `${waiting} change${waiting === 1 ? "" : "s"} waiting to sync — ${err}`;
  else if (sentSessions) S.syncMsg = `Session synced — the coach updates your TMs in about a minute.`;
  else if (sentOps) S.syncMsg = null;
  if (sentSessions || sentOps) setTimeout(() => refreshPlan(true), 45000);
  render();
  if (store.get("ops", []).length && !err) flushSoon();
  pollRequests();
}
window.addEventListener("online", flushAll);

// ------------------------------------------------------------------ the plan
export async function refreshPlan(quiet = false) {
  if (!S.settings.token) return;
  if (!quiet) { S.loading = true; render(); }
  try {
    S.plan = await gh.fetchPlan(S.settings);
    store.set("plan", S.plan);
    S.planError = null;
    const applied = new Set(S.plan.applied_ops || []);
    const cutoff = Date.now() - 24 * 3600 * 1000;                       // a batch the coach never applied ages out
    store.set("sent", store.get("sent", []).filter((b) => !applied.has(b.id) && new Date(b.at).getTime() > cutoff));
  } catch (e) {
    S.planError = e.message;
  } finally {
    S.loading = false;
    render();
  }
}

// ---------------------------------------------- requests the coach answers
export const requests = () => store.get("requests", []);
export function updateRequest(id, patch) {
  store.set("requests", requests().map((r) => (r.id === id ? { ...r, ...patch } : r)));
}
export function ask(body, meta = {}) {
  const id = uid(`${today()}-${body.kind}-`);
  store.set("requests", [...requests().slice(-14), { id, body: { ...body, id }, state: "queued", at: Date.now(), ...meta }]);
  render();
  flushAll();
  return id;
}
let pollTimer = null;
export async function pollRequests() {
  clearTimeout(pollTimer);
  const open = requests().filter((r) => r.state === "sent");
  if (!open.length || !S.settings.token) return;
  let changed = false;
  for (const r of open) {
    try {
      const resp = await gh.getJSON(S.settings, `out/app/responses/${r.id}.json`);
      if (resp) { updateRequest(r.id, { state: resp.status === "done" ? "done" : "error", response: resp }); changed = true; }
      else if (Date.now() - (r.sentAt || r.at) > 60 * 60 * 1000) { updateRequest(r.id, { state: "error", response: { error: "no answer after an hour" } }); changed = true; }
    } catch { /* offline — try again on the next poll */ }
  }
  if (changed) { render(); renderSheet(); if (requests().some((r) => r.state === "done" && r.body.kind !== "swap")) refreshPlan(true); }
  if (requests().some((r) => r.state === "sent")) pollTimer = setTimeout(pollRequests, 12000);
}
