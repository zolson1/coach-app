# Coach — the dashboard

A phone web app over the private coach repo: one place for training and fuel.

| Tab | What it does |
|---|---|
| **Today** | About a screen and a half: where the day stands (fuel level, last night's sleep, the shift's report and relief), the next thing by the clock, the day in order with what's behind you folded away, and the sessions to start |
| **Train** | This week's lifting sessions and the session runner: warm-up ramps with plate math, RPE logging with in-session load cuts, rest / hold / guided timers (the press and the pull-up alternate), calibration ladders. Training maxes and why each last changed |
| **Fuel** | Any day's card, back to Monday and a week ahead (it follows the schedule, so a picked-up shift moves the food). In guide mode each row is a target to build your own meal to; in cards mode, meals are checked off, skipped or swapped. Log anything off the card, for any day |
| **Kitchen** | Cards mode: batch counts and where they run out, cook days as a guided run, the haul and top-up lists, a pantry of extras, recipes. Guide mode: one card, and the way back |
| **Progress** | Is it working? This week against its plan, the last eight weeks from the watch, ring and scale (mat, lifts, sleep, HRV, resting heart rate, weight — tap a week), the health baseline (bloodwork, blood pressure, hip check, waist, assessment day), then the food: the plan check, morning weight, the off-card log |

Nothing is logged that a watch, a ring or a scale can record. The app is for deviations: a meal that
wasn't the card, a class that changed, a shift that ran late.

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
keeps everything it would commit in localStorage, and fakes the coach's answers. Tests: `node --test test/*.mjs`.
