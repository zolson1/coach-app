// Pure session logic — no DOM, no storage. Runs in the browser and in node tests.
// The numbers (RPE caps, cuts, rest) come from plan.policy, which the coach repo
// owns (coach/autoreg.py); this file only executes them.

export const DEFAULT_PLATES = [45, 35, 25, 10, 5, 2.5];

export const r5 = (x) => Math.floor(x / 5 + 0.5) * 5;

export function barWeight(implement, settings) {
  if (implement === "trap_bar") return Number(settings.trapBar) || 45;
  if (implement === "pullup") return 0;
  return Number(settings.barbell) || 45;
}

// Plates per side for a bar load, greedy from the heaviest available plate.
export function plates(total, bar, available = DEFAULT_PLATES) {
  if (!(total > bar)) return { perSide: [], remainder: 0 };
  let side = (total - bar) / 2;
  const out = [];
  for (const p of [...available].sort((a, b) => b - a)) {
    while (side + 1e-9 >= p) {
      out.push(p);
      side -= p;
    }
  }
  return { perSide: out, remainder: Math.round(side * 2 * 10) / 10 };
}

export function platesText(total, implement, settings) {
  if (implement === "pullup") return total > 0 ? `+${total} on the belt` : "bodyweight";
  const bar = barWeight(implement, settings);
  if (total <= bar) return "empty bar";
  const { perSide, remainder } = plates(total, bar, settings.plates || DEFAULT_PLATES);
  const txt = perSide.length ? perSide.join(" + ") + " / side" : "empty bar";
  return remainder ? `${txt} (${remainder} lb short)` : txt;
}

export function loadText(load, loadMode) {
  if (loadMode === "added") return load > 0 ? `+${load} lb` : "BW";
  return `${load} lb`;
}

export function capFor(block, policy) {
  return block.rpe_cap ?? policy?.rpe_cap?.["1"] ?? 7;
}

export function isGrind(entry, policy) {
  return !!entry.slowed || (entry.rpe ?? 0) >= (policy?.grind_rpe ?? 9) ||
    (entry.target_reps != null && entry.reps < entry.target_reps);
}

function cut(load, pct) {
  let n = r5(load * (1 - pct));
  if (n >= load) n = load - 5;
  return Math.max(0, n);
}

// After a WORK set is logged: the in-session autoregulation rules.
// Returns { newLoad|null, endLift, skipOptional, restS, reason|null, level }.
export function afterWorkSet(block, liftState, entry, policy) {
  const cap = capFor(block, policy);
  const rest = policy?.rest_s || {};
  const baseRest = block.rest_s || rest.main || 180;
  const res = { newLoad: null, endLift: false, skipOptional: false, restS: baseRest, reason: null, level: "ok" };
  if (block.speed_rule === "end" && isGrind(entry, policy)) {      // Breacher: speed is the metric
    res.endLift = true;
    res.level = "stop";
    res.reason = "Speed dropped — that's this exercise done for today. Grinding past it is counter-productive for power: move on.";
    res.skipReason = "ended — speed dropped";
    return res;
  }
  if (isGrind(entry, policy)) {
    liftState.grinds = (liftState.grinds || 0) + 1;
    res.restS = Math.max(baseRest, rest.over_cap || 240);
    res.skipOptional = true;
    if (liftState.grinds >= (policy?.max_grinds ?? 2)) {
      res.endLift = true;
      res.level = "stop";
      res.reason = "Second grind — this lift is done for today. That's the rule, not a failure: log it and move on.";
    } else {
      res.newLoad = cut(entry.load, policy?.big_cut ?? 0.1);
      res.level = "cut";
      res.reason = `That set was a grind${entry.slowed ? " (rep slowed)" : ""} → the rest drop to ${res.newLoad}. One more grind ends the lift.`;
    }
  } else if (entry.rpe != null && entry.rpe > cap) {
    res.newLoad = cut(entry.load, policy?.small_cut ?? 0.05);
    res.restS = Math.max(baseRest, rest.over_cap || 240);
    res.skipOptional = true;
    res.level = "cut";
    res.reason = `RPE ${entry.rpe} is over today's ${cap} cap → the rest drop to ${res.newLoad}.`;
  }
  return res;
}

// Apply an afterWorkSet result to the remaining sets of a lift (mutates sets).
export function applyAdjustment(sets, fromIdx, res) {
  for (let i = fromIdx + 1; i < sets.length; i++) {
    const s = sets[i];
    if (s.done || s.skipped) continue;
    if (res.endLift) { s.skipped = true; s.skipReason = res.skipReason || "ended — second grind"; continue; }
    if (s.optional && res.skipOptional) { s.skipped = true; s.skipReason = "only if the last set was fast"; continue; }
    if (res.newLoad != null) { s.from = s.from ?? s.load; s.load = res.newLoad; }
  }
}

// Calibration ladder: suggest the next load given the last logged ladder set.
export function ladderNext(last, target, jump) {
  if (!last) return null;
  if (last.slowed || (last.rpe ?? 0) >= target) return { done: true };
  const gap = target - (last.rpe ?? 0);
  const step = gap >= 1.5 ? jump : Math.max(5, r5(jump / 2));
  return { done: false, load: last.load + step };
}

// Top set of a ladder = the heaviest set logged at or under target + 1 RPE.
export function ladderTop(sets, target) {
  const ok = sets.filter((s) => s.rpe != null && s.rpe >= 7 && s.rpe <= target + 1.5);
  if (!ok.length) return null;
  return ok.reduce((a, b) => (e1rm(b.load, b.reps, b.rpe) > e1rm(a.load, a.reps, a.rpe) ? b : a));
}

export const e1rm = (load, reps, rpe) => load * (1 + 0.0333 * (reps + (10 - (rpe ?? 10))));

export function historyText(entries) {
  if (!entries || !entries.length) return null;
  const h = entries[0];
  const work = h.sets.filter((s) => (s.set_type || "work") === "work");
  const sets = work.length ? work : h.sets;
  const loads = [...new Set(sets.map((s) => s.added ?? s.weight))];
  const rpes = sets.map((s) => s.rpe).filter((x) => x != null);
  const rpe = rpes.length ? `, RPE ${Math.min(...rpes)}${Math.max(...rpes) !== Math.min(...rpes) ? "–" + Math.max(...rpes) : ""}` : "";
  const reps = [...new Set(sets.map((s) => s.reps))].join("/");
  return `${fmtDate(h.date)}: ${sets.length} × ${reps} @ ${loads.join("/")} lb${rpe}`;
}

export function fmtDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function fmtClock(s) {
  const neg = s < 0;
  s = Math.abs(Math.round(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${neg ? "-" : ""}${m}:${String(r).padStart(2, "0")}`;
}

export function localISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00");
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return localISO(d);
}

// A fresh runnable copy of a session spec, with per-set state.
export function startSession(spec, today, setsChoice) {
  const s = JSON.parse(JSON.stringify(spec));
  const sets = setsChoice || s.sets;
  for (const b of s.blocks) {
    if (b.type === "lift") {
      b.state = { grinds: 0, note: "", ladder: [], ladderDone: false };
      if (spec.kind === "strength" && b.work.length && sets && b.work.length !== sets) {
        const tmpl = b.work[0];
        b.work = Array.from({ length: sets }, () => ({ ...tmpl }));
      }
      b.work.forEach((w) => { w.done = false; w.target_reps = w.reps; });
      b.warmups.forEach((w) => { w.done = false; });
    } else if (b.type === "hold") {
      b.state = { secs: Array(b.sets).fill(null), load: b.load ?? null };
    } else if (b.type === "sets") {
      b.state = { done: Array(b.sets).fill(false), load: b.load ?? null };
    } else if (b.type === "checklist") {
      b.items.forEach((i) => { i.done = false; });
    } else if (b.type === "sequence") {
      b.state = { done: false };
    }
  }
  return { spec: s, key: spec.key, date: today, started: new Date().toISOString(), setsChoice: sets, note: "" };
}

export function sessionStatus(active) {
  for (const b of active.spec.blocks) {
    if (b.type !== "lift") continue;
    if (b.work.some((w) => !w.done && !w.skipped && !w.optional)) return "partial";
    if (b.calibrate?.kind === "no_tm" && !b.state.ladder.length) return "partial";
  }
  return "done";
}

export function buildLog(active, id) {
  const s = active.spec;
  const lifts = [], holds = [], setsItems = [], sequences = [];
  for (const b of s.blocks) {
    if (b.type === "lift") {
      const isSingle = b.id.startsWith("single_") || b.log_as === "single";      // heavy singles, Breacher primers
      const sets = [];
      b.warmups.filter((w) => w.done).forEach((w) => sets.push({ type: "warmup", load: w.load ?? 0, reps: w.reps }));
      const ladder = b.state.ladder.map((l) => ({ type: "calibration", load: l.load, reps: l.reps, rpe: l.rpe, slowed: !!l.slowed, at: l.at }));
      const work = b.work.filter((w) => w.done).map((w) => ({ type: isSingle ? "single" : "work", load: w.load, reps: w.reps,
        target_reps: w.target_reps, rpe: w.rpe ?? null, slowed: !!w.slowed, at: w.at }));
      // in the order he did them: a no-TM ladder comes before its back-off sets, a provisional check after the work
      sets.push(...(b.calibrate?.kind === "no_tm" ? [...ladder, ...work] : [...work, ...ladder]));
      if (!sets.length && !b.state.note) continue;
      lifts.push({ lift: b.lift, block_id: b.id, tm: b.tm, pct: b.pct, cap: isSingle ? null : b.rpe_cap,
        load_mode: b.load_mode, bodyweight: b.bodyweight, sets,
        adjustments: b.state.adjustments || [], ended_early: b.work.some((w) => w.skipReason?.startsWith("ended")),
        note: b.state.note || null });
    } else if (b.type === "hold") {
      const secs = b.state.secs.filter((x) => x != null);
      if (secs.length) holds.push({ id: b.id, track: b.track || null, load: b.state.load, load_label: b.load_label || null, sets_s: secs });
    } else if (b.type === "sets") {
      const n = b.state.done.filter(Boolean).length;
      if (n) setsItems.push({ id: b.id, done: n, of: b.sets, load: b.state.load, track: b.track || null });
      if (n && b.track && b.state.load) holds.push({ id: b.id, track: b.track, load: b.state.load, sets_s: [] });
    } else if (b.type === "sequence") {
      sequences.push({ id: b.id, done: !!b.state.done });
    }
  }
  return {
    v: 1, id, key: s.key, kind: s.kind, which: s.which || null, date: active.date,
    scheduled_date: s.date, block: s.block, week: s.week, block_key: s.block_key, deload: s.deload,
    adjustment_week: s.adjustment_week, started: active.started, finished: new Date().toISOString(),
    status: sessionStatus(active), sets_planned: active.setsChoice || null,
    lifts, holds, sets_items: setsItems, sequences, note: active.note || null,
  };
}
