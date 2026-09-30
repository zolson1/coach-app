// The Progress tab: is the plan working? The coach's verdict (the fuel plan's
// own decision rules), the numbers behind it, and the places to add a number.
import { S, A, SHEETS, esc, fuel, send, sheet, today, fmtNum } from "./core.js";
import { dayLabel } from "./ui.js";
import { weightChart, energyChart } from "./charts.js";

const signed = (n, d = 1) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`);
const tile = (label, value, note = "", cls = "") => `<div class="tile ${cls}"><span>${esc(label)}</span><b>${value}</b><i>${esc(note)}</i></div>`;
const adjText = (a) => Object.entries(a || {}).map(([k, v]) => `${k} ${v > 0 ? "+" : "−"}${Math.abs(v)}`).join(", ");

export function viewProgress() {
  const f = fuel();
  if (!f?.review) return `<section class="card"><p class="muted">Progress loads with the next morning run.</p></section>`;
  const r = f.review, v = r.verdict, w = r.weight, e = r.energy, a = r.adherence;
  const adjusted = Object.keys(f.carb_adjust || {}).length;
  const canApply = v.op && !f.carb_adjust_pending && JSON.stringify(v.op.levels) !== JSON.stringify(f.carb_adjust);
  let html = `<section class="card verdict ${esc(v.code)}"><span class="eyebrow">Plan check${r.window.days_in ? ` · day ${r.window.days_in}` : ""}</span>
    <h2>${esc(v.title)}</h2><p>${esc(v.action)}</p>
    ${(v.why || []).length ? `<ul class="plain muted small">${v.why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${canApply ? `<button class="btn primary" data-a="applyverdict">Apply it (${esc(adjText(v.op.levels))} carb portion)</button>` : ""}
    ${adjusted ? `<p class="adj">Carb dial in effect: ${esc(adjText(f.carb_adjust))} portion${f.carb_adjust_pending ? " — updating" : ""}.
      <button class="link" data-a="clearadjust">clear</button></p>` : ""}
  </section>`;

  const latest = w.latest;
  html += `<div class="tiles">
    ${tile("Weight", latest ? `${latest.lb}<small> lb</small>` : `${esc(w.manual_lb ?? "—")}<small> lb</small>`,
      w.loss_lb_per_wk != null ? `${signed(-w.loss_lb_per_wk)} lb/week` : latest ? `${dayLabel(latest.date)} · trend needs ${Math.max(0, 4 - w.n)} more` : "no weigh-ins yet")}
    ${tile("Waist", r.waist.points.length ? `${r.waist.points[r.waist.points.length - 1].inches}<small> in</small>` : "—",
      r.waist.to_go != null ? (r.waist.to_go > 0 ? `${r.waist.to_go} in to go (under 36)` : "under 36 — there") : "measure on an off morning")}
    ${tile("Eating", e.intake_avg ? `${fmtNum(e.intake_avg)}<small> kcal</small>` : "—", `plan averages ${fmtNum(e.plan_avg)} a day`)}
    ${tile("Burning", e.burn_avg ? `${fmtNum(e.burn_avg)}<small> kcal</small>` : "—", e.implied_deficit != null ? `deficit ${fmtNum(e.implied_deficit)} a day` : "Garmin, needs 5 days")}
    ${tile("Protein", a.protein_avg ? `${a.protein_avg}<small> g</small>` : "—", `floor ${a.protein_floor} g`)}
    ${tile("Off the card", `${a.off_card_7d.meals}<small> meal${a.off_card_7d.meals === 1 ? "" : "s"}</small> · ${a.off_card_7d.drink_evenings}<small> night${a.off_card_7d.drink_evenings === 1 ? "" : "s"}</small>`,
      `this week · budget ${a.budget.meals} and ${a.budget.drink_evenings}`, a.off_card_7d.meals > a.budget.meals || a.off_card_7d.drink_evenings > a.budget.drink_evenings ? "over" : "")}
  </div>`;

  html += `<section class="card"><div class="lift-head"><h2>Morning weight</h2><button class="btn sm primary" data-a="weightsheet">+ Weigh-in</button></div>
    ${w.points.length ? weightChart(w.points) : `<p class="muted">No weigh-ins yet. The scale syncs on its own; you can also type one in.</p>`}
    <p class="muted small">Off-day mornings only count — a post-shift weight swings with lost sleep, salt and fluid. Judge it loop to loop.</p></section>`;

  html += `<section class="card"><h2>Eaten against burned</h2>
    ${e.intake.length || e.burn.length ? energyChart(e.intake, e.burn) : `<p class="muted">Fills in as days go by.</p>`}
    ${e.calibration ? `<p class="adj">${esc(e.calibration)}</p>` : `<p class="muted small">Garmin's burn calibrates the plan against what the scale does. It's never a number to eat back.</p>`}</section>`;

  html += `<section class="card"><div class="lift-head"><h2>Waist</h2><button class="btn sm" data-a="waistsheet">+ Measure</button></div>
    ${r.waist.points.length ? `<ul class="plain loglist">${[...r.waist.points].reverse().slice(0, 6).map((p) => `<li>${esc(dayLabel(p.date))} — <b>${p.inches} in</b></li>`).join("")}</ul>` : ""}
    <p class="muted small">At the navel, tape level, after a normal exhale. Once a week, off morning. The tape decides, not the scale.</p></section>`;

  if (r.recovery.resting_hr_delta != null || r.recovery.sleep_avg_off_nights != null) {
    html += `<section class="card"><h2>Recovery</h2>
      ${r.recovery.resting_hr_delta != null ? `<p class="line">Resting heart rate ${Math.abs(r.recovery.resting_hr_delta) < 1 ? "unchanged" : `${signed(r.recovery.resting_hr_delta, 0)} bpm`} against the weeks before.</p>` : ""}
      ${r.recovery.sleep_avg_off_nights != null ? `<p class="line">Off-night sleep averaging ${r.recovery.sleep_avg_off_nights} h.</p>` : ""}
      ${r.recovery.flags.length ? `<p class="adj">${esc(r.recovery.flags.join(" · "))}</p>` : ""}</section>`;
  }

  const off = [...(f.off_card || [])].reverse().slice(0, 12);
  html += `<section class="card"><div class="lift-head"><h2>Off-card log</h2><button class="btn sm" data-a="offcard">+ Add</button></div>
    ${off.length ? `<ul class="plain loglist">${off.map((x) => `<li><span class="muted">${esc(dayLabel(x.date))}</span> ${esc(x.text)}
      <button class="link" data-a="offdel" data-id="${esc(x.id)}">remove</button></li>`).join("")}</ul>` : `<p class="muted small">Nothing logged. Add one for any day — yesterday and earlier included.</p>`}
  </section>`;
  return html;
}

SHEETS.weight = () => `<div class="sheet"><h3>Weigh-in</h3>
  <label class="fld">Date<input id="wdate" type="date" value="${today()}" max="${today()}"></label>
  <label class="fld">Weight (lb)<input id="wlb" type="number" inputmode="decimal" step="0.1" placeholder="229.4"></label>
  <p class="muted small">After the bathroom, before food. A typed entry wins over the scale's for that day.</p>
  <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Cancel</button><button class="btn primary" data-a="saveweight">Save</button></div></div>`;

SHEETS.waist = () => `<div class="sheet"><h3>Waist</h3>
  <label class="fld">Date<input id="wsdate" type="date" value="${today()}" max="${today()}"></label>
  <label class="fld">Inches<input id="wsin" type="number" inputmode="decimal" step="0.25" placeholder="37.5"></label>
  <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Cancel</button><button class="btn primary" data-a="savewaist">Save</button></div></div>`;

const val = (id) => document.getElementById(id)?.value?.trim() ?? "";
Object.assign(A, {
  weightsheet() { sheet({ type: "weight" }); },
  saveweight() {
    const lb = Number(val("wlb")), date = val("wdate") || today();
    if (!(lb > 80 && lb < 500)) return;
    sheet(null);
    send({ op: "log_weight", date, lb });
  },
  waistsheet() { sheet({ type: "waist" }); },
  savewaist() {
    const inches = Number(val("wsin")), date = val("wsdate") || today();
    if (!(inches > 20 && inches < 70)) return;
    sheet(null);
    send({ op: "record_waist", date, inches });
  },
  applyverdict() {
    const op = fuel().review.verdict.op;
    if (op && confirm("Apply this to the cards? It starts with tomorrow morning's plan, and you can clear it here.")) send(op);
  },
  clearadjust() { send({ op: "carb_adjust", levels: {} }); },
});
