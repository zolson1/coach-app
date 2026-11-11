// The Today tab: the one screen to open — where the day stands, what's next, the day in
// order, and the sessions to start. About a screen and a half (2026-11-10: it had grown to
// three and a half; the week's scorecard and the body numbers moved to Progress).
import { S, A, esc, fuel, send, today, fmtNum, pendingCount } from "./core.js";
import { levelChip, dayOf, tasksHTML, macroLine, LEVEL_NAME, companyControl, companyDetail } from "./ui.js";
import { dayTotals, nextRow, livedTotals } from "./ops.js";
import { sessionButton } from "./train.js";
import { matCard, mobilityRow } from "./mat.js";
import { fixPending } from "./fix.js";
import { timelineCard, nextOf, workRows } from "./day.js";
import { suggestionsCard } from "./plan.js";
import { freshBanner, weekStrip } from "./health.js";

// A competition inside its window: what today is for (coach/program.py § Competition).
function eventLine(d) {
  const e = d?.event;
  if (!e) return "";
  const n = e.offset;
  const what = n === 0 ? "today — nothing else on the plan"
    : n === -1 ? "tomorrow — primer only, no hard rounds"
    : n === -2 ? "in 2 days — no hard contact, nothing that leaves you sore"
    : n < 0 ? `in ${-n} days — Nordics and Copenhagens are off until after`
    : "was yesterday — an easy day";
  return `<p class="adj"><b>${esc(e.name)}</b> ${esc(what)}.</p>`;
}

export function viewToday() {
  const p = S.plan;
  const f = fuel();
  const d = f ? dayOf(today()) : null;
  const t = p?.today && p.today.date === today() ? p.today : null;
  let html = freshBanner();

  if (d) {
    const lv = d.level, tot = dayTotals(d), lived = livedTotals(d);
    const r = t?.readiness || {};
    const hm = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
    const sleep = r.sleep_last_night_h != null ? `slept ${hm(r.sleep_last_night_h)}` : null;
    const fixing = fixPending();
    html += `<section class="card dayhead"><div class="lift-head"><h2>${esc(d.weekday)} ${levelChip(lv.today, LEVEL_NAME[lv.today])}</h2>
        <div class="btnpair"><button class="btn sm" data-a="asksheet">Ask</button><button class="btn sm" data-a="fixsheet">Fix</button></div></div>
      <p class="big-num">${fmtNum(lv.kcal)} <span>kcal</span> · ${lv.protein}+ <span>g protein</span></p>
      <p class="muted">${esc([d.status, sleep ? `${sleep}${r.sleep_source === "reported" ? " (you)" : ""}` : null, r.hrv_state ? `HRV ${r.hrv_state}` : null, d.early_night ? "early night" : null].filter(Boolean).join(" · "))}</p>
      ${fixing.length ? `<p class="adj">Fix sent (${esc(fixing.map((o) => o.op === "report_sleep" ? `slept ${o.hours} h` : o.op === "schedule_override" ? `today is ${o.type.toLowerCase()}` : o.op === "neck_sore" ? "neck sore" : "neck fine").join(", "))}) — today rebuilds in about a minute.</p>` : ""}
      ${eventLine(d)}
      ${(lv.why || []).map((w) => `<p class="adj">${esc(w)}</p>`).join("")}
      ${lived.changes ? `<p class="muted small">With your ${lived.changes} change${lived.changes > 1 ? "s" : ""}: ≈${fmtNum(lived.kcal)} kcal · ${lived.protein} g protein</p>` : ""}
      ${workRows(d)}</section>`;

    html += suggestionsCard("today");
    const now = new Date();
    const dinner = d.card.rows.find((r) => r.slot === "dinner" && r.company && !d.log?.[r.slot]);
    const nx = nextOf(d);
    const dinnerAt = nx?.live.items.find((x) => x.slot === "dinner")?.at || null;
    if (nx) {
      // the next thing from the live day: a meal (re-timed, with any rebalance) or a session
      const i = nx.item;
      const notes = [i.moved && i.why ? i.why : null, ...(i.adjust || []), ...(i.notes || [])].filter(Boolean);
      if (i.kind === "train") {
        const spec = p?.sessions?.[i.session];
        html += `<section class="card next"><span class="eyebrow">Next · ${esc(i.at)}${i.until ? `–${esc(i.until)}` : ""}</span>
          <h2>${esc(i.label)}</h2>${notes.map((n) => `<p class="adj">${esc(n)}</p>`).join("")}
          <div class="two">${spec ? `<button class="btn primary" data-a="open" data-k="${esc(i.session)}">Start</button>` : ""}
            ${i.train === "activity" ? `<button class="btn" data-a="actsheet" data-date="${d.date}" data-id="${esc(i.activity)}">Moved or skipped?</button>`
              : i.train === "mat" ? `<button class="btn" data-a="classsheet" data-date="${d.date}" data-slot="${esc(i.session.replace(/^mat_/, ""))}">Different class or skipped?</button>`
              : `<button class="btn" data-a="sesssheet" data-date="${d.date}" data-id="${esc(i.id)}">Moved or skipped?</button>`}</div>
          ${dinner ? companyControl(d, dinner, dinnerAt) + companyDetail(dinner) : ""}</section>`;
      } else {
        const row = d.card.rows.find((r) => r.slot === i.slot) || {};
        const guide = row.guide && row.build;        // guide mode: the target is the headline, the meal an example
        html += `<section class="card next"><span class="eyebrow">Next · ${esc(i.at)}${i.moved ? ` <s>${esc(row.time || "")}</s>` : ""}</span>
          <h2>${esc(guide ? row.build.charAt(0).toUpperCase() + row.build.slice(1) : i.label || i.what)}</h2>
          ${guide ? `<p class="muted small">e.g. ${esc(row.what)}</p>` : ""}<p class="muted">${esc(macroLine(i.eff ? { ...i.eff, kcal: Math.round(i.eff.kcal) } : i))}</p>
          ${notes.map((n) => `<p class="adj">${esc(n)}</p>`).join("")}${companyDetail(row)}
          <div class="two"><button class="btn" data-a="devsheet" data-date="${d.date}" data-slot="${esc(i.slot)}">Ate something else</button>
            <button class="btn ghost" data-a="rowsheet" data-date="${d.date}" data-slot="${esc(i.slot)}">Moved / skipped</button></div>
          ${dinner ? companyControl(d, dinner, dinnerAt) + (dinner.slot === i.slot ? "" : companyDetail(dinner)) : ""}</section>`;
      }
      html += timelineCard(d, { fold: true });
    } else {
    const next = nextRow(d, now.getHours() * 60 + now.getMinutes());
    html += next ? `<section class="card next"><span class="eyebrow">Next · ${esc(next.time)}</span>
        <h2>${esc(next.what)}</h2><p class="muted">${esc(macroLine(next))}</p>${companyDetail(next)}
        <div class="two"><button class="btn" data-a="devsheet" data-date="${d.date}" data-slot="${esc(next.slot)}">Ate something else</button>
          <button class="btn ghost" data-a="tab" data-t="fuel">The whole card</button></div>
        ${dinner ? companyControl(d, dinner) + (dinner === next ? "" : companyDetail(dinner)) : ""}</section>`
      : `<section class="card next"><span class="eyebrow">Food</span><h2>That's the day's food.</h2>
        <p class="muted">≈${fmtNum(lived.kcal)} kcal · ${lived.protein} g protein today.</p></section>`;
    }
  } else if (f && !f.started) {
    html += `<section class="card"><h2>The fuel plan starts ${esc(f.start)}</h2></section>`;
  }

  const sessions = p?.sessions || {};
  const runnable = (t?.sessions || []).filter((k) => sessions[k]);
  html += matCard(d);
  const lic = (d?.sessions || t?.sessions || []).includes("lic");
  const nothing = !d?.mat_plan && !runnable.length && !lic && !(d?.activities || []).length;
  html += `<section class="card"><div class="lift-head"><h2>Training</h2><div class="btnpair"><button class="btn sm" data-a="weekview">Week</button><button class="btn sm ghost" data-a="plansheet" data-date="${today()}">Edit today</button></div></div>
    ${(d?.activities || []).map((a) => `<button class="notice" data-a="actsheet" data-date="${today()}" data-id="${esc(a.id)}"><b>${esc(a.name)}</b> · ${esc(a.start || "set a time")}${a.dur ? `, ${a.dur} min` : ""} <span class="muted">· ${esc(a.intensity === "hard" ? "a hard session" : "counts as Zone 2")}</span></button>`).join("")}
    ${d?.covered ? `<p class="line">Zone 2 — covered by ${esc(d.covered.lic)}; no separate LIC.</p>` : ""}
    ${d?.plan_pending ? `<p class="muted small">Plan change saved — today rebuilds in about a minute.</p>` : ""}
    ${S.active ? `<button class="btn primary big" data-a="resume">Resume ${esc(S.active.spec.title)}</button>` : ""}
    ${runnable.map((k) => sessionButton(sessions[k], true)).join("")}
    ${lic ? `<p class="line">Zone 2, 45–60 min.</p>` : ""}
    ${nothing ? `<p class="muted">No session scheduled${t ? "" : " — today's plan arrives with the morning run"}.</p>` : ""}
    ${t?.deviation ? `<p class="warn-text">${esc(t.deviation)}</p>` : ""}
    ${mobilityRow()}</section>`;
  html += weekStrip();
  html += suggestionsCard("later");

  if (d) {
    const tasks = tasksHTML(d);
    if (tasks) html += `<section class="card"><h2>Kitchen</h2>${tasks}</section>`;
    const short = f.kitchen.short[0];
    const v = f.review?.verdict;
    const notes = [];
    if (short) notes.push(`<button class="notice" data-a="tab" data-t="kitchen"><b>${esc(short.label)}</b> run out before the next ${esc(short.refill_kind)}.</button>`);
    if (v && !["collect", "on_track", "early"].includes(v.code)) notes.push(`<button class="notice" data-a="tab" data-t="progress"><b>Plan check:</b> ${esc(v.title)}</button>`);
    const tm = (p.tm_changes || []).filter((c) => c.date >= today()).length;
    if (tm) notes.push(`<button class="notice" data-a="tab" data-t="train"><b>${tm} training max${tm > 1 ? "es" : ""}</b> changed today.</button>`);
    if (notes.length) html += `<section class="card"><h2>Worth a look</h2>${notes.join("")}</section>`;
  }

  const n = pendingCount();
  if (n) html += `<p class="muted small center">${n} change${n > 1 ? "s" : ""} syncing to the coach…</p>`;
  return html;
}

Object.assign(A, {
  atenext(d) { send({ op: "meal_log", date: today(), slot: d.slot, status: "eaten", ...(d.at ? { ate_at: d.at } : {}) }); },
});
