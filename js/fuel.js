// The Fuel tab: any day's level and card (two weeks back, two weeks ahead),
// check-offs, skips and swaps, deviations for that day, and the small tools
// around eating (level override, eating out, the sweat test).
import { S, A, SHEETS, esc, fuel, send, sheet, render, renderSheet, today, ask, requests, store, fmtNum, uid } from "./core.js";
import { levelChip, dayOf, dayLabel, statusLine, macroLine, LEVEL_NAME, companyControl, companyDetail } from "./ui.js";
import { dayTotals, sweat } from "./ops.js";
import { timelineCard, nowMin } from "./day.js";
import { hm } from "./timeline.js";

const SESSION_NAME = { strength_a: "Strength A", strength_b: "Strength B", domain: "Domain Day", lic: "Zone 2",
  loaded_mobility: "Loaded mobility", mobility_pm: "Mobility", rest: "Rest" };
const SUPPS = [["creatine", "Creatine 5 g — breakfast"], ["omega3", "Omega-3, 2 softgels — dinner"], ["magnesium", "Magnesium glycinate — before bed"]];

const selDate = () => (S.fuelDate && dayOf(S.fuelDate) ? S.fuelDate : today());

export function viewFuel() {
  const f = fuel();
  if (!f) return `<section class="card"><p class="muted">The fuel plan loads with the next morning run.</p></section>`;
  const d = dayOf(selDate()) || f.days.find((x) => x.when === "today") || f.days[f.days.length - 1];
  if (!d) return `<section class="card"><h2>Fuel plan starts ${esc(f.start || "soon")}</h2><p class="muted">Nothing to show before day one.</p></section>`;
  const strip = `<div class="daystrip" id="daystrip">${f.days.map((x) => {
    const dt = new Date(x.date + "T12:00:00");
    const marks = (x.off_card?.length ? "•" : "") + (Object.values(x.log || {}).some((e) => e.status !== "eaten") ? "⇄" : "");
    return `<button class="daychip ${x.date === d.date ? "sel" : ""} ${x.when}" data-a="fday" data-date="${x.date}">
      <span class="dow">${x.when === "today" ? "Today" : dt.toLocaleDateString("en-US", { weekday: "short" })}</span>
      <span class="dom">${dt.getDate()}</span>${levelChip(x.level.pending || x.level.today)}<span class="marks">${marks}</span></button>`;
  }).join("")}</div>`;
  return strip + dayHTML(f, d);
}

function dayHTML(f, d) {
  const lv = d.level;
  const t = dayTotals(d);
  const live = d.when !== "future";
  const sessions = [d.mat === "double" ? "BJJ + Muay Thai" : d.mat === "one" ? "One class" : null,
    ...(d.sessions || []).map((s) => SESSION_NAME[s] || s), ...(d.activities || []).map((a) => a.name)].filter(Boolean);
  let html = `<section class="card dayhead">
    <div class="lift-head"><h2>${esc(dayLabel(d.date))}</h2>${levelChip(lv.today, LEVEL_NAME[lv.today])}</div>
    <p class="big-num">${fmtNum(lv.kcal)} <span>kcal</span> · ${lv.protein}+ <span>g protein</span> · ${esc(String(lv.carbs).replace("~", ""))} <span>carbs</span></p>
    <p class="muted">${esc(statusLine(d))}${sessions.length ? ` — ${esc(sessions.join(" · "))}` : ""}</p>
    ${(lv.why || []).map((w) => `<p class="adj">${esc(w)}</p>`).join("")}
    ${lv.pending ? `<p class="adj">Changing to ${esc(lv.pending)} — the card updates in about a minute.</p>` : ""}
    ${d.leave ? `<p class="adj">Leave: ${esc({ full: "the whole shift", first12: "first 12 h — working the night half", last12: "last 12 h — working the day half" }[d.leave.part])}</p>` : ""}
    ${d.leave_pending ? `<p class="muted small">Leave saved — the plan rebuilds in about a minute.</p>` : ""}
    ${d.plan_pending ? `<p class="muted small">Plan change saved — this day rebuilds in about a minute.</p>` : ""}
    ${d.when !== "past" ? `<div class="toolrow"><button class="btn sm ghost" data-a="plansheet" data-date="${d.date}">Edit training…</button>
      ${["SHIFT", "OT-DAY", "OT-NIGHT"].includes(d.leave?.base || d.day_type) ? `<button class="btn sm ghost" data-a="leavesheet" data-date="${d.date}">Leave…</button>` : ""}</div>` : ""}
    ${d.sleep_gated && d.when === "future" ? `<p class="muted small">Sleep-gated: 3–6 h on shift drops this a level; under 3 h makes it F1.</p>` : ""}
    ${live ? `<div class="meter" title="protein"><i style="width:${Math.min(100, (t.protein / (f.protein_floor || 200)) * 100)}%"></i></div>
      <p class="muted small">Logged ${t.logged} of ${t.rows} · ${fmtNum(t.kcal)} of ${fmtNum(t.plan_kcal)} kcal · ${t.protein} g protein (floor ${f.protein_floor})</p>` : ""}
  </section>`;

  const company = d.card.rows.filter((r) => r.company);
  if (company.length) {
    const c = f.company || {};
    html += `<section class="card"><div class="lift-head"><h2>Who's eating</h2>
        <button class="btn sm" data-a="companysheet">Usual</button></div>
      ${company.map((r) => companyControl(d, r) + companyDetail(r)).join("")}
      <p class="muted small">She eats about ${Math.round((c.share || 0.6) * 100)}% of your portion. Set it the day before when you can — tonight's thaw follows it.</p>
    </section>`;
  }

  html += timelineCard(d, { title: d.when === "today" ? "Today's timeline" : "Day timeline — meals and training", open: d.when === "future" });

  html += `<section class="card"><div class="lift-head"><h2>${esc(d.card.title)}</h2><span class="tm">${esc(d.card.totals)}</span></div>
    <div class="rows meal">${d.card.rows.map((r) => rowHTML(d, r)).join("")}</div>
    ${live && t.logged < t.rows ? `<button class="btn ghost" data-a="ateall" data-date="${d.date}">Mark the rest as eaten</button>` : ""}
    ${(d.card.notes || []).length ? `<details class="cues" ${d.when === "today" ? "open" : ""}><summary>Notes for this day</summary><ul class="plain">${d.card.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>` : ""}
  </section>`;

  const supp = store.get("supps", {})[d.date] || [];
  const supps = [...SUPPS, ...(d.tendon_shot ? [["tendon", "Tendon shot — 30–60 min before the lift or mobility"]] : [])];
  html += `<section class="card"><h2>Around the food</h2>
    ${(d.session_fuel || []).map((s) => `<p class="line">${esc(s)}</p>`).join("")}
    <p class="line"><b>Caffeine:</b> ${esc(d.caffeine)}</p>
    ${live ? `<div class="tasks">${supps.map(([k, text]) => `<div class="check ${supp.includes(k) ? "done" : ""}">
      <button class="tick" data-a="supp" data-date="${d.date}" data-k="${k}">${supp.includes(k) ? "✓" : ""}</button><span>${esc(text)}</span></div>`).join("")}</div>` : ""}
  </section>`;

  html += `<section class="card"><div class="lift-head"><h2>Off the card</h2>
      <button class="btn sm" data-a="offcard" data-date="${d.date}">+ Add</button></div>
    ${(d.off_card || []).length ? `<ul class="plain loglist">${d.off_card.map((x) => `<li>${esc(x.text)}
      <span class="muted">${x.drinks ? ` · ${x.drinks} drink${x.drinks > 1 ? "s" : ""}` : ""}${x.kcal ? ` · ~${x.kcal} kcal` : ""}</span>
      <button class="link" data-a="offdel" data-id="${esc(x.id)}">remove</button></li>`).join("")}</ul>`
      : `<p class="muted small">A restaurant meal, drinks, anything that wasn't the card. Logged, not judged — the next meal is back on the card.</p>`}
  </section>`;

  html += `<div class="toolrow">
    ${d.when === "today" ? `<button class="btn sm" data-a="levelsheet">Change today's level</button>` : ""}
    <button class="btn sm" data-a="eatout" data-date="${d.date}">Eating out</button>
    <button class="btn sm" data-a="companysheet">Eating with her</button>
    <button class="btn sm" data-a="asksheet">Ask the coach</button>
    <button class="btn sm" data-a="sweatsheet">Sweat test</button>
  </div>`;
  return html;
}

function rowHTML(d, r) {
  if (r.session) return `<div class="row session-row"><span class="k">${esc(r.time)}</span><span class="load">${esc(r.what)}</span></div>`;
  const e = d.log?.[r.slot];
  const state = e?.status;
  const swapped = state === "swapped" && e.swap;
  const icon = state === "eaten" ? "✓" : state === "skipped" ? "✕" : swapped ? "⇄" : "";
  const who = r.company === "shared" ? " · for two" : r.company === "away" ? " · not from the freezer" : "";
  const macros = (r.kcal == null ? "" : swapped ? macroLine(e.swap) : macroLine(r)) + who;
  const what = swapped ? `${esc(e.swap.title || e.swap.what)} <s>${esc(r.what)}</s>`
    : r.company === "away" && r.planned ? `${esc(r.what)} <s>${esc(r.planned)}</s>` : esc(r.what);
  return `<button class="row mealrow ${state || ""}" data-a="rowsheet" data-date="${d.date}" data-slot="${esc(r.slot)}">
    <span class="k">${esc(r.time)}</span>
    <span class="load">${what}</span>
    <span class="plates">${esc(macros)}</span>
    <span class="chk ${state || ""}">${icon}</span></button>`;
}

// ------------------------------------------------------------------ sheets
const rowOf = (date, slot) => { const d = dayOf(date); return [d, d?.card.rows.find((r) => r.slot === slot)]; };

SHEETS.row = (sh) => {
  const [d, r] = rowOf(sh.date, sh.slot);
  if (!r) return "";
  const e = d.log?.[r.slot];
  const live = d.when !== "future";
  const recipe = recipeFor(r);
  return `<div class="sheet"><h3>${esc(r.time)} — ${esc(dayLabel(d.date))}</h3>
    <p>${esc(r.what)}</p>${r.planned ? `<p class="muted small">Planned: ${esc(r.planned)}</p>` : ""}<p class="muted">${esc(macroLine(r))}</p>
    ${e?.status === "swapped" ? `<p class="adj">Swapped for: ${esc(e.swap.what)} (${esc(macroLine(e.swap))})</p>` : ""}
    ${r.company ? companyControl(d, r) + companyDetail(r) : ""}
    <div class="choices">
      ${live ? `<button class="btn primary big" data-a="meal" data-status="eaten">Ate it${e?.ate_at ? "" : " (as planned)"}</button>
        <div class="two"><label class="fld">Ate it at<input type="time" id="ateat" value="${esc(e?.ate_at || (d.when === "today" ? hm(nowMin()) : ""))}"></label>
          <button class="btn" data-a="ateat">Ate it at this time</button></div>` : ""}
      <button class="btn big" data-a="swapsheet">${live ? "Had something else…" : "Plan a swap…"}</button>
      <button class="btn big" data-a="meal" data-status="skipped">${live ? "Skipped it" : "Will skip it"}</button>
      ${e ? `<button class="btn ghost" data-a="meal" data-status="clear">Clear</button>` : ""}
      ${recipe ? `<button class="btn ghost" data-a="recipe" data-k="${esc(recipe)}">Recipe</button>` : ""}
      <button class="btn ghost" data-a="asksheet" data-date="${esc(d.date)}" data-slot="${esc(r.slot)}">Ask about this</button>
    </div>
    <button class="btn ghost" data-a="closesheet">Close</button></div>`;
};

function recipeFor(r) {
  const f = fuel();
  for (const k of Object.keys(r.uses || {})) if (f.menu.batches[k]?.recipe) return f.menu.batches[k].recipe;
  const m = /Recipe (\d)/.exec(r.what);
  if (m) return Object.keys(f.menu.recipes).find((k) => String(f.menu.recipes[k].n) === m[1]) || null;
  return null;
}

function swapRequest(sh) {
  return requests().filter((q) => q.body.kind === "swap" && q.body.date === sh.date && q.body.slot === sh.slot).pop();
}

SHEETS.swap = (sh) => {
  const f = fuel();
  const [d, r] = rowOf(sh.date, sh.slot);
  if (!r) return "";
  const builtin = (f.menu.swaps || []).filter((s) => s.slot === r.slot);
  const q = swapRequest(sh);
  const opt = (s, i, src) => `<button class="option" data-a="useswap" data-src="${src}" data-i="${i}">
      <b>${esc(s.title)}</b><span>${esc(s.what)}</span>
      <span class="muted">${esc(macroLine(s))}${s.when ? ` · ${esc(s.when)}` : ""}${s.why ? ` · ${esc(s.why)}` : ""}</span>
      ${(s.how || []).length ? `<span class="muted small">${esc(s.how.join(" → "))}</span>` : ""}</button>`;
  let coach = "";
  if (q?.state === "done") {
    const res = q.response.result;
    coach = `${res.note ? `<p class="adj">${esc(res.note)}</p>` : ""}${res.options.map((s, i) => opt(s, i, "coach")).join("")}`;
  } else if (q?.state === "error") {
    coach = `<p class="warn-text">No answer: ${esc(q.response?.error || "try again")}</p>`;
  } else if (q) {
    coach = `<p class="muted">Asking the coach — about a minute. You can close this; the answer waits here.</p>`;
  }
  return `<div class="sheet"><h3>Instead of: ${esc(r.what)}</h3>
    <p class="muted">Target ${esc(macroLine(r))}</p>
    ${d.when !== "future" ? `<button class="btn primary big" data-a="devsheet" data-date="${esc(sh.date)}" data-slot="${esc(sh.slot)}">Describe what I ate — the coach estimates it</button>` : ""}
    ${builtin.length ? `<h4>From the plan</h4>${builtin.map((s, i) => opt(s, i, "menu")).join("")}` : ""}
    <h4>From what you have</h4>
    ${coach}
    ${!q || q.state === "done" || q.state === "error" ? `<label class="fld">Anything specific? (optional)<input id="swapnote" placeholder="e.g. use the ribeye, something cold, no cooking"></label>
      <button class="btn" data-a="askswap">${q ? "Ask again" : "Ask the coach — uses your pantry"}</button>` : ""}
    <h4>Or type what you had</h4>
    <label class="fld">What<input id="cwhat" placeholder="e.g. Chipotle bowl, double chicken"></label>
    <div class="two"><label class="fld">kcal<input id="ckcal" type="number" inputmode="numeric" placeholder="${esc(r.kcal ?? "")}"></label>
      <label class="fld">Protein g<input id="cprot" type="number" inputmode="numeric" placeholder="${esc(r.protein ?? "")}"></label></div>
    <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Cancel</button>
      <button class="btn primary" data-a="customswap">Save what I had</button></div></div>`;
};

SHEETS.offcard = (sh) => `<div class="sheet"><h3>Off the card — ${esc(dayLabel(sh.date))}</h3>
  <label class="fld">Date<input id="ocdate" type="date" value="${esc(sh.date)}" max="${today()}"></label>
  <label class="fld">What was it<input id="octext" placeholder="burgers and 2 beers with the crew"></label>
  <div class="two"><label class="fld">Drinks<input id="ocdrinks" type="number" inputmode="numeric" placeholder="0"></label>
    <label class="fld">Extra kcal (optional)<input id="ockcal" type="number" inputmode="numeric" placeholder="estimate"></label></div>
  <p class="muted small">Leave the calories blank and the review assumes about 500 for a meal and 130 a drink.</p>
  <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Cancel</button>
    <button class="btn primary" data-a="saveoffcard">Log it</button></div></div>`;

SHEETS.level = () => {
  const f = fuel();
  const d = dayOf(today());
  return `<div class="sheet"><h3>Today's fuel level</h3>
    <p class="muted">The calendar and your readiness set it to ${esc(d?.level.today)}. Override it when the day turned out differently.</p>
    <div class="choices">${Object.entries(f.levels).map(([k, v]) => `<button class="btn big ${d?.level.today === k ? "primary" : ""}" data-a="setlevel" data-l="${k}">
      ${k} · ${fmtNum(v.kcal)} kcal <span class="muted small">${esc(v.what)}</span></button>`).join("")}</div>
    <label class="fld">Why (optional)<input id="lvlwhy" placeholder="skipped the mat, added a session…"></label>
    <button class="btn ghost" data-a="closesheet">Cancel</button></div>`;
};

SHEETS.eatout = (sh) => {
  const f = fuel();
  const d = dayOf(sh.date);
  const big = ["F3", "F4"].includes(d?.level.today);
  const orders = (f.menu.swaps || []).filter((s) => /eating out|on the road/i.test(s.when || ""));
  return `<div class="sheet"><h3>Eating out on an ${esc(d?.level.today)} day</h3>
    <ol class="plain"><li>Protein first — double it if the portion is under 40 g.</li><li>Add vegetables.</li>
      <li>One starch: <b>${big ? "a full portion" : "half a portion"}</b> today.</li>
      <li>One sauce, on the side. No mayo, mustard, ranch or aioli.</li><li>Water or zero-calorie drinks.</li>
      <li>Never a fried main, fries and dessert in the same meal.</li></ol>
    ${orders.map((s) => `<div class="option static"><b>${esc(s.title)}</b><span>${esc(s.what)}</span><span class="muted">${esc(macroLine(s))}</span></div>`).join("")}
    <p class="muted small">It replaces the card's meal at that time — don't eat both, and don't skip earlier meals to save calories.</p>
    <button class="btn ghost" data-a="closesheet">Close</button></div>`;
};

SHEETS.company = () => {
  const c = fuel().company || {};
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${l}</option>`;
  const share = c.share >= 0.64 ? "0.67" : c.share <= 0.52 ? "0.5" : "0.6";
  return `<div class="sheet"><h3>Eating with her</h3>
    <p class="muted">The usual, for days you don't say otherwise. Change any one meal in the Fuel tab's "Who's eating" — the day before is best, so the thaw reminder pulls the right pack.</p>
    <label class="fld">Dinner, usually<select id="cmdinner">${opt("shared", "With her, at mine", c.dinner)}${opt("solo", "Just me", c.dinner)}</select></label>
    <label class="fld">Lunch, usually<select id="cmlunch">${opt("solo", "Just me", c.lunch)}${opt("shared", "With her, at mine", c.lunch)}</select></label>
    <label class="fld">Her portion<select id="cmshare">${opt("0.5", "About half of mine", share)}${opt("0.6", "About 60% of mine", share)}${opt("0.67", "About two-thirds of mine", share)}</select></label>
    ${c.rate != null ? `<p class="muted small">Lately you've shared about ${Math.round(c.rate * 100)}% of dinners — the cook day sizes the batch and the for-two packs from that.</p>` : ""}
    <p class="muted small">Your own portions and macros never change. "At hers / out" takes that meal off the freezer, and the card gives you a protein-first target for it.</p>
    <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Cancel</button>
      <button class="btn primary" data-a="savecompany">Save</button></div></div>`;
};

SHEETS.sweat = () => {
  const f = fuel();
  const last = (f.sweat_tests || []).slice(-1)[0];
  return `<div class="sheet"><h3>Sweat test</h3>
    <p class="muted">On a double day: pee, weigh nude before BJJ; note everything you drink; towel off and weigh nude right after Muay Thai.</p>
    <div class="two"><label class="fld">Before (lb)<input id="swpre" type="number" inputmode="decimal" step="0.1"></label>
      <label class="fld">After (lb)<input id="swpost" type="number" inputmode="decimal" step="0.1"></label></div>
    <div class="two"><label class="fld">Drank (L)<input id="swdrank" type="number" inputmode="decimal" step="0.1" value="1.4"></label>
      <label class="fld">Minutes<input id="swmin" type="number" inputmode="numeric" value="150"></label></div>
    ${last ? `<p class="adj">Last test (${esc(last.date)}): ${last.rate_l_per_h} L/h, ${last.lost_pct}% of bodyweight lost. Drink ${last.drink_l_per_h[0]}–${last.drink_l_per_h[1]} L/h in the block; afterwards replace ${last.replace_l[0]}–${last.replace_l[1]} L${last.third_bottle ? "; add a third bottle with electrolytes" : ""}.</p>` : ""}
    <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Close</button>
      <button class="btn primary" data-a="savesweat">Work it out</button></div></div>`;
};

// ------------------------------------------------------------------ actions
const val = (id) => document.getElementById(id)?.value?.trim() ?? "";

Object.assign(A, {
  fday(d) { S.fuelDate = d.date; render(); },
  rowsheet(d) { sheet({ type: "row", date: d.date, slot: d.slot }); },
  closesheet() { sheet(null); },
  meal(d) {
    const sh = S.sheet;
    sheet(null);
    send({ op: "meal_log", date: sh.date, slot: sh.slot, status: d.status });
  },
  ateall(d) {
    const day = dayOf(d.date);
    send(day.card.rows.filter((r) => !r.session && r.kcal != null && !day.log?.[r.slot])
      .map((r) => ({ op: "meal_log", date: d.date, slot: r.slot, status: "eaten" })));
  },
  swapsheet() { sheet({ type: "swap", date: S.sheet.date, slot: S.sheet.slot }); },
  askswap() {
    const sh = S.sheet;
    const [d, r] = rowOf(sh.date, sh.slot);
    ask({ kind: "swap", date: sh.date, slot: sh.slot, level: d.level.today, note: val("swapnote"),
      row: { what: r.what, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat } });
    renderSheet();
  },
  useswap(d) {
    const sh = S.sheet;
    const f = fuel();
    const [, r] = rowOf(sh.date, sh.slot);
    const list = d.src === "menu" ? (f.menu.swaps || []).filter((s) => s.slot === r.slot) : swapRequest(sh).response.result.options;
    const s = list[Number(d.i)];
    sheet(null);
    send({ op: "meal_log", date: sh.date, slot: sh.slot, status: "swapped",
      swap: { title: s.title, what: s.what, kcal: s.kcal, protein: s.protein, carbs: s.carbs, fat: s.fat, uses: s.uses || {} } });
  },
  customswap() {
    const sh = S.sheet;
    const [, r] = rowOf(sh.date, sh.slot);
    const what = val("cwhat");
    if (!what) return;
    sheet(null);
    send({ op: "meal_log", date: sh.date, slot: sh.slot, status: "swapped",
      swap: { title: what, what, kcal: Number(val("ckcal")) || r.kcal, protein: Number(val("cprot")) || r.protein, uses: {} } });
  },
  supp(d) {
    const all = store.get("supps", {});
    const set = new Set(all[d.date] || []);
    if (set.has(d.k)) set.delete(d.k); else set.add(d.k);
    const keep = Object.keys(all).sort().slice(-20);
    store.set("supps", { ...Object.fromEntries(keep.map((k) => [k, all[k]])), [d.date]: [...set] });
    render();
  },
  offcard(d) { sheet({ type: "offcard", date: d.date || today() }); },
  saveoffcard() {
    const text = val("octext");
    if (!text) return;
    const drinks = Number(val("ocdrinks")) || 0, kcal = Number(val("ockcal")) || null;
    const meal = !drinks || /[a-z]{3,}/i.test(text.replace(/beers?|drinks?|wine|whiskey|cocktails?/gi, "").replace(/\d+/g, ""));
    const date = val("ocdate") || S.sheet.date;
    sheet(null);
    send({ op: "off_card", id: uid("d"), date, text, drinks: drinks || undefined, kcal: kcal ?? undefined,
      kind: drinks && meal ? "both" : drinks ? "drinks" : "meal" });
  },
  offdel(d) { send({ op: "off_card_remove", id: d.id }); },
  levelsheet() { sheet({ type: "level" }); },
  setlevel(d) {
    const why = val("lvlwhy");
    sheet(null);
    send({ op: "fuel_level", level: d.l, date: today(), why: why || undefined });
  },
  eatout(d) { sheet({ type: "eatout", date: d.date }); },
  companysheet() { sheet({ type: "company" }); },
  savecompany() {
    const o = { op: "company_settings", dinner: val("cmdinner"), lunch: val("cmlunch"), share: Number(val("cmshare")) };
    sheet(null);
    send(o);
  },
  sweatsheet() { sheet({ type: "sweat" }); },
  savesweat() {
    const o = { op: "sweat_test", date: today(), pre_lb: Number(val("swpre")), post_lb: Number(val("swpost")),
      drank_l: Number(val("swdrank")) || 0, minutes: Number(val("swmin")) || 150 };
    if (!o.pre_lb || !o.post_lb) return;
    send(o);
    renderSheet();
  },
});

export { sweat };
