# Maize Bites

Tracks free food events at the University of Michigan. TypeScript monorepo, pnpm workspaces, Node ≥ 20.19.

## Architecture

```
web (React SPA) ──/api proxy──▶ api (Express) ──┐
                                                ├──▶ Postgres 16
                     worker (scheduled jobs) ───┘
```

- **web** fetches from `/api/*`. The API serves everything under `/api`, and in dev Vite proxies `/api` to it unchanged.
- **api** and **worker** share `@maize-bites/db` (Drizzle schema, queries, client) and read `DATABASE_URL`.
- **api** and **worker** send mail through `@maize-bites/email` (Resend; without a key, messages are logged).
- **shared** holds the wire contract: Zod schemas, the types inferred from them, and pure domain helpers. The web app imports it, so it must stay browser-safe (no Node APIs, no db).

## Layout

```
apps/web        React + Vite + Tailwind v4, TanStack Query, React Router, MapLibre (OpenFreeMap tiles), PWA.
                src/{api,components,hooks,lib,pages,sw}; scripts/generate-icons.js writes public/icons
apps/api        Express 5. createApp({ db, logger, webOrigin }) in app.ts; routes/ per resource (index.ts mounts
                /api); errors.ts (HttpError + error format); serializers.ts; ics.ts; test/seed.ts (API fixtures)
apps/worker     node-cron scheduler.ts, jobs/ (ingest-happening, housekeeping, index.ts wires them),
                happening/ (feed client, schema, normalizer), locations/ (building matcher),
                classifier/ (rules + LLM), notify/ (alert matching, notifier, delivery),
                eval/ (harness + labeled.json), cli/, fixtures/ (captured feed response)
packages/db     schema.ts, queries/, client.ts (createDb), testing.ts (createTestDb + fixtures), seed/ (buildings), drizzle/ migrations
packages/email  mailer.ts (createMailer), templates.ts (sign-in link, instant alert, digest)
packages/shared enums.ts (all enumerated values), events.ts (wire schemas + domain helpers)
```

Internal packages export TypeScript source through the custom `@maize-bites/source` condition. tsx (`--conditions`), Vite/Vitest (`resolve.conditions`), and `tsc` (`customConditions`) all use it, so dev and typecheck need no prebuild. `tsconfig.build.json` clears the condition, so `pnpm build` compiles each package to `dist/` in dependency order.

## Commands

```sh
cp .env.example .env   # once
pnpm install
pnpm dev               # starts Postgres (docker compose), runs migrations, then web :5173, api :3001, worker
pnpm lint              # eslint + prettier --check   (pnpm format to fix)
pnpm typecheck
pnpm test              # vitest in every package; db tests use in-memory PGlite, no Docker needed
pnpm test:pg           # same suite against real Postgres (a throwaway db per test); run before merging db changes
pnpm build
pnpm db:generate       # after editing packages/db/src/schema.ts; commit the generated drizzle/ files
pnpm ingest:once        # one Happening @ Michigan ingestion pass (needs INGEST_CONTACT_EMAIL; obeys the hourly guard)
pnpm --filter worker eval  # score rules vs rules+LLM on eval/labeled.json (LLM part costs money; --rules-only, --max-llm-calls N)
pnpm db:seed           # upsert ~50 UMich buildings (idempotent); run after a fresh migrate
pnpm db:migrate | db:studio | db:up | db:down
pnpm --filter @maize-bites/api test   # target a single package
```

## Conventions

- **Validate with Zod at every boundary**: HTTP requests (params, query, body), API responses parsed by web, env vars (`parseEnv` in each app), and any external or ingested data. Derive types with `z.infer`. Don't hand-write duplicate interfaces.
- **No secrets in code.** Config comes from env vars, loaded from the root `.env` locally (gitignored). Add every new variable to `.env.example` with a safe placeholder, and to the app's env schema.
- **Tests for all business logic.** Keep logic in pure functions or in functions with injected dependencies (`db`, `now`, `logger`, `fetchFn`) so tests need no mocks of modules. Use `createTestDb()` from `@maize-bites/db/testing` for anything that touches SQL. Tests sit next to the code as `*.test.ts(x)`.
- Database access goes through `packages/db/src/queries/`. Apps don't build ad-hoc SQL. `schema.ts` must not import workspace packages, because drizzle-kit loads it directly.
- Enumerated values live in `shared/src/enums.ts`. Each pg enum in `schema.ts` repeats its values, and `schema.test.ts` fails if they drift. To add a value, change both, then run `pnpm db:generate`.
- PGlite accepts some things postgres-js rejects (for example, raw `Date` params in `sql` expressions; bind them with `sql.param(value, column)`). Run `pnpm test:pg` when you touch queries.
- **Ingestion** (`apps/worker/src/jobs/ingest-happening.ts`) runs hourly at :23 and once on startup. `ingestIfDue` skips any run within 59 min of the previous start, whatever triggered it. Each run fetches 14 local days from `events.umich.edu/list/json?v=2`, paged 200 at a time with a 1s pause. It sends a User-Agent carrying `INGEST_CONTACT_EMAIL`, uses a 10s timeout, and backs off exponentially on 429/5xx while honoring Retry-After. Events missing for 24h are marked `removed`, but only after a complete fetch, and only if they haven't ended and start inside the fetched window. Don't loosen these limits.
- A Cloudflare challenge on the feed (`cf-mitigated: challenge`) fails the run without retrying. Don't add headers or clients meant to get past it.
- **Housekeeping** (`apps/worker/src/jobs/housekeeping.ts`): `auth-cleanup` runs daily at 4:17 AM; `prune-events` deletes events that ended more than `EVENT_RETENTION_DAYS` ago, every `PRUNE_INTERVAL_MINUTES`.
- The feed has no coordinates. Locations resolve by matching `building_name` then `location_name` against building names and aliases (`locations/matcher.ts`). Unmatched names accumulate in `location_misses`; add aliases to `packages/db/src/seed/buildings.ts` from there.
- **Classifier** (`apps/worker/src/classifier/`) runs after each ingestion, once per content version:
  - **Rules** (`rules-config.ts` is the editable vocabulary) store a `rules` row for every live event. A candidate is stored as free food at confidence 0.3, which keeps it hidden and out of the review queue.
  - **LLM:** candidates without an llm or manual row for their current `content_hash` go to `claude-haiku-4-5` with structured output. The response is validated with Zod, and `evidence` must be verbatim text from the listing. On an invalid response it retries once with the problem spelled out; after that it writes a `review_flags` row and never re-sends that content version.
  - **Limits:** at most 3 requests in flight, and `LLM_MAX_CALLS_PER_RUN` (default 100, retries included) caps the rest, which defer to the next run. An auth error stops the stage. Without `ANTHROPIC_API_KEY`, only rules run.
- Measure classifier changes with `pnpm --filter worker eval` before and after. `eval/labeled.json` holds hand labels; `null` labels are skipped.
- **API conventions:**
  - Parse every `req.query` and `req.params` with a schema from `@maize-bites/shared`; a thrown ZodError becomes a 400.
  - Throw `HttpError(status, code, message)` for everything else.
  - Every error body is `{ error: { code, message, requestId, issues? } }` (`apiErrorSchema`). Never hand-roll an error response.
  - Response bodies are typed with shared types (`ListEventsResponse`, `EventDetail`, ...).
  - CORS allows only `WEB_ORIGIN`. Helmet and pino-http (with `X-Request-Id`) run on every request.
  - Routes that are designed but not built return 501 from their stub router; the TODOs there are the spec.
- **Web:**
  - Home page state (tab, filters, selected event, list/map view) lives in the URL (`lib/filters.ts`, `hooks/useHomeParams.ts`).
  - Validate API responses with shared schemas in `api/`.
  - Keep maize as a background behind blue text, never as text on white (contrast).
  - `EventMap` is lazy-loaded, and MapLibre's worker is bundled explicitly (`?worker&url`); don't remove that.
  - The service worker (`src/sw/sw.ts`, injectManifest) precaches the shell only and never caches `/api`.
- **Auth:**
  - Magic links go only to @umich.edu (`umichEmailSchema`).
  - Tokens and sessions are 32 random bytes; only SHA-256 hashes are stored.
  - Links are single-use (atomic `consumeMagicLink`) and expire in 15 min. Sessions last 30 days in the httpOnly, SameSite=Lax `mb_session` cookie.
  - The emailed link opens `/auth/verify` in the web app, which calls the API from JS, so link scanners can't burn tokens.
  - Protect routes with `requireUser` / `requireAdmin`. Writes pass `writeProtection` (Origin must be `WEB_ORIGIN`; bodies must be JSON).
- **Alerts** (`apps/worker/src/notify/`):
  - Instant alerts run after each ingestion. They cover only events published after the subscription was created; filters are ANDed; quiet hours (America/Detroit) defer rather than drop.
  - The digest runs at 7:30 AM and ignores quiet hours.
  - Always `claimNotification` (insert into notification_log, skip on conflict) _before_ sending. Delivery is at-most-once; failures are recorded in `notification_log.error`.
- **Publishing rule** (`listPublishedEvents`): an event shows when its status is active and its _active classification_ says `has_free_food`, with confidence ≥ `PUBLISH_CONFIDENCE` (0.7). A manual verdict skips the threshold. Machine free-food verdicts from 0.4 up to 0.7, and flagged events, make up `listReviewQueue`. The active classification is the newest manual row for the event, whatever content it was made against. Otherwise it is the newest row matching the event's current `content_hash`. `upsertEvent` computes that hash, so callers never set it.
- Timestamps are `timestamptz` in the db, `Date` in server code, and ISO-8601 strings on the wire. The UI always displays `America/Detroit` time.
- Node packages use ESM with `.js` extensions on relative imports (NodeNext). Web uses extensionless imports (Bundler).
- Add dependency versions to the `catalog:` in `pnpm-workspace.yaml`, then reference them as `"catalog:"`.
- TypeScript is strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Don't use `any`, and don't silence errors without a comment explaining why.
