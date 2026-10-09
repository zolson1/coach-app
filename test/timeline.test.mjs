// node --test test/ — the live day: re-timing and rebalancing from what's logged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveDay, toMin, hm } from "../js/timeline.js";

const T = (s) => toMin(s);
// An OFF day with a flexible lift — synthetic, shaped like coach/timeline.py's output.
function day(over = {}) {
  return {
    date: "2026-10-09", log: {}, session_log: {}, mat_log: {}, off_card: [],
    timeline: {
      wake: T("07:00"), lights: T("22:30"), work: null, station: false, level: "F2",
      targets: { kcal: 2900, protein: 230, carbs: 330, fat: 80 },
      items: [
        { id: "breakfast", slot: "breakfast", kind: "meal", t: T("07:00"), kcal: 680, protein: 48, carbs: 102, fat: 12, what: "Overnight oats + banana" },
        { id: "lunch", slot: "lunch", kind: "meal", t: T("12:30"), kcal: 650, protein: 56, carbs: 46, fat: 22, what: "Chicken bowl" },
        { id: "strength_a", kind: "train", train: "lift", session: "strength_a", t: T("15:00"), end: T("16:00"), label: "Strength A" },
        { id: "snack", slot: "snack", kind: "snack", t: T("16:30"), kcal: 325, protein: 43, carbs: 33, fat: 4, what: "Core Power + apple" },
        { id: "dinner", slot: "dinner", kind: "meal", t: T("19:00"), kcal: 1000, protein: 60, carbs: 120, fat: 30, what: "Chili + 1½ cups rice + salad with 1 tbsp olive oil" },
        { id: "pre_sleep", slot: "pre_sleep", kind: "snack", t: T("21:30"), kcal: 220, protein: 26, carbs: 20, fat: 5, what: "Greek yogurt + berries + walnuts" },
        { id: "lights", kind: "sleep", t: T("22:30"), label: "Lights out" },
      ],
    },
    ...over,
  };
}
const at = (live, id) => live.items.find((i) => i.id === id);

test("nothing logged: the ideal day, past items assumed done", () => {
  const live = liveDay(day(), { now: T("13:00") });
  assert.equal(at(live, "lunch").status, "past");
  assert.equal(at(live, "strength_a").at, "15:00");
  assert.equal(live.next.id, "strength_a");
  assert.equal(live.balance.deviated, false);
  assert.ok(!live.items.some((i) => i.moved));
});

test("a late lunch pushes the lift 2 h past it, and what follows comes after", () => {
  const d = day({ log: { lunch: { status: "eaten", ate_at: "14:15" } } });
  const live = liveDay(d, { now: T("14:30") });
  assert.equal(at(live, "strength_a").at, "16:15");
  assert.ok(at(live, "strength_a").moved && /after your last meal/.test(at(live, "strength_a").why));
  assert.equal(at(live, "snack").at, "17:30");           // not inside the lift: straight after it
  assert.equal(at(live, "dinner").at, "19:00");          // 90 min after that snack
});

test("a lift moved by him is fixed, and the evening cutoff still holds", () => {
  const d = day({ session_log: { strength_a: { status: "moved", at: "18:00" } } });
  const live = liveDay(d, { now: T("13:00") });
  assert.equal(at(live, "strength_a").at, "18:00");
  assert.equal(at(live, "dinner").at, "19:00");          // right as the lift ends
  const late = liveDay(day(), { now: T("19:00") });
  assert.equal(at(late, "strength_a").status, "past");
});

test("too late to lift before the 3-h cutoff → squeezed, with the fallback", () => {
  const d = day({ log: { lunch: { status: "eaten", ate_at: "18:00" } } });     // the lift was planned after lunch
  const live = liveDay(d, { now: T("18:10") });
  assert.ok(at(live, "strength_a").carried);
  assert.equal(at(live, "strength_a").status, "squeezed");
  assert.match(at(live, "strength_a").why, /Zone 2/);
});

test("a protein-light replacement → protein topped up; a fat-heavy one → the added fat goes", () => {
  const d = day({ log: {
    breakfast: { status: "swapped", swap: { what: "leftover injera + misir wat", kcal: 900, protein: 25, carbs: 110, fat: 40 } },
    lunch: { status: "swapped", swap: { what: "leftover doro wat + injera", kcal: 1000, protein: 45, carbs: 90, fat: 45 } } } });
  const live = liveDay(d, { now: T("13:00"), floor: 200 });
  const b = live.balance;
  assert.ok(b.deviated && b.dev.kcal > 500);
  const texts = b.adjustments.map((a) => a.text).join(" | ");
  assert.match(texts, /Core Power|palm|yogurt/);         // protein
  assert.match(texts, /−\d carb portion/);              // a trim, at dinner (not before the lift)
  assert.ok(!at(live, "snack").adjust?.some((x) => x.startsWith("−")));   // the post-lift snack is never trimmed
  assert.ok(b.projected.protein >= 200);
});

test("an under-eaten morning before training → carbs added before the session", () => {
  const d = day({ log: { breakfast: { status: "skipped" } } });
  const live = liveDay(d, { now: T("09:00") });
  assert.match(live.balance.adjustments.map((a) => a.text).join(" "), /\+\d carb portion.*Strength A/);
});

test("an OT night: dinner lands before clocking in; the pre-sleep follows the dinner gap", () => {
  const d = day();
  d.timeline.work = [T("19:00"), T("31:00")];
  d.timeline.lights = T("21:30");
  d.timeline.items.find((i) => i.id === "dinner").t = T("18:00");
  d.log = { lunch: { status: "eaten", ate_at: "16:00" }, snack: { status: "skipped" } };
  const live = liveDay(d, { now: T("16:05") });
  assert.equal(at(live, "dinner").at, "18:00");            // 2½ h after lunch would be 18:30 — work wins
  assert.match(at(live, "dinner").why, /before you clock in/);
});

test("a snack right before a lift he pinned moves to after it", () => {
  const d = day({ session_log: { strength_a: { status: "moved", at: "16:45" } } });
  d.timeline.items.find((i) => i.id === "snack").t = T("16:30");
  const live = liveDay(d, { now: T("13:00") });
  assert.equal(at(live, "snack").at, "18:00");               // lift 16:45–17:45 → +15
  assert.match(at(live, "snack").why, /after the lift/);
});

test("protein top-ups go to his own food, not a meal at hers", () => {
  const d = day({ log: { breakfast: { status: "swapped", swap: { what: "leftovers", kcal: 650, protein: 20, carbs: 60, fat: 30 } } } });
  d.timeline.items.find((i) => i.id === "dinner").company = "away";
  const live = liveDay(d, { now: T("09:00"), floor: 200 });
  const where = live.balance.adjustments.map((a) => a.id);
  assert.ok(where.length && !where.includes("dinner"));
});

// ---- report and relief
function otDay(set = {}) {
  // an OT day at the home station: report 03:30, relief 15:30 expected, 19:00 late
  return {
    date: "2026-10-09", log: {}, session_log: {}, mat_log: {}, off_card: [],
    work: { today: { date: "2026-10-09", type: "OT-DAY", where: "home", offset: 0, set }, relief: null, tomorrow: null },
    timeline: {
      wake: T("02:45"), lights: T("22:30"), work: [T("03:30"), T("15:30")], station: true, level: "F2",
      targets: { kcal: 3000, protein: 220, carbs: 330, fat: 80 },
      items: [
        { id: "work", kind: "work", t: T("03:30"), end: T("15:30"), fixed: true },
        { id: "lunch", slot: "lunch", kind: "meal", t: T("12:00"), kcal: 850, protein: 55, what: "Firehouse lunch" },
        { id: "snack", slot: "snack", kind: "snack", t: T("16:00"), kcal: 230, protein: 42, what: "Core Power", late: "Still at the station: the Core Power Elite from your kit bag." },
        { id: "lic", kind: "train", train: "lic", session: "lic", t: T("16:45"), end: T("17:30"), label: "Zone 2 (LIC)" },
        { id: "dinner", slot: "dinner", kind: "meal", t: T("18:30"), kcal: 900, protein: 55, what: "Chili + rice", late: "Still at the station: the firehouse dinner if it's served…" },
        { id: "lights", kind: "sleep", t: T("22:30") },
      ],
    },
  };
}

test("relieved on time: the home plan, with the late fallback held in reserve", () => {
  const live = liveDay(otDay(), { now: T("13:00") });
  assert.equal(at(live, "work").end, T("15:30"));
  assert.ok(!at(live, "dinner").at_work && at(live, "dinner").late);
  assert.equal(at(live, "lic").at, "16:45");
});

test("expecting late relief: the station versions take over and training slides after relief", () => {
  const live = liveDay(otDay({ relief: "19:00" }), { now: T("13:00") });
  assert.equal(at(live, "work").end, T("19:00"));
  assert.ok(at(live, "snack").at_work && /kit bag/.test(at(live, "snack").work_note));
  assert.ok(at(live, "dinner").at_work && /firehouse dinner/.test(at(live, "dinner").work_note));
  assert.equal(at(live, "lic").status, "squeezed");              // after 19:30 it can't finish 3 h before 22:30
  assert.match(at(live, "lic").why, /relieved too late/);
  const later = otDay({ relief: "17:30" });
  assert.equal(at(liveDay(later, { now: T("13:00") }), "lic").at, "18:00");   // a 17:30 relief: it still fits
});

test("a detail moves report and relief; an actual relief wins over the expected one", () => {
  const det = liveDay(otDay({ where: "detail" }), { now: T("06:00") });
  assert.equal(at(det, "work").t, T("05:30"));
  assert.equal(at(det, "work").end, T("17:30"));
  const actual = liveDay(otDay({ relieved_at: "16:10" }), { now: T("16:20") });
  assert.equal(at(actual, "work").end, T("16:10"));
  assert.ok(at(actual, "snack").at_work);                         // 16:00 snack: still at the station
  assert.ok(!at(actual, "dinner").at_work);
});

test("the relief morning: an 03:30 relief sleeps again, a late one eats when home", () => {
  const relief = (set) => ({
    date: "2026-10-11", log: {}, session_log: {}, mat_log: {}, off_card: [],
    work: { today: null, tomorrow: null, relief: { date: "2026-10-10", type: "SHIFT", where: "home", offset: -1440, set } },
    timeline: { wake: T("07:30"), lights: T("22:00"), work: null, station: false, level: "F3",
      targets: { kcal: 3600, protein: 236, carbs: 500, fat: 75 },
      items: [
        { id: "relief", kind: "work", t: 0, end: T("03:30"), fixed: true },
        { id: "breakfast", slot: "breakfast", kind: "meal", t: T("07:45"), planned_time: "on waking", kcal: 670, protein: 53, what: "Quick pre-mat breakfast" },
        { id: "lights", kind: "sleep", t: T("22:00") }] },
  });
  assert.equal(at(liveDay(relief({}), { now: T("03:00") }), "breakfast").at, "07:45");
  const late = liveDay(relief({ relieved_at: "08:10" }), { now: T("08:15") });
  assert.equal(at(late, "breakfast").at, "08:45");                // home at 08:40, no second sleep
  assert.equal(at(late, "relief").end, T("08:10"));
});
