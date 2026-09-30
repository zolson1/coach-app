# Coach — the dashboard

A phone web app over the private coach repo: one place for training and fuel.

| Tab | What it does |
|---|---|
| **Today** | The day's fuel level, the next meal by the clock, today's session, tonight's kitchen prep, anything that wants attention |
| **Train** | This week's lifting sessions and the session runner: warm-up ramps with plate math, RPE logging with in-session load cuts, rest / hold / guided timers, calibration ladders |
| **Fuel** | Any day's card, two weeks back and two weeks ahead (it follows the schedule, so a picked-up shift moves the food). Check meals off, skip them, swap them — from the plan's own swaps or by asking the coach, which builds one from the pantry. Log anything off the card, for any day |
| **Kitchen** | Batch counts and where they run out, cook days as a guided run, the haul and top-up lists, a pantry of extras, recipes, and the cycle menu — research a new one, import one, review a draft, switch |
| **Progress** | The plan check (the fuel plan's own decision rules), morning weight, eaten against burned, waist, recovery, the off-card log |

- **No data lives here.** The plan is read from the private repo's `out/app/plan.json`. Everything the app
  changes is committed back through the GitHub API with a fine-grained token kept on the phone:
  finished sessions to `app-logs/`, batches of ops to `app-logs/ops/`, questions for the coach to `app-requests/`.
- **The rules live in the coach repo.** `js/logic.js` runs the lifting policy it ships; `js/ops.js` replays
  the ops the phone has sent over the plan so the screen changes at once, and is replaced by the coach's
  answer on the next load.
- **Offline:** the shell is cached by `sw.js`; the plan, unsent sessions and unsent ops wait in localStorage.

Install: open https://zolson1.github.io/coach-app/ in Chrome on the phone → ⋮ → *Add to Home screen* →
paste the token once (Contents: read/write; Actions: read/write optional).

Dev: `python3 -m http.server 8765`, then `http://localhost:8765/?dev=dev/plan.json` — reads a local plan,
keeps everything it would commit in localStorage, and fakes the coach's answers. Tests: `node --test test/`.
