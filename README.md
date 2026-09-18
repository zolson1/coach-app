# Coach — workout runner

A phone web app that runs the day's TB Fighter/BKK session from the private
coach repo: warm-up ramps with plate math, per-set RPE logging, in-session load
adjustment, rest / hold / guided-sequence timers, notes, and sync back.

- **No data lives here.** This repo is only the app. The plan is read from the
  private repo's `out/app/plan.json` and finished sessions are committed to its
  `app-logs/` through the GitHub API, using a fine-grained token stored on the
  phone (Contents: read/write; Actions: read/write optional).
- **The rules live in the coach repo** (`coach/autoreg.py` ships them as
  `plan.policy`); `js/logic.js` only executes them.
- **Offline:** the app shell is cached by `sw.js`; the plan and unsynced
  sessions are kept in localStorage and sync when the signal comes back.

Install: open https://zolson1.github.io/coach-app/ in Chrome on the phone →
⋮ → *Add to Home screen* → paste the token once.

Dev: `python3 -m http.server 8765`, then `http://localhost:8765/?dev=dev/plan.json`
(reads a local plan, keeps "synced" logs in localStorage). Tests: `node --test test/`.
