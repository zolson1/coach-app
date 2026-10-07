// The shell: five tabs over one plan. Each tab module registers its own
// actions and sheets with core.js; this file routes, renders and listens.
import { S, A, INPUTS, esc, root, overlay, bar, tabbar, store, T, L, gh, today, save, flash, flashHTML, header, render,
  setRenderer, renderSheet, refreshPlan, flushAll, pollRequests, pendingCount, queue, fuel, DEV } from "./core.js";
import { viewTrain, viewSession, viewFinish, renderTimer } from "./train.js";
import { viewFuel } from "./fuel.js";
import { viewKitchen, viewCook, viewRecipe, viewCycle, viewDraft, kitchenInputs } from "./kitchen.js";
import { viewProgress } from "./progress.js";
import { viewToday } from "./today.js";
import { wireCharts } from "./charts.js";
import "./ui.js";
import { viewMat } from "./mat.js";
import "./fix.js";
import "./ask.js";
import "./day.js";

const TABS = [["today", "Today", "☀"], ["train", "Train", "🏋"], ["fuel", "Fuel", "🍽"], ["kitchen", "Kitchen", "🧊"], ["progress", "Progress", "📈"]];
const TAB_VIEW = { today: viewToday, train: viewTrain, fuel: viewFuel, kitchen: viewKitchen, progress: viewProgress };
const OVER = { session: viewSession, finish: viewFinish, settings: viewSettings, cook: viewCook, recipe: viewRecipe, cycle: viewCycle, draft: viewDraft, mat: viewMat };
Object.assign(INPUTS, kitchenInputs);

function banners() {
  const p = S.plan;
  const out = [];
  if (S.loading && !p) out.push(`<div class="banner">Loading your plan…</div>`);
  else if (!p) out.push(`<div class="banner warn">${esc(S.planError || "No plan loaded yet.")} <button class="btn sm" data-a="reload">Retry</button></div>`);
  else {
    if (S.planError) out.push(`<div class="banner warn">Offline copy — ${esc(S.planError)} <button class="btn sm" data-a="reload">Retry</button></div>`);
    if (p.date !== today()) {
      out.push(`<div class="banner ${L.mondayOf(p.date) !== L.mondayOf(today()) ? "warn" : ""}">Plan built ${esc(L.fmtDate(p.date))} — today's arrives with the morning run.
        <button class="btn sm" data-a="dispatch">Build it now</button></div>`);
    }
    if (p.version !== 2) out.push(`<div class="banner">The coach is updating — fuel and kitchen appear after the next morning run.</div>`);
  }
  if (S.syncMsg) out.push(`<div class="banner ${/waiting/.test(S.syncMsg) ? "warn" : "ok"}">${esc(S.syncMsg)}${/waiting/.test(S.syncMsg) ? ` <button class="btn sm" data-a="flush">Retry</button>` : ""}</div>`);
  return out.join("");
}

function shell() {
  if (S.view && OVER[S.view] && !(["session", "finish"].includes(S.view) && !S.active)) return OVER[S.view]();
  if (!S.settings.token) return viewSetup();
  const [, title] = TABS.find(([k]) => k === S.tab) || TABS[0];
  const n = pendingCount() + queue().length;
  return `${header(title, L.fmtDate(today()),
      `<button class="icon" data-a="reload" aria-label="Refresh">${S.loading ? "…" : "↻"}</button>`,
      `${n ? `<span class="syncdot" title="${n} syncing"></span>` : ""}<button class="icon" data-a="settings" aria-label="Settings">⚙</button>`)}
    <main class="wrap">${flashHTML()}${banners()}${(TAB_VIEW[S.tab] || viewToday)()}</main>`;
}

// Every render rebuilds the DOM, so two things have to survive it: the day
// strip's scroll position, and whatever he is typing. A render that wasn't
// caused by his own tap (a sync finishing, the plan refreshing) waits until
// the field he's in loses focus.
let lastStripKey = null, userAction = false, deferred = false;
const typing = (el) => { const a = document.activeElement; return !!a && el.contains(a) && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName); };

function paint() {
  if (!userAction && (typing(root) || typing(overlay))) { deferred = true; return; }
  deferred = false;
  const overView = !!(S.view && OVER[S.view]);
  const old = root.querySelector("#daystrip");
  const prevLeft = old ? old.scrollLeft : null;
  root.innerHTML = shell();
  document.body.classList.toggle("tabs", !overView && !!S.settings.token);
  tabbar.innerHTML = overView || !S.settings.token ? "" : TABS.map(([k, label, icon]) =>
    `<button class="tab ${S.tab === k ? "on" : ""}" data-a="tab" data-t="${k}"><span>${icon}</span>${label}</button>`).join("");
  renderSheet();
  renderTimer(T.state());
  const strip = root.querySelector("#daystrip");
  if (strip) {
    const sel = strip.querySelector(".sel");
    if (prevLeft != null && sel?.dataset.date === lastStripKey) strip.scrollLeft = prevLeft;
    else if (sel) strip.scrollLeft = sel.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + sel.offsetWidth / 2;
    lastStripKey = sel?.dataset.date ?? null;
  } else lastStripKey = null;
}
document.addEventListener("focusout", () => setTimeout(() => { if (deferred) paint(); }, 50));
setRenderer(paint);

function viewSetup() {
  return `${header("Coach", "One-time setup")}
  <main class="wrap"><section class="card"><h2>Connect to your coach</h2>
    <p class="muted">Paste a GitHub fine-grained token with access to <b>${esc(S.settings.repo)}</b>:
    <b>Contents: Read and write</b> (loads your plan, saves what you log) and <b>Actions: Read and write</b>
    (optional — lets the app start the morning run). It stays on this phone.</p>
    <label class="fld">Token<input type="password" id="tok" autocomplete="off" placeholder="github_pat_…"></label>
    <label class="fld">Repository<input id="repo" value="${esc(S.settings.repo)}"></label>
    <button class="btn primary big" data-a="savetoken">Connect</button></section></main>`;
}

function viewSettings() {
  const s = S.settings, rem = S.plan?.reminders;
  return `${header("Settings", "", `<button class="icon" data-a="closeview" aria-label="Back">‹</button>`)}
  <main class="wrap"><section class="card">
    <label class="fld">GitHub token<input type="password" id="set-token" value="${esc(s.token)}" autocomplete="off"></label>
    <label class="fld">Repository<input id="set-repo" value="${esc(s.repo)}"></label>
    <label class="fld">Barbell weight (lb)<input type="number" inputmode="decimal" id="set-barbell" value="${esc(s.barbell)}"></label>
    <label class="fld">Trap bar weight (lb) — check the bar; many are 55–65<input type="number" inputmode="decimal" id="set-trap" value="${esc(s.trapBar)}"></label>
    <fieldset class="fld"><legend>Plates available</legend>${L.DEFAULT_PLATES.map((p) =>
      `<label class="chip"><input type="checkbox" class="set-plate" value="${p}" ${s.plates.includes(p) ? "checked" : ""}> ${p}</label>`).join("")}</fieldset>
    <label class="chip"><input type="checkbox" id="set-sound" ${s.sound ? "checked" : ""}> Timer beeps</label>
    <label class="chip"><input type="checkbox" id="set-vib" ${s.vibrate ? "checked" : ""}> Vibrate</label>
    <label class="chip wide"><input type="checkbox" id="set-bg" ${s.background !== false ? "checked" : ""}> Ring when I'm in another app (a notification at the end of each rest)</label>
    <p class="muted small">Notifications: <b>${esc({ granted: "allowed", denied: "blocked — allow them for this site in Chrome's settings", default: "not asked yet", unsupported: "not supported here" }[T.notifyState()])}</b></p>
    <div class="toolrow">${T.notifyState() === "default" ? `<button class="btn sm" data-a="asknotify">Allow notifications</button>` : ""}
      <button class="btn sm" data-a="testrest">Test: ring in 10 s (switch apps now)</button></div>
    <button class="btn primary big" data-a="savesettings">Save</button></section>
    ${rem ? `<section class="card"><h2>Today's reminders</h2>
      <p class="muted small">What your phone's notifications will say (set up in MacroDroid).</p>
      <p class="line"><b>Morning:</b> ${esc(rem.morning || "nothing today")}</p>
      <p class="line"><b>Evening:</b> ${esc(rem.evening || "nothing tonight")}</p></section>` : ""}
    <p class="muted small center">Plan built ${esc(S.plan?.generated || "—")} · menu ${esc(fuel()?.menu?.id || "—")}</p></main>`;
}

Object.assign(A, {
  clearflash() { S.flash = null; render(); },
  reload() { refreshPlan().then(flushAll); },
  flush() { flushAll(); },
  tab(d) { S.tab = d.t; S.view = null; store.set("tab", d.t); if (d.t !== "fuel") S.fuelDate = null; render(); window.scrollTo(0, 0); },
  settings() { S.view = "settings"; render(); window.scrollTo(0, 0); },
  closeview() {
    const was = S.view;
    S.view = was === "recipe" && S.draft && S.viewArg && S.draft.recipes?.[S.viewArg] ? "draft" : null;
    if (was === "draft") { S.view = "cycle"; }
    render();
  },
  async dispatch() {
    try { await gh.dispatchDaily(S.settings); flash("Morning run started — refresh in about 2 minutes."); }
    catch (e) { flash(e.message, "warn"); }
  },
  savetoken() {
    const tok = document.getElementById("tok").value.trim();
    const repo = document.getElementById("repo").value.trim();
    if (!tok) return;
    S.settings = { ...S.settings, token: tok, repo: repo || S.settings.repo };
    store.saveSettings(S.settings);
    render(); refreshPlan();
  },
  savesettings() {
    const g = (id) => document.getElementById(id);
    S.settings = { ...S.settings, token: g("set-token").value.trim(), repo: g("set-repo").value.trim(),
      barbell: Number(g("set-barbell").value) || 45, trapBar: Number(g("set-trap").value) || 45,
      plates: [...document.querySelectorAll(".set-plate")].filter((x) => x.checked).map((x) => Number(x.value)),
      sound: g("set-sound").checked, vibrate: g("set-vib").checked, background: g("set-bg").checked };
    store.saveSettings(DEV ? { ...S.settings, token: "" } : S.settings);
    T.setPrefs({ sound: S.settings.sound, vibrate: S.settings.vibrate, background: S.settings.background });
    S.view = null; render(); refreshPlan();
  },
  async asknotify() { await T.askToNotify(); render(); },
  testrest() { T.unlockAudio(); T.start({ kind: "rest", label: "Test rest", next: "This was a test — the timer works in the background", mode: "down", secs: 10 }); },
});

function onClick(e) {
  const el = e.target.closest("[data-a]");
  if (!el || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "checkbox")) return;
  if (el.tagName === "INPUT" && el.type === "checkbox" && INPUTS[el.dataset.a]) { INPUTS[el.dataset.a](el); return; }
  const fn = A[el.dataset.a];
  if (!fn) return;
  T.unlockAudio();
  e.preventDefault();
  userAction = true;
  try { fn({ ...el.dataset }, el); } finally { userAction = false; }
}
for (const target of [root, overlay, bar, tabbar]) {
  target.addEventListener("click", onClick);
  target.addEventListener("input", (e) => {
    const el = e.target.closest("[data-a]");
    if (el && INPUTS[el.dataset.a] && el.type !== "checkbox") INPUTS[el.dataset.a](el);
  });
}
overlay.addEventListener("click", (e) => { if (e.target === overlay) { S.sheet = null; renderSheet(); } });
wireCharts(root);

// ------------------------------------------------------------------ boot
render();
if (S.active) T.keepAwake(true);
refreshPlan(!!S.plan).then(() => { flushAll(); pollRequests(); });
document.addEventListener("visibilitychange", () => {
  if (!S.settings.token) return;
  if (document.visibilityState === "hidden") { flushAll(); return; }     // don't leave taps waiting on the phone
  const age = S.plan?.generated ? Date.now() - new Date(S.plan.generated).getTime() : Infinity;
  if (age > 5 * 60 * 1000 || S.plan?.date !== today()) refreshPlan(true);
  flushAll();
});
setInterval(() => { if (document.visibilityState === "visible" && !S.view && S.tab === "today") render(); }, 5 * 60 * 1000);
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
