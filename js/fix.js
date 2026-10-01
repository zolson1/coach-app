// "The coach got something wrong." Quick fixes for what the morning run reads
// from the world — last night's sleep, what today actually is, a sore neck —
// plus anything else in his own words. Each lands as ops; the sync job
// rebuilds today from the morning's inputs plus the fix, about a minute later.
import { S, A, SHEETS, esc, send, sheet, renderSheet, today, ask, requests, gh, flash, pendingOps } from "./core.js";

const TYPES = [["AS-PLANNED", "As planned"], ["SHIFT", "24-hour shift"], ["OFF", "Off"], ["OT-DAY", "OT day (07–19)"],
  ["OT-NIGHT", "OT night (19–07)"], ["DAYTIME-WORK", "Daytime work"], ["TRAVEL", "Travelling"]];

export function fixPending() {
  const t = today();
  return pendingOps().filter((o) => ["report_sleep", "schedule_override", "neck_sore", "neck_clear"].includes(o.op) && (!o.date || o.date === t));
}

SHEETS.fix = () => {
  const t = S.plan?.today?.date === today() ? S.plan.today : null;
  const r = t?.readiness || {};
  const q = requests().filter((x) => x.body.kind === "correct").slice(-1)[0];
  let answer = "";
  if (q?.state === "done") {
    const res = q.response.result;
    answer = `<p class="adj">${esc(res.understood || "Nothing to change.")}${res.not_done ? ` — not done here: ${esc(res.not_done)}` : ""}</p>`;
  } else if (q?.state === "error") answer = `<p class="warn-text">That didn't go through: ${esc(q.response?.error || "")}</p>`;
  else if (q) answer = `<p class="muted">Reading it — about a minute.</p>`;
  return `<div class="sheet"><h3>Fix today</h3>
    <p class="muted small">Each fix rebuilds today — the readiness gates, the session, the fuel — in about a minute.</p>
    <label class="fld">Last night's sleep (hours)<input id="fxsleep" type="number" inputmode="decimal" step="0.25"
      value="${r.sleep_last_night_h ?? ""}" placeholder="7.5"></label>
    <p class="muted small">${r.sleep_last_night_h != null ? `${r.sleep_source === "reported" ? "You reported" : "The ring recorded"} ${r.sleep_last_night_h} h.` : "Nothing recorded."}</p>
    <label class="fld">Today is actually<select id="fxtype">${TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
    <p class="muted small">Planned as ${esc(t?.day_type || "—")}.</p>
    <label class="chip wide"><input type="checkbox" id="fxneck" ${t?.neck_sore ? "checked" : ""}> Neck is sore (isometrics only until it clears)</label>
    <button class="btn primary big" data-a="savefix">Save the fixes</button>
    <h4>Something else</h4>
    <textarea id="fxtext" rows="3" placeholder="e.g. I worked last night but slept 6 h at the station; or the chili count is wrong, I have 4"></textarea>
    <button class="btn" data-a="sendfix">Tell the coach</button>
    ${answer}
    <h4>Email replies</h4>
    <p class="muted small">GitHub only checks your email a few times a day. This checks it now.</p>
    <button class="btn" data-a="checkmail">Check my email replies now</button>
    <button class="btn ghost" data-a="closesheet">Close</button></div>`;
};

Object.assign(A, {
  fixsheet() { sheet({ type: "fix" }); },
  savefix() {
    const t = S.plan?.today?.date === today() ? S.plan.today : null;
    const ops = [];
    const hours = Number(document.getElementById("fxsleep").value);
    const recorded = t?.readiness?.sleep_last_night_h;
    if (document.getElementById("fxsleep").value !== "" && hours >= 0 && hours <= 16 && hours !== recorded) ops.push({ op: "report_sleep", date: today(), hours });
    const type = document.getElementById("fxtype").value;
    if (type !== "AS-PLANNED") ops.push({ op: "schedule_override", date: today(), type, note: "fixed in the app" });
    const neck = document.getElementById("fxneck").checked;
    if (neck !== !!t?.neck_sore) ops.push({ op: neck ? "neck_sore" : "neck_clear" });
    sheet(null);
    if (!ops.length) { flash("Nothing changed."); return; }
    send(ops);
    flash("Fix sent — today's plan rebuilds in about a minute.");
  },
  sendfix() {
    const text = document.getElementById("fxtext").value.trim();
    if (!text) return;
    ask({ kind: "correct", text, date: today() });
    renderSheet();
  },
  async checkmail() {
    try { await gh.dispatchWorkflow(S.settings, "inbox.yml"); flash("Checking your email now — replies are applied in a minute or two."); }
    catch (e) { flash(e.message, "warn"); }
    sheet(null);
  },
});
