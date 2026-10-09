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

Live Maize Pages run against the local db, 2026-10-09 05:02 UTC (3 requests in total to
maizepages.umich.edu today: robots.txt, the ICS feed, and nothing else from the worker):

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

- [ ] `POST /api/submissions`
- [ ] `POST /api/events/:id/reports`
- [ ] Admin: review queue, override, submission review, metrics, audit log
- [ ] Rate limits on submissions and reports
- [ ] API tests (trust, thresholds, admin authorization, audit)
- [ ] Web: Submit page, report buttons, gray-out, Admin page, tests

### Part 4: logging (`worker-pino`)

- [ ] Worker logs through pino with the API's config

### Part 5: CI and deploy (`ci-deploy`)

- [ ] `.github/workflows/ci.yml`
- [ ] Dockerfiles for api and worker
- [ ] `render.yaml`, `apps/web/vercel.json`
- [ ] `/api/health` per source
- [ ] `README.md`

### Seeing the site

- [x] Maize Pages ingest into the local db (27 events; see Part 2)
- [ ] `pnpm db:seed:demo` (needed: `ANTHROPIC_API_KEY` is not set)
- [ ] `pnpm dev` running; list, map, and `/api/health` confirmed

## Commits

| Part | Branch                | Commits                                                               | Merged to main |
| ---- | --------------------- | --------------------------------------------------------------------- | -------------- |
| 0    | `audit-cleanup`       | `84855df` `bcfc224` `1104d17` `329a3a3` `b2812b9` `7677ed5`           | yes (ff)       |
| 1    | `happening-diagnosis` | `ecee92a` `f8ee686`                                                   | yes            |
| 2    | `sources`             | `c5cf497` `60787c1` `726495e` `872387d` `8b49d46` `fd360b5` `a4bb5fa` | yes            |

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

## How to run the site

Filled in at the end.
