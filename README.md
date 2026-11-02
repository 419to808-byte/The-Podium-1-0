# The Podium 1.0 — empty starter

The Podium 1.0 is a nearly-ready-to-use starter derived from the demo
(The Podium). Same structure, layouts, and AI wiring —
shipped with **no users, no posts, no answers, no updates, and no data
of any kind**. The feed, briefing, archive, status, and replay views all
start empty and fill only through real use.

1.0 is **NOT the hackathon submission**. The demo is the submission.
1.0 must not be presented as having real users, real government
participation, or real data — it has none yet.

## Run it (no install, no build, no network)

Open the file directly — double-click it or paste the path into a browser:

```
podium-1.0/index.html
```

Works from `file://` and from any static host. Posts and votes persist
in the browser's localStorage.

To reset the starter: clear the site's localStorage (or run
`localStorage.removeItem("podium1.v1")` in devtools) and reload.

## What is inside

- Six tabs (Live Feed, Submit Post, The Weekly Briefing, Prior Posts &
  Answers, Status Updates, Watch Live), government-format styling, the
  full UI copy, and the Fine print register — minus demo-only wording.
- The weekly cycle calendar (posting/voting Mon 00:00 → Sun 23:59 ET,
  draw Mon 12:00, briefing Wed 1:00 PM ET). With no posts every draw
  shows pending, never a winner.
- The rules: one vote per citizen per weekly cycle (switchable until
  cutoff), one post per citizen per cycle, 630-word cap, Verbatim Rule,
  NIST-beacon draw, committee-answers-only, funds principle, language
  rule (original post is the official record; translations are
  machine aids).
- The AI wiring, unchanged in behavior: composer gate (local + live
  Muse Spark, same chain and timeouts, ES-7 live-clear override),
  on-demand translation, and the Wonder draft zone under Next Week
  posts (draft → committee edit → approve, session-only).
- Watch Live keeps its timing logic and player structure. With no
  briefings there is nothing to air: a live window shows a standby
  message, Upcoming names the next briefing date, and Replay is empty.
- A single signed-in local user (no identity picker). Sign-in here is
  a placeholder — the Fine print carries that limitation plainly, and
  real identity verification is required before production use.

## Structure

```
index.html        app shell (feed, composer, briefing, prior answers,
                  status updates, watch live)
css/style.css     mobile-first styles, no framework
js/seed.js        empty starter seed (no citizens/posts/answers/updates;
                  5 cycle shells with voting windows and briefing dates)
js/ai-adapter.js  ALL model calls go through PodiumAI (local fallback plus
                  live Muse Spark via Meta Model API when a key is set;
                  no key is needed or requested by this starter)
js/store.js       localStorage persistence + queries (votes,
                  one-post-per-cycle, closed-cycle cleanup)
js/strings.js     English + Spanish interface strings
js/app.js         UI wiring
```
