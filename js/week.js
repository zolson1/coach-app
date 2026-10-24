// The week at a glance — every day's work, classes, lifts, conditioning and
// activities, from the same plan the day screens use — and the class picker:
// the coach picks each mat day's classes from the gym's LIVE schedule (a
// holiday Monday has only an open mat), and he can overrule any day.
import { S, A, SHEETS, esc, fuel, send, sheet, renderSheet, today, header, flashHTML, go } from "./core.js";
import { dayOf, dayLabel, statusLine, levelChip } from "./ui.js";
import { live } from "./day.js";
import { hm, workBlock } from "./timeline.js";
import { SESSION_NAME } from "./plan.js";

const DISC = { bjj_gi: "BJJ", bjj_nogi: "No-gi", muay_thai: "Muay Thai", open_mat: "Open mat", grappling_live: "Live grappling",
  wrestling_takedowns: "Takedowns", mma: "MMA" };
const back = () => `<button class="icon" data-a="closeview" aria-label="Back">‹</button>`;
const ICON = { mat: "🥋", lift: "🏋", lic: "🚴", mobility: "🧘", activity: "🏃", work: "🚒" };
const key = (c) => `${c.start}|${c.name}`;

function workLine(d) {
  const w = d.work || {};
  const out = [];
  if (w.relief) { const b = workBlock(w.relief); out.push(`Relieved ≈${hm(b.actual ?? b.relief)}`); }
  if (w.today) {
    const b = workBlock(w.today);
    out.push(`${b.where === "home" ? "Home station" : "Detail"} ${hm(b.report)}–${hm(b.relief)}${b.relief >= 1440 ? " (next day)" : ""}`);
  }
  if (d.leave) out.push(`Leave: ${{ full: "whole shift", first12: "first 12 h", last12: "last 12 h" }[d.leave.part] || d.leave.part}`);
  return out.join(" · ");
}

function matLines(d) {
  const m = d.mat_plan;
  if (!m) return "";
  if (m.skipped_by_rule) return `<p class="adj">${esc(m.notes[0])}</p>`;
  const who = m.chosen_by === "you" ? `<i class="badge">your pick</i>` : m.source === "live" ? `<i class="badge">live schedule</i>` : `<i class="badge">usual week</i>`;
  const rows = m.slots.length ? m.slots.map((s) => `<p class="wk-row">🥋 <b>${esc(s.class.start)}–${esc(s.class.end)}</b> ${esc(s.class.name)}</p>`).join("")
    : `<p class="wk-row muted">🥋 No class fits.</p>`;
  return `${rows}<p class="muted small">${who}${m.changed ? ` ${esc(m.changed)}` : ""}</p>`;
}

function trainLines(d) {
  const L = live(d);
  const items = (L?.items || []).filter((i) => i.kind === "train" && i.train !== "mat");
  const rows = items.map((i) => `<p class="wk-row">${ICON[i.train] || "🏋"} <b>${esc(i.at)}</b> ${esc(i.label)}${i.status === "skipped" ? " <span class=\"muted\">(skipped)</span>" : ""}</p>`);
  const timed = new Set(items.map((i) => i.session));
  for (const s of d.sessions || []) if (!timed.has(s) && !["rest", "mobility_pm"].includes(s)) rows.push(`<p class="wk-row">🏋 ${esc(SESSION_NAME[s] || s)}</p>`);
  for (const a of d.activities || []) if (!a.start) rows.push(`<p class="wk-row">🏃 ${esc(a.name)} <span class="muted">— no time yet</span></p>`);
  if (d.covered) rows.push(`<p class="muted small">Zone 2 covered by ${esc(d.covered.lic)}.</p>`);
  return rows.join("");
}

// A day that's happened: what the watch saw against what was planned. Nothing to log.
const KIND = { mat: "🥋", strength: "🏋", aerobic: "🚴", mobility: "🧘", other: "•" };
function pastLine(d) {
  const a = d.actual || { activities: [] };
  const seen = (a.activities || []).map((x) => `${KIND[x.kind] || "•"} ${x.name || x.type} ${x.minutes} min`);
  const slots = (d.mat_plan?.slots || []).filter((s) => !d.mat_log?.[s.slot]);
  const sess = (d.sessions || []).filter((k) => !["rest", "mobility_pm"].includes(k) && !d.session_log?.[k]);
  const missed = [...slots.map((s) => s.label), ...sess.map((k) => SESSION_NAME[k] || k)];
  return `<div class="workrow"><p><b>${esc(dayLabel(d.date, { short: true }))}</b> <span class="muted">· ${esc(statusLine(d))}</span></p>
    <p class="small">${seen.length ? esc(seen.join(" · ")) : `<span class="muted">Nothing recorded on the watch.</span>`}</p>
    ${missed.length ? `<p class="muted small">Planned, not seen: ${esc(missed.join(", "))}</p>` : ""}</div>`;
}

export function viewWeek() {
  const f = fuel();
  const days = (f?.days || []).filter((d) => d.date >= today()).slice(0, 7);
  const mon = (() => { const t = new Date(today() + "T12:00:00"); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t.toISOString().slice(0, 10); })();
  const past = (f?.days || []).filter((d) => d.date >= mon && d.date < today());
  let html = `${header("This week", "Work, classes and training", back())}<main class="wrap">${flashHTML()}`;
  if (past.length) html += `<section class="card"><h2>So far this week</h2>${past.map(pastLine).join("")}
    <p class="muted small">From your watch, the morning after. Record classes and rides on it.</p></section>`;
  if (!days.length) return html + `<p class="muted">The week loads with the next plan.</p></main>`;
  for (const d of days) {
    const work = workLine(d);
    html += `<section class="card wk"><div class="lift-head"><h2>${esc(dayLabel(d.date))}</h2>${levelChip(d.level.today)}</div>
      <p class="muted small">${esc(statusLine(d))}${work ? ` · 🚒 ${esc(work)}` : ""}</p>
      ${matLines(d)}${trainLines(d)}
      ${d.plan_pending ? `<p class="muted small">Change saved — this day rebuilds in about a minute.</p>` : ""}
      <div class="toolrow"><button class="btn sm" data-a="matpicksheet" data-date="${d.date}">Classes…</button>
        <button class="btn sm ghost" data-a="plansheet" data-date="${d.date}">Edit training…</button></div></section>`;
  }
  return html + `<p class="muted small center">Classes come from BETA's live schedule two weeks out; past that, its usual week.</p></main>`;
}

// ------------------------------------------------------------ pick the classes
SHEETS.matpick = (sh) => {
  const d = dayOf(sh.date);
  if (!d) return "";
  const m = d.mat_plan || {};
  const opts = m.options || [];
  const chosen = new Set(sh.chosen ?? (m.slots || []).map((s) => key(s.class)));
  return `<div class="sheet"><h3>Classes — ${esc(dayLabel(sh.date))}</h3>
    ${m.changed ? `<p class="adj">${esc(m.changed)}</p>` : ""}
    <p class="muted small">${m.kind ? `The program has ${m.kind === "double" ? "a double (BJJ → Muay Thai)" : "one class"} that day. ` : "Not a mat day in the program. "}Tap the classes you'll go to.${m.window ? ` Your window: ${esc(hm(m.window[0]))}–${esc(hm(m.window[1]))}.` : ""}</p>
    ${opts.length ? opts.map((c) => {
      const on = chosen.has(key(c));
      const hard = c.level === "hard" ? " · hard" : c.level === "technical" ? " · technical" : "";
      const outside = m.window && (toM(c.start) < m.window[0] || toM(c.end) > m.window[1]);
      return `<button class="option ${on ? "on" : ""}" data-a="matpicktoggle" data-k="${esc(key(c))}">
        <b>${esc(c.start)}–${esc(c.end)} · ${esc(c.name)}</b><span class="muted">${esc(DISC[c.discipline] || c.discipline)}${hard}${outside ? " · outside your window" : ""}${c.note ? ` · ${esc(c.note)}` : ""}</span></button>`;
    }).join("") : `<p class="muted">No classes on the schedule that day.</p>`}
    <button class="btn primary big" data-a="matpicksave">Save these</button>
    <div class="two"><button class="btn" data-a="matpicknone">No mat that day</button>
      <button class="btn" data-a="matpickclear">${m.chosen_by === "you" ? "Back to the coach's picks" : "Keep the coach's picks"}</button></div>
    <button class="btn ghost" data-a="closesheet">Close</button></div>`;
};
const toM = (s) => { const [h, mm] = String(s).split(":").map(Number); return h * 60 + mm; };

Object.assign(A, {
  weekview() { sheet(null); go("week"); },
  matpicksheet(d) { sheet({ type: "matpick", date: d.date }); },
  matpicktoggle(d) {
    const sh = S.sheet;
    const m = dayOf(sh.date)?.mat_plan || {};
    const set = new Set(sh.chosen ?? (m.slots || []).map((s) => key(s.class)));
    if (set.has(d.k)) set.delete(d.k); else set.add(d.k);
    S.sheet = { ...sh, chosen: [...set] };
    renderSheet();
  },
  matpicksave() {
    const sh = S.sheet;
    const m = dayOf(sh.date)?.mat_plan || {};
    const set = new Set(sh.chosen ?? (m.slots || []).map((s) => key(s.class)));
    const classes = (m.options || []).filter((c) => set.has(key(c)));
    sheet(null);
    send(classes.length ? { op: "mat_pick", date: sh.date, classes } : { op: "mat_pick", date: sh.date, none: true });
  },
  matpicknone() { const sh = S.sheet; sheet(null); send({ op: "mat_pick", date: sh.date, none: true }); },
  matpickclear() {
    const sh = S.sheet;
    const m = dayOf(sh.date)?.mat_plan || {};
    sheet(null);
    if (m.chosen_by === "you") send({ op: "mat_pick", date: sh.date, clear: true });
  },
});
