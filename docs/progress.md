# Progress

Log of the autonomous pass through Parts 0 to 5, finished 2026-10-09. Everything is merged into
`main` locally. Nothing has been pushed, deployed, or emailed.

**Status:** Parts 0 to 5 are done, and so is the follow-up "real events with no API key"
(rules mode, below). The site is showing 31 real events. One step is yours (running the
Happening check on campus networks), and Happening ingestion stays off until its owners allow
our client. `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:pg` pass on `main`
(829 tests each run).

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
- [ ] Run it on campus wifi and the UMich VPN (Zach; see "Blocked / needs Zach")
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

## Blocked / needs Zach

- **Happening is blocked by a Cloudflare challenge.** Ingestion from it stays failing until the
  owners allow our client. Nothing in the code tries to get past it.
  1. On campus wifi, then again on the UMich VPN, run `scripts/check-happening.sh` from the repo
     root. It makes three requests and prints status, `cf-mitigated`, and whether the body is a
     challenge page.
  2. If any endpoint shows `status: 200` and `challenge page: no`, the block is network-specific.
     Tell me which network and endpoint; do not switch ingestion yourself.
  3. Either way, review and send `docs/happening-access-email.md` (find the team's current
     contact address on events.umich.edu first; I could not load the site to look it up).
- **No `ANTHROPIC_API_KEY` in `.env`.** Only the keyword rules run, so no feed event is ever
  published. Add the key and the next ingest pass classifies the waiting candidates (121 locally,
  mostly old Happening events). Until then the site shows demo data only (`pnpm db:seed:demo`).
- **Ask Student Life** whether a third-party reader of the public Maize Pages feed is fine.
  `MAIZEPAGES_ENABLED` defaults to false; your local `.env` does not set it either.
- **CI has never run.** Push a branch or open a PR to see `.github/workflows/ci.yml` execute.
- **Deploying** needs your accounts: Neon, Render, Vercel. Steps are in `README.md`.

## How to run the site

It is running now: http://localhost:5173 (web) and http://localhost:3001/api/health (API), with
the worker and Postgres. Started with `pnpm dev`; output is in `/tmp/maize-bites-dev.log`. To
stop it, end that `pnpm dev` process; `pnpm db:down` stops Postgres.

To start it again:

```sh
cd ~/SideProjects/FoodTracker
pnpm dev                     # Postgres (Docker), migrations, then web :5173, api :3001, worker
```

Docker Desktop must be running. Your `.env` now has `CLASSIFIER_MODE=rules`,
`HAPPENING_ENABLED=false`, and `MAIZEPAGES_ENABLED=true`, so the worker reads Maize Pages every
five hours (next at about 6:00 AM today), classifies with the rules each hour, and never calls
Anthropic.

Useful while tuning:

```sh
pnpm ingest:once               # one pass now: fetch whatever is due, then classify
pnpm ingest:once --reclassify  # after editing rules-config.ts: judge every live event again
pnpm --filter worker eval --mode rules   # precision/recall, once eval/labeled.json has labels
pnpm db:seed                   # after editing packages/db/src/seed/buildings.ts
pnpm db:seed:demo              # demo events, if you ever want an obviously fake full list
```

The list will thin out through the week: most of what is published is Happening data that ends
by Oct 13, and Maize Pages adds only a couple of positives per week under these rules. An
Anthropic key (`CLASSIFIER_MODE=llm`) or Happening access is what brings the numbers back up.

To use the signed-in parts (Share, report buttons, Alerts): Sign in with your @umich.edu
address and click the link printed in the API's log. For the Admin page:

```sh
docker compose exec postgres psql -U maize -d maize_bites \
  -c "update users set is_admin = true where email = 'zhoheb@umich.edu'"
```

### What I checked on the running site

- `GET /api/health` (through the web proxy): 200. Maize Pages fresh (last success 05:02 UTC),
  Happening listed as stale, `ingestionStale` false, `status` "degraded" because of Happening.
- `GET /api/events?from=<now>`: 31 events, 29 from Happening and 2 from Maize Pages, 23 with
  coordinates. Today tab: 9. Now tab: 0 (it was 2 AM).
- In headless Chrome the This Week tab lists the real events ("La Tertulia: Spanish Coffee
  Hour", "Fresh Check Day 2026", ...) and the map shows their pins on Central and North campus.
  Screenshot: `docs/screenshots/first-real-events.png`. As before, the street basemap did not
  paint in the headless capture; check it in a normal browser.
- The worker started in rules mode, logged "classifier: rules mode, LLM disabled, rules-only
  verdicts are published", and made no request (Maize Pages not due).

Not checked in a browser: signing in, Share, Admin, Alerts, and the report buttons.
