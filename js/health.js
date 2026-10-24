// What the wearables say, with nothing to log (Zach, 2026-10-24: "the app should
// automatically draw my health metrics and workouts … I'm only logging deviations").
//  · a banner when a feed the plan leans on has gone stale (coach/actuals.py freshness)
//  · the body: last night's sleep, HRV, resting HR, weight, waist
//  · the week so far against its targets, from the watch
import { S, esc } from "./core.js";
import { dayLabel } from "./ui.js";

const hours = (h) => (h == null ? "—" : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);
const when = (iso) => (iso ? dayLabel(iso) : "never");

export function freshBanner() {
  const p = S.plan;
  if (!p) return "";
  const stale = (p.freshness || []).filter((x) => !x.ok);
  const age = p.generated ? (Date.now() - new Date(p.generated).getTime()) / 36e5 : 0;
  if (age > 30) stale.unshift({ label: "The plan", last: p.generated.slice(0, 10), fix: "It hasn't rebuilt in over a day — the morning run may have failed. Pull to refresh; if it stays, tell the coach." });
  if (!stale.length) return "";
  return `<section class="card alert"><h2>Data is stale</h2>
    ${stale.map((x) => `<p class="line"><b>${esc(x.label)}</b> <span class="muted">· last ${esc(when(x.last))}</span><br><span class="small">${esc(x.fix || "")}</span></p>`).join("")}
  </section>`;
}

export function healthCard() {
  const h = S.plan?.health;
  if (!h) return "";
  const s = h.sleep || {}, v = h.hrv || {}, r = h.rhr || {}, w = h.weight || {};
  const lastSleep = s.last ? s.last[1] : null;
  const short = lastSleep != null && lastSleep < 7;
  const cell = (label, big, sub, warn) => `<div class="hcell"><span class="muted small">${esc(label)}</span><b class="${warn ? "warn-text" : ""}">${esc(big)}</b><span class="muted small">${esc(sub)}</span></div>`;
  return `<section class="card"><div class="lift-head"><h2>Body</h2><span class="tm">from Oura · Garmin · scale</span></div>
    <div class="hgrid">
      ${cell("Sleep", hours(lastSleep), `7-day ${hours(s.avg7)}`, short)}
      ${cell("HRV", v.last ? `${v.last[1]} ms` : "—", v.avg7 ? `7-day ${v.avg7}` : "", false)}
      ${cell("Resting HR", r.last ? `${r.last[1]}` : "—", r.avg7 ? `7-day ${r.avg7}` : "", false)}
      ${cell("Weight", w.avg7 ? `≈${w.avg7} lb` : "—", w.last ? `weighed ${when(w.last[0])}` : "no weigh-ins", false)}
    </div>
    ${h.waist ? `<p class="muted small">Waist ${esc(h.waist.inches)}" (${esc(when(h.waist.date))}) — the target is under 36".</p>` : ""}
  </section>`;
}

export function weekCard() {
  const w = S.plan?.week_actual;
  if (!w) return "";
  const t = w.targets || {};
  const lo = (x) => (Array.isArray(x) ? x[0] : x);
  const chip = (label, have, want, unit = "") => {
    const ok = have != null && have >= lo(want);
    return `<div class="hcell"><span class="muted small">${esc(label)}</span><b class="${ok ? "ok-text" : ""}">${esc(have ?? "—")}${esc(unit)}</b><span class="muted small">of ${esc(Array.isArray(want) ? want.join("–") : want)}${esc(unit)}</span></div>`;
  };
  return `<section class="card"><div class="lift-head"><h2>This week so far</h2><span class="tm">from your watch · since ${esc(dayLabel(w.from, { short: true }))}</span></div>
    <div class="hgrid">
      ${chip("Mat", w.mat_sessions, t.mat_sessions)}
      ${chip("Zone 2", w.zone2_min, t.zone2_min, " min")}
      ${chip("4×4", w.vo2, t.vo2)}
      ${chip("Lifts", w.lifts, t.lifts)}
      ${chip("Sleep avg", w.sleep_avg, t.sleep_avg, " h")}
    </div>
    <p class="muted small">Nothing to log — the watch checks sessions off by the next morning. Record classes and rides on it, chest strap on.</p>
  </section>`;
}
