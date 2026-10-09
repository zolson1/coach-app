// node --test test/ — the overlay that shows a change before the coach applies it.
// It has to agree with coach/apply_ops.py for the ops the phone sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, eaten, rowUses, dayTotals, nextRow, rowMinutes, sweat } from "../js/ops.js";

const card = () => ({ rows: [
  { slot: "breakfast", time: "07:00", what: "oats", kcal: 680, protein: 48, carbs: 102, fat: 12, uses: { oats_jars: 1 } },
  { slot: "during", time: "10:30–13:00", what: "bottles", kcal: 360, protein: 0, carbs: 88, fat: 0 },
  { slot: "lunch", time: "14:00", what: "bowl", kcal: 750, protein: 58, carbs: 76, fat: 22, uses: { chicken_bowls: 1 } },
  { slot: "session", time: "17:00", what: "lift", kcal: null, protein: null, session: true },
  { slot: "dinner", time: "19:00", what: "chili", kcal: 990, protein: 58, carbs: 121, fat: 32, uses: { chili: 1 } },
] });
const fuel = () => ({
  days: [
    { date: "2026-09-30", when: "today", card: card(), log: {}, tasks: [{ id: "thaw" }], tasks_done: [], off_card: [], level: { today: "F3" },
      counts_after: { chili: 7, chicken_bowls: 9, oats_jars: 1, salmon: 8, core_power: 28 } },
    { date: "2026-10-01", when: "future", card: card(), log: {}, tasks: [], tasks_done: [], off_card: [], level: { today: "F4" },
      counts_after: { chili: 6, chicken_bowls: 8, oats_jars: 0, salmon: 8, core_power: 28 } },
  ],
  kitchen: { counts: { chili: 7, chicken_bowls: 9, oats_jars: 1, salmon: 8, core_power: 28 } },
  menu: { batches: { chili: {}, chicken_bowls: {}, oats_jars: {}, salmon: { haul_qty: 8 }, core_power: { haul_qty: 28 } },
    cook_days: { cook1: { yields: { chili: 8, chicken_bowls: 10 }, alternate_loop_yields: { burritos: 12 } } } },
  shopping: { haul: { checked: ["a"] }, topup: { checked: [] }, extras: [] },
  pantry: [], off_card: [], waist: [], sweat_tests: [], menus: {}, carb_adjust: {},
  review: { weight: { points: [] }, waist: { points: [], target: 36 } },
});

test("skip refunds the batch, a swap charges what replaced it, clear undoes both", () => {
  const f = fuel();
  applyOps(f, [{ op: "meal_log", date: "2026-09-30", slot: "dinner", status: "skipped" }]);
  assert.equal(f.kitchen.counts.chili, 8);
  assert.equal(f.days[1].counts_after.chili, 7);                     // the projection moves with it
  applyOps(f, [{ op: "meal_log", date: "2026-09-30", slot: "lunch", status: "swapped", swap: { what: "salmon", kcal: 650, protein: 46, uses: { salmon: 1 } } }]);
  assert.equal(f.kitchen.counts.chicken_bowls, 10);
  assert.equal(f.kitchen.counts.salmon, 7);
  applyOps(f, [{ op: "meal_log", date: "2026-09-30", slot: "dinner", status: "clear" }, { op: "meal_log", date: "2026-09-30", slot: "lunch", status: "clear" }]);
  assert.deepEqual([f.kitchen.counts.chili, f.kitchen.counts.chicken_bowls, f.kitchen.counts.salmon], [7, 9, 8]);
  assert.deepEqual(f.days[0].log, {});
});

test("an eaten check-off is recorded and changes no count", () => {
  const f = fuel();
  applyOps(f, [{ op: "meal_log", date: "2026-09-30", slot: "breakfast", status: "eaten" }]);
  assert.equal(f.days[0].log.breakfast.status, "eaten");
  assert.equal(f.kitchen.counts.oats_jars, 1);
});

test("planning a skip on a future day leaves today's counts alone", () => {
  const f = fuel();
  applyOps(f, [{ op: "meal_log", date: "2026-10-01", slot: "dinner", status: "skipped" }]);
  assert.equal(f.kitchen.counts.chili, 7);
  assert.equal(f.days[1].log.dinner.status, "skipped");
});

test("kitchen corrections, cook days and hauls", () => {
  const f = fuel();
  applyOps(f, [{ op: "kitchen_set", item: "chili", count: 3 }]);
  assert.equal(f.kitchen.counts.chili, 3);
  assert.equal(f.days[1].counts_after.chili, 2);
  applyOps(f, [{ op: "cooked", cook_day: 1, with_alternates: false, date: "2026-10-04" }]);
  assert.deepEqual([f.kitchen.counts.chili, f.kitchen.counts.chicken_bowls], [11, 19]);
  applyOps(f, [{ op: "cooked", item: "oats_jars", servings: 2 }]);
  assert.equal(f.kitchen.counts.oats_jars, 3);
  applyOps(f, [{ op: "haul_done", date: "2026-10-03" }]);
  assert.deepEqual([f.kitchen.counts.core_power, f.kitchen.counts.salmon], [56, 16]);
  assert.deepEqual(f.shopping.haul.checked, []);
});

test("pantry, shopping, tasks, deviations, waist and weight", () => {
  const f = fuel();
  applyOps(f, [
    { op: "pantry_add", id: "p1", name: "ribeye", qty: "2" }, { op: "pantry_update", id: "p1", qty: "1" },
    { op: "shopping_add", id: "s1", item: "limes" }, { op: "shopping_check", list: "extras", key: "s1", checked: true },
    { op: "shopping_check", list: "topup", key: "bananas", checked: true },
    { op: "task_done", date: "2026-09-30", task: "thaw", done: true },
    { op: "off_card", id: "d1", date: "2026-09-30", text: "burger", kind: "meal" },
    { op: "record_waist", date: "2026-09-30", inches: 37.5 },
    { op: "log_weight", date: "2026-09-30", lb: 229.4 },
    { op: "fuel_level", date: "2026-09-30", level: "f2" },
    { op: "carb_adjust", levels: { F1: -1 } },
  ], { today: "2026-09-30" });
  assert.equal(f.pantry[0].qty, "1");
  assert.equal(f.shopping.extras[0].done, true);
  assert.deepEqual(f.shopping.topup.checked, ["bananas"]);
  assert.deepEqual(f.days[0].tasks_done, ["thaw"]);
  assert.equal(f.days[0].off_card.length, 1);
  assert.equal(f.review.waist.to_go, 1.5);
  assert.equal(f.review.weight.latest.lb, 229.4);
  assert.equal(f.days[0].level.pending, "F2");
  assert.deepEqual(f.carb_adjust, { F1: -1 });
  applyOps(f, [{ op: "off_card_remove", id: "d1" }, { op: "pantry_remove", id: "p1" }]);
  assert.equal(f.off_card.length + f.pantry.length + f.days[0].off_card.length, 0);
});

test("day totals count what was actually eaten", () => {
  const d = fuel().days[0];
  d.log = { breakfast: { status: "eaten" }, dinner: { status: "skipped" }, lunch: { status: "swapped", swap: { kcal: 650, protein: 46 } } };
  const t = dayTotals(d);
  assert.deepEqual([t.rows, t.logged, t.kcal, t.protein, t.plan_kcal], [4, 3, 1330, 94, 2780]);
});

test("next meal goes by the clock and skips what's logged", () => {
  const d = fuel().days[0];
  assert.equal(rowMinutes(d.card.rows[1]), 630);
  assert.equal(nextRow(d, 8 * 60).slot, "during");            // breakfast is more than 45 min gone
  assert.equal(nextRow(d, 7 * 60 + 20).slot, "breakfast");
  d.log = { breakfast: { status: "eaten" }, during: { status: "eaten" }, lunch: { status: "eaten" } };
  assert.equal(nextRow(d, 9 * 60).slot, "dinner");
  d.log.dinner = { status: "eaten" };
  assert.equal(nextRow(d, 9 * 60), null);
});

test("sweat test matches the coach's arithmetic", () => {
  const r = sweat({ date: "2026-09-30", pre_lb: 231, post_lb: 228, drank_l: 1.4, minutes: 150 });
  assert.equal(r.rate_l_per_h, 1.1);
  assert.equal(r.third_bottle, false);
  assert.deepEqual(eaten(rowUses(card()), { dinner: { status: "skipped" } }), { oats_jars: 1, chicken_bowls: 1 });
});

test("who's eating shows at once; at hers keeps what was planned, and back again restores it", () => {
  const f = fuel();
  f.company = { dinner: "shared", lunch: "solo", share: 0.6 };
  const dinner = f.days[1].card.rows.find((r) => r.slot === "dinner");
  Object.assign(dinner, { company: "shared", company_set: false, for_two: "For two: …" });
  applyOps(f, [{ op: "company", date: "2026-10-01", slot: "dinner", who: "away" }]);
  assert.equal(dinner.company, "away");
  assert.equal(dinner.planned, "chili");
  assert.ok(!dinner.for_two && dinner.company_set && dinner.company_pending);
  applyOps(f, [{ op: "company", date: "2026-10-01", slot: "dinner", who: "clear" }]);
  assert.equal(dinner.company, "shared");                            // the usual
  assert.equal(dinner.what, "chili");
  assert.equal(dinner.company_set, false);
  const lunch = f.days[1].card.rows.find((r) => r.slot === "lunch");
  applyOps(f, [{ op: "company", date: "2026-10-01", slot: "lunch", who: "shared" }]);
  assert.equal(lunch.company, undefined);                            // not a company row on this card: untouched
});

test("a cook day packed for two adds singles and for-two packs", () => {
  const f = fuel();
  f.kitchen.counts.chili_duo = 0;
  applyOps(f, [{ op: "cooked", cook_day: 1, with_alternates: false, packs: { chili: { single: 4, duo: 5 } } }]);
  assert.deepEqual([f.kitchen.counts.chili, f.kitchen.counts.chili_duo, f.kitchen.counts.chicken_bowls], [11, 5, 19]);
});

test("plan edits: skip, move (both days), restore brings it home; an activity shows at once", () => {
  const f = fuel();
  f.days[0].sessions = ["lic"];
  f.days[1].sessions = ["domain", "lic"];
  applyOps(f, [{ op: "plan_edit", date: "2026-10-01", action: "move", session: "domain", to: "2026-09-30" },
    { op: "plan_edit", date: "2026-09-30", action: "remove", session: "lic" }]);
  assert.deepEqual(f.days[0].sessions, ["domain"]);
  assert.deepEqual(f.days[1].sessions, ["lic"]);
  assert.equal(f.days[0].edits.add[0].from, "2026-10-01");
  assert.ok(f.days[0].plan_pending && f.days[1].plan_pending);
  applyOps(f, [{ op: "plan_edit", date: "2026-10-01", action: "restore", session: "domain" }]);
  assert.deepEqual(f.days[0].sessions, []);
  assert.deepEqual(f.days[1].sessions, ["lic", "domain"]);
  applyOps(f, [{ op: "activity", date: "2026-10-01", id: "tennis", name: "Tennis", start: "10:00", dur: 90 },
    { op: "plan_edit", date: "2026-10-01", action: "mat", mat: "one" }]);
  assert.deepEqual(f.days[1].activities, [{ id: "tennis", name: "Tennis", intensity: "moderate", start: "10:00", dur: 90 }]);
  assert.equal(f.days[1].mat, "one");
  applyOps(f, [{ op: "activity", date: "2026-10-01", id: "tennis", remove: true }]);
  assert.deepEqual(f.days[1].activities, []);
});
