# Progress

Running log for the autonomous pass through Parts 0 to 5. Updated and committed after each part.
Nothing here has been pushed, deployed, or emailed.

Note: the instructions refer to `docs/next-session.md`. That file is not in the repo; the ground
rules I am following are the ones from the session prompt (no challenge bypass, no SSO, no
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

### Seeing the site

- [x] Maize Pages ingest into the local db (27 events; see Part 2)
- [x] `pnpm db:seed:demo` (needed: `ANTHROPIC_API_KEY` is not set)
- [ ] `pnpm dev` running; list, map, and `/api/health` confirmed

## Commits

| Part | Branch                | Commits                                                               | Merged to main |
| ---- | --------------------- | --------------------------------------------------------------------- | -------------- |
| 0    | `audit-cleanup`       | `84855df` `bcfc224` `1104d17` `329a3a3` `b2812b9` `7677ed5`           | yes (ff)       |
| 1    | `happening-diagnosis` | `ecee92a` `f8ee686`                                                   | yes            |
| 2    | `sources`             | `c5cf497` `60787c1` `726495e` `872387d` `8b49d46` `fd360b5` `a4bb5fa` | yes            |
| 3    | `phase-7`             | `7e96853` `1f44aee` `61c9eda` `c6b01a5` `cd5b84e` `1cd18cd`           | yes            |
| 4    | `worker-pino`         | `7b0cfb4`                                                             | yes            |
| 5    | `ci-deploy`           | `d65198d` `03f6b1a` `8f379f1` `0e45e40` `703f872` `9aba454`           | yes            |

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
   "no". Side effect: while events.umich.edu challenges us, a Happening run costs one request
   (robots.txt) instead of one feed request, and the run error says robots.txt was challenged.
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

Filled in at the end.
