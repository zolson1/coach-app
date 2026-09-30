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

// One delegated handler for every chart on the page: hover, tap, or focus a
// column to read it. Values go in with textContent — they are data, not markup.
export function wireCharts(root) {
  const show = (g) => {
    const fig = g.closest(".chart");
    fig.querySelectorAll(".xg.on").forEach((el) => el.classList.remove("on"));
    g.classList.add("on");
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
