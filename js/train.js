// The Train tab and the session runner: this week's lifting sessions, warm-up
// ramps with plate math, RPE logging with in-session load cuts, rest / hold /
// guided-sequence timers, calibration ladders, notes.
import { S, A, INPUTS, SHEETS, L, T, store, root, bar, esc, today, save, policy, queue, doneLog,
  header, flashHTML, render, renderSheet, flushAll, fuel } from "./core.js";
import { matCard, mobilityCard } from "./mat.js";
const fuelDay = (iso) => fuel()?.days.find((d) => d.date === iso) || null;

export function label(lift) {
  const map = { trap_bar_deadlift: "Trap-bar DL", front_squat: "Front squat", high_bar_squat: "High-bar squat",
    zercher_squat: "Zercher", overhead_press: "OHP", push_press: "Push press", incline_or_landmine_press: "Incline/landmine",
    weighted_pullup: "Pull-up (total)", rack_pull: "Rack pull", power_clean: "Power clean" };
  return map[lift] || lift;
}

function doneThisWeek(key) {
  const mon = L.mondayOf(today());
  const local = Object.entries(doneLog()).some(([id, v]) => v.key === key && v.date >= mon);
  const remote = (S.plan?.ingested || []).some((id) => id.slice(0, 10) >= mon && id.slice(11).startsWith(key));
  return local || remote;
}

export function sessionButton(s, isToday) {
  const done = doneThisWeek(s.key);
  return `<button class="session ${isToday ? "hero" : ""} ${done ? "done" : ""}" data-a="open" data-k="${esc(s.key)}">
    <span class="s-title">${esc(s.title)}${done ? " ✓" : ""}</span>
    <span class="s-sub">${esc(s.subtitle)}</span>
    <span class="s-when">${s.scheduled_today ? "Scheduled today" : `Scheduled ${esc(s.weekday)} ${esc(L.fmtDate(s.date).split(", ")[1] || "")}`}${s.gym ? ` · ${esc(s.gym)} gym` : ""}</span>
  </button>`;
}

// ------------------------------------------------------------------ session
function elapsedText() {
  const s = (Date.now() - new Date(S.active.started).getTime()) / 1000;
  return L.fmtClock(s);
}

export function viewSession() {
  const a = S.active, s = a.spec;
  const anyWork = s.blocks.some((b) => b.type === "lift" && b.work.some((w) => w.done));
  let html = header(s.title, s.subtitle, `<button class="icon" data-a="closeview" aria-label="Back">‹</button>`,
    `<span class="elapsed" id="elapsed">${elapsedText()}</span>`);
  html += `<main class="wrap session">${flashHTML()}`;
  if (s.kind === "strength" && s.alt_sets && !anyWork) {
    html += `<div class="setsel">${[3, 4].map((n) => `<button class="seg ${a.setsChoice === n ? "on" : ""}" data-a="sets" data-n="${n}">${n} sets</button>`).join("")}
      <p class="muted">${esc(s.sets_rule || "")}</p></div>`;
  }
  s.blocks.forEach((b, i) => { html += blockHTML(b, i); });
  html += `<div class="finishbar"><button class="btn primary big" data-a="finish">Finish session</button></div></main>`;
  return html;
}

function blockHTML(b, i) {
  switch (b.type) {
    case "checklist": return checklistHTML(b, i);
    case "lift": return liftHTML(b, i);
    case "hold": return holdHTML(b, i);
    case "sets": return setsHTML(b, i);
    case "sequence": return sequenceHTML(b, i);
    case "info": return `<details class="card info"><summary>${esc(b.title)}</summary><ul class="plain">${b.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>`;
    default: return "";
  }
}

function checklistHTML(b, i) {
  const all = b.items.every((x) => x.done);
  return `<details class="card checklist" ${all ? "" : "open"}><summary>${esc(b.title)}${all ? " ✓" : ""}</summary>
    ${b.items.map((it, j) => `<div class="check ${it.done ? "done" : ""}">
      <button class="tick" data-a="check" data-b="${i}" data-s="${j}" aria-label="done">${it.done ? "✓" : ""}</button>
      <span>${esc(it.text)}</span>
      ${it.timer_s ? `<button class="btn sm" data-a="itemtimer" data-b="${i}" data-s="${j}">▶ ${L.fmtClock(it.timer_s)}</button>` : ""}
    </div>`).join("")}</details>`;
}

function cuesHTML(b) {
  if (!b.cues || !b.cues.length) return "";
  return `<details class="cues"><summary>Cues</summary><ul class="plain">${b.cues.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></details>`;
}

function currentWorkIdx(b) {
  return b.work.findIndex((w) => !w.done && !w.skipped);
}

function liftHTML(b, i) {
  const st = S.settings;
  const hist = L.historyText(S.plan?.history?.[b.lift]);
  const note = S.plan?.lift_notes?.[b.lift];
  const cur = currentWorkIdx(b);
  const complete = b.work.length && cur === -1;
  let rows = "", wuRows = "";
  b.warmups.forEach((w, j) => {
    const load = w.bar ? (b.load_mode === "added" ? 0 : L.barWeight(b.implement, st)) : w.load;
    wuRows += `<button class="row wu ${w.done ? "done" : ""}" data-a="wu" data-b="${i}" data-s="${j}">
      <span class="k">WU</span><span class="load">${w.bar ? (b.load_mode === "added" ? "BW" : "Bar") : esc(L.loadText(load, b.load_mode))}</span>
      <span class="reps">× ${esc(w.reps)}</span><span class="plates">${esc(L.platesText(load, b.implement, st))}</span><span class="chk">${w.done ? "✓" : ""}</span></button>`;
  });
  b.work.forEach((w, j) => {
    const isCur = j === cur;
    const cls = w.done ? "done" : w.skipped ? "skipped" : isCur ? "current" : "";
    const res = w.done ? `${w.reps} @ ${w.rpe ?? "–"}${w.slowed ? " ⚠" : ""}` : w.skipped ? "skipped" : "";
    rows += `<button class="row work ${cls}" data-a="${w.done || w.skipped ? "editset" : "log"}" data-b="${i}" data-s="${j}">
      <span class="k">${w.optional ? "opt" : j + 1}</span>
      <span class="load">${esc(L.loadText(w.load, b.load_mode))}${w.from != null && w.from !== w.load ? ` <s>${esc(w.from)}</s>` : ""}</span>
      <span class="reps">× ${esc(w.target_reps ?? w.reps)}</span>
      <span class="plates">${esc(L.platesText(w.load, b.implement, st))}</span>
      <span class="chk">${esc(res)}</span></button>`;
    if (w.optional && w.condition && !w.done && !w.skipped) rows += `<p class="muted small">${esc(w.condition)}</p>`;
  });
  const adj = (b.state.adjustments || []).map((x) => `<p class="adj ${esc(x.level)}">${esc(x.reason)}</p>`).join("");
  return `<section class="card lift" id="blk${i}">
    <div class="lift-head"><h2>${esc(b.label)}</h2>
      <span class="tm">${b.tm ? `TM ${esc(b.tm)}${b.load_mode === "added" ? " total" : ""}` : "No TM"}${b.load_mode === "added" && b.bodyweight ? ` · BW ${esc(b.bodyweight)}` : ""}${b.provisional ? ` <i class="badge">provisional</i>` : ""}${b.pct ? ` · ${Math.round(b.pct * 100)}%${b.pct_basis ? ` ${esc(b.pct_basis)}` : ""}` : ""}${b.speed_rule ? " · speed governs" : ` · cap RPE ${esc(b.rpe_cap)}`}${b.rest_label ? ` · rest ${esc(b.rest_label)}` : ""}</span></div>
    ${hist ? `<p class="hist">Last ${esc(hist)}</p>` : ""}
    ${note ? `<p class="hist note">Note (${esc(L.fmtDate(note.date))}): ${esc(note.text)}</p>` : ""}
    ${cuesHTML(b)}
    <div class="rows">${wuRows}</div>
    ${b.calibrate?.kind === "no_tm" ? ladderHTML(b, i) : ""}
    ${rows ? `<div class="rows">${rows}</div>` : ""}
    ${adj}
    ${b.calibrate?.kind === "provisional" && complete ? (b.state.adjustments?.length && !b.state.ladder.length
      ? `<p class="muted small">TM calibration skipped today — your sets ran over the cap, so the safety valve is already watching this TM.</p>`
      : ladderHTML(b, i)) : ""}
    <textarea class="note" data-a="note" data-b="${i}" rows="1" placeholder="Note for next time (knee, grip, setup…)">${esc(b.state.note)}</textarea>
  </section>`;
}

function ladderHTML(b, i) {
  const c = b.calibrate, lad = b.state.ladder;
  const last = lad[lad.length - 1];
  const nxt = L.ladderNext(last, c.target_rpe, c.jump);
  const top = L.ladderTop(lad, c.target_rpe);
  const suggested = b.state.ladderLoad ?? (nxt && !nxt.done ? nxt.load : c.start ?? "");
  const rows = lad.map((l, j) => `<div class="row lad done"><span class="k">C${j + 1}</span><span class="load">${esc(L.loadText(l.load, b.load_mode))}</span>
    <span class="reps">× ${esc(l.reps)}</span><span class="plates">${esc(L.platesText(l.load, b.implement, S.settings))}</span><span class="chk">@ ${esc(l.rpe)}${l.slowed ? " ⚠" : ""}</span></div>`).join("");
  let foot;
  if (b.state.ladderDone || (nxt && nxt.done)) {
    foot = top ? `<p class="ok-text">Top set ${esc(L.loadText(top.load, b.load_mode))} × ${esc(top.reps)} @ RPE ${esc(top.rpe)} — the coach sets the TM from it when you sync.</p>`
      : `<p class="warn-text">No set landed at RPE 7–9.5 — the TM won't change. Fine to leave it.</p>`;
    if (c.kind === "no_tm" && top && !b.work.length && c.backoff_sets) {
      foot += `<button class="btn" data-a="backoff" data-b="${i}">Add ${esc(c.backoff_sets)} back-off sets @ ${esc(L.loadText(L.r5(top.load * c.backoff_pct), b.load_mode))}</button>`;
    }
  } else {
    foot = `<div class="ladrow"><button class="btn sm" data-a="ladstep" data-b="${i}" data-d="-${c.jump}">−${c.jump}</button>
      <input class="num" type="number" inputmode="decimal" data-a="ladload" data-b="${i}" value="${esc(suggested)}" placeholder="start load">
      <button class="btn sm" data-a="ladstep" data-b="${i}" data-d="${c.jump}">+${c.jump}</button>
      <button class="btn primary" data-a="ladlog" data-b="${i}">Log set</button></div>
      ${lad.length ? `<button class="btn sm ghost" data-a="laddone" data-b="${i}">That was my top set</button>` : ""}`;
  }
  return `<div class="ladder"><p class="cal">${esc(c.text)}</p>${rows}${foot}</div>`;
}

function holdHTML(b, i) {
  const st = b.state;
  const target = b.max_s ? `${b.target_s}–${b.max_s} s` : `${b.target_s} s`;
  const loadField = b.track && b.track.endsWith("_lb") || b.load != null || b.load_note
    ? `<label class="inl">Load <input class="num" type="number" inputmode="decimal" data-a="holdload" data-b="${i}" value="${esc(st.load ?? "")}" placeholder="lb"> lb</label>` : "";
  return `<section class="card hold"><div class="lift-head"><h2>${esc(b.title)}</h2><span class="tm">${esc(b.sets)} × ${esc(target)}${b.load_label ? ` · ${esc(b.load_label)}` : ""}</span></div>
    ${b.load_note ? `<p class="muted">${esc(b.load_note)}</p>` : ""}${loadField}
    ${cuesHTML(b)}
    <div class="rows">${st.secs.map((x, j) => `<div class="row ${x != null ? "done" : ""}"><span class="k">${j + 1}</span>
      <span class="load">${x != null ? `${Math.round(x)} s` : "—"}</span><span class="plates">${b.implement ? esc(L.platesText(st.load || 0, b.implement, S.settings)) : ""}</span>
      <button class="btn sm ${x == null ? "primary" : ""}" data-a="hold" data-b="${i}" data-s="${j}">${x == null ? "▶ Hold" : "Redo"}</button></div>`).join("")}</div>
  </section>`;
}

function setsHTML(b, i) {
  const st = b.state;
  const loadField = b.track ? `<label class="inl">Load <input class="num" type="number" inputmode="decimal" data-a="setsload" data-b="${i}" value="${esc(st.load ?? "")}" placeholder="lb"> lb</label>` : "";
  return `<section class="card sets"><div class="lift-head"><h2>${esc(b.title)}</h2><span class="tm">${esc(b.sets)} × ${esc(b.reps_label)}</span></div>
    ${loadField}${cuesHTML(b)}
    <div class="dots">${st.done.map((d, j) => `<button class="dot ${d ? "on" : ""}" data-a="setdone" data-b="${i}" data-s="${j}">${d ? "✓" : j + 1}</button>`).join("")}</div>
  </section>`;
}

function sequenceHTML(b, i) {
  const total = b.rounds * b.steps.length;
  return `<section class="card seq"><div class="lift-head"><h2>${esc(b.title)}</h2><span class="tm">${esc(b.rounds)} rounds × ${esc(b.steps.length)} holds · ${esc(b.steps[0].hold_s)} s · rest ${esc(b.rest_s)} s</span></div>
    <ol class="plain">${b.steps.map((x) => `<li>${esc(x.label)}</li>`).join("")}</ol>
    ${cuesHTML(b)}
    <button class="btn ${b.state.done ? "" : "primary"} big" data-a="seq" data-b="${i}">${b.state.done ? "Done ✓ — run again" : `▶ Start (${total} holds, guided)`}</button>
  </section>`;
}

export function viewFinish() {
  const a = S.active, s = a.spec;
  const status = L.sessionStatus(a);
  const lines = s.blocks.filter((b) => b.type === "lift").map((b) => {
    const d = b.work.filter((w) => w.done).length;
    return `<li><b>${esc(b.label)}</b> ${d}/${b.work.length || "—"} sets${b.state.ladder.length ? ` · ${b.state.ladder.length} calibration` : ""}</li>`;
  }).join("");
  return `${header("Finish", s.title, `<button class="icon" data-a="back" aria-label="Back">‹</button>`)}
  <main class="wrap">
    <section class="card"><h2>${status === "done" ? "Session complete" : "Partial session"}</h2>
      <ul class="plain">${lines}</ul>
      ${status === "partial" ? `<p class="muted">Unlogged sets are recorded as not done — nothing gets made up.</p>` : ""}
      <label class="fld">Session note<textarea data-a="snote" rows="3" placeholder="How it went, anything the coach should know">${esc(a.note)}</textarea></label>
      <button class="btn primary big" data-a="commit">Save & sync</button>
      <button class="btn ghost" data-a="back">Keep training</button>
      <button class="btn danger ghost" data-a="discard">Discard session</button>
    </section>
  </main>`;
}

// ------------------------------------------------------------------ RPE sheet
const RPES = [5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

SHEETS.rpe = (sh) => {
  const b = S.active.spec.blocks[sh.b];
  const cap = sh.kind === "ladder" ? b.calibrate.target_rpe : b.rpe_cap;
  return `<div class="sheet" role="dialog" aria-label="Log set">
    <h3>${esc(b.label)} — ${sh.kind === "ladder" ? "calibration set" : `set ${sh.s + 1}`}</h3>
    <div class="steppers">
      <div class="stepper"><span class="lbl">${b.load_mode === "added" ? "Added" : "Load"}</span>
        <button class="btn" data-a="sh-load" data-d="-5">−5</button><b>${esc(sh.load)}</b><button class="btn" data-a="sh-load" data-d="5">+5</button></div>
      <div class="stepper"><span class="lbl">Reps</span>
        <button class="btn" data-a="sh-reps" data-d="-1">−</button><b>${esc(sh.reps)}</b><button class="btn" data-a="sh-reps" data-d="1">+</button></div>
    </div>
    <p class="muted">RPE — ${sh.kind === "ladder" ? `stop the climb at ${esc(cap)}` : `today's cap ${esc(cap)}`} · 10 = nothing left, 8 = 2 more in the tank</p>
    <div class="rpes">${RPES.map((r) => `<button class="rpe ${sh.rpe === r ? "on" : ""} ${r > cap ? "hot" : ""}" data-a="sh-rpe" data-r="${r}">${r === 5 ? "≤5" : r}</button>`).join("")}</div>
    <label class="chip wide"><input type="checkbox" data-a="sh-slow" ${sh.slowed ? "checked" : ""}> A rep slowed (bar speed dropped)</label>
    <div class="sheet-foot"><button class="btn ghost" data-a="sh-cancel">Cancel</button>
      <button class="btn primary big" data-a="sh-save" ${sh.rpe == null ? "disabled" : ""}>Save set</button></div>
  </div>`;
};

function openSheet(bi, si, kind = "work") {
  const b = S.active.spec.blocks[bi];
  if (kind === "ladder") {
    const load = Number(b.state.ladderLoad ?? L.ladderNext(b.state.ladder.at(-1), b.calibrate.target_rpe, b.calibrate.jump)?.load ?? b.calibrate.start ?? 0);
    S.sheet = { type: "rpe", b: bi, s: null, kind, load: load || 0, reps: Number(String(b.calibrate.reps).split("–").pop()) || 5, rpe: null, slowed: false };
  } else {
    const w = b.work[si];
    S.sheet = { type: "rpe", b: bi, s: si, kind, load: w.load, reps: w.done ? w.reps : w.target_reps ?? w.reps, rpe: w.rpe ?? null, slowed: !!w.slowed, edit: !!w.done };
  }
  renderSheet();
}

function saveSheet() {
  const sh = S.sheet, b = S.active.spec.blocks[sh.b];
  const at = new Date().toISOString();
  if (sh.kind === "ladder") {
    b.state.ladder.push({ load: sh.load, reps: sh.reps, rpe: sh.rpe, slowed: sh.slowed, at });
    b.state.ladderLoad = null;
    S.sheet = null;
    const nxt = L.ladderNext(b.state.ladder.at(-1), b.calibrate.target_rpe, b.calibrate.jump);
    if (nxt?.done) b.state.ladderDone = true;
    startRest(Math.max(b.rest_s || 180, 180), nxt?.done ? nextUp() : `Next climb: ${L.loadText(nxt.load, b.load_mode)}`);
    save(); render();
    return;
  }
  const w = b.work[sh.s];
  const wasDone = w.done;
  if (!b.work.some((x) => x.done)) b.warmups.forEach((x) => { x.done = true; });   // working sets imply the ramp
  Object.assign(w, { load: sh.load, reps: sh.reps, rpe: sh.rpe, slowed: sh.slowed, done: true, skipped: false, at });
  S.sheet = null;
  if (!wasDone) {
    const res = L.afterWorkSet(b, b.state, { ...w, target_reps: w.target_reps }, policy());
    L.applyAdjustment(b.work, sh.s, res);
    if (res.reason) (b.state.adjustments ||= []).push({ after_set: sh.s + 1, level: res.level, reason: res.reason, to: res.newLoad });
    const nextLabel = nextUp();
    if (nextLabel) startRest(res.restS, nextLabel);
  }
  save(); render();
  scrollToCurrent();
}

// What's next in the session, for the rest bar.
function nextUp() {
  for (const b of S.active.spec.blocks) {
    if (b.type === "lift") {
      const i = currentWorkIdx(b);
      if (i >= 0) return `${b.label}: ${L.loadText(b.work[i].load, b.load_mode)} × ${b.work[i].target_reps ?? b.work[i].reps}`;
    } else if (b.type === "hold" && b.state.secs.some((x) => x == null)) return b.title;
    else if (b.type === "sets" && b.state.done.some((x) => !x)) return b.title;
    else if (b.type === "sequence" && !b.state.done) return b.title;
  }
  return "Finish";
}

function scrollToCurrent() {
  requestAnimationFrame(() => {
    const el = root.querySelector(".row.current");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

// ------------------------------------------------------------------ timers
function startRest(secs, next) {
  T.start({ kind: "rest", label: "Rest", next, mode: "down", secs });
}

function holdFlow(bi, si) {
  const b = S.active.spec.blocks[bi];
  T.start({ kind: "leadin", label: "Get set", mode: "down", secs: 3, onDone: () => {
    T.start({ kind: "hold", label: b.title, mode: "up", secs: b.target_s, max: b.max_s, sub: `Set ${si + 1} of ${b.sets}`,
      onStop: (elapsed) => {
        b.state.secs[si] = Math.round(elapsed);
        save(); render();
        const rest = b.rest_s ?? 60;
        if (!rest) return;                                   // mobility holds flow straight on
        if (b.state.secs.some((x) => x == null)) startRest(rest, `${b.title} — set ${si + 2}`);
        else startRest(rest, nextUp());
      } });
  } });
}

function sequenceFlow(bi) {
  const b = S.active.spec.blocks[bi];
  const segs = [{ label: "Get set", secs: 3, kind: "leadin" }];
  for (let r = 0; r < b.rounds; r++) {
    b.steps.forEach((st, j) => {
      segs.push({ label: st.label, secs: st.hold_s, kind: "hold", sub: `Round ${r + 1}/${b.rounds} · hold ${j + 1}/${b.steps.length}` });
      const last = r === b.rounds - 1 && j === b.steps.length - 1;
      if (!last) segs.push({ label: "Rest", secs: b.rest_s, kind: "rest", next: b.steps[(j + 1) % b.steps.length].label });
    });
  }
  let k = 0;
  const run = () => {
    if (k >= segs.length) { b.state.done = true; save(); render(); return; }
    const sg = segs[k++];
    T.start({ ...sg, mode: "down", seq: true, onDone: run });
  };
  run();
}

// The bar's buttons are built once per timer and only the clock text changes
// per tick — rebuilding them 5×/s would eat taps.
let barFor = null;
export function renderTimer(st) {
  const s = st || T.state();
  if (!s) {
    barFor = null;
    bar.className = "timerbar"; bar.innerHTML = ""; document.body.classList.remove("holding");
    return;
  }
  document.body.classList.toggle("holding", s.kind === "hold" || s.kind === "leadin");
  const id = `${s.startAt}:${s.secs}`;
  if (barFor !== id) {
    barFor = id;
    const btns = s.mode === "up" ? `<button class="btn primary big" data-a="t-stop">Done</button>`
      : s.kind === "leadin" ? `<button class="btn primary big" data-a="t-go">Go now</button><button class="btn sm ghost" data-a="t-skip">Cancel</button>`
      : `${s.kind === "rest" && !s.seq ? `<button class="btn sm" data-a="t-adj" data-d="-30">−30</button><button class="btn sm" data-a="t-adj" data-d="30">+30</button>` : ""}
         <button class="btn sm" data-a="t-skip">${s.seq ? "Stop" : "Skip"}</button>`;
    const nxt = s.mode === "down" ? (s.next ? `Next: ${esc(s.next)}` : "")
      : `Target ${s.secs}${s.max ? `–${s.max}` : ""} s — tap Done when you let go`;
    bar.innerHTML = `<div class="t-main"><span class="t-label">${esc(s.label)}${s.sub ? ` · ${esc(s.sub)}` : ""}</span>
      <span class="t-clock"></span><div class="t-prog"><i></i>${s.mode === "up" && s.max ? `<b style="left:${(s.secs / s.max) * 100}%"></b>` : ""}</div>
      ${nxt ? `<span class="t-next">${nxt}</span>` : ""}</div><div class="t-btns">${btns}</div>`;
  }
  const frac = s.mode === "down" ? 1 - Math.max(0, s.remaining ?? s.secs) / (s.secs || 1)
    : Math.min(1, s.elapsed / (s.max || s.secs || 1));
  bar.querySelector(".t-prog i").style.width = `${Math.round(frac * 1000) / 10}%`;
  let clock, zone = "";
  if (s.mode === "down") {
    clock = L.fmtClock(Math.max(0, s.remaining ?? s.secs));
  } else {
    clock = L.fmtClock(s.elapsed);
    zone = s.elapsed >= (s.max || Infinity) ? "max" : s.elapsed >= s.secs ? "target" : "";
  }
  bar.className = `timerbar show ${s.mode === "up" ? "hold" : s.kind} ${zone}`;
  bar.querySelector(".t-clock").textContent = clock;
}

T.onChange((c, st) => renderTimer(st));
setInterval(() => {
  const el = document.getElementById("elapsed");
  if (el && S.active) el.textContent = elapsedText();
}, 1000);


// ------------------------------------------------------------------ actions
Object.assign(A, {
  open(d) {
    const spec = S.plan?.sessions?.[d.k] || S.plan?.routines?.[d.k];
    if (!spec) return;
    if (S.active && S.active.key !== d.k && !confirm(`Abandon the in-progress ${S.active.spec.title}? (Finish it first to keep it.)`)) return;
    if (!S.active || S.active.key !== d.k) S.active = L.startSession(spec, today());
    save(); S.view = "session"; render(); T.keepAwake(true);
  },
  sets(d) {
    const n = Number(d.n);
    const spec = S.plan.sessions[S.active.key];
    const keepNotes = S.active.spec.blocks.map((b) => b.state?.note);
    const checklists = S.active.spec.blocks.map((b) => b.items?.map((x) => x.done));
    S.active = { ...L.startSession(spec, today(), n), started: S.active.started, note: S.active.note };
    S.active.spec.blocks.forEach((b, i) => {
      if (b.state && keepNotes[i]) b.state.note = keepNotes[i];
      if (b.items && checklists[i]) b.items.forEach((x, j) => { x.done = checklists[i][j]; });
    });
    save(); render();
  },
  check(d) { const it = S.active.spec.blocks[d.b].items[d.s]; it.done = !it.done; save(); render(); },
  itemtimer(d) {
    const it = S.active.spec.blocks[d.b].items[d.s];
    T.start({ kind: "rest", label: it.text, mode: "down", secs: it.timer_s, onDone: () => { it.done = true; save(); render(); } });
  },
  wu(d) { const w = S.active.spec.blocks[d.b].warmups[d.s]; w.done = !w.done; save(); render(); },
  log(d) { openSheet(Number(d.b), Number(d.s)); },
  editset(d) {
    const w = S.active.spec.blocks[d.b].work[d.s];
    if (w.skipped) { w.skipped = false; save(); render(); return; }
    openSheet(Number(d.b), Number(d.s));
  },
  "sh-load"(d) { S.sheet.load = Math.max(0, S.sheet.load + Number(d.d)); renderSheet(); },
  "sh-reps"(d) { S.sheet.reps = Math.max(0, S.sheet.reps + Number(d.d)); renderSheet(); },
  "sh-rpe"(d) { S.sheet.rpe = Number(d.r); renderSheet(); },
  "sh-cancel"() { S.sheet = null; renderSheet(); },
  "sh-save"() { if (S.sheet.rpe != null) saveSheet(); },
  ladstep(d) {
    const b = S.active.spec.blocks[d.b];
    const cur = Number(root.querySelector(`input[data-a="ladload"][data-b="${d.b}"]`)?.value) || 0;
    b.state.ladderLoad = Math.max(0, cur + Number(d.d)); save(); render();
  },
  ladlog(d) {
    const b = S.active.spec.blocks[d.b];
    const v = Number(root.querySelector(`input[data-a="ladload"][data-b="${d.b}"]`)?.value);
    if (Number.isFinite(v)) b.state.ladderLoad = v;
    openSheet(Number(d.b), null, "ladder");
  },
  laddone(d) { S.active.spec.blocks[d.b].state.ladderDone = true; save(); render(); },
  backoff(d) {
    const b = S.active.spec.blocks[d.b], c = b.calibrate;
    const top = L.ladderTop(b.state.ladder, c.target_rpe);
    const load = L.r5(top.load * c.backoff_pct);
    b.work = Array.from({ length: c.backoff_sets }, () => ({ load, reps: c.backoff_reps, target_reps: c.backoff_reps, done: false }));
    save(); render(); scrollToCurrent();
  },
  hold(d) { holdFlow(Number(d.b), Number(d.s)); },
  setdone(d) {
    const b = S.active.spec.blocks[d.b];
    b.state.done[d.s] = !b.state.done[d.s];
    save(); render();
    if (b.state.done[d.s]) startRest(b.rest_s || 60, b.state.done.every(Boolean) ? nextUp() : `${b.title} — set ${Number(d.s) + 2}`);
  },
  seq(d) { sequenceFlow(Number(d.b)); },
  "t-adj"(d) { T.adjust(Number(d.d)); },
  "t-skip"() { T.stop(false); },
  "t-go"() { T.adjust(-3600); },
  "t-stop"() { T.stop(true); },
  finish() { S.view = "finish"; render(); },
  back() { S.view = "session"; render(); },
  async commit() {
    const a = S.active;
    const done = doneLog();
    let id = `${a.date}-${a.key}`;
    for (let n = 2; done[id]; n++) id = `${a.date}-${a.key}-${n}`;
    const log = L.buildLog(a, id);
    store.set("queue", [...queue(), log]);
    done[id] = { key: a.key, date: a.date };
    store.set("done", done);
    S.active = null; save();
    T.stop(false); T.keepAwake(false);
    S.view = null; S.tab = "train";
    S.syncMsg = "Saving…";
    render();
    await flushAll();
  },
  discard() {
    if (!confirm("Discard this session? Nothing will be saved.")) return;
    S.active = null; save(); T.stop(false); T.keepAwake(false); S.view = null; render();
  },
});

Object.assign(INPUTS, {
  note(el) { S.active.spec.blocks[el.dataset.b].state.note = el.value; save(); },
  snote(el) { S.active.note = el.value; save(); },
  holdload(el) { S.active.spec.blocks[el.dataset.b].state.load = Number(el.value) || null; save(); },
  setsload(el) { S.active.spec.blocks[el.dataset.b].state.load = Number(el.value) || null; save(); },
  ladload(el) { S.active.spec.blocks[el.dataset.b].state.ladderLoad = Number(el.value); save(); },
  "sh-slow"(el) { S.sheet.slowed = el.checked; },
});

// ------------------------------------------------------------------ the tab
export function viewTrain() {
  const p = S.plan;
  if (!p) return "";
  const sessions = p.sessions || {};
  const t = p.today && p.today.date === today() ? p.today : null;
  let html = "";
  if (S.active) {
    html += `<section class="card resume"><h2>In progress: ${esc(S.active.spec.title)}</h2>
      <button class="btn primary big" data-a="resume">Resume</button></section>`;
  }
  if (t) {
    const runnable = (t.sessions || []).filter((k) => sessions[k]);
    html += `<section class="card today"><h2>Today · ${esc(t.weekday)}</h2>
      ${t.deviation ? `<p class="warn-text">${esc(t.deviation)}</p>` : ""}
      ${runnable.map((k) => sessionButton(sessions[k], true)).join("") || `<p class="muted">No lifting session scheduled today.</p>`}
      <details><summary>Today's full training plan</summary><ul class="plain">${(t.items || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>
    </section>`;
  }
  const day = fuelDay(today());
  html += matCard(day) + mobilityCard();
  const keys = Object.keys(sessions).sort((x, y) => sessions[x].date.localeCompare(sessions[y].date));
  if (keys.length) html += `<section class="card"><h2>This week</h2>${keys.map((k) => sessionButton(sessions[k], false)).join("")}</section>`;
  const changes = (p.tm_changes || []).slice(-5).reverse();
  if (changes.length) {
    html += `<section class="card"><h2>Recent TM changes</h2><ul class="plain">${changes.map((c) =>
      `<li><b>${esc(label(c.lift))}</b> ${esc(c.from ?? "—")} → ${esc(c.to ?? "—")} <span class="muted">(${esc(c.reason)} · ${esc(L.fmtDate(c.date))})</span></li>`).join("")}</ul>
      <p class="muted small">Reply "undo &lt;lift&gt;" to the briefing to revert one.</p></section>`;
  }
  html += `<section class="card"><h2>Training maxes</h2><ul class="tms">${Object.entries(p.tms || {}).filter(([, v]) => v).map(([k, v]) =>
    `<li><span>${esc(label(k))}</span><b>${esc(v)}${(p.provisional || []).includes(k) ? " <i class=\"badge\">provisional</i>" : ""}</b></li>`).join("")}</ul>
    <p class="muted small">Bodyweight ${esc(p.bodyweight_lb ?? "—")} lb — pull-up loads follow it.</p></section>`;
  return html;
}

Object.assign(A, {
  resume() { S.view = "session"; render(); scrollToCurrent(); T.keepAwake(true); },
});
