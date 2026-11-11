// The Progress tab: is it working? Training and recovery first — this week against its plan,
// eight weeks of the same, the body's numbers, the health baseline — then the food: the plan
// check (the fuel plan's own decision rules), the numbers behind it, and where to add one.
// Nothing here is logged by hand except a weigh-in, the waist, and the two baseline check-offs.
import { S, A, SHEETS, esc, fuel, send, sheet, today, fmtNum, pendingOps } from "./core.js";
import { dayLabel } from "./ui.js";
import { weightChart, energyChart, trendCharts } from "./charts.js";
import { weekCard, healthCard } from "./health.js";

const signed = (n, d = 1) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`);
const tile = (label, value, note = "", cls = "") => `<div class="tile ${cls}"><span>${esc(label)}</span><b>${value}</b><i>${esc(note)}</i></div>`;
const adjText = (a) => Object.entries(a || {}).map(([k, v]) => `${k} ${v > 0 ? "+" : "−"}${Math.abs(v)}`).join(", ");

// The health baseline (coach/trend.py): what no wearable sees. A check-off he sent that the
// coach hasn't folded in yet shows at once.
function baseline() {
  const items = (S.plan?.trend?.baseline || []).map((i) => ({ ...i }));
  for (const o of pendingOps().filter((x) => x.op === "health_item")) {
    const i = items.find((x) => x.id === o.item);
    if (!i) continue;
    if (o.clear) Object.assign(i, { last: null, note: null, status: "owed", next: null });
    else Object.assign(i, { last: o.date || today(), note: o.note || null, status: "ok", next: null });
  }
  const rank = { owed: 0, due: 1, ok: 2 };
  return items.sort((a, b) => rank[a.status] - rank[b.status]);
}

function baselineCard() {
  const items = baseline();
  if (!items.length) return "";
  const open = items.filter((i) => i.status !== "ok").length;
  const date = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: iso.slice(0, 4) === today().slice(0, 4) ? undefined : "numeric" });
  const row = (i) => {
    const ok = i.status === "ok";
    const st = i.status === "owed" ? "not yet" : i.status === "due" ? `due${i.last ? ` · last ${date(i.last)}` : i.next ? ` ${date(i.next)}` : ""}`
      : [i.last ? date(i.last) : null, i.next ? `next ${date(i.next)}` : null].filter(Boolean).join(" · ");
    const act = i.check ? `<button class="btn sm ${ok ? "ghost" : ""}" data-a="blsheet" data-id="${esc(i.id)}">${ok ? "Edit" : "Mark done…"}</button>`
      : i.id === "waist" ? `<button class="btn sm ${ok ? "ghost" : ""}" data-a="waistsheet">+ Measure</button>`
      : ok ? "" : i.id === "hip" && S.plan?.routines?.hip_check ? `<button class="btn sm" data-a="open" data-k="hip_check">Start (5 min)</button>`
      : "";
    const detail = `<p>${esc(i.what)}</p>${i.lines?.length ? `<ul>${i.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}`;
    return `<div class="bl ${esc(i.status)}"><div class="bl-h"><span class="g">${ok ? "✓" : "○"}</span><b>${esc(i.label)}</b><span class="st">${esc(st)}</span></div>
      ${ok ? (i.note ? `<p class="muted">${esc(i.note)}</p>` : "") : `<details class="cues"><summary>${i.lines?.length ? "What to ask for" : "How"}</summary>${detail}</details>`}
      ${act ? `<div class="toolrow" style="justify-content:flex-start">${act}</div>` : ""}</div>`;
  };
  return `<section class="card"><div class="lift-head"><h2>Health baseline</h2><span class="tm">${open ? `${open} to do` : "all current"}</span></div>
    ${items.map(row).join("")}
    <p class="muted small">What no watch or ring can see. This is a list to take to your physician — the app records that a check was done, never what a result means.</p></section>`;
}

function trendCard() {
  const weeks = S.plan?.trend?.weeks;
  if (!weeks?.length) return "";
  return `<section class="card"><div class="lift-head"><h2>Last ${weeks.length} weeks</h2><span class="tm">from your watch · ring · scale</span></div>
    ${trendCharts(weeks)}
    <p class="muted small">Strength is read at each block's end and on the assessment day — the training maxes are on the Train tab.</p></section>`;
}

export function viewProgress() {
  const f = fuel();
  let html = weekCard() + trendCard() + healthCard() + baselineCard();
  if (!f?.review) return html || `<section class="card"><p class="muted">Progress loads with the next morning run.</p></section>`;
  const r = f.review, v = r.verdict, w = r.weight, e = r.energy, a = r.adherence;
  const adjusted = Object.keys(f.carb_adjust || {}).length;
  const canApply = v.op && !f.carb_adjust_pending && JSON.stringify(v.op.levels) !== JSON.stringify(f.carb_adjust);
  html += `<h3 class="sub sect">Food</h3><section class="card verdict ${esc(v.code)}"><span class="eyebrow">Plan check${r.window.days_in ? ` · day ${r.window.days_in}` : ""}</span>
    <h2>${esc(v.title)}</h2><p>${esc(v.action)}</p>
    ${(v.why || []).length ? `<ul class="plain muted small">${v.why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${canApply ? `<button class="btn primary" data-a="applyverdict">Apply it (${esc(adjText(v.op.levels))} carb portion)</button>` : ""}
    ${adjusted ? `<p class="adj">Carb dial in effect: ${esc(adjText(f.carb_adjust))} portion${f.carb_adjust_pending ? " — updating" : ""}.
      <button class="link" data-a="clearadjust">clear</button></p>` : ""}
  </section>`;

  const latest = w.latest;
  const guide = f.mode === "guide";            // his own food to the cards' numbers: intake isn't measured, so it isn't shown as if it were
  html += `<div class="tiles">
    ${tile("Weight", latest ? `${latest.lb}<small> lb</small>` : `${esc(w.manual_lb ?? "—")}<small> lb</small>`,
      w.loss_lb_per_wk != null ? `${signed(-w.loss_lb_per_wk)} lb/week` : latest ? `${dayLabel(latest.date)} · trend needs ${Math.max(0, 4 - w.n)} more` : "no weigh-ins yet")}
    ${tile("Waist", r.waist.points.length ? `${r.waist.points[r.waist.points.length - 1].inches}<small> in</small>` : "—",
      r.waist.to_go != null ? (r.waist.to_go > 0 ? `${r.waist.to_go} in to go (under 36)` : "under 36 — there") : "measure on an off morning")}
    ${guide ? "" : tile("Eating", e.intake_avg ? `${fmtNum(e.intake_avg)}<small> kcal</small>` : "—", `plan averages ${fmtNum(e.plan_avg)} a day`)}
    ${tile("Burning", e.burn_avg ? `${fmtNum(e.burn_avg)}<small> kcal</small>` : "—", guide ? "Garmin, daily average" : e.implied_deficit != null ? `deficit ${fmtNum(e.implied_deficit)} a day` : "Garmin, needs 5 days")}
    ${guide ? "" : tile("Protein", a.protein_avg ? `${a.protein_avg}<small> g</small>` : "—", `floor ${a.protein_floor} g`)}
    ${tile("Off the card", `${a.off_card_7d.meals}<small> meal${a.off_card_7d.meals === 1 ? "" : "s"}</small> · ${a.off_card_7d.drink_evenings}<small> night${a.off_card_7d.drink_evenings === 1 ? "" : "s"}</small>`,
      `this week · budget ${a.budget.meals} and ${a.budget.drink_evenings}`, a.off_card_7d.meals > a.budget.meals || a.off_card_7d.drink_evenings > a.budget.drink_evenings ? "over" : "")}
  </div>`;

  html += `<section class="card"><div class="lift-head"><h2>Morning weight</h2><button class="btn sm primary" data-a="weightsheet">+ Weigh-in</button></div>
    ${w.points.length ? weightChart(w.points) : `<p class="muted">No weigh-ins yet. The scale syncs on its own; you can also type one in.</p>`}
    <p class="muted small">Off-day mornings only count — a post-shift weight swings with lost sleep, salt and fluid. Judge it loop to loop.</p></section>`;

  if (!guide) html += `<section class="card"><h2>Eaten against burned</h2>
    ${e.intake.length || e.burn.length ? energyChart(e.intake, e.burn) : `<p class="muted">Fills in as days go by.</p>`}
    ${e.calibration ? `<p class="adj">${esc(e.calibration)}</p>` : `<p class="muted small">Garmin's burn calibrates the plan against what the scale does. It's never a number to eat back.</p>`}</section>`;

  if (r.waist.points.length > 1) html += `<section class="card"><h2>Waist</h2>
    <ul class="plain loglist">${[...r.waist.points].reverse().slice(0, 6).map((p) => `<li>${esc(dayLabel(p.date))} — <b>${p.inches} in</b></li>`).join("")}</ul></section>`;

  const off = [...(f.off_card || [])].reverse().slice(0, 12);
  const li = (x) => `<li><span class="muted">${esc(dayLabel(x.date))}</span> ${esc(x.text)}
      <button class="link" data-a="offdel" data-id="${esc(x.id)}">remove</button></li>`;
  html += `<section class="card"><div class="lift-head"><h2>Off-card log</h2><button class="btn sm" data-a="offcard">+ Add</button></div>
    ${off.length ? `<ul class="plain loglist">${off.slice(0, 3).map(li).join("")}</ul>
      ${off.length > 3 ? `<details class="cues"><summary>${off.length - 3} earlier</summary><ul class="plain loglist">${off.slice(3).map(li).join("")}</ul></details>` : ""}`
      : `<p class="muted small">Nothing logged. Add one for any day — yesterday and earlier included.</p>`}
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

SHEETS.baseline = (sh) => {
  const i = baseline().find((x) => x.id === sh.id);
  if (!i) return "";
  return `<div class="sheet"><h3>${esc(i.label)}</h3>
    <label class="fld">Date it was done<input id="bldate" type="date" value="${esc(i.last || today())}" max="${today()}"></label>
    <label class="fld">Note (optional)<input id="blnote" maxlength="300" value="${esc(i.note || "")}" placeholder="${i.id === "bp" ? "e.g. 118/76 average" : "e.g. ApoB 78, Lp(a) 12, vitamin D 34"}"></label>
    <p class="muted small">Your own record. The coach doesn't read meaning into it — what the numbers mean is your physician's call.</p>
    <div class="sheet-foot">${i.last ? `<button class="btn ghost" data-a="blclear" data-id="${esc(i.id)}">Not done</button>` : `<button class="btn ghost" data-a="closesheet">Cancel</button>`}
      <button class="btn primary" data-a="blsave" data-id="${esc(i.id)}">Save</button></div></div>`;
};

const val = (id) => document.getElementById(id)?.value?.trim() ?? "";
Object.assign(A, {
  blsheet(d) { sheet({ type: "baseline", id: d.id }); },
  blsave(d) {
    const date = val("bldate") || today(), note = val("blnote");
    sheet(null);
    send({ op: "health_item", item: d.id, date, ...(note ? { note } : {}) });
  },
  blclear(d) { sheet(null); send({ op: "health_item", item: d.id, clear: true }); },
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
