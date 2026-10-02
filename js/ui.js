// Small pieces every tab uses.
import { S, A, esc, fuel, send, go, today, L } from "./core.js";

export const LEVEL_NAME = { F1: "Recovery", F2: "Base", F3: "Double", F4: "Double + PM session" };

export function levelChip(level, extra = "") {
  return `<span class="lvl ${esc(String(level).toLowerCase())}">${esc(level)}${extra ? ` ${esc(extra)}` : ""}</span>`;
}

export const dayOf = (date) => fuel()?.days.find((d) => d.date === date) || null;

export function dayLabel(iso, opts = {}) {
  const t = today();
  if (iso === t) return "Today";
  const d = new Date(iso + "T12:00:00"), n = new Date(t + "T12:00:00");
  const diff = Math.round((d - n) / 86400000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", opts.short ? { weekday: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric" });
}

export function statusLine(d) {
  const bits = [d.status];
  if (d.day_type && d.day_type !== "OFF" && !String(d.status).toUpperCase().includes(d.day_type.split("-")[0])) bits.push(d.day_type);
  if (d.sleep_gated && d.when === "future") bits.push("sleep-gated");
  if (d.early_night) bits.push("early night");
  return bits.join(" · ");
}

// Kitchen tasks for a day, as a checklist. Checking one sends its op too
// (mixing oats adds the jars; a haul stocks the bought batches).
export function tasksHTML(d, { when = null, title = null } = {}) {
  const tasks = (d.tasks || []).filter((t) => !when || t.when === when);
  if (!tasks.length) return "";
  const done = new Set(d.tasks_done || []);
  return `${title ? `<h3 class="sub">${esc(title)}</h3>` : ""}<div class="tasks">${tasks.map((t) => {
    const isDone = done.has(t.id);
    if (t.id === "company") {             // "tomorrow's dinner: with her (the usual)?" — answer it right here
      return `<div class="check"><span class="tick ghost">🍽</span><span>${esc(t.text)}
        ${whoButtons(t.date, t.slot || "dinner", t.who)}</span></div>`;
    }
    if (t.cook_day && !isDone) {
      return `<div class="check"><span class="tick ghost">🍳</span><span>${esc(t.text)}</span>
        <button class="btn sm primary" data-a="startcook" data-k="cook${t.cook_day}">Start</button></div>`;
    }
    return `<div class="check ${isDone ? "done" : ""}">
      <button class="tick" data-a="task" data-date="${esc(d.date)}" data-task="${esc(t.id)}" aria-label="done">${isDone ? "✓" : ""}</button>
      <span>${esc(t.text)}</span></div>`;
  }).join("")}</div>`;
}

Object.assign(A, {
  task(d) {
    const day = dayOf(d.date);
    const t = day?.tasks.find((x) => x.id === d.task);
    if (!t) return;
    const wasDone = (day.tasks_done || []).includes(t.id);
    const ops = [{ op: "task_done", date: d.date, task: t.id, done: !wasDone }];
    if (!wasDone && t.op) ops.unshift({ ...t.op, date: d.date });
    send(ops);
  },
  startcook(d) { go("cook", d.k); },
  company(d) { send({ op: "company", date: d.date, slot: d.slot, who: d.who }); },
});

// Who's eating a meal: just him, with her at his place (the plan's food, a
// for-two pack), or at hers / out (not the plan's food).
export const WHO = [["solo", "Just me"], ["shared", "With her"], ["away", "At hers / out"]];
export function whoButtons(date, slot, current) {
  return `<div class="segs who">${WHO.map(([k, l]) => `<button class="seg ${current === k ? "on" : ""}" data-a="company"
    data-date="${esc(date)}" data-slot="${esc(slot)}" data-who="${k}">${l}</button>`).join("")}</div>`;
}
export function companyControl(d, r, at = null) {
  const slot = r.slot === "dinner" ? "Dinner" : "Lunch";
  return `<div class="company"><p class="small"><b>${slot} ${esc(at || r.time)}</b>
    <span class="muted">${r.company_pending ? "· updating…" : r.company_set ? "" : r.company_counted ? "· as counted this morning" : "· the usual"}</span></p>
    ${whoButtons(d.date, r.slot, r.company)}</div>`;
}
export function companyDetail(r) {
  if (r.company === "shared" && r.for_two) return `<p class="adj">${esc(r.for_two)}</p>`;
  if (r.company === "away" && r.away_note) return `<p class="adj">${esc(r.away_note)}</p>`;
  return "";
}

export function macroLine(r) {
  if (r.kcal == null) return "";
  return `${r.kcal} kcal · ${r.protein ?? 0} g P${r.carbs != null ? ` · ${r.carbs} C · ${r.fat} F` : ""}`;
}

export function emptyState(text) { return `<p class="muted empty">${esc(text)}</p>`; }
export { L };
