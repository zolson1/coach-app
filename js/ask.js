// Ask the coach: a question about the plan ("does the tendon shot include the
// OJ?"), answered from the program and fuel-plan documents plus what the app
// shows — about a minute. Say something as fact ("eating at hers tonight") and
// it comes back as ops the sync job applies, like a correction. An answer that
// finds the app showing something wrong is flagged, and the morning briefing
// says so.
import { S, A, INPUTS, SHEETS, esc, sheet, renderSheet, today, ask, requests } from "./core.js";
import { dayOf, dayLabel } from "./ui.js";

const asks = () => requests().filter((q) => q.body.kind === "ask");
const when = (iso) => { const l = dayLabel(iso); return /^(Today|Tomorrow|Yesterday)$/.test(l) ? l.toLowerCase() : l; };

// The last few answered questions about the same day, so a follow-up has its context.
function thread(date) {
  return asks().filter((q) => q.state === "done" && q.body.date === date).slice(-3)
    .map((q) => ({ q: q.body.text, a: q.response.result.answer }));
}

const WHO = { shared: "with her", solo: "just you", away: "at hers / out", clear: "the usual" };
function opText(o) {
  if (o.op === "company") return `${o.slot || "dinner"} ${when(o.date)}: ${WHO[o.who] || o.who}`;
  if (o.op === "report_sleep") return `slept ${o.hours} h`;
  if (o.op === "schedule_override") return `${when(o.date)} is ${String(o.type).toLowerCase()}`;
  return o.op.replace(/_/g, " ");
}

function qaHTML(q) {
  const res = q.response?.result || {};
  const ab = q.body.about;
  let a;
  if (q.state === "done") {
    a = `<p class="a">${esc(res.answer || "No answer came back.")}</p>
      ${(res.ops || []).length ? `<p class="muted small">Updated: ${esc(res.ops.map(opText).join(" · "))} — the plan refreshes in about a minute.</p>` : ""}
      ${res.flag ? `<p class="muted small">Flagged for a fix: ${esc(res.flag)}</p>` : ""}`;
  } else if (q.state === "error") {
    a = `<p class="warn-text">No answer: ${esc(q.response?.error || "try again")}</p>`;
  } else {
    a = `<p class="muted">Thinking — about a minute. You can close this; the answer waits here.</p>`;
  }
  return `<div class="qa-item">${ab ? `<span class="muted small">${esc(dayLabel(ab.date))} · ${esc(ab.time)} — ${esc(ab.what)}</span>` : ""}
    <p class="q">${esc(q.body.text)}</p>${a}</div>`;
}

SHEETS.ask = (sh) => {
  const list = asks().slice(-6);
  const about = sh.about;
  return `<div class="sheet"><h3>Ask the coach</h3>
    ${list.length ? `<div class="qa">${list.map(qaHTML).join("")}</div>`
      : `<p class="muted small">Anything about the plan — what a row means, timing, a swap, a rule. Answers come from your program and fuel plan in about a minute. Tell it something ("eating at hers tonight", "I slept 7") and it updates the plan too.</p>`}
    ${about ? `<p class="aboutchip">About ${esc(when(about.date))} · ${esc(about.time)} — ${esc(about.what)}
      <button class="link" data-a="askclear">not about this</button></p>` : ""}
    <textarea id="asktext" rows="3" data-a="askdraft" placeholder="${about ? "What about it?" : "e.g. Is 2 h enough after lunch before Zone 2?"}">${esc(S.askDraft || "")}</textarea>
    <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Close</button>
      <button class="btn primary" data-a="sendask">Ask</button></div></div>`;
};

Object.assign(INPUTS, {
  askdraft(el) { S.askDraft = el.value; },
});

Object.assign(A, {
  asksheet(d) {
    let about = null;
    if (d.date && d.slot) {
      const r = dayOf(d.date)?.card.rows.find((x) => x.slot === d.slot);
      if (r) about = { date: d.date, slot: d.slot, time: r.time, what: r.planned || r.what };
    }
    sheet({ type: "ask", about });
  },
  askclear() { S.sheet = { ...S.sheet, about: null }; renderSheet(); },
  sendask() {
    const text = (document.getElementById("asktext")?.value || "").trim();
    if (!text) return;
    const about = S.sheet?.about || null;
    const date = about?.date || today();
    ask({ kind: "ask", text, date, ...(about ? { about } : {}), thread: thread(date) });
    S.askDraft = "";
    renderSheet();
  },
});
