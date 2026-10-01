// The mat and daily mobility: each class as a check-off (done, drilled, swapped
// for another class, skipped), the warm-ups before it as a tick-list, and the
// daily mobility routine, which runs in the session runner for its timed holds.
import { S, A, SHEETS, esc, fuel, send, sheet, render, today, store, go, header, flashHTML, L } from "./core.js";
import { dayOf, dayLabel } from "./ui.js";

const STATUS = { done: "Done", drilled: "Drilled only", swapped: "Swapped", skipped: "Skipped" };
const ICON = { done: "✓", drilled: "◐", swapped: "⇄", skipped: "✕" };
const DISC = { bjj_gi: "BJJ (gi)", bjj_nogi: "BJJ (no-gi)", muay_thai: "Muay Thai", open_mat: "Open mat", mma: "MMA", grappling_live: "Live grappling" };
const back = () => `<button class="icon" data-a="closeview" aria-label="Back">‹</button>`;
const weekdayIdx = (iso) => (new Date(iso + "T12:00:00").getDay() + 6) % 7;      // Monday = 0, like the timetable
const optionsFor = (iso) => S.plan?.timetable?.[String(weekdayIdx(iso))] || [];

function slotLine(d, s) {
  const e = d.mat_log?.[s.slot];
  const c = e?.class || s.class;
  const what = c ? `${c.start ? `${c.start} ` : ""}${c.name}` : "Pick the class you went to";
  return `<button class="row mealrow ${e?.status || ""}" data-a="classsheet" data-date="${d.date}" data-slot="${esc(s.slot)}">
    <span class="k">${esc(s.label)}</span>
    <span class="load">${esc(what)}${e?.status === "swapped" && s.class ? ` <s>${esc(s.class.name)}</s>` : ""}</span>
    <span class="plates">${e ? esc(STATUS[e.status] || e.status) : ""}</span>
    <span class="chk ${e?.status || ""}">${ICON[e?.status] || ""}</span></button>`;
}

// The card on Today and Train.
export function matCard(d) {
  const m = d?.mat_plan;
  if (!m) return "";
  if (m.skipped_by_rule) return `<section class="card"><h2>Mat</h2>${m.notes.map((n) => `<p class="adj">${esc(n)}</p>`).join("")}</section>`;
  return `<section class="card"><div class="lift-head"><h2>${m.kind === "double" ? "Double mat" : "One class"}</h2>
      <button class="btn sm" data-a="matview" data-date="${d.date}">Warm-ups</button></div>
    <div class="rows meal">${m.slots.map((s) => slotLine(d, s)).join("")}</div>
    ${m.notes.map((n) => `<p class="adj">${esc(n)}</p>`).join("")}</section>`;
}

const mobilityDone = (date) => !!(S.plan?.mobility_log?.[date] || Object.values(store.get("done", {})).some((v) => v.date === date && String(v.key).startsWith("mobility")));

export function mobilityCard(date = today()) {
  if (!S.plan?.routines) return "";
  const done = mobilityDone(date);
  const log = S.plan.mobility_log?.[date];
  return `<section class="card"><div class="lift-head"><h2>Daily mobility${done ? " ✓" : ""}</h2><span class="tm">7–8 min</span></div>
    ${log ? `<p class="muted small">Deep squat ${Math.round(log.deep_squat_s || 0)} s · dead hang ${Math.round(log.dead_hang_s || 0)} s</p>` : ""}
    <div class="two"><button class="btn ${done ? "" : "primary"}" data-a="open" data-k="mobility">${done ? "Again" : "Start"}</button>
      <button class="btn" data-a="open" data-k="mobility_min">3-min minimum</button></div>
    <p class="muted small">Any time except right before lifting, power work or sparring.</p></section>`;
}

// ------------------------------------------------------------- the mat screen
export function viewMat() {
  const d = dayOf(S.viewArg) || dayOf(today());
  const m = d?.mat_plan;
  if (!m) return `${header("Mat", "", back())}<main class="wrap"><p class="muted">No mat scheduled.</p></main>`;
  const w = S.plan?.mat_warmups || {};
  const ticks = store.get("matticks", {})[d.date] || [];
  const list = (key) => {
    const wu = w[key];
    if (!wu) return "";
    return `<section class="card"><h2>${esc(wu.title)}</h2><div class="tasks">${wu.steps.map((t, i) => {
      const id = `${key}:${i}`, on = ticks.includes(id);
      return `<div class="check ${on ? "done" : ""}"><button class="tick" data-a="mattick" data-date="${d.date}" data-id="${esc(id)}">${on ? "✓" : ""}</button><span>${esc(t)}</span></div>`;
    }).join("")}</div></section>`;
  };
  let html = `${header(m.kind === "double" ? "Double mat" : "One class", dayLabel(d.date), back())}<main class="wrap">${flashHTML()}`;
  html += m.notes.map((n) => `<p class="adj">${esc(n)}</p>`).join("");
  for (const s of m.slots) {
    const e = d.mat_log?.[s.slot];
    const mt = (e?.class || s.class)?.discipline === "muay_thai";
    html += (mt && s.warmups_mt ? s.warmups_mt : s.warmups).map(list).join("");
    html += `<section class="card"><h2>${esc(s.label)}</h2><div class="rows meal">${slotLine(d, s)}</div></section>`;
  }
  return html + `</main>`;
}

SHEETS.cls = (sh) => {
  const d = dayOf(sh.date);
  const s = d?.mat_plan?.slots.find((x) => x.slot === sh.slot);
  if (!s) return "";
  const e = d.mat_log?.[s.slot];
  const options = optionsFor(sh.date);
  const opt = (c, i) => `<button class="option" data-a="classpick" data-i="${i}"><b>${esc(c.start)}–${esc(c.end)} · ${esc(c.name)}</b><span class="muted">${esc(DISC[c.discipline] || c.discipline)}</span></button>`;
  const level = d.level?.today;
  const othersSkipped = d.mat_plan.slots.filter((x) => x.slot !== s.slot).every((x) => d.mat_log?.[x.slot]?.status === "skipped");
  return `<div class="sheet"><h3>${esc(s.label)} — ${esc(dayLabel(sh.date))}</h3>
    ${s.class ? `<p>${esc(s.class.start)}–${esc(s.class.end)} · ${esc(s.class.name)}</p>` : `<p class="muted">Pick the class you went to.</p>`}
    ${sh.picking ? `<h4>${s.pick ? "Which class" : "Went to instead"}</h4>${options.map(opt).join("")}
      <button class="option" data-a="classpick" data-i="lic"><b>Zone 2 instead</b><span class="muted">No class — easy cardio in its place</span></button>
      <button class="btn ghost" data-a="classback">Back</button>`
    : `<div class="choices">
      ${s.pick ? `<button class="btn primary big" data-a="classswap">Pick the class I went to…</button>`
        : `<button class="btn primary big" data-a="classstatus" data-st="done">Done</button>`}
      <button class="btn big" data-a="classstatus" data-st="drilled">Drilled only — no hard rounds</button>
      ${s.pick ? "" : `<button class="btn big" data-a="classswap">Went to a different class…</button>`}
      <button class="btn big" data-a="classstatus" data-st="skipped">Skipped it</button>
      ${e ? `<button class="btn ghost" data-a="classstatus" data-st="clear">Clear</button>` : ""}</div>
      ${["F3", "F4"].includes(level) && d.mat_plan.kind === "double" && othersSkipped ? `<p class="muted small">Skipping all of today's mat? The fuel follows the session — drop today to F2 in the Fuel tab.</p>` : ""}
      <button class="btn ghost" data-a="closesheet">Close</button>`}</div>`;
};

Object.assign(A, {
  matview(d) { go("mat", d.date); },
  mattick(d) {
    const all = store.get("matticks", {});
    const set = new Set(all[d.date] || []);
    if (set.has(d.id)) set.delete(d.id); else set.add(d.id);
    const keep = Object.keys(all).sort().slice(-10);
    store.set("matticks", { ...Object.fromEntries(keep.map((k) => [k, all[k]])), [d.date]: [...set] });
    render();
  },
  classsheet(d) { sheet({ type: "cls", date: d.date, slot: d.slot }); },
  classswap() { sheet({ ...S.sheet, picking: true }); },
  classback() { sheet({ ...S.sheet, picking: false }); },
  classstatus(d) {
    const sh = S.sheet;
    sheet(null);
    send({ op: "mat_log", date: sh.date, slot: sh.slot, status: d.st });
  },
  classpick(d) {
    const sh = S.sheet;
    const day = dayOf(sh.date);
    const s = day.mat_plan.slots.find((x) => x.slot === sh.slot);
    const options = optionsFor(sh.date);
    const c = d.i === "lic" ? { start: null, end: null, name: "Zone 2 instead", discipline: "lic" } : options[Number(d.i)];
    sheet(null);
    send({ op: "mat_log", date: sh.date, slot: sh.slot, status: s.pick ? "done" : "swapped", class: c });
  },
});
