// Two small SVG charts for the Progress tab, built as strings. Marks follow a
// fixed spec (2px lines, r4 markers with a surface ring, ≤24px bars with a
// rounded data-end, hairline grid); colors are the validated --series-* pair.
// Every x position is a hit column carrying its own readout, so a tap or hover
// anywhere in the column shows the values — the pointer never has to find a mark.
import { esc } from "./core.js";

const W = 340, H = 190, PAD = { l: 38, r: 14, t: 12, b: 24 };
const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
const day = (iso) => Math.round(new Date(iso + "T12:00:00").getTime() / 86400000);
const short = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const long = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || 1;
  const step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const out = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function frame(ticks, y, xticks, x) {
  return ticks.map((t) => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="tick" x="${PAD.l - 6}" y="${y(t) + 3.5}" text-anchor="end">${t.toLocaleString("en-US")}</text>`).join("")
    + xticks.map((iso, i) => `<text class="tick" x="${x(iso)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === xticks.length - 1 ? "end" : "middle"}">${esc(short(iso))}</text>`).join("");
}

const table = (head, rows) => `<details class="datatable"><summary>Table</summary><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;

// Weigh-ins over time. One series, so no legend: counted (off-morning) readings
// are solid and joined by the line; the rest are hollow and sit off it.
export function weightChart(points) {
  if (!points.length) return "";
  const d0 = day(points[0].date), d1 = Math.max(day(points[points.length - 1].date), d0 + 14);
  const ys = points.map((p) => p.lb);
  const ticks = niceTicks(Math.min(...ys) - 1, Math.max(...ys) + 1);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const LABEL = 46;                                   // room on the right for the end label, so it never sits on the line
  const x = (iso) => PAD.l + ((day(iso) - d0) / (d1 - d0)) * (iw - LABEL);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;
  const counted = points.filter((p) => p.off_morning);
  const path = counted.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.lb).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const endDate = new Date((d1) * 86400000).toISOString().slice(0, 10);
  const cols = points.map((p, i) => {
    const cx = x(p.date), prev = i ? x(points[i - 1].date) : PAD.l, next = i < points.length - 1 ? x(points[i + 1].date) : cx + 24;
    const a = i ? (prev + cx) / 2 : PAD.l, b = i < points.length - 1 ? (cx + next) / 2 : cx + 12;
    return `<g class="xg" tabindex="0" data-tip="${esc(`${long(p.date)}|${p.lb} lb${p.off_morning ? "" : " — post-shift, not counted"}${p.src === "manual" ? " · typed in" : ""}`)}">
      <line class="cross" x1="${cx}" x2="${cx}" y1="${PAD.t}" y2="${PAD.t + ih}"/>
      <circle class="dot ${p.off_morning ? "" : "hollow"}" cx="${cx}" cy="${y(p.lb)}" r="4"/>
      <rect class="hit" x="${a}" y="${PAD.t}" width="${Math.max(24, b - a)}" height="${ih}"/></g>`;
  }).join("");
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Morning weight, ${points.length} weigh-ins, latest ${last.lb} pounds">
      ${frame(ticks, y, [points[0].date, endDate], x)}
      ${counted.length > 1 ? `<path class="line s1" d="${path}"/>` : ""}
      ${cols}
      <text class="endlabel" x="${x(last.date) + 9}" y="${y(last.lb) + 4}">${last.lb} lb</text>
    </svg><div class="tip" hidden></div>
    ${table(["Date", "Weight (lb)", "Counted"], [...points].reverse().map((p) => [long(p.date), p.lb, p.off_morning ? "yes" : "post-shift"]))}</figure>`;
}

// Plan intake (columns) against Garmin's burn (line), one kcal axis from zero.
export function energyChart(intake, burn) {
  const dates = [...new Set([...intake.map((d) => d.date), ...burn.map((d) => d.date)])].sort();
  if (!dates.length) return "";
  const I = Object.fromEntries(intake.map((d) => [d.date, d])), B = Object.fromEntries(burn.map((d) => [d.date, d.kcal]));
  const max = Math.max(...intake.map((d) => d.kcal), ...burn.map((d) => d.kcal), 3000);
  const ticks = niceTicks(0, max, 4);
  const hi = ticks[ticks.length - 1];
  const band = iw / dates.length, bw = Math.min(24, Math.max(3, band - 2));
  const x = (iso) => PAD.l + (dates.indexOf(iso) + 0.5) * band;
  const y = (v) => PAD.t + (1 - v / hi) * ih;
  const base = y(0);
  const bar = (iso) => {
    const v = I[iso]?.kcal;
    if (!v) return "";
    const top = y(v), r = Math.min(4, bw / 2), l = x(iso) - bw / 2;
    return `<path class="bar s2" d="M${l},${base} V${top + r} Q${l},${top} ${l + r},${top} H${l + bw - r} Q${l + bw},${top} ${l + bw},${top + r} V${base} Z"/>`;
  };
  const burnDates = dates.filter((d) => B[d]);
  const path = burnDates.map((d, i) => `${i ? "L" : "M"}${x(d).toFixed(1)},${y(B[d]).toFixed(1)}`).join(" ");
  const lastB = burnDates[burnDates.length - 1];
  const cols = dates.map((iso) => `<g class="xg" tabindex="0" data-tip="${esc(`${long(iso)}|Ate ${I[iso] ? `${I[iso].kcal.toLocaleString("en-US")} kcal (${I[iso].level})` : "—"}|Burned ${B[iso] ? `${B[iso].toLocaleString("en-US")} kcal` : "—"}`)}">
      <line class="cross" x1="${x(iso)}" x2="${x(iso)}" y1="${PAD.t}" y2="${base}"/>${bar(iso)}
      <rect class="hit" x="${x(iso) - band / 2}" y="${PAD.t}" width="${band}" height="${ih}"/></g>`).join("");
  return `<figure class="chart"><div class="legend"><span><i class="key rect s2"></i>Eaten (plan, less skips, plus off-card)</span><span><i class="key stroke s1"></i>Burned (Garmin)</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily calories eaten against calories burned">
      ${frame(ticks, y, [dates[0], dates[dates.length - 1]], x)}
      ${cols}
      ${burnDates.length > 1 ? `<path class="line s1" d="${path}"/>` : ""}
      ${lastB ? `<circle class="dot" cx="${x(lastB)}" cy="${y(B[lastB])}" r="4"/>` : ""}
    </svg><div class="tip" hidden></div>
    ${table(["Date", "Eaten", "Level", "Burned"], [...dates].reverse().map((d) => [long(d), I[d]?.kcal ?? "—", I[d]?.level ?? "—", B[d] ?? "—"]))}</figure>`;
}

// Eight weeks as small multiples: one measure a panel, one hue, one week readout shared by
// all six (tap a week in any panel and every panel marks it). Counts are columns from zero
// with the week's plan as a tick across the column; averages are lines on their own scale.
// The current, unfinished week is drawn lighter (columns) or hollow (lines).
const TW = 164, TH = 78, TP = { l: 5, r: 5, t: 8, b: 15 };

export function trendCharts(weeks) {
  if (!weeks?.length) return "";
  const n = weeks.length, band = (TW - TP.l - TP.r) / n, th = TH - TP.t - TP.b, base = TP.t + th;
  const cx = (i) => TP.l + (i + 0.5) * band;
  const wkDate = (w, opt = { month: "short", day: "numeric" }) => new Date(w.week + "T12:00:00").toLocaleDateString("en-US", opt);
  const full = weeks.filter((w) => !w.partial);
  const mean = (k, rows = full) => { const xs = rows.map((w) => w[k]).filter((v) => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const f1 = (v) => (v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString("en-US"));
  const of = (a, b) => `${a ?? 0} of ${b ?? 0}`;
  const tip = (w) => [`Week of ${wkDate(w)}${w.partial ? " (so far)" : ""} · ${w.work_days} work day${w.work_days === 1 ? "" : "s"}`,
    `Mat ${of(w.mat, w.mat_plan)}`, `Lifts ${of(w.lifts, w.lifts_plan)}`, `4×4 ${of(w.vo2, w.vo2_plan)}`, `Zone 2 ${w.zone2_min ?? 0} min`,
    `Sleep ${f1(w.sleep)} h${w.nights_under_6 ? ` (${w.nights_under_6} under 6)` : ""}`, `HRV ${f1(w.hrv)}`, `Resting HR ${f1(w.rhr)}`,
    `${f1(w.weight)} lb`].join("|");
  const hits = (inner) => weeks.map((w, i) => `<g class="xg" tabindex="0" data-grp="${i}" data-tip="${esc(tip(w))}">
      <line class="cross" x1="${cx(i)}" x2="${cx(i)}" y1="${TP.t}" y2="${base}"/>${inner(w, i)}
      <rect class="hit" x="${TP.l + i * band}" y="0" width="${band}" height="${TH}"/></g>`).join("");
  const ends = `<text class="tick" x="${TP.l}" y="${TH - 3}">${esc(wkDate(weeks[0]))}</text>
    <text class="tick" x="${TW - TP.r}" y="${TH - 3}" text-anchor="end">${esc(wkDate(weeks[n - 1]))}</text>`;
  const panel = (label, value, unit, sub, svg, aria) => `<div class="tpanel"><div class="tk"><span>${esc(label)}</span>
      <b>${esc(value)}<small>${esc(unit)}</small></b><i>${esc(sub)}</i></div>
    <svg viewBox="0 0 ${TW} ${TH}" role="img" aria-label="${esc(aria)}">${svg}${ends}</svg></div>`;

  const columns = (k, kp) => {
    const hi = Math.max(1, ...weeks.map((w) => Math.max(w[k] || 0, w[kp] || 0)));
    const y = (v) => TP.t + (1 - v / hi) * th, bw = Math.min(24, band - 5);
    return `<line class="grid" x1="${TP.l}" x2="${TW - TP.r}" y1="${base}" y2="${base}"/>` + hits((w, i) => {
      const v = w[k] || 0, top = y(v), r = Math.min(4, bw / 2, (base - top) / 2), l = cx(i) - bw / 2;
      const bar = v ? `<path class="bar s1${w.partial ? " partial" : ""}" d="M${l},${base} V${top + r} Q${l},${top} ${l + r},${top} H${l + bw - r} Q${l + bw},${top} ${l + bw},${top + r} V${base} Z"/>` : "";
      const plan = w[kp] ? `<line class="plan" x1="${l - 2}" x2="${l + bw + 2}" y1="${y(w[kp])}" y2="${y(w[kp])}"/>` : "";
      return bar + plan;
    });
  };
  const line = (k, target = null) => {
    const vals = weeks.map((w) => w[k]).filter((v) => v != null);
    if (!vals.length) return `<text class="tick" x="${TW / 2}" y="${TH / 2}" text-anchor="middle">no data yet</text>`;
    let lo = Math.min(...vals, ...(target != null ? [target] : [])), hi = Math.max(...vals, ...(target != null ? [target] : []));
    const pad = (hi - lo || 1) * 0.18; lo -= pad; hi += pad;
    const y = (v) => TP.t + (1 - (v - lo) / (hi - lo)) * th;
    let d = "", pen = false;                            // a week with no reading breaks the line
    weeks.forEach((w, i) => { if (w[k] == null) { pen = false; return; } d += `${pen ? "L" : "M"}${cx(i).toFixed(1)},${y(w[k]).toFixed(1)} `; pen = true; });
    const last = weeks.reduce((a, w, i) => (w[k] != null ? i : a), -1);
    return (target != null ? `<line class="plan" x1="${TP.l}" x2="${TW - TP.r}" y1="${y(target)}" y2="${y(target)}"/>` : "")
      + `<path class="line s1" d="${d}"/>`
      + hits((w, i) => (w[k] == null ? "" : `<circle class="dot ${i === last ? (w.partial ? "hollow" : "") : "pt"}" cx="${cx(i)}" cy="${y(w[k])}" r="4"/>`));
  };

  const wt = full.filter((w) => w.weight != null);
  const perWk = wt.length > 1 ? (wt[wt.length - 1].weight - wt[0].weight) / ((new Date(wt[wt.length - 1].week) - new Date(wt[0].week)) / 6048e5) : null;
  const sgn = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
  const span = `${full.length} full week${full.length === 1 ? "" : "s"}`;
  const latest = (k) => [...weeks].reverse().find((w) => w[k] != null)?.[k];
  return `<figure class="chart trend"><div class="tgrid">
      ${panel("Mat sessions", f1(mean("mat")), " a week", `planned ${f1(mean("mat_plan"))}`, columns("mat", "mat_plan"), `Mat sessions a week against the plan, ${n} weeks`)}
      ${panel("Lifts", f1(mean("lifts")), " a week", `planned ${f1(mean("lifts_plan"))}`, columns("lifts", "lifts_plan"), `Lifting sessions a week against the plan, ${n} weeks`)}
      ${panel("Sleep", f1(mean("sleep")), " h a night", "line marks 7.5 h", line("sleep", 7.5), `Average sleep a night by week, ${n} weeks`)}
      ${panel("HRV", f1(mean("hrv")), " ms", "weekly average", line("hrv"), `Average overnight HRV by week, ${n} weeks`)}
      ${panel("Resting heart rate", f1(mean("rhr")), " bpm", "weekly average", line("rhr"), `Average resting heart rate by week, ${n} weeks`)}
      ${panel("Weight", f1(latest("weight")), " lb", perWk == null ? "weekly average" : `${sgn(perWk)} lb a week`, line("weight"), `Average morning weight by week, ${n} weeks`)}
    </div>
    <div class="tip trendtip"><span>Averages are over ${esc(span)}. Tap a week for its numbers; the tick across a column is that week's plan.</span></div>
    ${table(["Week of", "Mat", "Lifts", "4×4", "Zone 2", "Sleep", "HRV", "RHR", "Weight"], [...weeks].reverse().map((w) => [wkDate(w) + (w.partial ? " (so far)" : ""),
      `${w.mat ?? 0}/${w.mat_plan ?? 0}`, `${w.lifts ?? 0}/${w.lifts_plan ?? 0}`, `${w.vo2 ?? 0}/${w.vo2_plan ?? 0}`, `${w.zone2_min ?? 0} min`, f1(w.sleep), f1(w.hrv), f1(w.rhr), f1(w.weight)]))}</figure>`;
}

// One delegated handler for every chart on the page: hover, tap, or focus a
// column to read it. Values go in with textContent — they are data, not markup.
// Columns that share a data-grp (the trend panels' weeks) light up together.
export function wireCharts(root) {
  const show = (g) => {
    const fig = g.closest(".chart");
    fig.querySelectorAll(".xg.on").forEach((el) => el.classList.remove("on"));
    const grp = g.dataset.grp;
    (grp == null ? [g] : fig.querySelectorAll(`.xg[data-grp="${Number(grp)}"]`)).forEach((el) => el.classList.add("on"));
    const tip = fig.querySelector(".tip");
    const [head, ...rest] = g.dataset.tip.split("|");
    tip.replaceChildren(Object.assign(document.createElement("span"), { textContent: head }),
      ...rest.map((t) => Object.assign(document.createElement("b"), { textContent: t })));
    tip.hidden = false;
  };
  const over = (e) => { const g = e.target.closest?.(".xg"); if (g && root.contains(g)) show(g); };
  root.addEventListener("pointermove", over);
  root.addEventListener("pointerdown", over);
  root.addEventListener("focusin", over);
}
