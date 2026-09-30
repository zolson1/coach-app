// The Kitchen tab: batch counts and where they run out, tonight's prep, cook
// days as a guided run, shopping lists, the pantry of extras, recipes, and the
// cycle menu (research a new one, import one, review a draft, switch).
import { S, A, SHEETS, esc, fuel, send, sheet, render, renderSheet, today, ask, requests, store, fmtNum, uid, go,
  header, flash, flashHTML, gh, L, T } from "./core.js";
import { dayOf, dayLabel, tasksHTML, macroLine, emptyState } from "./ui.js";

const TABS = [["stock", "Stock"], ["shop", "Shop"], ["pantry", "Pantry"], ["menu", "Menu"]];
const when = (iso) => (iso ? dayLabel(iso) : "—");
const inDays = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

export function viewKitchen() {
  const f = fuel();
  if (!f) return `<section class="card"><p class="muted">The kitchen loads with the next morning run.</p></section>`;
  const tab = S.kitchenTab;
  const seg = `<div class="segs">${TABS.map(([k, t]) => `<button class="seg ${tab === k ? "on" : ""}" data-a="ktab" data-k="${k}">${t}</button>`).join("")}</div>`;
  return seg + ({ stock, shop, pantry, menu }[tab] || stock)(f);
}

// ------------------------------------------------------------------- stock
function stock(f) {
  const k = f.kitchen;
  const d = dayOf(today());
  let html = "";
  if (k.short.length) {
    html += `<section class="card alert"><h2>Running short</h2>${k.short.map((s) =>
      `<p class="line"><b>${esc(s.label)}</b> run${s.label.endsWith("s") ? "" : "s"} out ${esc(when(s.runs_out))} — before the next ${esc(s.refill_kind)}${s.refill ? ` (${esc(when(s.refill))})` : ""}.</p>`).join("")}
      <p class="muted small">Cook a batch early, or plan a swap on that day in the Fuel tab.</p></section>`;
  }
  if (d) {
    const tasks = tasksHTML(d);
    html += `<section class="card"><h2>Today in the kitchen</h2>${tasks || emptyState("Nothing to prep today.")}</section>`;
  }
  const n = k.next;
  html += `<section class="card"><h2>Coming up</h2><div class="tiles three">
    <div class="tile"><span>Cook day</span><b>${n.cook ? esc(when(n.cook.date)) : "—"}</b><i>${n.cook ? `${esc(n.cook.title || "")} · ${inDays(n.cook.days)}` : ""}</i></div>
    <div class="tile"><span>28-day haul</span><b>${n.haul ? esc(when(n.haul.date)) : "—"}</b><i>${n.haul ? inDays(n.haul.days) : ""}</i></div>
    <div class="tile"><span>Fresh top-up</span><b>${n.topup ? esc(when(n.topup.date)) : "—"}</b><i>${n.topup ? inDays(n.topup.days) : ""}</i></div></div>
    ${n.cook ? `<button class="btn" data-a="startcook" data-k="${esc(n.cook.key)}">Open ${esc(n.cook.title || "cook day")}</button>` : ""}
  </section>`;

  html += `<section class="card"><div class="lift-head"><h2>Batches</h2><button class="btn sm" data-a="cookedsheet">+ I made some</button></div>
    ${Object.entries(k.batches).map(([id, b]) => {
      const c = k.counts[id] ?? 0;
      const out = k.runout[id];
      const low = k.low.includes(id);
      const meta = [b.store, b.thaw === "overnight" ? "thaw overnight" : b.thaw === "same_day" ? "thaw same day" : null].filter(Boolean).join(" · ");
      return `<div class="batch ${low ? "low" : ""}">
        <div class="b-main"><b>${esc(b.label)}</b>
          <span class="muted small">${esc(meta)}${out ? ` · ${b.store === "fridge" ? "mix more by" : "runs out"} ${esc(when(out))}` : " · covers the next two weeks"}</span></div>
        <div class="stepper2"><button class="btn sm" data-a="bstep" data-k="${id}" data-d="-1" aria-label="one less">−</button>
          <button class="count" data-a="bset" data-k="${id}">${c}</button>
          <button class="btn sm" data-a="bstep" data-k="${id}" data-d="1" aria-label="one more">+</button></div>
      </div>`;
    }).join("")}
    <p class="muted small">The cards count these down each morning. Fix a number whenever the freezer disagrees.</p>
  </section>`;
  return html;
}

SHEETS.cooked = () => {
  const f = fuel();
  return `<div class="sheet"><h3>I made or bought some</h3>
    <label class="fld">What<select id="ckitem">${Object.entries(f.kitchen.batches).map(([id, b]) => {
      const y = b.recipe ? f.menu.recipes[b.recipe]?.yield : b.haul_qty;
      return `<option value="${id}" data-y="${y || 1}">${esc(b.label)}${y ? ` (a batch is ${y})` : ""}</option>`;
    }).join("")}</select></label>
    <label class="fld">How many portions<input id="ckn" type="number" inputmode="numeric" placeholder="a full batch if blank"></label>
    <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Cancel</button>
      <button class="btn primary" data-a="savecooked">Add to the count</button></div></div>`;
};

SHEETS.bset = (sh) => {
  const f = fuel();
  return `<div class="sheet"><h3>${esc(f.kitchen.batches[sh.k].label)}</h3>
    <label class="fld">How many are actually there<input id="bsetn" type="number" inputmode="numeric" value="${f.kitchen.counts[sh.k] ?? 0}"></label>
    <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Cancel</button>
      <button class="btn primary" data-a="savebset">Set</button></div></div>`;
};

// -------------------------------------------------------------------- shop
function checklist(list, items, checked) {
  const set = new Set(checked || []);
  return `<div class="tasks">${items.map((it) => `<div class="check ${set.has(it.key) ? "done" : ""}">
    <button class="tick" data-a="shopcheck" data-list="${list}" data-k="${esc(it.key)}" data-on="${set.has(it.key) ? 0 : 1}">${set.has(it.key) ? "✓" : ""}</button>
    <span>${esc(it.item)}${it.qty && it.qty !== "—" ? ` <i class="muted">· ${esc(it.qty)}</i>` : ""}</span></div>`).join("")}</div>`;
}

function shop(f) {
  const s = f.shopping;
  const stores = [...new Set(s.haul.items.map((x) => x.where))];
  let html = "";
  if (s.suggestions.length) {
    html += `<section class="card alert"><h2>Worth adding</h2>${s.suggestions.map((x) =>
      `<p class="line"><b>${esc(x.item)}</b> <span class="muted">· ${esc(x.qty)} · ${esc(x.why)}</span></p>`).join("")}</section>`;
  }
  html += `<section class="card"><div class="lift-head"><h2>My list</h2></div>
    ${s.extras.length ? `<div class="tasks">${s.extras.map((x) => `<div class="check ${x.done ? "done" : ""}">
      <button class="tick" data-a="shopcheck" data-list="extras" data-k="${esc(x.id)}" data-on="${x.done ? 0 : 1}">${x.done ? "✓" : ""}</button>
      <span>${esc(x.item)}${x.qty ? ` <i class="muted">· ${esc(x.qty)}</i>` : ""}</span>
      <button class="link" data-a="shopdel" data-id="${esc(x.id)}">remove</button></div>`).join("")}</div>` : emptyState("Anything outside the plan's lists.")}
    <div class="addrow"><input id="shopitem" placeholder="Add an item"><button class="btn" data-a="shopadd">Add</button></div>
  </section>`;
  html += `<section class="card"><div class="lift-head"><h2>Fresh top-up</h2>
      <span class="tm">${s.topup.next ? `next ${esc(when(s.topup.next.date))}` : ""}</span></div>
    ${checklist("topup", s.topup.items, s.topup.checked)}
    <button class="btn" data-a="topupdone">Top-up done</button>
    ${s.topup.last ? `<p class="muted small">Last one ${esc(when(s.topup.last))}.</p>` : ""}</section>`;
  html += `<section class="card"><div class="lift-head"><h2>The 28-day haul</h2>
      <span class="tm">${s.haul.next ? `next ${esc(when(s.haul.next.date))} · ` : ""}≈$${fmtNum(s.haul.total_est)}</span></div>
    ${stores.map((st) => `<h3 class="sub">${esc(st)}</h3>${checklist("haul", s.haul.items.filter((x) => x.where === st), s.haul.checked)}`).join("")}
    <button class="btn" data-a="hauldone">Haul done — stock the counts</button>
    ${s.haul.last ? `<p class="muted small">Last haul ${esc(when(s.haul.last))}.</p>` : ""}</section>`;
  return html;
}

// ------------------------------------------------------------------ pantry
function pantry(f) {
  return `<section class="card"><div class="lift-head"><h2>Extras on hand</h2><button class="btn sm primary" data-a="pantrysheet">+ Add</button></div>
    <p class="muted small">Food the cards don't use — a steak in the freezer, leftovers, something that needs eating. When you ask for a swap, the coach builds it from these first.</p>
    ${f.pantry.length ? f.pantry.map((p) => `<div class="batch">
      <div class="b-main"><b>${esc(p.name)}</b><span class="muted small">${esc([p.qty && `${p.qty} ${p.unit || ""}`.trim(), p.where, p.note].filter(Boolean).join(" · "))}</span></div>
      <div class="stepper2"><button class="btn sm" data-a="pantrysheet" data-id="${esc(p.id)}">Edit</button>
        <button class="btn sm" data-a="pantrydel" data-id="${esc(p.id)}">Used up</button></div></div>`).join("") : emptyState("Nothing listed.")}
  </section>`;
}

SHEETS.pantry = (sh) => {
  const p = sh.id ? fuel().pantry.find((x) => x.id === sh.id) : null;
  return `<div class="sheet"><h3>${p ? "Edit" : "Add an"} extra</h3>
    <label class="fld">What<input id="pname" value="${esc(p?.name || "")}" placeholder="ribeye, leftover rice, ground beef…"></label>
    <div class="two"><label class="fld">How much<input id="pqty" value="${esc(p?.qty || "")}" placeholder="2"></label>
      <label class="fld">Unit<input id="punit" value="${esc(p?.unit || "")}" placeholder="steaks, lb, cups"></label></div>
    <label class="fld">Where<select id="pwhere">${["freezer", "fridge", "pantry"].map((w) => `<option ${p?.where === w ? "selected" : ""}>${w}</option>`).join("")}</select></label>
    <label class="fld">Note (optional)<input id="pnote" value="${esc(p?.note || "")}" placeholder="use by Friday"></label>
    <div class="sheet-foot"><button class="btn ghost" data-a="closesheet">Cancel</button>
      <button class="btn primary" data-a="savepantry">Save</button></div></div>`;
};

// -------------------------------------------------------------------- menu
function menu(f) {
  const m = f.menu, cat = f.menus;
  const open = requests().filter((q) => ["new_menu", "import_menu"].includes(q.body.kind) && ["queued", "sent"].includes(q.state));
  return `<section class="card"><div class="lift-head"><h2>${esc(m.name)}</h2><span class="tm">this cycle's menu</span></div>
      ${cat.pending ? `<p class="adj">Switching to ${esc(cat.pending)} — takes about a minute.</p>` : ""}
      <p class="muted small">${esc(m.summary || m.source || "")}</p>
      <button class="btn" data-a="cycle">Bored of it? Build a new cycle${open.length ? " · working…" : ""}</button>
      ${cat.drafts.length ? `<h3 class="sub">Drafts waiting for you</h3>${cat.drafts.map((x) =>
        `<button class="session" data-a="draft" data-id="${esc(x.id)}"><span class="s-title">${esc(x.name || x.id)}</span><span class="s-sub">${esc(x.summary || "")}</span><span class="s-when">${esc(x.source || "")}</span></button>`).join("")}` : ""}
      ${cat.available.filter((x) => x.id !== cat.active).length ? `<h3 class="sub">Other menus</h3>${cat.available.filter((x) => x.id !== cat.active).map((x) =>
        `<button class="session" data-a="switchmenu" data-id="${esc(x.id)}"><span class="s-title">${esc(x.name || x.id)}</span><span class="s-when">Switch back to this one</span></button>`).join("")}` : ""}
    </section>
    <section class="card"><h2>Recipes</h2>${Object.entries(m.recipes).map(([k, r]) =>
      `<button class="session" data-a="recipe" data-k="${esc(k)}"><span class="s-title">${esc(r.title)}</span>
        <span class="s-when">makes ${esc(r.yield)} · ${esc(macroLine(r.macros))}</span></button>`).join("")}</section>
    <section class="card"><h2>Cook days</h2>${Object.entries(m.cook_days).map(([k, c]) =>
      `<button class="session" data-a="startcook" data-k="${esc(k)}"><span class="s-title">${esc(c.title)}</span>
        <span class="s-when">${esc(c.when || "")} · about ${esc(c.hours)} h</span></button>`).join("")}</section>
    <section class="card"><h2>Station kit</h2><ul class="plain">${(m.station_kit || []).map((x) =>
      `<li><b>${esc(x.item)}</b> <span class="muted">· ${esc(x.per_rotation)} per rotation — ${esc(x.job)}</span></li>`).join("")}</ul></section>`;
}

export function viewRecipe() {
  const f = fuel();
  const r = (S.draft?.recipes || f.menu.recipes)[S.viewArg] || f.menu.recipes[S.viewArg];
  if (!r) return header("Recipe", "", back()) + `<main class="wrap"><p class="muted">Not found.</p></main>`;
  return `${header(r.title, `makes ${r.yield} · ${r.serving || ""}`, back())}
  <main class="wrap"><section class="card"><p class="big-num">${esc(macroLine(r.macros))}</p>
    ${r.macros_rest ? `<p class="muted">Rest size: ${esc(macroLine(r.macros_rest))}</p>` : ""}
    <h3 class="sub">Ingredients</h3><ul class="plain">${r.ingredients.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <h3 class="sub">Method</h3><ol class="plain">${r.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
    ${r.storage ? `<h3 class="sub">Storing it</h3><p>${esc(r.storage)}</p>` : ""}
    ${r.cost ? `<p class="muted small">About $${Number(r.cost).toFixed(2)} a serving.</p>` : ""}</section></main>`;
}

const back = () => `<button class="icon" data-a="closeview" aria-label="Back">‹</button>`;

// ---------------------------------------------------------------- cook day
export function viewCook() {
  const f = fuel();
  const key = S.viewArg;
  const c = f.menu.cook_days[key];
  if (!c) return header("Cook day", "", back());
  const st = store.get("cook") || {};
  const mine = st.key === key ? st : { key, started: null, done: [] };
  const done = new Set(mine.done);
  const alt = Object.keys(c.alternate_loop_yields || {});
  const withAlt = mine.alt ?? alt.some((k) => (f.kitchen.counts[k] || 0) <= 2);
  const yields = { ...c.yields, ...(withAlt ? c.alternate_loop_yields : {}) };
  const recipes = [...new Set(Object.keys(yields).map((k) => f.menu.batches[k]?.recipe).filter(Boolean))];
  const elapsed = mine.started ? L.fmtClock((Date.now() - mine.started) / 1000) : null;
  return `${header(c.title, `about ${c.hours} h`, back(), elapsed ? `<span class="elapsed" id="cookclock">${elapsed}</span>` : "")}
  <main class="wrap">${flashHTML()}
    <section class="card"><p>${esc(c.prep || "")}</p>
      <p class="muted">Makes ${Object.entries(yields).map(([k, n]) => `${n} ${esc(f.menu.batches[k]?.label.toLowerCase() || k)}`).join(", ")}.</p>
      ${alt.length ? `<label class="chip wide"><input type="checkbox" data-a="cookalt" ${withAlt ? "checked" : ""}> Also making ${alt.map((k) => esc(f.menu.batches[k]?.label.toLowerCase())).join(", ")} this time</label>` : ""}
      ${c.note ? `<p class="muted small">${esc(c.note)}</p>` : ""}
      ${mine.started ? "" : `<button class="btn primary big" data-a="cookstart">Start the clock</button>`}
    </section>
    <section class="card"><h2>Timeline</h2><div class="tasks">${c.timeline.map(([at, what], i) => `<div class="check ${done.has(i) ? "done" : ""}">
      <button class="tick" data-a="cookstep" data-i="${i}">${done.has(i) ? "✓" : ""}</button>
      <span><b class="at">${esc(at)}</b> ${esc(what)}</span></div>`).join("")}</div></section>
    <section class="card"><h2>Recipes</h2>${recipes.map((k) => { const r = f.menu.recipes[k]; return `<details class="cues"><summary>${esc(r.title)}</summary>
      <ul class="plain">${r.ingredients.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <ol class="plain">${r.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol><p class="muted small">${esc(r.storage || "")}</p></details>`; }).join("")}</section>
    <div class="finishbar"><button class="btn primary big" data-a="cookdone">Done — add it all to the freezer</button></div>
  </main>`;
}
setInterval(() => {
  const el = document.getElementById("cookclock");
  const st = store.get("cook");
  if (el && st?.started) el.textContent = L.fmtClock((Date.now() - st.started) / 1000);
}, 1000);

// ------------------------------------------------------------ a new cycle
export function viewCycle() {
  const f = fuel();
  const prefs = store.get("cycleprefs") || "";
  const usePantry = store.get("cyclepantry") ?? true;
  const reqs = requests().filter((q) => ["new_menu", "import_menu"].includes(q.body.kind)).slice(-4).reverse();
  return `${header("A new cycle", "same numbers, different food", back())}
  <main class="wrap">${flashHTML()}
    <section class="card"><p>A new menu changes what the cards are made of — the recipes, the batches, the haul. Your fuel levels, meal times and cook days stay exactly as they are.</p>
      <label class="fld">What do you want from it?<textarea id="cyprefs" rows="4" data-a="cyprefs" placeholder="Bored of chili. More Korean and Mexican. Keep the overnight oats. Something I can grill.">${esc(prefs)}</textarea></label>
      <label class="chip wide"><input type="checkbox" data-a="cypantry" ${usePantry ? "checked" : ""}> Work in my pantry extras (${f.pantry.length})</label>
    </section>
    <section class="card"><h2>Let the coach research it</h2>
      <p class="muted small">Runs on GitHub with web search: 15–20 minutes and a few dollars of API credit. You get a draft to review — nothing changes until you activate it.</p>
      <button class="btn primary big" data-a="cyresearch">Research a new menu</button></section>
    <section class="card"><h2>Or use Claude's Research yourself</h2>
      <p class="muted small">Copy the brief, run it in Claude with Research on, then paste the whole answer back here.</p>
      <button class="btn" data-a="cycopy">Copy the brief</button>
      <label class="fld">Paste the finished plan<textarea id="cypaste" rows="5" placeholder="Paste the full write-up here"></textarea></label>
      <button class="btn" data-a="cyimport">Import it</button></section>
    ${reqs.length ? `<section class="card"><h2>Recent requests</h2>${reqs.map((q) => {
      const kind = q.body.kind === "new_menu" ? "Research" : "Import";
      const t = new Date(q.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (q.state === "done") { const r = q.response.result; return `<button class="session hero" data-a="draft" data-id="${esc(r.menu_id)}">
        <span class="s-title">${esc(r.name)} — draft ready</span><span class="s-sub">${esc(r.summary || "")}</span>
        <span class="s-when">${kind} · ${esc(t)}${r.problems?.length ? ` · ${r.problems.length} check(s) to look at` : ""}</span></button>`; }
      if (q.state === "error") return `<p class="warn-text">${kind} at ${esc(t)} failed: ${esc(q.response?.error || "unknown")}</p>`;
      return `<p class="line">${kind} started ${esc(t)} — working. ${q.body.kind === "new_menu" ? "Give it 15–20 minutes; you can leave this screen." : "A few minutes."}</p>`;
    }).join("")}</section>` : ""}
  </main>`;
}

const pantryText = (f) => f.pantry.map((p) => `${p.name}${p.qty ? ` — ${p.qty} ${p.unit || ""}`.trimEnd() : ""}${p.where ? ` (${p.where})` : ""}`).join("\n");

export function viewDraft() {
  const id = S.viewArg;
  const m = S.draft?.id === id ? S.draft : null;
  if (!m) return `${header("Draft menu", "", back())}<main class="wrap">${flashHTML()}<p class="muted">Loading the draft…</p></main>`;
  const f = fuel();
  const req = requests().find((q) => q.response?.result?.menu_id === id);
  const problems = req?.response?.result?.problems || [];
  const isDraft = (f.menus.drafts || []).some((x) => x.id === id) || !(f.menus.available || []).some((x) => x.id === id);
  return `${header(m.name, "draft — nothing changes until you activate it", back())}
  <main class="wrap">${flashHTML()}
    <section class="card"><p>${esc(m.summary || "")}</p><p class="muted small">${esc(m.source || "")}</p>
      ${problems.length ? `<div class="adj">Checks that didn't pass — it can't be activated as is:<ul class="plain">${problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <button class="btn" data-a="draftwriteup" data-id="${esc(id)}">Read the full write-up</button>
      ${S.draftText ? `<div class="writeup">${esc(S.draftText)}</div>` : ""}</section>
    ${Object.entries(m.cards).map(([k, c]) => `<section class="card"><div class="lift-head"><h2>${esc(c.title || k)}</h2><span class="tm">${esc(c.totals || "")}</span></div>
      <div class="rows meal">${c.rows.map((r) => `<div class="row mealrow"><span class="k">${esc(r.time)}</span><span class="load">${esc(r.what)}</span><span class="plates">${esc(macroLine(r))}</span></div>`).join("")}</div></section>`).join("")}
    <section class="card"><h2>Recipes</h2>${Object.entries(m.recipes).map(([k, r]) => `<details class="cues"><summary>${esc(r.title)} — makes ${esc(r.yield)}</summary>
      <p class="muted small">${esc(macroLine(r.macros))}</p><ul class="plain">${r.ingredients.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <ol class="plain">${r.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>`).join("")}</section>
    <section class="card"><h2>The haul</h2><p class="muted">About $${fmtNum(Math.round(m.haul.reduce((a, h) => a + (h.est || 0), 0)))} per loop.</p>
      <ul class="plain">${m.haul.map((h) => `<li>${esc(h.item)} <span class="muted">· ${esc(h.qty)} · ${esc(h.where)}</span></li>`).join("")}</ul></section>
    ${isDraft && !problems.length ? `<div class="finishbar"><button class="btn primary big" data-a="activate" data-id="${esc(id)}">Activate this menu</button>
      <p class="muted small">New batches start at zero — do a cook day, then set the counts. You can switch back any time from Kitchen → Menu.</p></div>` : ""}
  </main>`;
}

// ------------------------------------------------------------------ actions
const val = (id) => document.getElementById(id)?.value?.trim() ?? "";

Object.assign(A, {
  ktab(d) { S.kitchenTab = d.k; store.set("kitchenTab", d.k); render(); window.scrollTo(0, 0); },
  bstep(d) {
    const c = fuel().kitchen.counts[d.k] ?? 0;
    send({ op: "kitchen_set", item: d.k, count: Math.max(0, c + Number(d.d)) });
  },
  bset(d) { sheet({ type: "bset", k: d.k }); },
  savebset() {
    const k = S.sheet.k, n = Number(val("bsetn"));
    sheet(null);
    if (Number.isFinite(n)) send({ op: "kitchen_set", item: k, count: Math.max(0, Math.round(n)) });
  },
  cookedsheet() { sheet({ type: "cooked" }); },
  savecooked() {
    const sel = document.getElementById("ckitem");
    const n = Number(val("ckn")) || Number(sel.selectedOptions[0].dataset.y) || 1;
    sheet(null);
    send({ op: "cooked", item: sel.value, servings: n, date: today() });
  },
  shopcheck(d) { send({ op: "shopping_check", list: d.list, key: d.k, checked: d.on === "1" }); },
  shopadd() {
    const item = val("shopitem");
    if (item) send({ op: "shopping_add", id: uid("s"), item });
  },
  shopdel(d) { send({ op: "shopping_remove", id: d.id }); },
  hauldone() {
    if (confirm("Mark the haul done? This adds the bought batches (Core Power, salmon) to your counts and clears the list.")) send({ op: "haul_done", date: today() });
  },
  topupdone() { send({ op: "topup_done", date: today() }); },
  pantrysheet(d) { sheet({ type: "pantry", id: d.id || null }); },
  savepantry() {
    const name = val("pname");
    if (!name) return;
    const body = { name, qty: val("pqty") || null, unit: val("punit") || null, where: val("pwhere"), note: val("pnote") || null };
    const id = S.sheet.id;
    sheet(null);
    send(id ? { op: "pantry_update", id, ...body } : { op: "pantry_add", id: uid("p"), ...body, date: today() });
  },
  pantrydel(d) { send({ op: "pantry_remove", id: d.id }); },
  recipe(d) { sheet(null); go("recipe", d.k); },
  cycle() { go("cycle"); },
  cookstart() { store.set("cook", { key: S.viewArg, started: Date.now(), done: [] }); T.keepAwake(true); render(); },
  cookstep(d) {
    const st = store.get("cook")?.key === S.viewArg ? store.get("cook") : { key: S.viewArg, started: Date.now(), done: [] };
    const set = new Set(st.done);
    const i = Number(d.i);
    if (set.has(i)) set.delete(i); else set.add(i);
    store.set("cook", { ...st, done: [...set] });
    render();
  },
  cookdone() {
    const key = S.viewArg;
    const f = fuel();
    const c = f.menu.cook_days[key];
    const st = store.get("cook")?.key === key ? store.get("cook") : {};
    const alt = Object.keys(c.alternate_loop_yields || {});
    const withAlt = st.alt ?? alt.some((k) => (f.kitchen.counts[k] || 0) <= 2);
    if (!confirm(`Log ${c.title}? This adds its portions to your counts.`)) return;
    const ops = [{ op: "cooked", cook_day: Number(key.replace("cook", "")), with_alternates: withAlt, date: today() }];
    if (dayOf(today())?.tasks.some((t) => t.id === key)) ops.push({ op: "task_done", date: today(), task: key, done: true });
    store.set("cook", null);
    T.keepAwake(!!S.active);
    S.view = null; S.tab = "kitchen"; S.kitchenTab = "stock";
    send(ops);
  },
  cyresearch() {
    const f = fuel();
    if (!confirm("Start the research? It takes 15–20 minutes and costs a few dollars of API credit.")) return;
    ask({ kind: "new_menu", preferences: val("cyprefs"), pantry: store.get("cyclepantry") ?? true ? pantryText(f) : "" });
    flash("Research started. The draft shows up here when it's done.");
  },
  async cycopy() {
    const f = fuel();
    const text = f.research.prompt.replace("{{PREFERENCES}}", val("cyprefs") || "(no specific requests — vary the cuisines and proteins from the current menu)")
      .replace("{{PANTRY}}", (store.get("cyclepantry") ?? true) && f.pantry.length ? pantryText(f) : "(nothing listed)");
    try { await navigator.clipboard.writeText(text); flash("Brief copied — paste it into Claude with Research on."); }
    catch { sheet({ type: "text", title: "Copy this brief", text }); }
  },
  cyimport() {
    const text = val("cypaste");
    if (text.length < 800) { flash("That's too short to be a full plan — paste the whole answer.", "warn"); return; }
    ask({ kind: "import_menu", writeup: text });
    flash("Importing — the draft shows up here in a few minutes.");
  },
  async draft(d) {
    S.draft = null; S.draftText = null;
    go("draft", d.id);
    try {
      const m = (await gh.getJSON(S.settings, `menus/drafts/${d.id}.json`)) || (await gh.getJSON(S.settings, `menus/${d.id}.json`));
      if (!m) throw new Error("the draft file isn't there yet — try again in a minute");
      S.draft = m;
    } catch (e) { flash(e.message, "warn"); }
    render();
  },
  async draftwriteup(d) {
    try { S.draftText = (await gh.getText(S.settings, `menus/drafts/${d.id}.md`)) || (await gh.getText(S.settings, `menus/${d.id}.md`)) || "No write-up was saved with this menu."; }
    catch (e) { S.draftText = e.message; }
    render();
  },
  activate(d) {
    if (!confirm("Switch to this menu? The cards change from tomorrow morning's run; new batches start at zero.")) return;
    S.view = null; S.tab = "kitchen"; S.kitchenTab = "menu";
    send({ op: "set_menu", id: d.id, date: today() });
  },
  switchmenu(d) { if (confirm("Switch back to this menu?")) send({ op: "set_menu", id: d.id, date: today() }); },
});

SHEETS.text = (sh) => `<div class="sheet"><h3>${esc(sh.title)}</h3><textarea rows="12" readonly>${esc(sh.text)}</textarea>
  <button class="btn ghost" data-a="closesheet">Close</button></div>`;

export const kitchenInputs = {
  cyprefs(el) { store.set("cycleprefs", el.value); },
  cypantry(el) { store.set("cyclepantry", el.checked); },
  cookalt(el) {
    const st = store.get("cook")?.key === S.viewArg ? store.get("cook") : { key: S.viewArg, started: null, done: [] };
    store.set("cook", { ...st, alt: el.checked });
    render();
  },
};
