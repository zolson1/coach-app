// Changing the plan, and the coach looking ahead (coach/anticipate.py).
//  · Edit a day: move a session to another day, skip it, bring it back, add one,
//    set the class, or add an activity (tennis, a hike) — an easy or moderate one
//    counts as that day's Zone 2 and the LIC drops off.
//  · Looking ahead: the week against what's been added to it — a stacked day, an
//    activity that can stand in for a neighbour's Zone 2 — each one tap to apply.
import { S, A, SHEETS, esc, fuel, send, sheet, render, renderSheet, today, store } from "./core.js";
import { dayOf, dayLabel, statusLine } from "./ui.js";

export const SESSION_NAME = { strength_a: "Strength A", strength_b: "Strength B", domain: "Domain Day (Breacher)",
  lic: "Zone 2", loaded_mobility: "Loaded mobility", mobility_pm: "Mobility PM", rest: "Rest", hic: "Hard conditioning" };
const ADDABLE = ["lic", "domain", "loaded_mobility", "strength_a", "strength_b", "mobility_pm"];
const INTENSITY = { easy: "Easy — counts as Zone 2", moderate: "Moderate — counts as Zone 2", hard: "Hard — a hard session" };
const MAT = { none: "No class", one: "One class", double: "BJJ + Muay Thai" };

export const keyOf = (x) => (x.kind === "strength" ? `strength_${String(x.which).toLowerCase()}` : x.kind);
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const short = (iso) => {
  if (iso === today()) return "Today";
  const t = new Date(today() + "T12:00:00"); t.setDate(t.getDate() + 1);
  if (iso === t.toISOString().slice(0, 10)) return "Tomorrow";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
};
const ahead = () => (fuel()?.days || []).filter((x) => x.date >= today()).slice(0, 8);

// ------------------------------------------------------------ looking ahead
const ids = (k) => new Set(store.get(k, []));
const remember = (k, id) => store.set(k, [...store.get(k, []).filter((x) => x !== id), id].slice(-60));

export function suggestions() {
  const done = ids("sug_done"), no = ids("sug_no");
  return (S.plan?.suggestions || []).filter((s) => !done.has(s.id) && !no.has(s.id)
    && !(s.until && (s.dates || []).includes(today()) && nowHM() >= s.until));
}

export function suggestionsCard() {
  const list = suggestions();
  if (!list.length) return "";
  return `<section class="card"><h2>Looking ahead</h2>
    ${list.map((s) => `<div class="workrow"><p><b>${esc(s.title)}</b></p><p class="muted small">${esc(s.text)}</p>
      <div class="toolrow"><button class="btn sm primary" data-a="sugdo" data-id="${esc(s.id)}">Do it</button>
        <button class="btn sm ghost" data-a="plansheet" data-date="${esc(s.dates[0])}">Edit ${esc(short(s.dates[0]).replace(/^To(day|morrow)$/, (m) => m.toLowerCase()))}…</button>
        <button class="btn sm ghost" data-a="sugno" data-id="${esc(s.id)}">Not this time</button></div></div>`).join("")}
  </section>`;
}

// ------------------------------------------------------------ one day's plan
// The training line for a day: class, sessions, activities, and what covers what.
export function planLine(d) {
  const bits = [d.mat === "double" ? MAT.double : d.mat === "one" ? MAT.one : null,
    ...(d.sessions || []).filter((s) => s !== "rest").map((s) => SESSION_NAME[s] || s),
    ...(d.activities || []).map((a) => `${a.name}${a.start ? ` ${a.start}` : ""}`)].filter(Boolean);
  return bits.join(" · ");
}

function sessionRow(d, key, sh) {
  const from = ((d.edits || {}).add || []).find((x) => keyOf(x) === key && x.from);
  const moving = sh.move === key;
  const days = ahead().filter((x) => x.date !== d.date);
  return `<div class="workrow"><p><b>${esc(SESSION_NAME[key] || key)}</b>${from ? `<span class="muted"> · moved here from ${esc(short(from.from))}</span>` : ""}</p>
    <div class="toolrow"><button class="btn sm ${moving ? "primary" : ""}" data-a="planmovepick" data-k="${esc(key)}">Move…</button>
      <button class="btn sm ghost" data-a="planedit" data-act="remove" data-k="${esc(key)}">Skip</button>
      ${from ? `<button class="btn sm ghost" data-a="planback" data-k="${esc(key)}" data-from="${esc(from.from)}">Send back to ${esc(short(from.from))}</button>` : ""}</div>
    ${moving ? `<div class="chips">${days.map((x) => `<button class="chipbtn" data-a="planmove" data-k="${esc(key)}" data-to="${x.date}">${esc(short(x.date))}${x.sessions?.length || x.mat ? ` <span class="muted">· ${esc(planLine(x))}</span>` : ""}</button>`).join("")}</div>` : ""}
  </div>`;
}

SHEETS.plan = (sh) => {
  const d = dayOf(sh.date);
  if (!d) return "";
  const ed = d.edits || {};
  const moved = ed.moved || {};
  const gone = (ed.remove || []).filter((k) => !(d.sessions || []).includes(k));
  const have = new Set(d.sessions || []);
  return `<div class="sheet"><h3>Edit ${esc(dayLabel(sh.date))}</h3>
    <p class="muted small">${esc(statusLine(d))} — the day's meals and timeline rebuild in about a minute.</p>
    ${d.plan_pending ? `<p class="adj">Change saved — the plan rebuilds in about a minute.</p>` : ""}
    ${(d.sessions || []).filter((k) => k !== "rest").map((k) => sessionRow(d, k, sh)).join("")}
    ${d.covered ? `<div class="workrow"><p><b>Zone 2</b> <span class="muted">— covered by ${esc(d.covered.lic)}; no separate LIC.</span></p></div>` : ""}
    ${gone.map((k) => `<div class="workrow"><p><b>${esc(SESSION_NAME[k] || k)}</b> <span class="muted">— ${moved[k] ? `moved to ${esc(short(moved[k]))}` : "skipped"}</span></p>
      <div class="toolrow"><button class="btn sm ghost" data-a="planedit" data-act="restore" data-k="${esc(k)}">Bring it back</button></div></div>`).join("")}
    ${(d.activities || []).map((a) => `<div class="workrow"><p><b>${esc(a.name)}</b> <span class="muted">· ${esc(a.start || "no time yet")}${a.dur ? `, ${a.dur} min` : ""} · ${esc(a.intensity)}</span></p>
      <div class="toolrow"><button class="btn sm ghost" data-a="actsheet" data-date="${d.date}" data-id="${esc(a.id)}">Edit</button></div></div>`).join("")}
    <p class="small"><b>Class</b></p>
    <div class="segs">${Object.entries(MAT).map(([k, v]) => `<button class="seg ${(d.mat || "none") === k ? "on" : ""}" data-a="planmat" data-mat="${k}">${v}</button>`).join("")}</div>
    <div class="toolrow"><button class="btn sm" data-a="actsheet" data-date="${d.date}">+ Activity</button>
      <button class="btn sm ${sh.adding ? "primary" : ""}" data-a="planaddpick">+ Session</button></div>
    ${sh.adding ? `<div class="chips">${ADDABLE.filter((k) => !have.has(k)).map((k) => `<button class="chipbtn" data-a="planedit" data-act="add" data-k="${k}">${esc(SESSION_NAME[k])}</button>`).join("")}</div>` : ""}
    <div class="sheet-foot">${Object.keys(ed).length ? `<button class="btn ghost" data-a="planedit" data-act="clear">Back to the template</button>` : ""}
      <button class="btn ghost" data-a="closesheet">Close</button></div></div>`;
};

// ------------------------------------------------------------ an activity
SHEETS.act = (sh) => {
  const d = dayOf(sh.date);
  if (!d) return "";
  const a = (d.activities || []).find((x) => x.id === sh.id) || {};
  const inten = sh.intensity || a.intensity || "moderate";
  const logged = d.session_log?.[`act_${a.id}`];
  return `<div class="sheet"><h3>${a.id ? "Edit" : "Add"} an activity — ${esc(dayLabel(sh.date))}</h3>
    <label class="fld">What<input id="actname" value="${esc(a.name || "")}" placeholder="Tennis, a hike, pickup basketball"></label>
    <div class="two"><label class="fld">Start<input type="time" id="actstart" value="${esc(a.start || "")}"></label>
      <label class="fld">Minutes<input type="number" inputmode="numeric" id="actdur" value="${esc(a.dur || 60)}"></label></div>
    <div class="choices">${Object.entries(INTENSITY).map(([k, v]) => `<button class="option ${inten === k ? "on" : ""}" data-a="actint" data-v="${k}"><b>${esc(v)}</b></button>`).join("")}</div>
    <p class="muted small">Sport is conditioning: easy or moderate takes that day's Zone 2 off the plan. The meals and training around it re-time to the start you set.</p>
    <button class="btn primary big" data-a="actsave">Save</button>
    ${a.id && d.when === "today" ? `<div class="two"><button class="btn" data-a="actlog" data-status="done">Did it</button><button class="btn" data-a="actlog" data-status="skipped">Didn't happen</button></div>` : ""}
    ${logged ? `<p class="muted small">Logged: ${esc(logged.status)}${logged.at ? ` at ${esc(logged.at)}` : ""}.</p>` : ""}
    ${a.id ? `<button class="btn ghost" data-a="actremove">Remove it</button>` : ""}
    <button class="btn ghost" data-a="${sh.back ? "plansheet" : "closesheet"}" data-date="${esc(sh.date)}">${sh.back ? "Back" : "Close"}</button></div>`;
};

Object.assign(A, {
  plansheet(d) { sheet({ type: "plan", date: d.date || today() }); },
  planmovepick(d) { S.sheet = { ...S.sheet, move: S.sheet.move === d.k ? null : d.k, adding: false }; renderSheet(); },
  planaddpick() { S.sheet = { ...S.sheet, adding: !S.sheet.adding, move: null }; renderSheet(); },
  planedit(d) {
    const sh = S.sheet;
    send({ op: "plan_edit", date: sh.date, action: d.act, ...(d.k ? { session: d.k } : {}) });
    S.sheet = { ...sh, move: null, adding: false };
    renderSheet();
  },
  planmove(d) {
    const sh = S.sheet;
    send({ op: "plan_edit", date: sh.date, action: "move", session: d.k, to: d.to });
    S.sheet = { ...sh, move: null };
    renderSheet();
  },
  planback(d) {                     // a session moved here goes home: restore it on its template day
    send({ op: "plan_edit", date: d.from, action: "restore", session: d.k });
    renderSheet();
  },
  planmat(d) {
    send({ op: "plan_edit", date: S.sheet.date, action: "mat", mat: d.mat });
    renderSheet();
  },
  actsheet(d) {
    const back = S.sheet?.type === "plan";
    sheet({ type: "act", date: d.date || today(), id: d.id || null, back });
  },
  actint(d) { S.sheet = { ...S.sheet, intensity: d.v }; renderSheet(); },
  actsave() {
    const sh = S.sheet;
    const a = (dayOf(sh.date)?.activities || []).find((x) => x.id === sh.id) || {};
    const val = (id) => (document.getElementById(id)?.value || "").trim();
    const name = val("actname");
    if (!name) return;
    const dur = parseInt(val("actdur"), 10);
    send({ op: "activity", date: sh.date, id: a.id || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 16)}-${Date.now().toString(36).slice(-4)}`,
      name, intensity: sh.intensity || a.intensity || "moderate", ...(val("actstart") ? { start: val("actstart") } : {}), ...(dur > 0 ? { dur } : {}) });
    sheet(sh.back ? { type: "plan", date: sh.date } : null);
  },
  actremove() {
    const sh = S.sheet;
    send({ op: "activity", date: sh.date, id: sh.id, remove: true });
    sheet(sh.back ? { type: "plan", date: sh.date } : null);
  },
  actlog(d) {
    const sh = S.sheet;
    send({ op: "session_log", date: sh.date, session: `act_${sh.id}`, status: d.status, ...(d.status === "done" ? { at: nowHM() } : {}) });
    sheet(null);
  },
  sugdo(d) {
    const s = (S.plan?.suggestions || []).find((x) => x.id === d.id);
    if (!s) return;
    remember("sug_done", s.id);
    send(s.ops);
  },
  sugno(d) { remember("sug_no", d.id); render(); },
});
