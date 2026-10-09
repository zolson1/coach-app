// Pure: replay the ops the app has sent (but the coach hasn't applied yet) over
// the plan's fuel section, so the screen shows a change the moment it's made.
// Mirrors coach/apply_ops.py for exactly the ops the phone sends — the coach's
// answer replaces this the next time the plan loads.

export function rowUses(card) {
  const out = {};
  for (const r of card?.rows || []) if (r.uses) out[r.slot] = r.uses;
  return out;
}

// What a day drew from the batches: its card's rows, minus skipped ones, with a
// swapped row charged for what replaced it. (coach/fuel.py: eaten)
export function eaten(uses, log) {
  const total = {};
  const add = (u) => { for (const [k, n] of Object.entries(u || {})) total[k] = (total[k] || 0) + n; };
  for (const [slot, u] of Object.entries(uses)) {
    const e = log?.[slot] || {};
    if (e.status === "skipped") continue;
    add(e.status === "swapped" ? e.swap?.uses : u);
  }
  for (const [slot, e] of Object.entries(log || {})) {
    if (!(slot in uses) && e.status === "swapped") add(e.swap?.uses);
  }
  return total;
}

function shift(f, delta) {               // delta > 0 = more eaten
  const c = f.kitchen.counts;
  for (const [k, n] of Object.entries(delta)) {
    if (!(k in c) || !n) continue;
    c[k] = Math.max(0, c[k] - n);
    for (const d of f.days) if (d.counts_after && k in d.counts_after) d.counts_after[k] = Math.max(0, d.counts_after[k] - n);
  }
}

export function sweat(o) {
  const hours = (Number(o.minutes) || 150) / 60, drank = Number(o.drank_l) || 0;
  const lostKg = (Number(o.pre_lb) - Number(o.post_lb)) * 0.4536;
  const rate = Math.round(((lostKg + drank) / hours) * 100) / 100;
  const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
  return { date: o.date, rate_l_per_h: rate, lost_pct: r1(((o.pre_lb - o.post_lb) / o.pre_lb) * 100), drank_l: drank,
    minutes: Number(o.minutes) || 150, drink_l_per_h: [r2(rate * 0.6), r2(rate * 0.8)],
    replace_l: [r1(Math.max(lostKg, 0) * 1.25), r1(Math.max(lostKg, 0) * 1.5)], third_bottle: rate > 1.2 };
}

export function applyOps(f, ops, ctx = {}) {
  const day = (date) => f.days.find((d) => d.date === date);
  for (const o of ops) {
    const date = o.date || ctx.today;
    switch (o.op) {
      case "kitchen_set":
        if (o.item in f.kitchen.counts) shift(f, { [o.item]: f.kitchen.counts[o.item] - Math.max(0, Number(o.count) || 0) });
        break;
      case "cooked": {
        let yields = {};
        if (o.cook_day) {
          const cd = f.menu.cook_days[`cook${o.cook_day}`];
          if (!cd) break;
          yields = { ...cd.yields };
          const alt = cd.alternate_loop_yields || {};
          const withAlt = o.with_alternates ?? Object.keys(alt).some((k) => (f.kitchen.counts[k] || 0) <= 2);
          if (withAlt) for (const [k, n] of Object.entries(alt)) yields[k] = (yields[k] || 0) + n;
          for (const [k, p] of Object.entries(o.packs || {})) {        // packed for two: singles + for-two packs
            if (!(k in yields) || !p) continue;
            yields[k] = Math.max(0, Number(p.single ?? yields[k]) || 0);
            if (Number(p.duo) > 0 && `${k}_duo` in f.kitchen.counts) yields[`${k}_duo`] = Number(p.duo);
          }
          f.kitchen.last_cook = date;
          f.kitchen.stocked = true;
        } else if (o.item in f.kitchen.counts) {
          yields = { [o.item]: Number(o.servings) || 1 };
        }
        shift(f, Object.fromEntries(Object.entries(yields).map(([k, n]) => [k, -n])));   // negative = added
        break;
      }
      case "haul_done": {
        f.kitchen.last_haul = date;
        f.kitchen.stocked = true;
        if (o.stock !== false) {
          const add = {};
          for (const [k, b] of Object.entries(f.menu.batches)) if (b.haul_qty) add[k] = -b.haul_qty;
          shift(f, add);
        }
        f.shopping.haul.checked = [];
        f.shopping.haul.last = date;
        break;
      }
      case "topup_done":
        f.kitchen.last_topup = date;
        f.shopping.topup.checked = [];
        f.shopping.topup.last = date;
        break;
      case "meal_log": {
        const d = day(o.date);
        if (!d) break;
        const uses = rowUses(d.card);
        const before = eaten(uses, d.log);
        d.log = { ...(d.log || {}) };
        if (o.status === "clear") delete d.log[o.slot];
        else d.log[o.slot] = { status: o.status, ...(o.status === "swapped" ? { swap: o.swap } : {}), ...(o.note ? { note: o.note } : {}),
          ...(o.ate_at ? { ate_at: o.ate_at } : {}) };
        const after = eaten(uses, d.log);
        if (d.when !== "future") {
          const delta = {};
          for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) delta[k] = (after[k] || 0) - (before[k] || 0);
          shift(f, delta);
        }
        break;
      }
      case "task_done": {
        const d = day(o.date);
        if (!d) break;
        const set = new Set(d.tasks_done || []);
        if (o.done === false) set.delete(o.task); else set.add(o.task);
        d.tasks_done = [...set];
        break;
      }
      case "pantry_add":
        if (!f.pantry.some((p) => p.id === o.id)) f.pantry.push({ id: o.id, name: o.name, qty: o.qty, unit: o.unit, where: o.where, note: o.note, added: date });
        break;
      case "pantry_update": {
        const p = f.pantry.find((x) => x.id === o.id);
        if (p) for (const k of ["name", "qty", "unit", "where", "note"]) if (k in o) p[k] = o[k];
        break;
      }
      case "pantry_remove":
        f.pantry = f.pantry.filter((p) => p.id !== o.id);
        break;
      case "shopping_add":
        if (!f.shopping.extras.some((x) => x.id === o.id)) f.shopping.extras.push({ id: o.id, item: o.item, qty: o.qty, done: false });
        break;
      case "shopping_remove":
        f.shopping.extras = f.shopping.extras.filter((x) => x.id !== o.id);
        break;
      case "shopping_check": {
        if (o.list === "extras") {
          const x = f.shopping.extras.find((e) => e.id === o.key);
          if (x) x.done = o.checked !== false;
        } else if (f.shopping[o.list]) {
          const set = new Set(f.shopping[o.list].checked || []);
          if (o.checked === false) set.delete(o.key); else set.add(o.key);
          f.shopping[o.list].checked = [...set];
        }
        break;
      }
      case "off_card": {
        if (f.off_card.some((x) => x.id === o.id)) break;
        const e = { id: o.id, date, text: o.text, kind: o.kind, kcal: o.kcal, drinks: o.drinks, slot: o.slot,
          protein: o.protein, carbs: o.carbs, fat: o.fat, ate_at: o.ate_at };
        f.off_card.push(e);
        const d = day(date);
        if (d) d.off_card = [...(d.off_card || []), e];
        break;
      }
      case "off_card_remove":
        f.off_card = f.off_card.filter((x) => x.id !== o.id);
        for (const d of f.days) d.off_card = (d.off_card || []).filter((x) => x.id !== o.id);
        break;
      case "record_waist": {
        const e = { date, inches: Number(o.inches) };
        f.waist = [...f.waist.filter((w) => w.date !== date), e].sort((a, b) => a.date.localeCompare(b.date));
        if (f.review?.waist) {
          f.review.waist.points = f.waist;
          f.review.waist.to_go = Math.round((e.inches - f.review.waist.target) * 10) / 10;
        }
        break;
      }
      case "log_weight": {
        const pts = f.review?.weight?.points;
        if (!pts) break;
        const e = { date, lb: Number(o.lb), off_morning: true, src: "manual", pending: true };
        const i = pts.findIndex((p) => p.date === date);
        if (i >= 0) pts[i] = e; else pts.push(e);
        pts.sort((a, b) => a.date.localeCompare(b.date));
        f.review.weight.latest = pts[pts.length - 1];
        break;
      }
      case "fuel_level": {
        const d = day(date);
        if (d) d.level = { ...d.level, pending: String(o.level).toUpperCase() };
        break;
      }
      case "carb_adjust":
        f.carb_adjust = { ...(o.levels || {}) };
        if (f.review) f.review.carb_adjust = f.carb_adjust;
        f.carb_adjust_pending = true;
        break;
      case "set_menu":
        f.menus.pending = o.id;
        break;
      case "mat_log": {
        const d = day(o.date);
        if (!d) break;
        d.mat_log = { ...(d.mat_log || {}) };
        if (o.status === "clear") delete d.mat_log[o.slot];
        else d.mat_log[o.slot] = { status: o.status, ...(o.class ? { class: o.class } : {}), ...(o.note ? { note: o.note } : {}) };
        break;
      }
      case "work_set": {              // where he's working, report, expected / actual relief
        for (const d of f.days) {
          for (const k of ["today", "relief", "tomorrow"]) {
            const b = d.work?.[k];
            if (!b || b.date !== o.date) continue;
            const set = o.clear ? {} : { ...(b.set || {}) };
            if (!o.clear) {
              for (const key of ["where", "report", "relief", "relieved_at"]) {
                if (!(key in o)) continue;
                if (o[key] == null || o[key] === "") delete set[key]; else set[key] = o[key];
              }
            }
            d.work = { ...d.work, [k]: { ...b, set, ...(set.where ? { where: set.where } : {}) } };
          }
        }
        break;
      }
      case "session_log": {           // training timing on the day's timeline
        const d = day(date);
        if (!d) break;
        d.session_log = { ...(d.session_log || {}) };
        if (o.status === "clear") delete d.session_log[o.session];
        else d.session_log[o.session] = { status: o.status, ...(o.at ? { at: o.at } : {}) };
        break;
      }
      case "company": {               // who's eating; the batch counts follow when the coach applies it
        const r = day(date)?.card.rows.find((x) => x.slot === (o.slot || "dinner"));
        if (!r || !r.company) break;
        const who = o.who === "clear" ? (f.company?.[r.slot] || "solo") : o.who;
        if (who === "away" && r.company !== "away") { r.planned = r.what; r.what = "At hers / out — not the plan's food"; }
        if (who !== "away" && r.company === "away" && r.planned) { r.what = r.planned; delete r.planned; }
        if (who !== "shared") delete r.for_two;
        if (who !== "away") delete r.away_note;
        Object.assign(r, { company: who, company_set: o.who !== "clear", company_pending: true });
        break;
      }
      case "company_settings":
        f.company = { ...(f.company || {}), ...Object.fromEntries(["dinner", "lunch", "share"].filter((k) => o[k] != null).map((k) => [k, o[k]])) };
        break;
      case "sweat_test":
        f.sweat_tests = [...(f.sweat_tests || []), sweat({ ...o, date })];
        break;
      default:
        break;
    }
  }
  return f;
}

// ------------------------------------------------------------ day arithmetic
const num = (x) => Number(x) || 0;

// What was actually eaten on a day, from the card and its log.
export function dayTotals(d) {
  const out = { kcal: 0, protein: 0, carbs: 0, fat: 0, plan_kcal: 0, plan_protein: 0, logged: 0, rows: 0 };
  for (const r of d.card?.rows || []) {
    if (r.session || r.kcal == null) continue;
    out.rows++;
    out.plan_kcal += num(r.kcal);
    out.plan_protein += num(r.protein);
    const e = d.log?.[r.slot];
    if (!e) continue;
    if (e.status === "skipped") { out.logged++; continue; }
    const src = e.status === "swapped" && e.swap ? e.swap : r;
    out.logged++;
    for (const k of ["kcal", "protein", "carbs", "fat"]) out[k] += num(src[k]);
  }
  return out;
}

// The clock time a row is meant for, in minutes — null when it has none ("during").
export function rowMinutes(r) {
  const m = /(\d{1,2}):(\d{2})/.exec(r.time || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// The next row still to eat today, by the clock.
export function nextRow(d, nowMinutes) {
  const open = (d.card?.rows || []).filter((r) => !r.session && r.kcal != null && !d.log?.[r.slot]);
  const timed = open.filter((r) => rowMinutes(r) != null);
  return timed.find((r) => rowMinutes(r) >= nowMinutes - 45) || timed[timed.length - 1] || open[0] || null;
}
