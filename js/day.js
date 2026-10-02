// The day's timeline on screen — meals and training in one list, live
// (js/timeline.js) — plus the two ways to tell it what really happened:
//  · training: done at a time, moved to a time, or skipped (session_log);
//  · eating: a meal at a different time (meal_log ate_at), or something else
//    entirely — described in words, estimated by the coach, logged as a swap
//    on the meals it replaced (or an extra on top). The rest of the day then
//    re-times and rebalances itself.
import { S, A, INPUTS, SHEETS, esc, fuel, send, sheet, renderSheet, render, today, ask, requests, uid, fmtNum } from "./core.js";
import { dayOf, dayLabel, macroLine } from "./ui.js";
import { liveDay, hm, toMin } from "./timeline.js";

export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const EAT = new Set(["meal", "snack", "during", "extra"]);
const TRAIN_ICON = { mat: "🥋", lift: "🏋", lic: "🚴", mobility: "🧘" };
const ICON = { meal: "🍽", snack: "🥤", during: "💧", work: "🚒", sleep: "☾", cue: "·", extra: "➕" };

export function live(d) {
  if (!d?.timeline) return null;
  const f = fuel();
  const now = d.when === "today" ? nowMin() : d.when === "past" ? 1e6 : -1;
  return liveDay(d, { now, rules: f?.timeline_rules, floor: f?.protein_floor });
}

const signed = (n) => `${n >= 0 ? "+" : "−"}${fmtNum(Math.abs(Math.round(n)))}`;

function rowFor(d, slot) { return d.card?.rows.find((r) => r.slot === slot) || null; }

function tlRow(d, i) {
  const eating = EAT.has(i.kind);
  const icon = i.kind === "train" ? TRAIN_ICON[i.train] || "🏋" : ICON[i.kind] || "·";
  const st = { done: "✓", past: "✓", skipped: "✕", squeezed: "⚠", fold: "↩", now: "▶" }[i.status] || (i.next ? "●" : "");
  const time = `${esc(i.at)}${i.until && ["train", "work"].includes(i.kind) ? `<span class="muted">–${esc(i.until)}</span>` : ""}`;
  const r = i.slot ? rowFor(d, i.slot) : null;
  const notes = [
    i.why && (i.moved || ["squeezed", "fold"].includes(i.status) || i.tight) ? i.why : null,
    ...(i.adjust || []), ...(i.notes || []),
    r?.company === "shared" && r.for_two ? r.for_two : null,
    r?.company === "away" && r.away_note ? r.away_note : null,
  ].filter(Boolean);
  const macro = eating && i.eff && (i.eff.kcal || i.eff.protein) ? `${fmtNum(Math.round(i.eff.kcal))} kcal · ${Math.round(i.eff.protein)} g P` : "";
  const label = i.kind === "train" || i.kind === "sleep" || i.kind === "work" ? i.label : (i.label || i.what);
  const act = eating && i.slot && d.card?.rows.some((x) => x.slot === i.slot) ? `data-a="rowsheet" data-date="${d.date}" data-slot="${esc(i.slot)}"`
    : i.kind === "train" && i.train === "mat" ? `data-a="classsheet" data-date="${d.date}" data-slot="${esc(i.session.replace(/^mat_/, ""))}"`
    : i.kind === "train" ? `data-a="sesssheet" data-date="${d.date}" data-id="${esc(i.id)}"` : "";
  const Tag = act ? "button" : "div";
  return `<${Tag} class="tl-row ${esc(i.kind)} ${esc(i.status || "")} ${i.next ? "next" : ""}" ${act}>
    <span class="tl-t">${time}${i.moved ? `<s>${esc(hm(i.ideal))}</s>` : ""}</span>
    <span class="tl-i">${icon}</span>
    <span class="tl-w"><b>${esc(label)}</b>${macro ? `<span class="muted small">${esc(macro)}${i.swapped ? (i.estimated ? " · estimated" : " · logged") : ""}</span>` : ""}
      ${notes.map((n) => `<span class="tl-n">${esc(n)}</span>`).join("")}</span>
    <span class="tl-s">${st}</span></${Tag}>`;
}

export function timelineCard(d, { title = "Your day", open = true } = {}) {
  const L = live(d);
  if (!L) return "";
  const b = L.balance;
  let head = "";
  if (b.deviated) {
    head = `<p class="adj">So far ≈${fmtNum(Math.round(b.eaten.kcal))} kcal · ${Math.round(b.eaten.protein)} g protein (${signed(b.dev.kcal)} kcal vs the card). `
      + (b.adjustments.length ? "The rest of today is adjusted below." : esc(b.lines?.[0] || "Nothing to change — back on the card at the next meal.")) + `</p>`;
  }
  const rows = L.items.filter((i) => i.kind !== "cue" || i.slot === "overnight").map((i) => tlRow(d, i)).join("");
  const extras = L.untimed.filter((i) => i.extra).map((i) => `<p class="muted small">➕ ${esc(i.label)} — ${fmtNum(i.eff.kcal)} kcal (no time logged)</p>`).join("");
  const body = `${head}<div class="tl">${rows}</div>${extras}
    ${(d.timeline.notes || []).map((n) => `<p class="muted small">${esc(n)}</p>`).join("")}
    ${d.when !== "future" ? `<div class="toolrow"><button class="btn sm" data-a="devsheet" data-date="${d.date}">Ate something else</button></div>` : ""}`;
  return open ? `<section class="card"><h2>${esc(title)}</h2>${body}</section>`
    : `<section class="card"><details class="cues"><summary>${esc(title)}</summary>${body}</details></section>`;
}

// The next thing to do, from the live day — a meal (with its adjustment) or a session.
export function nextOf(d) {
  const L = live(d);
  return L?.next ? { item: L.next, live: L } : null;
}

// ------------------------------------------------------------ training time
SHEETS.sess = (sh) => {
  const d = dayOf(sh.date);
  const L = live(d);
  const i = L?.items.find((x) => x.id === sh.id);
  if (!i) return "";
  const logged = d.session_log?.[i.session];
  const spec = S.plan?.sessions?.[i.session];
  const t = logged?.at || (d.when === "today" && i.status !== "past" ? i.at : i.at);
  return `<div class="sheet"><h3>${esc(i.label)} — ${esc(i.at)}${i.until ? `–${esc(i.until)}` : ""}</h3>
    ${i.why ? `<p class="adj">${esc(i.why)}</p>` : ""}
    ${spec && d.when === "today" ? `<button class="btn primary big" data-a="open" data-k="${esc(i.session)}">Start it now</button>` : ""}
    <label class="fld">Time<input type="time" id="sesst" value="${esc(t)}"></label>
    <div class="choices">
      ${d.when !== "future" ? `<button class="btn big" data-a="sessmark" data-status="done">Did it at this time</button>` : ""}
      <button class="btn big" data-a="sessmark" data-status="moved">${d.when === "future" ? "Plan it for this time" : "Moving it to this time"}</button>
      <button class="btn big" data-a="sessmark" data-status="skipped">${d.when === "future" ? "Won't happen that day" : "Skipping it today"}</button>
      ${logged ? `<button class="btn ghost" data-a="sessmark" data-status="clear">Clear — back to the plan</button>` : ""}
    </div>
    <p class="muted small">Meals around it re-time themselves: a full meal 2–4 h before a lift, the next one within 2 h after.</p>
    <button class="btn ghost" data-a="closesheet">Close</button></div>`;
};

// ------------------------------------------------------------ ate something else
const estimates = () => requests().filter((q) => q.body.kind === "estimate");

SHEETS.dev = (sh) => {
  const d = dayOf(sh.date);
  if (!d) return "";
  const rows = d.card.rows.filter((r) => !r.session && r.kcal != null && !["during"].includes(r.slot));
  const chosen = new Set(sh.slots || []);
  const q = sh.reqId ? estimates().find((x) => x.id === sh.reqId) : null;
  const one = chosen.size + (sh.extra ? 1 : 0) === 1;
  let est = "";
  if (q?.state === "done") {
    const res = q.response.result;
    est = `<div class="qa"><p class="muted small">Coach's estimate${res.confidence ? ` (${esc(res.confidence)} confidence)` : ""}: ${esc(res.note || "")}</p>
      ${res.items.map((it) => `<p><b>${esc(it.slot ? (rowFor(d, it.slot)?.time || it.slot) + " · " + it.slot.replace("_", " ") : "Extra")}</b> — ${esc(it.what)}<br>
        <span class="muted small">${esc(macroLine(it))}</span></p>`).join("")}
      <button class="btn primary big" data-a="devlogest">Log it — rebalance the rest of the day</button></div>`;
  } else if (q?.state === "error") est = `<p class="warn-text">No estimate: ${esc(q.response?.error || "try again")}</p>`;
  else if (q) est = `<p class="muted">Estimating — about a minute. You can close this; it waits here.</p>`;
  return `<div class="sheet"><h3>Ate something else — ${esc(dayLabel(sh.date))}</h3>
    <label class="fld">What did you eat?<textarea id="devtext" rows="2" data-a="devdraft" placeholder="e.g. leftover Ethiopian — doro wat, misir wat, 2 injera">${esc(S.devDraft || "")}</textarea></label>
    <p class="small"><b>Instead of</b> <span class="muted">(tap all it replaced)</span></p>
    <div class="chips">${rows.map((r) => `<button class="chipbtn ${chosen.has(r.slot) ? "on" : ""}" data-a="devrow" data-slot="${esc(r.slot)}">${esc(r.time)} · ${esc(r.slot.replace("_", " "))}</button>`).join("")}
      <button class="chipbtn ${sh.extra ? "on" : ""}" data-a="devrow" data-slot="_extra">Extra — on top</button></div>
    ${one ? `<label class="fld">When<input type="time" id="devat" value="${esc(sh.at || hm(nowMin()))}" data-a="devat"></label>` : ""}
    ${est}
    ${!q || q.state !== "sent" && q.state !== "queued" ? `<button class="btn ${q?.state === "done" ? "" : "primary"} big" data-a="devestimate">${q ? "Estimate again" : "Estimate it"}</button>` : ""}
    <details class="cues" ${sh.numbers ? "open" : ""}><summary>I know the numbers</summary>
      <div class="two"><label class="fld">kcal<input id="devkcal" type="number" inputmode="numeric"></label>
        <label class="fld">Protein g<input id="devprot" type="number" inputmode="numeric"></label></div>
      <div class="two"><label class="fld">Carbs g<input id="devcarb" type="number" inputmode="numeric"></label>
        <label class="fld">Fat g<input id="devfat" type="number" inputmode="numeric"></label></div>
      <button class="btn big" data-a="devlognum">Log these numbers</button>
      ${chosen.size > 1 ? `<p class="muted small">Split evenly across the ${chosen.size} meals it replaced.</p>` : ""}</details>
    <button class="btn ghost" data-a="closesheet">Close</button></div>`;
};

function devOps(sh, items) {
  const ops = [];
  const at = (sh.slots || []).length + (sh.extra ? 1 : 0) === 1 ? (document.getElementById("devat")?.value || sh.at || null) : null;
  for (const it of items) {
    const m = { kcal: Math.round(it.kcal || 0), protein: Math.round(it.protein || 0), carbs: Math.round(it.carbs || 0), fat: Math.round(it.fat || 0) };
    if (it.slot) {
      ops.push({ op: "meal_log", date: sh.date, slot: it.slot, status: "swapped", ...(at ? { ate_at: at } : {}),
        swap: { title: it.what, what: it.what, ...m, uses: {}, estimated: !!it.estimated } });
    } else {
      ops.push({ op: "off_card", id: uid("d"), date: sh.date, text: it.what, kind: "meal", ...m, ...(at ? { ate_at: at } : {}) });
    }
  }
  return ops;
}

Object.assign(INPUTS, {
  devdraft(el) { S.devDraft = el.value; },
  devat(el) { S.sheet = { ...S.sheet, at: el.value }; },
});

Object.assign(A, {
  sesssheet(d) { sheet({ type: "sess", date: d.date, id: d.id }); },
  sessmark(d) {
    const sh = S.sheet;
    const day = dayOf(sh.date);
    const i = live(day)?.items.find((x) => x.id === sh.id);
    if (!i) return;
    const at = document.getElementById("sesst")?.value || null;
    sheet(null);
    send({ op: "session_log", date: sh.date, session: i.session, status: d.status, ...(at && ["done", "moved"].includes(d.status) ? { at } : {}) });
  },
  devsheet(d) {
    const day = dayOf(d.date || today());
    const L = live(day);
    const slot = d.slot || (L?.next && L.next.slot) || null;
    sheet({ type: "dev", date: d.date || today(), slots: slot ? [slot] : [], extra: false, at: hm(nowMin()) });
  },
  devrow(d) {
    const sh = S.sheet;
    if (d.slot === "_extra") { S.sheet = { ...sh, extra: !sh.extra, slots: !sh.extra ? [] : sh.slots, reqId: null }; renderSheet(); return; }
    const set = new Set(sh.slots || []);
    if (set.has(d.slot)) set.delete(d.slot); else set.add(d.slot);
    S.sheet = { ...sh, slots: [...set], extra: false, reqId: null };
    renderSheet();
  },
  devestimate() {
    const sh = S.sheet;
    const text = (document.getElementById("devtext")?.value || "").trim();
    if (!text) return;
    const day = dayOf(sh.date);
    const rows = (sh.slots || []).map((s) => rowFor(day, s)).filter(Boolean)
      .map((r) => ({ slot: r.slot, time: r.time, what: r.what, kcal: r.kcal, protein: r.protein }));
    if (!rows.length && !sh.extra) { S.sheet = { ...sh, extra: true }; }
    const id = ask({ kind: "estimate", text, date: sh.date, rows });
    S.sheet = { ...S.sheet, reqId: id };
    renderSheet();
  },
  devlogest() {
    const sh = S.sheet;
    const q = estimates().find((x) => x.id === sh.reqId);
    if (q?.state !== "done") return;
    const items = q.response.result.items.map((it) => ({ ...it, estimated: true }));
    sheet(null);
    S.devDraft = "";
    send(devOps(sh, items));
  },
  devlognum() {
    const sh = S.sheet;
    const v = (id) => Number(document.getElementById(id)?.value) || 0;
    const tot = { kcal: v("devkcal"), protein: v("devprot"), carbs: v("devcarb"), fat: v("devfat") };
    if (!tot.kcal) return;
    const what = (document.getElementById("devtext")?.value || "").trim() || "Something else";
    const slots = sh.slots || [];
    const n = Math.max(1, slots.length);
    const part = Object.fromEntries(Object.entries(tot).map(([k, x]) => [k, x / n]));
    const items = slots.length ? slots.map((slot) => ({ slot, what, ...part })) : [{ slot: null, what, ...tot }];
    sheet(null);
    S.devDraft = "";
    send(devOps(sh, items));
  },
  ateat() {
    const sh = S.sheet;
    const at = document.getElementById("ateat")?.value;
    sheet(null);
    send({ op: "meal_log", date: sh.date, slot: sh.slot, status: "eaten", ...(at ? { ate_at: at } : {}) });
  },
});

// keep "now" moving on the Today screen (only when nothing is open — never mid-typing)
setInterval(() => { if (S.tab === "today" && !S.view && !S.sheet && document.visibilityState === "visible") render(); }, 60000);
