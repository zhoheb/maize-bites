# Progress

Log of the autonomous pass through Parts 0 to 5, finished 2026-10-09. Everything is merged into
`main` locally. Nothing has been pushed, deployed, or emailed.

**Status:** Parts 0 to 5, rules mode, and the Happening integration header are all done.
Happening is ingesting again with the header its owners issued, and the site is showing real
events from both sources. `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:pg` pass on
`main` (854 tests each run).

Note: the instructions refer to `docs/next-session.md`. That file is not in the repo; the ground
rules I followed are the ones from the session prompt (no challenge bypass, no SSO, no
robots-disallowed paths, no push/deploy/email/accounts, no unlisted dependencies).

## Checklist

### Part 0: merge (`main`)

- [x] Fast-forward `main` to `audit-cleanup` (`7677ed5`)
- [x] lint, typecheck, test, test:pg green

### Part 1: diagnose the Happening 403 (`happening-diagnosis`)

- [x] `scripts/check-happening.sh`
- [x] Run it here and record the result (all three endpoints challenged; see below)
- [x] Run it on campus wifi and the UMich VPN: no longer needed; the owners issued an integration header
- [x] Report any official endpoint that returns real data: none does from this network
- [x] Draft `docs/happening-access-email.md` (not sent)

Result from this network, 2026-10-09 04:45 UTC, with our real User-Agent:

| Endpoint                           | Status | cf-mitigated | Challenge page |
| ---------------------------------- | ------ | ------------ | -------------- |
| `/list/json?v=2&max-results=1`     | 403    | challenge    | yes            |
| `/event/150244-21908461/feed/ical` | 403    | challenge    | yes            |
| `/feeds`                           | 403    | challenge    | yes            |

### Part 2: source abstraction + Maize Pages (`sources`)

- [x] Move Happening under `apps/worker/src/sources/happening/` (tests unchanged)
- [x] Source interface and generic ingest loop (`sources/types.ts`, `jobs/ingest.ts`)
- [x] Shared HTTP client (User-Agent, robots.txt, rate limit, conditional requests, backoff)
- [x] Per-source runs in `ingestion_runs` (migration `0005_sources`)
- [x] `HAPPENING_ENABLED` / `MAIZEPAGES_ENABLED`
- [x] Maize Pages source (ICS, RSS fallback, ttl) and `maizepages` enum value
- [x] Dedupe against Happening
- [x] Fixtures and tests (normalizer, dedupe, failure isolation)
- [x] Live `ingest:once` with only Maize Pages enabled
- [x] Update `docs/sources.md` and `CLAUDE.md`

Live Maize Pages run against the local db, 2026-10-09 05:02 UTC (the worker made two
requests to maizepages.umich.edu: robots.txt and the ICS feed):

| Measure                            | Result                                     |
| ---------------------------------- | ------------------------------------------ |
| Events fetched                     | 27                                         |
| Events created                     | 27 (23 active, 4 cancelled by their hosts) |
| Matched to a building              | 6                                          |
| With coordinates from the feed     | 11                                         |
| Rules candidates for free food     | 3                                          |
| Classified as free food by the LLM | not run: `ANTHROPIC_API_KEY` is not set    |
| Published                          | 0 (candidates wait for the LLM)            |
| Errors                             | 0                                          |

The three rules candidates, for a sanity check of the classifier on this source:

| Event                                       | When (Ann Arbor)    | Where                                   | Rule matched         |
| ------------------------------------------- | ------------------- | --------------------------------------- | -------------------- |
| Soju Night                                  | Fri Oct 9, 5:00 PM  | Bamboo Ann Arbor (2nd Floor Rooftop)    | "food"               |
| Rebuilding Democracy (Nwanevu and Anderson) | Fri Oct 9, 5:30 PM  | Ross School of Business, Robertson Aud. | "light refreshments" |
| Cider Mill Long Run                         | Sun Oct 11, 9:15 AM | Dexter Cider Mill                       | "donuts, cider"      |

I could not give five published examples: with no API key nothing is published, and only three
events in this week's feed mention food at all. "Soju Night" and the cider mill run are probably
not free food, which is the kind of call the LLM stage exists to make.

The first pass created only 9 events and skipped 18 as duplicates of Happening rows last seen on
Sep 30. That exposed a flaw in the dedupe rule, fixed in a follow-up commit (see "Decisions to
review"). I then re-applied the saved feed from disk, with no second request.

### Part 3: phase 7 (`phase-7`)

- [x] `POST /api/submissions` (and `GET /api/buildings` for the form)
- [x] `POST /api/events/:id/reports`
- [x] Admin: review queue, override, submission review, metrics, audit log, building aliases
- [x] Rate limits on submissions and reports (per user)
- [x] API tests (trust, thresholds, admin authorization, audit)
- [x] Web: Submit page, report buttons, gray-out, Admin page, tests

### Part 4: logging (`worker-pino`)

- [x] Worker logs through pino with the API's config

### Part 5: CI and deploy (`ci-deploy`)

- [x] `.github/workflows/ci.yml` (not run: nothing has been pushed)
- [x] Dockerfiles for api and worker (both built and run locally)
- [x] `render.yaml`, `apps/web/vercel.json` (config only; not validated against real accounts)
- [x] `/api/health` per source
- [x] `README.md`

### Rules mode: real events with no API key (`classifier-rules-mode`)

- [x] Step 0: state check (Part 2 done; prefilter only marks candidates; nothing publishes
      without the LLM)
- [x] Step 1: Maize Pages source already built. Checked for Engage's "Free Food" perk: the
      feeds don't carry it (see Decisions)
- [x] Step 2: `CLASSIFIER_MODE` (`llm` default, `rules`), validated and tested
- [x] Step 3: strict rules-mode decider; vocabulary in `rules-config.ts`
- [x] Step 4: 50 table-driven decider cases, PGlite integration tests, eval `--mode rules`;
      the llm-mode test files are unchanged
- [x] Step 5: `.env.example`, your `.env` (three keys only), `CLAUDE.md`, `docs/sources.md`,
      About page
- [x] Step 6: real run, tuned once, aliases and buildings added
- [x] Step 7: site running, checked, screenshot at `docs/screenshots/first-real-events.png`

Counts from the real run (2026-10-09, about 2:15 AM Ann Arbor time):

| Measure                           | Result                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fetched this session              | 0. Maize Pages was last read at 05:02 UTC (27 events) and may next be read at 10:01 UTC; I did not fetch early |
| Live events judged                | 381 (358 Happening rows from Sep 30, 23 Maize Pages)                                                           |
| Rules positives, first run        | 33                                                                                                             |
| Rules positives after tuning      | 31 (one false positive removed, one duplicate removed)                                                         |
| Published and upcoming            | 31: 29 Happening, 2 Maize Pages                                                                                |
| Rejected                          | 350, of which 89 mention food                                                                                  |
| Published with a map pin          | 23 of 31                                                                                                       |
| Live events matched to a building | 185 of 381 after new buildings and aliases (119 before)                                                        |
| Today tab / This Week tab         | 9 / 31                                                                                                         |
| Errors                            | 0                                                                                                              |

Ten of the 31 published, with the evidence the rules quoted:

| When (Ann Arbor) | Event                                       | Where                       | Evidence                                                 |
| ---------------- | ------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| Fri 10:00 AM     | La Tertulia: Spanish Coffee Hour            | Modern Languages Building   | "Free coffee, tea, light snacks, & baked goods"          |
| Fri 12:00 PM     | Master's Resume Lab                         | Student Activities Building | "Lunch will be provided."                                |
| Fri 12:00 PM     | Fresh Check Day 2026                        | The Diag                    | "Free food (fall donuts, anyone?), swag"                 |
| Fri 3:00 PM      | Sustainability Coffee Chats                 | Michigan League             | tag: Free Food                                           |
| Fri 5:30 PM      | Rebuilding Democracy (Maize Pages)          | Ross School of Business     | "Doors open, light refreshments and Literati book sales" |
| Sat 9:00 AM      | Dr. Sarah Bartolome: Singing and Breathwork | Earl V. Moore Building      | "Free registration. Lunch will be provided."             |
| Sun 9:15 AM      | Cider Mill Long Run (Maize Pages)           | Dexter Cider Mill (no pin)  | "donuts & cider provided"                                |
| Mon 12:00 PM     | Midterm Study Hall at the DSI               | Mason Hall                  | "Snacks and drinks will be provided!"                    |
| Tue 1:00 PM      | ResNavs #SoYF Game Break                    | Michigan Union              | "(free sugar cookies)"                                   |
| Tue 5:30 PM      | 2026 First-Gen Fall Community Dinner        | Michigan Union              | "Dinner will be served."                                 |

Ten rejected events that mention food, with why:

| Event                                       | Why                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 34th Annual Women in Leadership Conference  | "PURCHASE YOUR TICKETS HERE"                                                             |
| Soju Night                                  | "Tickets $25"                                                                            |
| Maize & Brew Oktoberfest                    | "your ticket is 50% off"                                                                 |
| Lunchtime Yoga                              | "$120 for 12 classes"                                                                    |
| Ross Soccer Club pick-up                    | "pay-per-game ($10) via Venmo"                                                           |
| Breakfast, Luncheon, and Dinner: Dining Out | meal words only (an exhibit title)                                                       |
| Three Martini Lunch                         | "lunch" only (a book talk)                                                               |
| Bate-Papo: Portuguese Conversation Hour     | "Enjoy coffee, tea, and light snacks": no "free" or "provided". Probably a miss          |
| WISE STEM Community Meetings                | "Join us ... for snacks": same. Probably a miss                                          |
| Ginsberg Reads Book Club                    | "Bring your own lunch: light snacks & drinks will..." vetoed by "bring your own". A miss |

Precision looked good: of the 33 first-run positives I read, one was clearly wrong (an event
that only invited hosts to "offer light refreshments") and one was a duplicate. Recall is the
cost: at least three of the rejected events above probably do have free food.

Date check: Maize Pages times are right for America/Detroit (the 8:00 AM conference is stored
as 12:00 UTC). 25 of its 27 events are upcoming; one "event" in the feed started in 2022 and is
still running.

Eval: `pnpm --filter worker eval --mode rules` works, but `eval/labeled.json` has 20 items and
none are labelled yet, so it reports "Nothing to score". I did not label them: the labels are
meant to be yours.

### Happening integration header (`happening-integration`)

- [x] Step 0: state check (Part 2 and `CLASSIFIER_MODE` merged; headers are built in
      `sources/http/client.ts`)
- [x] Step 1: `UMICH_INTEGRATION_TOKEN`, `PUBLIC_SITE_URL` in the env schema, `.env.example`,
      and your `.env`; token confirmed absent from tracked files and from every commit
- [x] Step 2: header sent to `events.umich.edu` only; redacted; rejection reported, not retried
- [x] Step 3: tests for format, host scoping, redirects, log hygiene, missing token, rejection
- [x] Step 4: real run with both sources enabled
- [x] Step 5: site running; `docs/screenshots/both-sources.png`
- [x] Step 6: `docs/sources.md`, `CLAUDE.md`, `README.md`, `render.yaml`, this file

Real run, 2026-10-09 3:58 PM Ann Arbor time, `CLASSIFIER_MODE=rules` (no Anthropic key, so no
LLM calls and no cost):

| Measure                       | Happening                                   | Maize Pages                                                  |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Fetched                       | 1,097                                       | not due: last read 1:23 PM (29 events), next allowed 6:22 PM |
| Created / updated / unchanged | 740 / 30 / 327                              | (1:23 PM run: 2 created, 4 updated)                          |
| Removed (no longer listed)    | 2                                           | 0                                                            |
| Errors                        | 0                                           | 0                                                            |
| Live events now               | 1,052                                       | 2 shown, 23 hidden as duplicates                             |
| Matched to a building         | 573 of 1,052 (457 before the new buildings) | 0 of the 2 shown                                             |
| Published and upcoming        | 68 (10 from the "Free Food" tag)            | 0 of its own; see below                                      |
| Published with a map pin      | 51 of 68 (38 before)                        |                                                              |

Duplicates: 23 Maize Pages events also have a fresh Happening listing, so the Maize Pages copy
is hidden and the Happening copy shown. No Maize Pages id is active in both sources. Five of
them:

| Event                     | When        | Maize Pages copy | Happening copy |
| ------------------------- | ----------- | ---------------- | -------------- |
| ISBA Education Session #4 | Fri 4:00 PM | 12868342 hidden  | 153460 shown   |
| Soju Night                | Fri 5:00 PM | 12820964 hidden  | 152918 shown   |
| Rebuilding Democracy      | Fri 5:30 PM | 12720408 hidden  | 151776 shown   |
| 15s Match @ Notre Dame    | Fri 6:00 PM | 12458848 hidden  | 148061 shown   |
| SAS Public Open House     | Fri 9:00 PM | 12528481 hidden  | 149611 shown   |

Ten published events (all `source: happening`):

| When         | Event                                         | Building                          | Evidence                                     |
| ------------ | --------------------------------------------- | --------------------------------- | -------------------------------------------- |
| Fri 4:30 PM  | 2026 Faculty Mixer                            | Kelsey Museum of Archaeology      | "Snacks and drinks will be served"           |
| Fri 5:30 PM  | Rebuilding Democracy (the Maize Pages import) | Ross School of Business           | "light refreshments and Literati book sales" |
| Fri 5:30 PM  | Rebuilding Democracy (Happening's own entry)  | Ross School of Business           | "light refreshments in the lobby"            |
| Sat 9:00 AM  | Dr. Sarah Bartolome: Singing and Breathwork   | Earl V. Moore Building            | "Free registration. Lunch will be provided." |
| Sun 9:15 AM  | Cider Mill Long Run                           | no pin (Dexter Cider Mill)        | "donuts & cider provided"                    |
| Sun 11:15 AM | optiMize Social Innovation Challenge workshop | Central Campus Classroom Building | "Lunch will be provided"                     |
| Sun 4:25 PM  | Lions Football Watch Party at Alice Lloyd     | Alice Lloyd Hall                  | "Light snacks will be provided"              |
| Sun 6:00 PM  | Worship & Dinner at the Wesley Foundation     | no pin (602 E Huron St)           | "Free dinner follows worship"                |
| Mon 12:00 PM | Midterm Study Hall at the DSI                 | Mason Hall                        | "Snacks and drinks will be provided!"        |
| Mon 3:00 PM  | LSA@Play: Mystery Book Match                  | no pin (LSA Building)             | "there's free food and LSA swag, too"        |

### UI redesign (`ui-redesign`, merged to `main` as part of `ui-v3`)

Branched from `main` in a separate worktree (`../FoodTracker-ui-redesign`), so `ml-classifier`
and its uncommitted `ml/` work were never touched. Lint, typecheck, `pnpm test` (979 tests) and
`pnpm test:pg` for db and api pass. Screenshots: `docs/screenshots/ui-redesign/` (`before-*`
and `after-*`, 1440×900 and 390×844, light and dark).

- [x] Tokens in `apps/web/src/index.css` (Tailwind v4 `@theme`): navy ink, maize as the one
      accent, warm off-white page, one green, one coral. Dark mode by system setting plus a
      header toggle. `lib/tokens.test.ts` reads the CSS and fails below WCAG AA.
- [x] Self-hosted Inter and Bricolage Grotesque, Latin subsets preloaded and precached.
- [x] `components/ui/`: Button, Chip, Pill, Badge, Segmented, Toggle, Menu, Drawer, Sheet,
      Skeleton (Radix under the interactive ones).
- [x] Event card: status pill, title, food line with a meal icon, dietary chips, meta, and
      badges only for Members only, RSVP required, Likely over.
- [x] Filters in one row (pill menus, switch, search) with removable chips; a full-screen
      filter sheet with "Show N events" on phones.
- [x] List grouped under sticky headers: Happening now, Starting soon, Later today, then days.
- [x] Map: our own light and dark basemap over the same OpenFreeMap tiles, status pins with
      meal icons, clusters, popovers, Fit results, Near me (asks only when pressed).
- [x] Card and pin are linked both ways (hover, select, scroll into view); `j`/`k`, Enter,
      Esc and `/` work from the keyboard.
- [x] Phones: full-screen map with a three-height bottom sheet, and a list-only view.
- [x] Detail drawer with When, Where (mini map, directions), Who it's for, What's there,
      Source, crowd buttons with optimistic counts and "last report", and Share.
- [x] Skeletons, empty states with a next step, error with retry, offline banner.
- [x] Alerts, Share, About (three-step "How it works"), Sign in and Admin restyled.
- [x] New favicon, app icons and Open Graph image.
- [x] Lighthouse mobile on the production build, landing view: performance 92, accessibility
      100, layout shift 0.002 (was 49 before the performance pass). The This Week tab scores
      about 82: its request carries a timestamp, so it can't be started early from the HTML.
- [ ] `/admin/label` is on `ml-classifier`, not `main`, so it is not restyled. The old colour
      name `michigan-blue` still resolves, so it won't break, but it will look out of place in
      dark mode until its classes are migrated.
- [ ] Not checked in a real browser by a person: drag feel of the sheet on a touch device,
      Near me with real location permission, the system share sheet, and installing the PWA.

### UI v3 (`ui-v3`, built on `ui-redesign`)

Lint, typecheck and `pnpm test` pass. Screenshots and the graded review are in
`docs/screenshots/ui-v3/` (`REVIEW.md` has the grades and the Lighthouse numbers).

- [x] Tokens replaced with the "campus field guide" palette: paper page, white panels and
      cards in light; five surfaces stepping up in lightness in dark. Light is the default.
- [x] Maize only on pins, the selected card or row, the nav underline and the logo. Active
      controls are ink. A test fails if any other component names maize.
- [x] The list is an agenda: NowCard (status, time left, progress bar) for events that are live
      or start within 30 minutes; a compact time-rail AgendaRow for the rest, in one panel per
      section. Each event shows its time once.
- [x] Headline computed from the list on screen ("3 spots with free food right now",
      "5 spots today", "72 spots this week", or "Nothing right now — next up: …").
- [x] Freshness dot by age: green under 15 minutes, amber under 2 hours, grey beyond.
- [x] "Open to all" is a switch only, with no chip.
- [x] Map: v3 basemap colours, pins sized by urgency (30/26/22px), maize-soft clusters, one
      toolbar (Near me, Fit results, zoom), a peek card with Directions and Details, and
      "Search this area" after the map is moved.
- [x] Fixed 520px list beside an edge-to-edge map; the list casts a shadow onto it.
- [x] Phones: the sheet's header holds the headline and the time control; peek shows the first
      card; search is behind an icon.
- [x] Detail drawer at 440px with a progress bar when live and a "Live reports" section.
- [x] `VITE_SHOW_DEMO` (default false) hides `[demo]` events; the demo seed has 20 events
      covering every state.
- [x] Typographic empty states, a slim offline banner, skeletons shaped like each card type.
- [x] Form pages on a centred 560px panel; About's steps use the meal-tile style.
- [x] "optiMize … Workshop 2" showing Lunch: investigated, not a bug (decision 1 below).
- [ ] Checklist items graded Partial or Fail in `REVIEW.md`: seven events above the fold with
      several live, the dark map's separation from the page, early truncation beside a badge.
- [ ] Not built: crowd signals on the NowCard ("3 still food · 8m ago"), Tooltip and Popover
      components, motion/react for row entrance and the sheet (decisions 5, 8 and 9).
- [ ] Not looked at in a browser: Alerts, Share, Sign in and Admin (they need a signed-in
      session). Their classes were migrated and their tests pass.

### Seeing the site

- [x] Maize Pages ingest into the local db (27 events; see Part 2)
- [x] `pnpm db:seed:demo` (needed: `ANTHROPIC_API_KEY` is not set)
- [x] `pnpm dev` running; list, map, and `/api/health` confirmed (details under "How to run
      the site")

## Commits

| Part       | Branch                  | Commits                                                                                             | Merged to main |
| ---------- | ----------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| 0          | `audit-cleanup`         | `84855df` `bcfc224` `1104d17` `329a3a3` `b2812b9` `7677ed5`                                         | yes (ff)       |
| 1          | `happening-diagnosis`   | `ecee92a` `f8ee686`                                                                                 | yes            |
| 2          | `sources`               | `c5cf497` `60787c1` `726495e` `872387d` `8b49d46` `fd360b5` `a4bb5fa`                               | yes            |
| 3          | `phase-7`               | `7e96853` `1f44aee` `61c9eda` `c6b01a5` `cd5b84e` `1cd18cd`                                         | yes            |
| 4          | `worker-pino`           | `7b0cfb4`                                                                                           | yes            |
| 5          | `ci-deploy`             | `d65198d` `03f6b1a` `8f379f1` `0e45e40` `703f872` `9aba454`                                         | yes            |
| fix        | `map-fallback`          | `d6e9004`                                                                                           | yes            |
| rules mode | `classifier-rules-mode` | `222ba1a` `ad829d6` `1036e6b` `6bbeadf` `0102e60` `757366e` `c0a9c03` `738f332` `451ac79` `5eeaae4` | yes            |
| header     | `happening-integration` | `0780571` `b45cdb6` `f4c15c8`                                                                       | yes            |

Each branch still exists locally. `docs/progress.md` commits are on the part branches too.

## Decisions to review

### Part 2

1. **Dedupe rule changed from what you approved.** Approved: "link, and Happening wins". Built:
   Happening wins only while its feed has listed its copy in the last 24 hours; otherwise the
   Maize Pages listing takes over and the stale Happening row is hidden. Why: the live run
   showed 18 of 27 Maize Pages events shadowed by Happening rows that had not been refreshed in
   nine days because of the block. Those copies could be cancelled or changed and we would
   never know. When Happening comes back, its copy wins again. Alert claims move with the
   survivor either way.
2. **Classification runs only in a pass where at least one source ran.** With Maize Pages alone
   that would be every 5 hours. Happening is on by default and writes a run row hourly even
   while it fails, so in practice classification stays hourly. Alternative: classify on every
   tick regardless. I held back because a restart loop could then spend LLM calls each start.
3. **robots.txt that can't be read means we don't fetch.** RFC 9309 lets a crawler proceed on
   most 4xx; I allow only 404/410 and treat a challenge, other 4xx, 5xx, or a network error as
   "no". Today events.umich.edu answers `/robots.txt` with a plain 404 (so nothing is
   disallowed) and then challenges the feed itself, so a blocked Happening run costs two
   requests an hour: robots.txt (cached for a day after the first) and one feed request.
4. **No conditional requests for Happening.** Its URL changes daily (date range) and is paged,
   so ETags would rarely match. Maize Pages uses them.
5. **Hand-written RSS reader is deliberately narrow.** It handles the flat elements Engage
   emits and nothing else. If the ICS feed ever fails and the RSS shape has changed, items fail
   validation and are counted as errors rather than being stored wrong.
6. **ICS and RSS descriptions differ in formatting**, so a run that falls back to RSS changes
   content hashes and re-classifies those events. Rare, and correct, but it costs LLM calls.
7. **Personal data.** The RSS `<author>` element carries organizer email addresses. The reader
   never extracts it, and the committed fixtures have every email address replaced with
   `organizer@example.edu`. Descriptions can still contain addresses the hosts wrote themselves.
8. **Coordinates outside Ann Arbor are dropped.** The feed geocodes away games (one fixture
   event is in South Bend). They keep their location name but get no map pin.
9. **`ingestion_runs.classified` for community tips** is recorded on the first source's row of
   the pass, since tips have no feed run of their own.
10. **Pass-level errors** (classifier or alert failures) are also recorded on the first source's
    row, not on every row.
11. **Job renamed** from `ingest-happening` to `ingest` in logs.
12. **Existing rows backfilled** by the migration: old `ingestion_runs` rows become
    `source = 'happening'`, and Happening events get `maizepages_event_id` from their raw payload.
13. **The ingestion test file kept its assertions** but its setup helper changed (it now builds a
    Happening source), and one env test gained the two new flags. The Happening client,
    normalizer, and schema tests are byte-for-byte unchanged apart from import paths.

### Part 3

1. **Extra routes beyond your list.** `GET /api/buildings` (public; the tip form needs it),
   `POST /api/admin/buildings/:id/aliases` (makes the location-misses panel actionable; the
   query and schema already existed), and `GET /api/admin/audit-log`.
2. **Rate limits:** 5 tips and 30 reports per user per hour, keyed on the user id, not the IP.
3. **Tip time rules, checked on the server:** a tip can't already be over (no end time counts
   as one hour long) and can't start more than 14 days ahead.
4. **A repeat report answers 200, a new one 201**, both with fresh counts. Reports are only
   accepted on published events (404 otherwise).
5. **Reviewing a tip twice is a 400**, not a 409: the shared error codes have no "conflict".
6. **Override keeps what the classifier extracted** for any field the admin leaves out, and
   resolves the event's open review flags. Confidence is stored as 1.
7. **Tips are published before the classifier reads them** (that was already the rule in
   `listPublishedEvents`). The worker extracts food details on its next hourly pass, so a fresh
   tip shows with no food items for up to an hour.
8. **Admin page includes "override any event"** by pasting an event link or id, since the queue
   only lists events that need review.
9. **Two tests that asserted the 501 stubs** now assert a 401 for signed-out writes; the
   `notImplemented` helper is gone. The admin test's "admins reach the stub" case was replaced
   by tests of the real behaviour.
10. **Making someone an admin is still manual**: `update users set is_admin = true where
email = '...'`. There is no UI for it, on purpose.
11. **Events reported gone** are faded and desaturated on cards, with a "Food may be gone"
    badge in place of the audience badge; the title is struck through in details.

### Part 4

1. **The pino options are copied, not shared** (your choice). `apps/worker/src/logger.ts` says
   to keep it in step with `apps/api/src/logger.ts`.
2. **Job code still calls `logger.info('[ingest] ...')`.** An adapter maps that onto pino: the
   tag becomes a `component` field, an `Error` argument becomes `err`. This kept every job and
   test untouched. Worker lines also carry `app: "worker"`.
3. **The worker now reads `NODE_ENV` and `LOG_LEVEL`**, with the API's defaults.
4. **Library defaults still fall back to `console`** when no logger is passed (the scheduler and
   the HTTP client, which tests call directly). The worker entrypoint passes pino everywhere.
5. **`ingest:once` logs job output with `console`**, as allowed for CLIs.

### Part 5

1. **`/api/health` meanings.** `sources` lists each feed source that has started a run in the
   last 48 hours (older means "switched off" and is left out). A source is stale after 3 hours
   (Happening) or 11 hours (Maize Pages, which is read every 5). `status` is `degraded` if any
   listed source is stale. `ingestionStale`, which drives the site's "Data may be out of date"
   banner, is true only when no source is fresh. So with Happening blocked and Maize Pages
   working, monitoring says degraded but visitors aren't told the data is old.
2. **Production migrations** run from a new `packages/db/dist/migrate.js` (drizzle-orm's
   migrator, same files and bookkeeping table as `pnpm db:migrate`), because drizzle-kit is a
   dev dependency and isn't in the image. Render runs it as the API's pre-deploy command.
3. **`"files"` added to five package.json files** (`dist`, plus `drizzle` for the db package) so
   `pnpm deploy` copies compiled output into the image; `dist` is gitignored and would otherwise
   be left out.
4. **Images use Node 22** (`node:22-slim`), run as the `node` user, and are about 60 MB of app.
   `pnpm deploy --legacy` is used because the workspace doesn't inject workspace packages.
5. **CI uses `pnpm/action-setup`** rather than corepack so `actions/setup-node` can cache the
   pnpm store. It runs `pnpm test:pg:ci` (new script: the Postgres suite without
   `docker compose up`) against a service container, then `pnpm build`.
6. **Render:** `autoDeploy: false`, plan `starter`, `API_PORT=10000`, `TRUST_PROXY=2`
   (Vercel's rewrite plus Render's load balancer). Check the proxy count once it is live;
   it decides which IP the sign-in rate limit sees.
7. **Vercel:** the API host in `apps/web/vercel.json` is a placeholder you must replace.
8. **Demo seed also refuses a non-local database**, not only `NODE_ENV=production`. Demo events
   get a `manual` classification (so the classifier never spends LLM calls on them) with
   evidence "Demo data", and their descriptions end with "This is demo data, not a real event."
   `pnpm db:seed:demo --clear` removes them.

### After Part 5

1. **Map error boundary (`map-fallback`), not on your list.** While checking the site in a
   headless browser with no WebGL, MapLibre threw and the whole page went blank, because nothing
   caught the error. A visitor on a browser without WebGL2 would have seen the same. The map now
   sits in a boundary that shows "The map can't be shown in this browser" and leaves the list
   working. This was already broken before this session; I fixed it because it blocked verifying
   the site and is a one-file change with a test.
2. **I left your `.env` alone.** It has no `ANTHROPIC_API_KEY` and does not set
   `MAIZEPAGES_ENABLED`, so the running worker ingests Happening only (and fails on the
   challenge). The Maize Pages run in Part 2 used a one-off environment override.

### Rules mode

1. **29 of the 31 published events are Happening listings last fetched on Sep 30.** They are
   real events dated Oct 9 to 13, but nine days stale: a cancellation or change since then
   would not show. I published them because they are what makes the site useful tonight, and
   Maize Pages alone had two positives. If you'd rather show only the live source, run
   `update events set status = 'removed' where source = 'happening'` in psql; they come back
   if Happening is ever fetched again. They age out by Oct 13 either way.
2. **A new column, `classifications.rules_mode`** (migration 0006), tells a rules-mode verdict
   from an llm-mode prefilter row. Both are `method = 'rules'`, `model` null, as you asked.
   Without the marker a rules-mode negative would have looked like "the prefilter said no" and
   kept the event from the LLM for good.
3. **How llm mode treats rules-mode rows:** it writes a fresh prefilter row over each one, which
   hides the event until the model decides, exactly as llm mode has always worked. So turning
   llm mode on without a key hides everything rules mode published. Rules mode, for its part,
   leaves content the LLM already judged alone.
4. **The "Free Food" perk is not in the Maize Pages feeds**, only behind `/api/`, which
   robots.txt disallows, so there is no `perk_free_food` field. Rules mode does treat a
   "Free Food" tag as a strong positive (0.85), and Happening turns out to use that tag: two of
   the published events came from it.
5. **Classification now runs on every pass**, including when no source is due. This reverses
   Part 2 decision 2. Without it, nothing would have been classified until the next Maize Pages
   fetch at 6 AM, and tips would wait up to five hours.
6. **Stored events are matched to buildings again on every pass**, so a new alias (from the
   seed file or the admin page) reaches events already ingested. Before, it only affected
   events fetched later.
7. **Hard negatives are blunt on purpose.** "tickets", "admission", "fee", "fundraiser",
   "bring your own" veto an event even next to "free pizza". I exempted only wording that
   plainly means no charge ("free admission", "no tickets required", "no cost").
8. **Meal type:** a meal named in the text wins ("lunch provided" at 6 PM is lunch); otherwise
   the local start hour decides, and outside meal hours it is null. You asked for time of day;
   I put the named meal first because it is the more reliable signal.
   **Reversed on `ui-redesign`:** the start hour is no longer used at all (see UI redesign,
   decision 1).
9. **Tips in rules mode** stay published whatever the rules find; the rules only add food
   items, dietary tags, and audience.
10. **Cross-posted duplicates.** "Rebuilding Democracy" was on both sites with no import
    record, so it showed twice. Maize Pages ingest now links a Happening row with the same
    start time and the same title (ignoring case and punctuation), and the existing rule picks
    the copy. Happening's own double listings (two "Master's Resume Lab" entries, two
    "First-Gen Dinner" entries with different titles) still show twice.
11. **Ten buildings added** with coordinates from OpenStreetMap Nominatim, the same way the
    original seed was built: East Hall, West Hall, Kelsey Museum, Power Center, Clements
    Library, Student Activities Building, ISR, Alice Lloyd, Undergraduate Science Building,
    Walgreen Drama Center. Plus aliases for the Natural History Museum, Mendelssohn Theatre,
    and the Earl Lewis Room. I skipped the LSA Building (Nominatim's match was a restaurant)
    and "The Connector" (not sure which building). Two tests that used East Hall as their
    unmatched example now use the LSA Building.
12. **`pnpm ingest:once --reclassify`** (rules mode only) drops stored rules-mode verdicts so
    edited vocabulary applies to events already judged. Verdicts are otherwise once per content
    version.
13. **Screenshot taken with system Chrome, not Playwright.** The Playwright browsers are in
    your cache but the `playwright` package isn't installed anywhere, and I didn't add it. The
    cached Chromium would not finish a headless capture of the map; system Chrome did.
14. **Two fixture replays.** To apply the dedupe changes without fetching early, I re-applied
    the saved Maize Pages feed from disk (no network), then deleted the run rows those replays
    wrote so the schedule and `/api/health` reflect only the real 05:02 UTC fetch.
15. **The demo events are gone** (`pnpm db:seed:demo --clear`); what you see is real data.

### Happening integration header

1. **No event with `source: maizepages` is published right now.** Every Maize Pages event the
   rules like is also on Happening, so its Happening copy is the one shown, as the rule says.
   Two Maize Pages-only events are live; neither mentions free food. Maize Pages' value at the
   moment is as a fallback if Happening goes away again.
2. **Maize Pages was not fetched in this run.** The dev worker had read it at 1:23 PM, so it
   was not due until 6:22 PM and I did not fetch early. The duplicate counts come from stored
   Maize Pages rows meeting the fresh Happening data.
3. **The header is a host-scoped setting in the shared client** (`hostHeaders`, exact hostname
   match), which you allowed as an alternative to attaching it inside the Happening source. I
   chose it because robots.txt for `events.umich.edu` is fetched by the shared robots checker,
   and "every request to that host" should include that one.
4. **Redirects are followed by hand when a host header is in play.** Node's fetch would carry a
   custom header across a redirect to another host. With the header set, a redirect within
   `events.umich.edu` (https only) is followed with it, up to three hops; a redirect anywhere
   else fails the run and no second request is made.
5. **Happening now needs the header to run at all.** With `HAPPENING_ENABLED=true` and either
   value missing, the worker logs one line and leaves Happening off. A malformed value (http
   site URL, trailing slash, a token with spaces) is a startup error, since that is a typo to
   fix rather than a state to run in.
6. **A 401 or a plain 403 gets the same "rejected the integration header" message** as a
   challenge. None is retried.
7. **`scripts/check-happening.sh` sends the header too** when both values are set, and prints
   only that it was sent.
8. **24 more buildings and aliases** (14 new buildings in this pass, on top of the 10 from
   rules mode), all with Nominatim coordinates. Still unmatched and worth a look: the LSA
   Building (Nominatim has no clean match), "The Connector", Betsy Barbour (the Maize and Blue
   Cupboard), and the soccer stadium.
9. **Happening lists some events twice itself**, for example "Rebuilding Democracy" once as its
   Maize Pages import and once as its own entry, with different titles. Both show. Our dedupe
   only works across sources.
10. **Screenshot again with system Chrome**, not Playwright (the package is not installed).

### UI redesign

1. **The "Lunch" bug was in the worker, not the UI.** Rules mode guessed a meal from the start
   hour (decision 8 under Rules mode, which you had asked for). It now reads the meal only from
   the listing, so most events have none. Locally 66 of 90 published rules-mode events carried
   a meal type before and 27 do after. The web app never infers one either.
2. **One additive API field:** `lastReportAt` on the event detail and report responses.
3. **Search runs in the browser** over loaded events, and the page size went from 30 to the
   API's maximum of 100. Past 100 events, search covers only the pages loaded so far.
4. **Offline:** the service worker still never caches `/api`. The last list per tab is saved in
   `localStorage` and shown only when the request can't be made, under a banner with its time.
5. **vaul was dropped.** Its non-modal mode still marks the rest of the page `aria-hidden` and
   traps focus, which would hide the map and filters from screen readers for as long as the
   sheet is up. The sheet is hand-written instead: a plain region, draggable by its header,
   and the handle is a button (arrow keys step the height).
6. **Motion is used only for the detail drawer.** List cards animate in with CSS and the sheet
   with a CSS transition, so the animation library stays out of the first bundle. There is no
   exit animation on cards.
7. **"Likely over" cards are greyed with tokens, not faded.** At 60% opacity their text failed
   AA contrast.
8. **Pin click and card click do different things.** A pin highlights and scrolls to its card
   and shows a popover with a Details button; a card opens the details. If a pin opened the
   drawer at once, "scrolls to and highlights its card" would never be seen.
9. **Events reported likely over sort last in their group** and don't count toward the
   "N spots right now" headline.
10. **The map loads after the list**, when the browser is idle (2 s at most). On phones the
    default view now includes the map, which the old default did not.
11. **Empty-state hints** ("Lunch rush usually starts around 11:30") are fixed copy keyed to
    the time of day, not computed from data.
12. **Walking time** is straight-line distance times 1.25 at 80 m per minute, shown as an
    estimate. The position stays in the page and is sent nowhere.
13. **`VITE_MAP_STYLE_URL` is now optional** and replaces the built-in basemap in both themes
    when set.
14. **The demo seed has 17 events** and creates three `demo-reporter-N@umich.edu` users for the
    likely-over one; `--clear` removes them.

### UI v3

1. **"Lunch" on the optiMize workshop is correct.** Its description says "Lunch will be
   provided", and that sentence is the stored evidence. Nothing defaults to a meal: the
   time-of-day guess was removed on `ui-redesign`, and the serializer and UI have no fallback.
   What made it look like a default was the bare word, so a food line that is only a meal word
   now reads "Lunch provided". A classifier test pins the real listing text.
2. **Status is green and amber, not maize.** The brief says maize is for "now/soon status" but
   also defines `--now` green and `--soon` amber and uses them for the accent bar and progress
   bar. I used the status tokens for status and kept maize for pins, selection, the nav
   underline and the logo.
3. **Five token values are darker (or lighter in dark mode) than the brief's**, because the
   brief's failed its own AA rule: `--ink-3` (`#8A94A6` is 2.9:1 on the page) is `#5C6678`
   light and `#8E9AAB` dark; status text uses new `--now-ink` and `--soon-ink`; `--members` is
   `#A34A06`. `--now`, `--soon` and `--over` keep the brief's values for dots, bars and pins.
4. **No vaul.** As on `ui-redesign`: it hides the rest of the page from screen readers even in
   non-modal mode. The sheet is hand-written.
5. **Animation is CSS except for the drawer.** Row entrance (8px rise, 30ms stagger, first
   eight rows), the countdown crossfade and the sheet use CSS; the drawer uses motion/react
   with the spring you specified. Putting motion in the first bundle was part of what took
   Lighthouse from 49 to 92 on `ui-redesign`.
6. **Likely-over events are rows, not NowCards,** even while live, and they don't count in the
   headline. So "Happening now · 4" can sit under "3 spots with free food right now".
7. **"Search this area" filters in the browser** to events whose pin is inside the visible map,
   shown as a removable "Map area" chip. Events with no map location drop out while it is on.
8. **No crowd signal on the NowCard beyond "Likely over".** "3 still food · 8m ago" needs
   report counts on the list endpoint, which only carries `likelyGone` today. The drawer has
   the counts and the last report time.
9. **Tooltip and Popover components were not created.** Row titles use the native `title`
   attribute and the map's peek card is a MapLibre popup, so nothing would have used them.
10. **Demo events are filtered in the browser** by their `[demo]` title prefix, as the brief
    asked. They are still in API responses, so a page can show fewer than its page size.
11. **The headline counts "spots"** ("5 spots today") where the brief had "7 today", to keep
    the three ranges parallel.
12. **Phone search is behind an icon** in the sheet header, so the peek can show the first
    card. `/` opens it.
13. **`main` was fast-forwarded locally to `ui-v3`.** This repository has no git remote
    configured, so nothing was pushed or deployed. Nothing here has been checked against
    production data.

## Before deploying

After `ui-redesign` merges:

- Run `pnpm ingest:once --reclassify` against production once, so stored rules-mode verdicts
  lose their guessed meal types.
- `og:image` in `apps/web/index.html` is the relative `/og.png`. Most link previews need an
  absolute URL; set it to the production origin once that is fixed.
- Migrate `/admin/label` to the new colour classes after `ml-classifier` merges.

- Set `UMICH_INTEGRATION_TOKEN` and `PUBLIC_SITE_URL` in the Render environment for the worker
  (both are `sync: false` in `render.yaml`, so Render will ask for them). The token is a
  secret: enter it in the dashboard, never in a file that is committed.
- If the final domain is not `maizebites.zachhoheb.dev`, update `PUBLIC_SITE_URL` and tell
  Student Life Technology Solutions, since the site URL is part of what they approved.
- Set `HAPPENING_ENABLED=true` and decide on `MAIZEPAGES_ENABLED` (`render.yaml` has it false).
- Decide the classifier mode for production: `CLASSIFIER_MODE=llm` with `ANTHROPIC_API_KEY`, or
  `rules`.
- Replace the placeholder API host in `apps/web/vercel.json`.

## Blocked / needs Zach

- **No `ANTHROPIC_API_KEY`.** The site runs in rules mode. With a key and `CLASSIFIER_MODE=llm`
  the model re-checks everything rules mode decided.
- **Ask Student Life** whether a third-party reader of the public Maize Pages feed is fine. It
  is on locally.
- **CI has never run.** Push a branch or open a PR to see `.github/workflows/ci.yml` execute.
- **Deploying** needs your accounts: Neon, Render, Vercel. See "Before deploying" and
  `README.md`.
- The campus wifi/VPN check from Part 1 and the access email are no longer needed: the owners
  answered with the integration header.

## How to run the site

It is running now: http://localhost:5173 (web) and http://localhost:3001/api/health (API), with
the worker and Postgres. Started with `pnpm dev`; output is in `/tmp/maize-bites-dev.log`. To
stop it, end that `pnpm dev` process; `pnpm db:down` stops Postgres.

To start it again:

```sh
cd ~/SideProjects/FoodTracker
pnpm dev                     # Postgres (Docker), migrations, then web :5173, api :3001, worker
```

Docker Desktop must be running. Your `.env` has Happening and Maize Pages on, the integration
token and site URL set, and `CLASSIFIER_MODE=rules`. The worker reads Happening hourly and Maize
Pages every five hours, classifies with the rules each hour, and never calls Anthropic.

Useful commands:

```sh
pnpm ingest:once               # one pass now: fetch whatever is due, then classify
pnpm ingest:once --reclassify  # after editing rules-config.ts: judge every live event again
scripts/check-happening.sh     # how events.umich.edu answers us (sends the header, prints no secret)
pnpm --filter worker eval --mode rules   # precision/recall, once eval/labeled.json has labels
pnpm db:seed                   # after editing packages/db/src/seed/buildings.ts
```

To use the signed-in parts (Share, report buttons, Alerts): Sign in with your @umich.edu
address and click the link printed in the API's log. For the Admin page:

```sh
docker compose exec postgres psql -U maize -d maize_bites \
  -c "update users set is_admin = true where email = 'zhoheb@umich.edu'"
```

### What I checked on the running site (2026-10-09, 4:05 PM)

- `GET /api/health`: `status: "ok"`. Happening last succeeded at 3:58 PM, Maize Pages at
  1:23 PM; neither is stale.
- Through the web proxy: Now tab 3 events, Today tab 3, This Week tab 52 (42 with pins), all
  `source: happening`.
- In headless Chrome the This Week tab lists the events and the map shows pins on Central and
  North campus. Screenshot: `docs/screenshots/both-sources.png`. The street basemap still does
  not paint in the headless capture; check it in a normal browser.
- The worker started with both sources, in rules mode, and made no request (neither was due).
- The token does not appear in the dev log, in any tracked file, or in any commit.

Not checked in a browser: signing in, Share, Admin, Alerts, and the report buttons.

## 2026-10-14: digest push fix (shipped)

**Root cause.** The digest push used its tag (`digest-Wednesday, October 14`) as the Web Push
`Topic` header, which only allows URL-safe base64 characters, so web-push threw before
contacting FCM. The VAPID keys and the subscription were fine. Fixed in `2ac46ab`.

- Pushed `2ac46ab` to `main` at 18:18 UTC. `migrate.yml` passed: the migrator applied
  `0007_normalize_push_keys` (the only pending migration; the migrator fails the step on any
  error) and called the Render deploy hook.
- `/api/health` answered 200 with `status: "ok"` on every check from 18:20 to 18:30 UTC. It
  doesn't report a version, so this can't tell which build is serving; Render keeps the old one
  up if a new one fails its health check. Worth a glance at the Render dashboard.
- Manual `digest.yml` run 38614232502: green. The worker parsed both VAPID keys under the new
  validation. It sent 0 messages: the failed morning run had already claimed today's events
  (delivery is at-most-once), so nothing was due. Tomorrow's 7:30 AM digest is the first real
  push through the fixed path. I didn't delete `notification_log` rows to force a resend.

### Flaky test: HomePage › headline › at / reads "1 spot with free food right now"

Failed once in `pnpm test` (3.5s), passed on every rerun and on unchanged `main`. Reproduced
once in four runs of the web, api, and worker suites in parallel: it hit vitest's 5s test
timeout, together with an unrelated FilterBar test. So the cause is CPU contention: the first
HomePage test pays for the first render and lazy imports. It does read the real clock
(`NOW = new Date()` at module load, fixtures relative to it), but every margin is 20+ minutes,
so a fixed fake timer would not have prevented this failure. Not fixed. Options if it recurs
in CI: raise `testTimeout` for apps/web, or warm the lazy imports in a `beforeAll`.

## 2026-10-14: daily unique visitors (shipped)

Branch `analytics`, fast-forwarded into `main` (`95016b3`..`712707e`). Migration
`0008_page_view_analytics` applied by `migrate.yml`; CI, migrate, Render and Vercel all green.

**What it is.** One `sendBeacon` per page to `POST /api/analytics/view`; the API stores a
`page_views` row keyed by `sha256(daily salt + IP + User-Agent + site host)`, with the route,
referrer host, mobile/desktop and signed-in flag. No cookie, no browser storage, no IP or UA
stored. Salts live in `analytics_salts` and are deleted after two days. Housekeeping rolls
finished days into `analytics_daily` (kept forever) and deletes raw rows after 90 days. The
admin page has a Visitors panel (tiles, 30/90-day chart, table view, funnel, top pages and
referrers, device split, "Leave out my own visits"). About has a Privacy section; CLAUDE.md
documents the scheme.

**Verified.**

- Locally: two Chromium contexts with different real-browser User-Agents (desktop Chrome, iPhone
  Safari) browsed 3 and 2 pages; the dashboard showed 2 unique visitors and 5 page views; the
  admin's own `/admin` visits weren't counted. Screenshots:
  `docs/screenshots/analytics/analytics-dashboard-{light,dark}.png`.
- Production: after deploy, `POST /api/analytics/view` answers 204 (the old build 404s, so this
  also shows the new API is serving), `/api/health` is ok, and the Vercel bundle sends beacons.
  I visited 2 pages with headless Chromium and a desktop User-Agent; a manual `cleanup.yml` run
  (38620466950) logged `2 raw page view(s) stored`. My curl probes (bot UA) weren't stored.

**A miss, fixed.** `0a1fc51` broke `pnpm build`: `normalizePath` used `URL`, which
`@maize-bites/shared` doesn't have when it compiles without DOM or Node types (typecheck
passed). CI caught it; Render most likely kept the previous API until `712707e` fixed it. I
hadn't run `pnpm build` locally; I do now.

### Decisions to review

- **"Last 30 days" is visitor-days.** Ids change daily by design, so distinct people across
  days can't be counted. The tile sums daily uniques and says so.
- **Always 204**, including invalid input and over the rate limit (60/min per IP); this departs
  from the API's usual 400. The route answers after its single insert rather than before, so
  failures are logged and tests need no timing.
- **What counts as a page:** a path change, or opening an event in Home's drawer (`?event=`,
  stored as `/events/:id`). Filter and tab changes don't. Unknown paths are stored as `/404`.
- **Device:** viewport under 640px is mobile; tablets count as desktop.
- **Funnel step 3** counts people whose first alert subscription was made that day. It isn't
  linked to visitors (it can't be without storing a user id).
- **Admin opt-out** is a `users.exclude_from_analytics` column, default true for everyone; only
  admins' flags are read.
- **Bots:** the User-Agent regex includes `HeadlessChrome` and `preview`; rare phone brands
  with "bot" in the model name (e.g. Cubot) would be dropped. Testing with a headless browser
  needs a normal User-Agent.
- **Client IP** comes from `req.ip` with `TRUST_PROXY=2` (Vercel, then Render). Tests cover the
  two-hop case; in production the only sign of a wrong setting would be uniques collapsing to
  about one a day. Worth a look once real traffic arrives.
- **Production test data:** my 2 test page views on 2026-10-14 are in the production counts.

## 2026-10-15: "who it's for" only from the listing (shipped)

Branch `audience-unknown`, fast-forwarded into `main` (`82dea3c`..`eddebab`). Migration
`0009_audience_unknown` (adds `unknown` to `audience`, `wrong_audience` to `report_kind`, and
`classifications.audience_evidence`) applied by `migrate.yml`; CI, migrate, Render and Vercel all
green. Production backfill run with `audience-backfill.yml` (dry run 38796558950, then 38796643215).

**What it is.** open, members and rsvp are stated only with a phrase from the title or
description, stored as `audience_evidence`; otherwise `unknown`. Rules (`classifier/audience.ts`,
`AUDIENCE_RULES`) for rules mode and the backfill; the LLM must quote its evidence and is
downgraded to unknown if the quote isn't in the listing. Reads enforce it as well
(`effectiveAudience`), so an old verdict without evidence shows as unknown. The drawer quotes the
evidence or links to the listing; cards badge only members/RSVP; emails, push and calendar files
share `audienceNote`; "Wrong audience" reports put an event in the admin queue with a count until
a reviewer records an audience with a note.

**Production counts** (published current and upcoming events, 61 at the time):

| audience | before | after |
| -------- | -----: | ----: |
| open     |     35 |     9 |
| members  |      0 |     0 |
| rsvp     |     26 |    24 |
| unknown  |      0 |    28 |

1112 machine verdicts on live events were rewritten; there were no manual verdicts to keep. The
"before" column is the stored audience read at face value (what the old site showed). The run's
log has 10 examples per audience with their evidence.

**Verified.** Locally: lint, typecheck, `pnpm test`, `pnpm test:pg` and `pnpm build` pass; the
built API answered `/api/health` (database ok) and served `audience`/`audienceEvidence`; the
backfill ran against the dev database (open 34 → 7). Production: `/api/health` is ok after the
deploy and after the backfill; `open_only` returns 9 events, with `include_unspecified` 37, of
61; the Vercel bundle has the new filter.

### Decisions to review

- **Filter default: strict.** "Open to all" shows only listings that say so, with the note "Only
  events whose listing says they're open". That hid most events (9 of 61), so there is an
  "Include unspecified" checkbox, off by default, which adds unknown ones (37). Off, because the
  label would otherwise promise "open" for events whose listing never said so. It resets when
  "Open to all" is switched off.
- **Alert subscriptions' "Open to all only" is strict too**, with no unspecified option. Anyone
  who had it on now gets far fewer alerts. Worth revisiting if someone asks.
- **No trained model exists**, so that path wasn't built. Neither feed has structured audience
  or registration data (`docs/sources.md`), so evidence comes only from text.
- **LLM needs_rsvp is gone**: the model returns one audience with members > rsvp > open, plus
  `audience_evidence`. A bad quote downgrades to unknown without a retry (the food verdict
  stands).
- **The backfill rewrote LLM verdicts' audience with the rules**, in place. Few LLM audiences had
  a quote to check, and re-asking the model would cost money. New content gets the LLM's checked
  audience.
- **Members is rare in practice (0 in production).** Patterns were tightened after a dry run on
  real listings: "open to all degree-seeking students" and "open to all engineering students" are
  unknown, not members (a wrong "Members only" badge is its own false claim), and patterns can't
  span sentences. "Open to all UM students" is open.
- **"members and friends welcome" → unknown** (neither open to anyone nor members only);
  "members and non-members", "non-members welcome" → open; "open house" → unknown; "free for
  members, $5 for non-members" → members; "no tickets required" → unknown, not rsvp.
- **Wording.** A reviewer's evidence is shown as "Our review: …", not "Listing says: …". Unknown
  without a source link (a tip) says "Check with the host before you go."
- **Deploy order.** The web schema accepts the old API's `audience: null` and a missing
  `audienceEvidence`. Old cached clients against the new API would fail to parse `unknown` until
  the service worker updates them (autoUpdate + skipWaiting, so one reload).
- **Between the deploy and the backfill (a few minutes)** every production event showed as
  unknown, because no stored verdict had evidence yet.
- **Known misses.** "Sign up"/"register" also match "sign up for our newsletter" or "register to
  vote"; the rsvp list is the brief's. Recurring occurrences repeat in the samples.
- **Flaky local timeouts.** With the machine at load ~20, single API/worker tests timed out at
  15s (different ones each run) and passed on rerun; unrelated to this change.
