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

- [ ] `scripts/check-happening.sh`
- [ ] Run it here and record the result
- [ ] Run it on campus wifi and the UMich VPN (Zach; see "Blocked / needs Zach")
- [ ] Report any official endpoint that returns real data
- [ ] Draft `docs/happening-access-email.md` (not sent)

### Part 2: source abstraction + Maize Pages (`sources`)

- [ ] Move Happening under `apps/worker/src/sources/happening/`
- [ ] Source interface and generic ingest loop
- [ ] Shared HTTP client (User-Agent, robots.txt, rate limit, conditional requests, backoff)
- [ ] Per-source runs in `ingestion_runs` (migration)
- [ ] `HAPPENING_ENABLED` / `MAIZEPAGES_ENABLED`
- [ ] Maize Pages source (ICS, RSS fallback, ttl) and `maizepages` enum value (migration)
- [ ] Dedupe against Happening
- [ ] Fixtures and tests (normalizer, dedupe, failure isolation)
- [ ] Live `ingest:once` with only Maize Pages enabled
- [ ] Update `docs/sources.md` and `CLAUDE.md`

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

- [ ] Maize Pages ingest into the local db
- [ ] `pnpm db:seed:demo` (needed: `ANTHROPIC_API_KEY` is not set)
- [ ] `pnpm dev` running; list, map, and `/api/health` confirmed

## Commits

| Part | Branch          | Commits                                                     | Merged to main |
| ---- | --------------- | ----------------------------------------------------------- | -------------- |
| 0    | `audit-cleanup` | `84855df` `bcfc224` `1104d17` `329a3a3` `b2812b9` `7677ed5` | yes (ff)       |

## Decisions to review

None yet.

## Blocked / needs Zach

None yet.

## How to run the site

Filled in at the end.
