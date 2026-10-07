// node --test test/  — the pure session logic the phone runs mid-workout.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../js/logic.js";

const policy = { rpe_cap: { 1: 7 }, grind_rpe: 9, small_cut: 0.05, big_cut: 0.1, max_grinds: 2,
  rest_s: { main: 180, over_cap: 240 } };
const block = () => ({ rpe_cap: 7, rest_s: 180, work: [275, 275, 275, 275].map((load) => ({ load, reps: 5, target_reps: 5 })) });

test("plates: greedy per side, remainder reported", () => {
  assert.deepEqual(L.plates(275, 45).perSide, [45, 45, 25]);
  assert.deepEqual(L.plates(260, 45).perSide, [45, 45, 10, 5, 2.5]);
  assert.equal(L.plates(262, 45, [45, 25, 10, 5]).remainder, 7);
  assert.deepEqual(L.plates(45, 45).perSide, []);
  assert.equal(L.platesText(0, "pullup", {}), "bodyweight");
  assert.equal(L.platesText(275, "trap_bar", { trapBar: 55, plates: L.DEFAULT_PLATES }), "45 + 45 + 10 + 10 / side");
});

test("under the cap: nothing changes", () => {
  const b = block(), st = {};
  const r = L.afterWorkSet(b, st, { load: 275, reps: 5, target_reps: 5, rpe: 6.5 }, policy);
  assert.equal(r.newLoad, null);
  assert.equal(r.restS, 180);
});

test("over the cap: -5% on the remaining sets, longer rest", () => {
  const b = block(), st = {};
  b.work[0].done = true;
  const r = L.afterWorkSet(b, st, { load: 275, reps: 5, target_reps: 5, rpe: 7.5 }, policy);
  L.applyAdjustment(b.work, 0, r);
  assert.equal(r.newLoad, 260);
  assert.equal(r.restS, 240);
  assert.deepEqual(b.work.map((w) => w.load), [275, 260, 260, 260]);
});

test("grind: -10%, and the second grind ends the lift", () => {
  const b = block(), st = {};
  b.work[0].done = true;
  let r = L.afterWorkSet(b, st, { load: 275, reps: 5, target_reps: 5, rpe: 8, slowed: true }, policy);
  L.applyAdjustment(b.work, 0, r);
  assert.equal(r.newLoad, 250);
  b.work[1].done = true;
  r = L.afterWorkSet(b, st, { load: 250, reps: 4, target_reps: 5, rpe: 8 }, policy);   // missed a rep
  L.applyAdjustment(b.work, 1, r);
  assert.ok(r.endLift);
  assert.ok(b.work[2].skipped && b.work[3].skipped);
});

test("easy sets never add load", () => {
  const b = block(), st = {};
  const r = L.afterWorkSet(b, st, { load: 275, reps: 5, target_reps: 5, rpe: 5 }, policy);
  assert.equal(r.newLoad, null);
});

test("optional heavy single is skipped when the 85% single wasn't fast", () => {
  const b = { rpe_cap: 8, work: [{ load: 310, reps: 1, target_reps: 1, done: true }, { load: 330, reps: 1, optional: true }] };
  const r = L.afterWorkSet(b, {}, { load: 310, reps: 1, target_reps: 1, rpe: 8.5 }, policy);
  L.applyAdjustment(b.work, 0, r);
  assert.ok(b.work[1].skipped);
});

test("calibration ladder climbs, then stops at the target", () => {
  assert.equal(L.ladderNext({ load: 305, rpe: 6 }, 8, 10).load, 315);
  assert.equal(L.ladderNext({ load: 315, rpe: 7.5 }, 8, 10).load, 320);
  assert.ok(L.ladderNext({ load: 320, rpe: 8 }, 8, 10).done);
  assert.ok(L.ladderNext({ load: 320, rpe: 7, slowed: true }, 8, 10).done);
  const top = L.ladderTop([{ load: 305, reps: 5, rpe: 6 }, { load: 315, reps: 5, rpe: 7.5 }, { load: 320, reps: 5, rpe: 8 }], 8);
  assert.equal(top.load, 320);
});

test("e1RM matches the coach's formula", () => {
  assert.equal(Math.round(L.e1rm(315, 5, 8)), Math.round(315 * (1 + 0.0333 * 7)));
});

test("session lifecycle → log the coach can ingest", () => {
  const spec = { key: "strength_a", kind: "strength", which: "A", title: "Strength A", sets: 3, date: "2026-09-22",
    block: 1, week: 1, block_key: "k", blocks: [
      { type: "lift", id: "front_squat", lift: "front_squat", rpe_cap: 7, pct: 0.75, tm: 320, load_mode: "total",
        warmups: [{ bar: true, reps: 5 }], work: [{ load: 240, reps: 5 }, { load: 240, reps: 5 }, { load: 240, reps: 5 }] },
      { type: "hold", id: "plate_pinch", sets: 3, target_s: 20, track: "plate_pinch" },
    ] };
  const a = L.startSession(spec, "2026-09-22", 4);
  assert.equal(a.spec.blocks[0].work.length, 4);
  a.spec.blocks[0].work.slice(0, 2).forEach((w) => Object.assign(w, { done: true, rpe: 6.5 }));
  a.spec.blocks[1].state.secs = [22, 25, null];
  assert.equal(L.sessionStatus(a), "partial");
  const log = L.buildLog(a, "2026-09-22-strength_a");
  assert.equal(log.status, "partial");
  assert.equal(log.lifts[0].sets.filter((s) => s.type === "work").length, 2);
  assert.deepEqual(log.holds[0].sets_s, [22, 25]);
  a.spec.blocks[0].work.forEach((w) => Object.assign(w, { done: true, rpe: 6.5 }));
  assert.equal(L.sessionStatus(a), "done");
});

test("Breacher: a slowed rep on a speed-governed lift ends it at once", async () => {
  const L = await import("../js/logic.js");
  const block = { speed_rule: "end", rest_s: 240, rpe_cap: 8 };
  const st = { grinds: 0 };
  const ok = L.afterWorkSet(block, st, { load: 130, reps: 3, target_reps: 3, rpe: 6, slowed: false }, {});
  assert.equal(ok.endLift, false);
  const slow = L.afterWorkSet(block, st, { load: 130, reps: 3, target_reps: 3, rpe: 6, slowed: true }, {});
  assert.equal(slow.endLift, true);
  const sets = [{ done: true }, { done: false }, { done: false }];
  L.applyAdjustment(sets, 0, slow);
  assert.deepEqual(sets.slice(1).map((x) => x.skipReason), ["ended — speed dropped", "ended — speed dropped"]);
});

test("light work offers a TM check on a 7.5/8 week — never on the 75% week, never for one easy set", async () => {
  const L = await import("../js/logic.js");
  const pol = { check_margin: 3, check_min_cap: 7.5 };
  const lift = (cap, rpes) => ({ type: "lift", tm: 320, rpe_cap: cap, calibrate: null,
    work: rpes.map((r) => ({ load: 255, reps: 5, rpe: r, done: true })) });
  assert.equal(L.lightCheck(lift(7.5, [4, 4.5, 4]), pol), true);
  assert.equal(L.lightCheck(lift(7, [3, 3, 3]), pol), false);        // week 1: light by design
  assert.equal(L.lightCheck(lift(7.5, [4, 6, 4]), pol), false);
  assert.equal(L.lightCheck({ ...lift(8, [4, 4]), calibrate: { kind: "provisional" } }, pol), false);
});
