// The day as one timeline, live. The coach builds the IDEAL day (coach/timeline.py:
// meals and training interleaved by the fuel plan's Part 4 clock and Part 6
// session-fueling rules). This re-times and rebalances it from what he logs:
//
//  · anything not logged is assumed done as planned (once its time has passed);
//  · a meal eaten late, a lift moved, a class skipped → everything after it is
//    re-placed by the same gap rules (meal 2–4 h before a lift, next meal within
//    2 h of training, dinner 2½ h before lights out, training done 3 h before…);
//  · a replacement meal or an extra → the rest of the day is rebalanced the way
//    the plan's Part 12 says: protein topped up to the floor, carbs kept around
//    training, trims only away from training and never more than 2 carb portions.
//
// Pure — no DOM, no store. The screens call liveDay(day, ctx).

export const DEFAULT_RULES = {
  meal_gap: 180, meal_gap_min: 150, snack_gap: 90, lift_after_meal: 120, lift_after_snack: 45,
  lift_ideal_after_meal: 150, lic_after_meal: 75, class_after_meal: 180, eat_after_session: 120,
  recovery_after_mat: 15, dinner_before_lights: 150, pre_sleep_before_lights: 60, train_before_lights: 180,
  train_before_work: 90, eat_before_work: 60, round: 15,
};
const PORTION = { kcal: 200, carbs: 48 };                 // one carb portion (the plan's unit)
const EATING = new Set(["meal", "snack", "during", "extra"]);
const MACROS = ["kcal", "protein", "carbs", "fat"];

export const toMin = (s) => {
  const m = /(\d{1,2}):(\d{2})/.exec(String(s ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const hm = (m) => {
  if (m == null) return "";
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const up = (m, r) => Math.ceil(m / r) * r;
const down = (m, r) => Math.floor(m / r) * r;

function macrosOf(x) {
  return Object.fromEntries(MACROS.map((k) => [k, Number(x?.[k]) || 0]));
}
function add(a, b, sign = 1) {
  for (const k of MACROS) a[k] = (a[k] || 0) + sign * (Number(b?.[k]) || 0);
  return a;
}

// ------------------------------------------------------------------ apply logs
function applyLogs(items, day, ctx) {
  const log = day.log || {};
  const sess = day.session_log || {};
  const mat = day.mat_log || {};
  for (const it of items) {
    it.ideal = it.t;
    it.eff = macrosOf(it);                               // what this item counts for
    if (EATING.has(it.kind) && it.slot && log[it.slot]) {
      const e = log[it.slot];
      const at = toMin(e.ate_at);                         // when he ate it; none = as planned
      if (e.status === "skipped") { it.status = "skipped"; it.eff = macrosOf({}); }
      else if (e.status === "eaten") { it.status = "done"; if (at != null) it.t = at; }
      else if (e.status === "swapped" && e.swap) {
        it.status = "done"; it.swapped = true; it.eff = macrosOf(e.swap);
        it.label = e.swap.title || e.swap.what; if (at != null) it.t = at;
        it.estimated = !!e.swap.estimated;
      }
    }
    if (it.kind === "train") {
      const s = it.train === "mat" ? mat[it.session.replace(/^mat_/, "")] : sess[it.session];
      if (s?.status === "skipped") it.status = "skipped";
      else if (s?.status === "done" || s?.status === "drilled") {
        it.status = "done";
        const at = toMin(s.at ?? s.class?.start);
        if (at != null) { const dur = (it.end ?? it.t) - it.t; it.t = at; it.end = at + dur; }
      } else if (s?.status === "moved" || (s?.status === "swapped" && s.class?.start)) {
        const at = toMin(s.at ?? s.class?.start);
        if (at != null) {
          const dur = s.class?.end ? toMin(s.class.end) - at : (it.end ?? it.t) - it.t;
          it.t = at; it.end = at + dur; it.fixed = true; it.moved_by_you = true;
        }
      }
    }
  }
  for (const [i, x] of (day.off_card || []).entries()) {            // extras on top of the card
    const kcal = Number(x.kcal) || (x.kind === "drinks" ? 130 * (x.drinks || 1) : x.kind === "both" ? 500 + 130 * (x.drinks || 1) : 500);
    items.push({ id: `extra${i}`, kind: "extra", label: x.text, t: toMin(x.ate_at), status: "done", extra: true,
      eff: { kcal, protein: Number(x.protein) || (x.kind === "drinks" ? 0 : 25), carbs: Number(x.carbs) || 0, fat: Number(x.fat) || 0 },
      meal: kcal >= 400 && x.kind !== "drinks" });
  }
}

// ------------------------------------------------------------------ work
// Report and relief (mirrors coach/work.py): home station 03:30 / 15:30, a detail
// 05:30 / 17:30, late relief at the official 07:00 / 19:00 change or later.
const EARLY = { home: 210, detail: 90 };
const CHANGE = { day: 420, night: 1140 };
const SPANS = { SHIFT: ["day", "day", 1], "OT-DAY": ["day", "night", 0], "OT-NIGHT": ["night", "day", 1] };

// A block recomputed from its type and what he's set — so a change shows at once.
export function workBlock(b) {
  const span = b && SPANS[b.type];
  if (!span) return b || null;
  const set = b.set || {};
  const where = set.where || b.where || "home";
  const [start, end, off] = span;
  const o = b.offset || 0;
  const day = 1440 * off;
  const report = (set.report ? toMin(set.report) : CHANGE[start] - EARLY[where]) + o;
  const nominal = CHANGE[end] + day + o;
  const planned = CHANGE[end] + day - EARLY[where] + o;          // the early relief his station usually gives
  const relief = set.relief ? toMin(set.relief) + day + o : planned;
  const late = relief < nominal ? nominal : relief + 120;
  const actual = set.relieved_at ? toMin(set.relieved_at) + day + o : null;
  return { ...b, where, report, relief, planned, nominal, late, actual };
}
export const earlyLights = (reportNext) => reportNext + 1440 - (reportNext < 300 ? 450 : 480);

// Apply the day's work blocks: the work rows, tonight's lights out before a dawn
// report, the relief morning's wake, and what a late relief does to the day.
function applyWork(items, day, tl, R) {
  const w = day.work || {};
  const today = w.today ? workBlock(w.today) : null;
  const relief = w.relief ? workBlock(w.relief) : null;
  const tom = w.tomorrow ? workBlock(w.tomorrow) : null;
  const station = R.station_alt || {};
  const where = (b) => (b.where === "home" ? "home station" : "detail");
  let lights = tl.lights;
  let work = tl.work;
  if (tom && ["SHIFT", "OT-DAY"].includes(tom.type) && !(today && ["SHIFT", "OT-NIGHT"].includes(today.type))) {
    lights = earlyLights(tom.report - 1440);
  }
  const blocks = [];
  for (const [id, b] of [["relief", relief], ["work", today]]) {
    if (!b) continue;
    const eff = b.actual ?? b.relief;
    blocks.push({ ...b, eff });
    const it = items.find((x) => x.kind === "work" && x.id === id);
    if (!it) continue;
    it.t = Math.max(0, b.report); it.end = eff; it.relief = b.relief; it.late = b.late; it.actual = b.actual;
    it.where = b.where; it.block = b.date;
    it.label = id === "relief"
      ? (b.actual != null ? `Relieved ${hm(b.actual)} (${where(b)})` : `On duty (${where(b)}) — relief ≈${hm(b.relief)}`)
      : `Report — ${where(b)} · ${b.actual != null ? `relieved ${hm(b.actual)}` : `relief ≈${hm(b.relief)}${b.relief >= 1440 ? " tomorrow" : ""}`}`;
    it.why = b.actual != null || b.relief >= 1440 + 360 ? null : `late relief: ${hm(b.late)} or later — the plan has a fallback`;
    if (id === "work") work = [b.report, eff];
  }
  // the relief morning: relieved before 06:00 = home to a second sleep; later = straight into the day
  if (relief) {
    const r = relief.actual ?? relief.relief;
    const eat = r <= 360 ? Math.max(450, r + 240) + 15 : up(r + 30, R.round || 15);   // after a second sleep / when home
    for (const it of items) {
      if (!it.status && /waking/i.test(it.planned_time || "") && EATING.has(it.kind) && it.t !== eat) {
        it.t = eat;
        if (r > 360) it.why = "relieved late — no second sleep, eat when you're home";
      }
    }
  }
  // inside a work window and planned for after the expected relief → at work now (late relief)
  for (const b of blocks) {
    if (b.eff <= b.planned || b.planned >= 1440 + 360) continue;        // on time (or a next-day relief)
    for (const it of items) {
      if (it.status || it.t == null || it.t < b.planned || it.t >= b.eff + 30) continue;
      if (EATING.has(it.kind) && it.slot && it.kind !== "during") {
        it.at_work = true;
        it.work_note = it.late || station[it.slot] || R.station_snack || "Still at the station: the Core Power from your kit.";
      } else if (it.kind === "train" && it.train !== "mat") {
        it.after_work = b.eff + 30;
      } else if (it.kind === "train") {
        it.at_work = true;
        it.work_note = "Relieved late — this class is out; the mat card has the swaps.";
      }
    }
  }
  return { ...tl, lights, work, blocks };
}

// ------------------------------------------------------------------ re-time
function retime(items, tl, ctx, R) {
  const now = ctx.now;
  const lights = tl.lights;
  const work = tl.work;
  const eveningWork = work && !tl.station && work[0] > 720 ? work[0] : null;
  const trainCut = Math.min(lights - R.train_before_lights, eveningWork != null ? eveningWork - R.train_before_work : Infinity);
  // Not logged and its time has passed → assumed done as planned — unless something
  // planned BEFORE it was logged as happening AFTER its time (a late lunch carries the
  // lift that follows it along: the plan's order holds).
  const late = items.filter((i) => i.status === "done" && i.ideal != null && i.t != null && i.t > i.ideal);
  for (const it of items) {
    if (it.status || it.t == null) continue;
    const carried = it.kind !== "sleep" && it.kind !== "work" && late.some((l) => l.ideal < it.ideal && l.t >= it.ideal);
    if (carried) { it.carried = true; continue; }
    const end = it.end ?? it.t;
    if (end <= now) it.status = "past";
    else if ((it.kind === "train" || it.kind === "work") && it.t <= now) it.status = "now";
  }
  const happened = items.filter((i) => ["done", "past", "now"].includes(i.status) && i.t != null);
  let lastMeal = Math.max(-Infinity, ...happened.filter((i) => i.kind === "meal" || (i.extra && i.meal)).map((i) => i.t));
  let lastEat = Math.max(-Infinity, ...happened.filter((i) => ["meal", "snack", "extra"].includes(i.kind)).map((i) => i.t));
  let lastTrain = Math.max(-Infinity, ...happened.filter((i) => i.kind === "train").map((i) => i.end ?? i.t));
  const mealT = () => lastMeal;
  const future = items.filter((i) => !i.status && i.t != null && !i.rel && i.kind !== "cue").sort((a, b) => a.t - b.t);
  let cursor = now;
  const windows = items.filter((i) => i.kind === "train" && ["done", "now"].includes(i.status)).map((i) => [i.t, i.end ?? i.t]);
  const clear = (t) => {                                          // no eating inside a session
    for (const [s, e] of windows) if (t >= s && t < e) return up(e + 15, R.round);
    return t;
  };
  for (const it of future) {
    if (it.kind === "train" && (it.fixed || it.train === "mat")) {
      if (it.train === "mat" && mealT() > it.t - R.class_after_meal && mealT() > it.t - 600) {
        it.notes = [...(it.notes || []), `A full meal ${it.t - mealT()} min before class — go easy early, and skip the top-up.`];
      }
      lastTrain = Math.max(lastTrain, it.end ?? it.t);
      windows.push([it.t, it.end ?? it.t]);
      continue;
    }
    if (it.kind === "work" || it.kind === "sleep") continue;
    if (it.kind === "train") {                                   // a flexible session
      const dur = (it.end ?? it.t) - it.t;
      let earliest = cursor;
      if (it.train === "lift") {
        earliest = Math.max(earliest, mealT() + R.lift_after_meal);
        if (lastEat > mealT()) earliest = Math.max(earliest, lastEat + R.lift_after_snack);
      } else if (it.train === "lic") earliest = Math.max(earliest, mealT() + R.lic_after_meal);
      earliest = Math.max(earliest, lastTrain + 15);
      if (it.after_work) { earliest = Math.max(earliest, it.after_work); it.why = "after relief — you're still at work"; }
      const t = Math.max(it.t, up(earliest, R.round));
      if (t + dur > trainCut) {
        const latest = down(trainCut - dur, R.round);
        const settle = it.train === "lift" ? 60 : it.train === "lic" ? 45 : 0;   // the least a squeezed slot can give
        if (latest >= cursor && latest >= mealT() + settle && !(it.after_work && latest < it.after_work)) {
          it.t = latest; it.end = latest + dur; it.tight = true;
          it.why = `start by ${hm(latest)} to be done ${eveningWork != null && trainCut === eveningWork - R.train_before_work ? "before work" : "3 h before lights out"} — keep the meal before it small`;
        } else {
          it.status = "squeezed";
          it.why = it.after_work ? `relieved too late for it to finish ${trainCut === lights - R.train_before_lights ? "3 h before lights out" : "in time"} — it's off today`
            : it.train === "lift" ? "no room left today — the priority stack says the Domain Day moves first; Zone 2 is the fallback"
            : "no room left before the evening cutoff";
        }
      } else {
        if (t !== it.t) it.why = it.train === "lift" ? `${R.lift_after_meal / 60} h after your last meal` : "after your last meal settles";
        it.t = t; it.end = t + dur;
      }
      if (it.status !== "squeezed") { lastTrain = it.end; windows.push([it.t, it.end]); }
      continue;
    }
    // eating
    const dinnerBy = Math.min(lights - R.dinner_before_lights, eveningWork != null ? eveningWork - R.eat_before_work : Infinity);
    let earliest = cursor;
    if (it.slot === "recovery" || it.slot === "during") {
      earliest = Math.max(earliest, it.slot === "during" ? it.t : Math.min(it.t, lastTrain + R.recovery_after_mat));
    } else {
      if (it.kind === "meal") earliest = Math.max(earliest, mealT() + R.meal_gap_min, lastEat + R.snack_gap);
      else earliest = Math.max(earliest, lastEat + R.snack_gap);
    }
    const t0 = Math.max(it.t, up(earliest, R.round));
    let t = it.slot === "during" ? it.t : clear(t0);
    if (t !== t0) it.why = "after the session — not in the middle of it";
    // the first eating after training comes within 2 h of it
    if (lastTrain > lastEat && t > lastTrain + R.eat_after_session && it.kind === "snack" && it.slot !== "pre_sleep") {
      t = Math.max(up(lastTrain + 30, R.round), up(cursor, R.round)); it.why = "within 2 h of training";
    }
    // a snack right before a lift he's pinned goes after it instead
    const lift = future.find((x) => x.kind === "train" && x.train === "lift" && !x.status && x.t >= t);
    if (it.kind === "snack" && it.slot !== "pre_sleep" && lift && (lift.fixed || lift.moved_by_you) && lift.t - t < R.lift_after_snack) {
      t = up((lift.end ?? lift.t) + 15, R.round); it.why = "after the lift — it was too close before it";
    }
    const deadline = it.slot === "dinner" ? dinnerBy : it.slot === "pre_sleep" ? lights - R.pre_sleep_before_lights : Infinity;
    if (t > deadline) {
      if (it.slot === "pre_sleep" && deadline - lastEat < 75) { it.status = "fold"; it.why = "too close to your last meal — fold it into that meal"; continue; }
      t = down(deadline, R.round);
      it.why = it.slot === "dinner" ? (eveningWork != null && dinnerBy < lights - R.dinner_before_lights ? "before you clock in" : "2½ h before lights out") + " — a short gap, so keep it lighter"
        : "an hour before lights out";
    }
    if (t !== it.t && !it.why) {
      const prev = items.find((i) => i.t === lastEat && EATING.has(i.kind));
      it.why = prev ? `${it.kind === "meal" ? "2½+" : "1½"} h after ${prev.swapped || prev.extra ? "what you ate" : "your last meal"}` : "spacing";
    }
    it.t = t;
    lastEat = t;
    if (it.kind === "meal") lastMeal = t;
    cursor = Math.max(cursor, t);
  }
  // things tied to a session follow it: the pre-lift snack, the tendon shot, a recovery shake
  for (const it of items.filter((i) => i.rel && !i.status)) {
    const s = items.find((x) => x.id === it.rel);
    if (!s || s.status === "skipped" || s.status === "squeezed") { it.status = "skipped"; it.why = "its session isn't happening"; continue; }
    const t = it.why?.startsWith("after the lift") || it.slot === "recovery" ? (s.end ?? s.t) + 15 : s.t - (it.offset ?? 45);
    if (t !== it.t) { it.t = t; }
    if (it.t + 30 <= now) it.status = "past";
  }
  for (const it of items) if (it.status === "past" && it.t > now) delete it.status;
}

// What a carb portion is, in this meal's own food.
function trimText(what, n) {
  const w = what.toLowerCase();
  const rice = /(\d[\d½¼¾]*|½|¼|¾)?\s*cups? (?:cooked )?rice|rice/.exec(w);
  if (rice) return n > 1 ? `${n} cups less rice` : "1 cup less rice";
  if (/potato/.test(w)) return `${300 * n} g less potato`;
  const fruit = /(apple|banana|orange|berries|dates?|mango)/.exec(w);
  if (fruit) return `skip the ${fruit[1]}${/honey/.test(w) ? " and the honey" : ""}`;
  if (/honey/.test(w)) return "skip the honey";
  if (/oats|bagel|bread|tortilla|injera|pasta/.test(w)) return "a smaller portion of the starch";
  return "a smaller starch portion";
}

// ------------------------------------------------------------------ rebalance
function rebalance(items, tl, ctx) {
  const floor = ctx.floor || 200;
  const target = macrosOf(tl.targets);
  const eaten = macrosOf({});
  const plannedSoFar = macrosOf({});
  const remaining = macrosOf({});
  let deviated = false;
  for (const it of items) {
    if (!EATING.has(it.kind)) continue;
    if (["done", "past"].includes(it.status)) {
      add(eaten, it.eff);
      if (!it.extra) add(plannedSoFar, it);
      if (it.swapped || it.extra) deviated = true;
    } else if (it.status === "skipped") {
      add(plannedSoFar, it); deviated = true;
    } else if (!["fold"].includes(it.status)) add(remaining, it.eff);
  }
  const dev = add({ ...eaten }, plannedSoFar, -1);
  const projected = add({ ...eaten }, remaining);
  const out = { eaten, target, dev, projected: { ...projected }, adjustments: [], deviated };
  if (!deviated) return out;

  const upcoming = items.filter((i) => EATING.has(i.kind) && !i.status && i.kind !== "during" && i.kcal != null).sort((a, b) => a.t - b.t);
  if (!upcoming.length) return out;
  const trains = items.filter((i) => i.kind === "train" && !["done", "past", "skipped", "squeezed"].includes(i.status));
  const nearTraining = (it) => trains.some((s) => (it.t <= s.t && s.t - it.t <= 180) || (it.t >= (s.end ?? s.t) && it.t - (s.end ?? s.t) <= 120)) ||
    ["recovery", "pre_lift", "topup"].includes(it.slot);
  const big = ["F3", "F4"].includes(tl.level);
  const note = (it, text, delta) => {
    it.adjust = [...(it.adjust || []), text];
    add(it.eff, delta);
    add(projected, delta);
    out.adjustments.push({ id: it.id, at: hm(it.t), text });
  };

  // 1. protein to the floor (the card's own number if it's higher)
  const want = Math.max(floor, (target.protein || 0) - 20);
  let need = want - projected.protein;
  if (need >= 10 || projected.protein < floor) {
    const home = upcoming.filter((i) => i.company !== "away");
    const meal = home.find((i) => i.kind === "meal") || home[home.length - 1];
    const snack = home.find((i) => i.kind === "snack" && i.slot !== "pre_sleep") || home[home.length - 1] || meal;
    const away = upcoming.find((i) => i.company === "away");
    const g = Math.round(need);
    if (!meal && away) note(away, `get ~${g} g more protein here than the usual target — an extra palm of meat or fish`, { kcal: g * 5, protein: g });
    else if (need >= 35) note(snack, `+1 Core Power Elite (42 g protein) — you're ${g} g short of ${want} g`, { kcal: 230, protein: 42, carbs: 8, fat: 4 });
    else if (need >= 20 && meal?.kind === "meal") note(meal, `+1 extra palm of lean meat or fish (~30 g protein) — you're ${g} g short`, { kcal: 160, protein: 30, carbs: 0, fat: 5 });
    else note(meal, `+170 g Greek yogurt (17 g protein) — you're ${g} g short`, { kcal: 100, protein: 17, carbs: 6, fat: 0 });
  }

  // 2. carbs and calories: trims away from training, fuel added before it
  const over = projected.kcal - target.kcal;
  if (over >= 150) {
    const trimmable = upcoming.filter((i) => !nearTraining(i) && (!big || !trains.some((s) => s.t > i.t)));
    let n = Math.min(2, Math.round(over / PORTION.kcal));
    const order = [...trimmable.filter((i) => i.slot === "dinner"), ...trimmable.filter((i) => i.slot !== "dinner")];
    for (const it of order) {
      if (n <= 0) break;
      const carbs = it.eff.carbs || 0;
      if (carbs < 20) continue;
      const can = Math.max(1, Math.min(n, Math.floor(carbs / PORTION.carbs)));
      const cut = Math.min(carbs, PORTION.carbs * can);
      note(it, `−${can} carb portion${can > 1 ? "s" : ""}: ${trimText(it.what || "", can)}`, { kcal: -Math.round(cut * 4.2), carbs: -cut });
      n -= can;
    }
    if (dev.fat >= 15) {
      const fat = order.find((i) => /olive oil|walnut|avocado|oil/i.test(i.what || ""));
      if (fat) note(fat, "skip the added fat (oil / walnuts) — the meal you swapped in carried plenty", { kcal: -110, fat: -12 });
    }
    if (!out.adjustments.some((a) => a.text.startsWith("−") || a.text.startsWith("skip"))) {
      out.lines = [`About ${Math.round(over)} kcal over the card — nothing to trim away from training today. One day doesn't move the plan; back on the card at the next meal.`];
    }
  } else {
    const ahead = trains.filter((s) => s.train === "lift" || s.train === "mat" || s.train === "lic");
    const short = target.carbs - projected.carbs;
    if (ahead.length && (short >= 40 || over <= -250)) {
      const s = ahead[0];
      const pre = upcoming.filter((i) => i.t <= s.t && s.t - i.t <= 240).pop() || upcoming.find((i) => i.t >= (s.end ?? s.t));
      if (pre) {
        const n = Math.min(2, Math.max(1, Math.round(Math.max(short, -over / 4) / PORTION.carbs)));
        note(pre, `+${n} carb portion${n > 1 ? "s" : ""} for ${s.label || "training"} (2 rice cakes + honey, or a banana + a date)`,
          { kcal: PORTION.kcal * n, carbs: PORTION.carbs * n });
      }
    }
  }
  out.projected = projected;
  return out;
}

// ------------------------------------------------------------------ the day
// ctx: { now (minutes; -1 for a future day, 1e9 for a past one), rules, floor }
export function liveDay(day, ctx = {}) {
  const tl = day?.timeline;
  if (!tl) return null;
  const R = { ...DEFAULT_RULES, ...(ctx.rules || {}) };
  const items = JSON.parse(JSON.stringify(tl.items));
  applyLogs(items, day, ctx);
  const clock = applyWork(items, day, tl, R);
  retime(items, clock, { ...ctx, now: ctx.now ?? -1 }, R);
  const balance = rebalance(items, tl, ctx);
  for (const it of items) {
    it.at = hm(it.t);
    if (it.end != null) it.until = hm(it.end);
    it.moved = it.ideal != null && it.t != null && Math.abs(it.t - it.ideal) >= 15 && !["done", "past"].includes(it.status);
  }
  const live = items.filter((i) => i.t != null).sort((a, b) => a.t - b.t || (a.kind === "train" ? -1 : 1));
  const next = live.find((i) => !i.status && ["meal", "snack", "train"].includes(i.kind));
  if (next) next.next = true;
  return { items: live, untimed: items.filter((i) => i.t == null), balance, next, lights: clock.lights, work: clock.work,
    blocks: clock.blocks };
}
