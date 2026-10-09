// The Today tab: the one screen to open — what to eat next, what to train,
// what the kitchen needs tonight, and whether anything wants attention.
import { S, A, esc, fuel, send, today, fmtNum, pendingCount } from "./core.js";
import { levelChip, dayOf, statusLine, tasksHTML, macroLine, LEVEL_NAME, companyControl, companyDetail } from "./ui.js";
import { dayTotals, nextRow } from "./ops.js";
import { sessionButton } from "./train.js";
import { matCard, mobilityCard } from "./mat.js";
import { fixPending } from "./fix.js";
import { timelineCard, nextOf, workCard } from "./day.js";
import { suggestionsCard } from "./plan.js";

export function viewToday() {
  const p = S.plan;
  const f = fuel();
  const d = f ? dayOf(today()) : null;
  const t = p?.today && p.today.date === today() ? p.today : null;
  let html = "";

  if (d) {
    const lv = d.level, tot = dayTotals(d);
    const r = t?.readiness || {};
    const sleep = r.sleep_last_night_h != null ? `slept ${r.sleep_last_night_h} h` : null;
    const fixing = fixPending();
    html += `<section class="card dayhead"><div class="lift-head"><h2>${esc(d.weekday)}</h2>${levelChip(lv.today, LEVEL_NAME[lv.today])}</div>
      <p class="big-num">${fmtNum(lv.kcal)} <span>kcal</span> · ${lv.protein}+ <span>g protein</span></p>
      <div class="lift-head"><p class="muted">${esc([statusLine(d), sleep ? `${sleep}${r.sleep_source === "reported" ? " (you)" : ""}` : null, r.hrv_state ? `HRV ${r.hrv_state}` : null].filter(Boolean).join(" · "))}</p>
        <div class="btnpair"><button class="btn sm" data-a="asksheet">Ask</button><button class="btn sm" data-a="fixsheet">Fix</button></div></div>
      ${fixing.length ? `<p class="adj">Fix sent (${esc(fixing.map((o) => o.op === "report_sleep" ? `slept ${o.hours} h` : o.op === "schedule_override" ? `today is ${o.type.toLowerCase()}` : o.op === "neck_sore" ? "neck sore" : "neck fine").join(", "))}) — today rebuilds in about a minute.</p>` : ""}
      ${(lv.why || []).map((w) => `<p class="adj">${esc(w)}</p>`).join("")}
      <div class="meter" title="protein"><i style="width:${Math.min(100, (tot.protein / (f.protein_floor || 200)) * 100)}%"></i></div>
      <p class="muted small">${tot.logged} of ${tot.rows} meals logged · ${tot.protein} of ${f.protein_floor} g protein</p></section>`;

    html += workCard(d);
    html += suggestionsCard();
    const now = new Date();
    const dinner = d.card.rows.find((r) => r.slot === "dinner" && r.company && !d.log?.[r.slot]);
    const nx = nextOf(d);
    const dinnerAt = nx?.live.items.find((x) => x.slot === "dinner")?.at || null;
    if (nx) {
      // the next thing from the live day: a meal (re-timed, with any rebalance) or a session
      const i = nx.item;
      const notes = [i.moved && i.why ? i.why : null, ...(i.adjust || [])].filter(Boolean);
      if (i.kind === "train") {
        const spec = p?.sessions?.[i.session];
        html += `<section class="card next"><span class="eyebrow">Next · ${esc(i.at)}${i.until ? `–${esc(i.until)}` : ""}</span>
          <h2>${esc(i.label)}</h2>${notes.map((n) => `<p class="adj">${esc(n)}</p>`).join("")}
          <div class="two">${spec ? `<button class="btn primary" data-a="open" data-k="${esc(i.session)}">Start</button>` : ""}
            ${i.train === "activity" ? `<button class="btn" data-a="actsheet" data-date="${d.date}" data-id="${esc(i.activity)}">Done / moved / skipped…</button>`
              : i.train === "mat" ? `<button class="btn" data-a="classsheet" data-date="${d.date}" data-slot="${esc(i.session.replace(/^mat_/, ""))}">Class done / swapped…</button>`
              : `<button class="btn" data-a="sesssheet" data-date="${d.date}" data-id="${esc(i.id)}">Done / moved / skipped…</button>`}</div>
          ${dinner ? companyControl(d, dinner, dinnerAt) + companyDetail(dinner) : ""}</section>`;
      } else {
        const row = d.card.rows.find((r) => r.slot === i.slot) || {};
        html += `<section class="card next"><span class="eyebrow">Next · ${esc(i.at)}${i.moved ? ` <s>${esc(row.time || "")}</s>` : ""}</span>
          <h2>${esc(i.label || i.what)}</h2><p class="muted">${esc(macroLine(i.eff ? { ...i.eff, kcal: Math.round(i.eff.kcal) } : i))}</p>
          ${notes.map((n) => `<p class="adj">${esc(n)}</p>`).join("")}${companyDetail(row)}
          <div class="two"><button class="btn primary" data-a="atenext" data-slot="${esc(i.slot)}" data-at="${esc(i.at)}">Ate it</button>
            <button class="btn" data-a="devsheet" data-date="${d.date}" data-slot="${esc(i.slot)}">Ate something else</button></div>
          ${dinner ? companyControl(d, dinner, dinnerAt) + (dinner.slot === i.slot ? "" : companyDetail(dinner)) : ""}</section>`;
      }
      html += timelineCard(d);
    } else {
    const next = nextRow(d, now.getHours() * 60 + now.getMinutes());
    html += next ? `<section class="card next"><span class="eyebrow">Next · ${esc(next.time)}</span>
        <h2>${esc(next.what)}</h2><p class="muted">${esc(macroLine(next))}</p>${companyDetail(next)}
        <div class="two"><button class="btn primary" data-a="atenext" data-slot="${esc(next.slot)}">Ate it</button>
          <button class="btn" data-a="tab" data-t="fuel">The whole card</button></div>
        ${dinner ? companyControl(d, dinner) + (dinner === next ? "" : companyDetail(dinner)) : ""}</section>`
      : `<section class="card next"><span class="eyebrow">Food</span><h2>Every meal is logged.</h2>
        <p class="muted">${fmtNum(tot.kcal)} kcal · ${tot.protein} g protein today.</p></section>`;
    }
  } else if (f && !f.started) {
    html += `<section class="card"><h2>The fuel plan starts ${esc(f.start)}</h2></section>`;
  }

  const sessions = p?.sessions || {};
  const runnable = (t?.sessions || []).filter((k) => sessions[k]);
  html += matCard(d);
  html += `<section class="card"><div class="lift-head"><h2>Training</h2><button class="btn sm ghost" data-a="plansheet" data-date="${today()}">Edit today</button></div>
    ${(d?.activities || []).map((a) => `<button class="notice" data-a="actsheet" data-date="${today()}" data-id="${esc(a.id)}"><b>${esc(a.name)}</b> · ${esc(a.start || "set a time")}${a.dur ? `, ${a.dur} min` : ""} <span class="muted">· ${esc(a.intensity === "hard" ? "a hard session" : "counts as Zone 2")}</span></button>`).join("")}
    ${d?.covered ? `<p class="line">Zone 2 — covered by ${esc(d.covered.lic)}; no separate LIC.</p>` : ""}
    ${d?.plan_pending ? `<p class="muted small">Plan change saved — today rebuilds in about a minute.</p>` : ""}
    ${S.active ? `<button class="btn primary big" data-a="resume">Resume ${esc(S.active.spec.title)}</button>` : ""}
    ${runnable.map((k) => sessionButton(sessions[k], true)).join("")}
    ${(d?.sessions || t?.sessions || []).includes("lic") ? `<p class="line">Zone 2, 45–60 min.</p>` : ""}
    ${!d?.mat_plan && !runnable.length && !(d?.sessions || t?.sessions || []).includes("lic") && !(d?.activities || []).length ? `<p class="muted">Nothing scheduled${t ? "" : " — today's plan arrives with the morning run"}.</p>` : ""}
    ${t?.deviation ? `<p class="warn-text">${esc(t.deviation)}</p>` : ""}</section>`;
  html += mobilityCard();

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

  html += `<div class="toolrow"><button class="btn sm" data-a="devsheet" data-date="${today()}">Ate something else</button>
    <button class="btn sm" data-a="weightsheet">Weigh-in</button><button class="btn sm" data-a="waistsheet">Waist</button></div>`;
  const n = pendingCount();
  if (n) html += `<p class="muted small center">${n} change${n > 1 ? "s" : ""} syncing to the coach…</p>`;
  return html;
}

Object.assign(A, {
  atenext(d) { send({ op: "meal_log", date: today(), slot: d.slot, status: "eaten", ...(d.at ? { ate_at: d.at } : {}) }); },
});
