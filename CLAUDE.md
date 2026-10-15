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
apps/web        React + Vite + Tailwind v4, TanStack Query, React Router, Radix, MapLibre (OpenFreeMap tiles), PWA.
                src/{api,components,components/ui,hooks,lib,pages,sw}; scripts/ (generate-icons, generate-og, screenshots)
apps/api        Express 5. createApp({ db, logger, webOrigin }) in app.ts; routes/ per resource (index.ts mounts
                /api); errors.ts (HttpError + error format); serializers.ts; ics.ts; test/seed.ts (API fixtures)
apps/worker     node-cron scheduler.ts, jobs/ (ingest, housekeeping, index.ts wires them),
                sources/ (types.ts Source interface; http/ shared client, robots.txt, rate limit;
                happening/ and maizepages/ each with fetch + schema + normalizer),
                locations/ (building matcher), classifier/ (rules + LLM), notify/ (alert matching,
                notifier, delivery), eval/ (harness + labeled.json), cli/,
                fixtures/ (captured feed responses)
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
pnpm ingest:once        # one ingestion pass over the enabled sources (needs INGEST_CONTACT_EMAIL; obeys the per-source guard)
pnpm digest:once        # send the morning digest once (DIGEST_CRON set: only if that UTC schedule is 7:30 AM in Ann Arbor today)
pnpm cleanup:once       # delete expired sessions and sign-in links, events past EVENT_RETENTION_DAYS; roll up analytics
pnpm --filter worker audience:backfill  # reapply the audience rules to current and upcoming events (keeps manual verdicts; --dry-run); audience-backfill.yml runs it in production
pnpm --filter worker eval  # score rules vs rules+LLM on eval/labeled.json (LLM part costs money; --rules-only, --max-llm-calls N, --mode rules)
pnpm db:seed           # upsert the 73 UMich buildings (idempotent); run after a fresh migrate
pnpm db:seed:demo      # 20 "[demo]" events covering every state (live, soon, later, open, members, RSVP, unknown audience, likely over); --clear removes them; refuses production
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
- **Ingestion** (`apps/worker/src/jobs/ingest.ts`) runs hourly at :23 and once on startup, over the sources enabled by `HAPPENING_ENABLED` and `MAIZEPAGES_ENABLED`. Each source implements `Source` (`sources/types.ts`) and gets its own `ingestion_runs` row; a source that fails, or is challenged, never stops the next one. Stored events without a building are matched again (`relinkLocations`), then classification and alerts run once per pass, after all sources and also when none was due. `docs/sources.md` records what we may fetch and why.
  - `ingestIfDue` skips a source within 59 min of its previous start, whatever triggered it, and longer if the source or its feed asks (Maize Pages: 5 hours). Don't loosen these limits.
  - Every request goes through `sources/http/client.ts`: a User-Agent carrying `INGEST_CONTACT_EMAIL`, robots.txt checked first (cached per host; unreadable means don't fetch), at least 1s between requests to a host, a 10s timeout, exponential backoff on 429/5xx honoring Retry-After.
  - **Happening**: 14 local days from `events.umich.edu/list/json?v=2`, paged 200 at a time with a 1s pause. It needs the integration header Student Life Technology Solutions issued: `x-umich-integration: ${UMICH_INTEGRATION_TOKEN} ${PUBLIC_SITE_URL}`. `sourcesFromEnv` registers it as a host header for `events.umich.edu` (`HttpOptions.hostHeaders`), and the client sends such headers only when the request hostname matches exactly, refuses redirects to another host instead of following them, and never logs them. Without both env vars the worker logs one line and leaves Happening off. Never attach the header globally, and never write the token into code, tests, docs, or logs.
  - **Maize Pages**: one GET of `maizepages.umich.edu/events.ics` with conditional headers (a 304 is a complete run); `/events.rss` only as a fallback for ordinary failures. Never call `/api/` there; robots.txt disallows it.
  - Events missing for 24h are marked `removed`, but only after a complete fetch, and only if they haven't ended and start inside the fetched window.
  - To add a source: a new `event_source` value (shared enum, pg enum, migration), a module under `sources/<name>/`, an env flag, and an entry in `docs/sources.md` first.
- If Happening answers 401, 403, or a challenge with the header sent, the run fails once with "Happening rejected the integration header; check the token".
- A Cloudflare challenge (`cf-mitigated: challenge`) or a robots.txt refusal fails the run without retrying, and the source must not try another URL on that site. Don't add headers or clients meant to get past it.
- **Duplicates across sources**: Happening imports some Maize Pages events. Both rows carry `events.maizepages_event_id` and only one is active: the Happening copy while its feed has listed it in the last 24h, otherwise the Maize Pages one (`hasFreshHappeningTwin`, `retireDuplicateEvents`). The hidden row is marked `removed` and its alert claims move to the survivor.
- **Deployment runs the jobs one at a time, not as a worker.** In production there is no long-running worker: scheduled GitHub Actions (`.github/workflows/{ingest,digest,cleanup}.yml`) run the one-shot CLIs in `apps/worker/src/cli/` (ingest every 3 hours, digest at 7:30 AM Ann Arbor, cleanup daily), and `migrate.yml` applies migrations on each push to `main` and then triggers the API deploy. The scheduler in `apps/worker/src/index.ts` is what `pnpm dev` runs locally. A job added to the scheduler needs a CLI and a workflow too, and each CLI must exit nonzero on failure. Jobs can't rely on anything kept in memory between runs.
- The API listens on `PORT` when the host sets it, else `API_PORT` (`listenPort`).
- The API host sleeps when idle. Web queries retry through a wake-up (`shouldRetry`, `retryDelay` in `api/queries.ts`) and Home shows `WakingNotice`; don't surface an error for a 502/503/504 or a network failure until those retries are spent.
- **Housekeeping** (`apps/worker/src/jobs/housekeeping.ts`): `auth-cleanup` runs daily at 4:17 AM; `prune-events` deletes events that ended more than `EVENT_RETENTION_DAYS` ago, every `PRUNE_INTERVAL_MINUTES`; `analytics-rollup` runs daily at 4:37 AM (see Analytics).
- The Happening feed has no coordinates; Maize Pages gives some. Locations resolve by matching each source's location names against building names and aliases (`locations/matcher.ts`). Unmatched names accumulate in `location_misses`; add aliases to `packages/db/src/seed/buildings.ts` from there.
- **Classifier** (`apps/worker/src/classifier/`) runs on every pass (also when no source was due), once per content version. `CLASSIFIER_MODE` picks who decides:
  - **`llm` (default).**
    - **Rules prefilter** (`rules.ts`; `DEFAULT_RULES` in `rules-config.ts` is the vocabulary) stores a `rules` row for every live event. It is tuned for recall. A candidate is stored as free food at confidence 0.3, which keeps it hidden and out of the review queue.
    - **LLM:** candidates without an llm or manual row for their current `content_hash` go to `claude-haiku-4-5` with structured output. The response is validated with Zod, and `evidence` must be verbatim text from the listing. On an invalid response it retries once with the problem spelled out; after that it writes a `review_flags` row and never re-sends that content version.
    - **Limits:** at most 3 requests in flight, and `LLM_MAX_CALLS_PER_RUN` (default 100, retries included) caps the rest, which defer to the next run. An auth error stops the stage. Without `ANTHROPIC_API_KEY`, only the prefilter runs and nothing from a feed is published.
  - **`rules`.** No LLM; the Anthropic client is never built. `rules-mode.ts` is the final judge and is tuned for precision (`RULES_MODE` in `rules-config.ts`): it publishes only on an explicit statement that food is given away, or a "Free Food" tag, and money, potlucks, food trucks, and dining halls veto it. It stores a `rules` row with `rules_mode = true` at 0.75 (0.85 for the tag), which is above `PUBLISH_CONFIDENCE`, or 0.2 for a negative. Don't loosen the prefilter to help rules mode, and don't loosen rules mode to pad the list.
  - **Switching modes.** `classifications.rules_mode` tells a rules-mode verdict from a prefilter row. Each mode re-judges content whose newest rules row came from the other, so turning llm mode on writes a fresh prefilter row over every rules-mode verdict (hiding it, as llm mode always does until the model decides) and sends candidates to the LLM; rules-mode rows never block that. Rules mode leaves content the LLM already judged alone. Manual verdicts win in both modes.
- **Audience** (who an event is for: `open | members | rsvp | unknown`) is stated only when the listing says so. `classifications.audience_evidence` holds the listing's words (for a manual row, the reviewer's note); open, members and rsvp need it, and absence of a restriction is never "open".
  - Rules (both modes and the backfill): `detectAudience` in `classifier/audience.ts` with `AUDIENCE_RULES` in `rules-config.ts`; members > rsvp > open; no match is unknown. `audience.test.ts` is the contract (including "open house" → unknown, "members and friends welcome" → unknown).
  - LLM: returns `audience` and a verbatim `audience_evidence`; `checkedAudience` downgrades to unknown when the quote isn't in the title or description (no retry). There is no trained model.
  - Reads enforce it too: `effectiveAudience` (shared) serves a machine audience without evidence as unknown, and the open-only filter mirrors that in SQL. Manual verdicts stand.
  - Neither feed has a structured audience or registration field (docs/sources.md), so evidence comes only from text.
  - Wording everywhere comes from one place per surface: `audienceNote` (shared) for email, push and ICS; `AudienceInfo` in `EventDetails` for the drawer (quote, or "check the listing" with a link). Cards badge only members and rsvp.
- Measure classifier changes with `pnpm --filter worker eval` before and after (`--mode rules` scores rules mode). `eval/labeled.json` holds hand labels; `null` labels are skipped.
- **API conventions:**
  - Parse every `req.query` and `req.params` with a schema from `@maize-bites/shared`; a thrown ZodError becomes a 400.
  - Throw `HttpError(status, code, message)` for everything else.
  - Every error body is `{ error: { code, message, requestId, issues? } }` (`apiErrorSchema`). Never hand-roll an error response.
  - Response bodies are typed with shared types (`ListEventsResponse`, `EventDetail`, ...).
  - CORS allows only `WEB_ORIGIN`. Helmet and pino-http (with `X-Request-Id`) run on every request.
  - Writes by signed-in users are rate limited per user (`byUser` in `rate-limit.ts`), not per IP.
  - Every admin write calls `recordAudit` with the actor. Admin routes sit behind `requireAdmin`.
- **Web:**
  - Home page state (tab, filters, selected event, list/map view) lives in the URL (`lib/filters.ts`, `hooks/useHomeParams.ts`).
  - Validate API responses with shared schemas in `api/`.
  - Colours, type, radius and shadows are tokens in `src/index.css` (`bg-page`, `bg-panel`, `bg-card`, `bg-raised`, `bg-sunken`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `now`/`soon` with `-soft` and `-ink`, `members`, `rsvp`, `danger`, `meal-*`). Use them, not raw palette classes, so dark mode works. `lib/tokens.test.ts` checks every text/background pair for WCAG AA; add new pairs there.
  - Maize is for map pins, the selected card or row, the nav underline and the logo, and nothing else. Active controls use `bg-active`/`bg-primary` (ink). The token test lists the files allowed to name maize.
  - Build from `components/ui/` (Button, IconButton, Segmented, Toggle, DropdownPill, Chip, Badge, StatusPill, MealTile, ProgressBar, SectionHeader, Skeleton, Drawer, Sheet). A file that exports a component exports nothing else (fast refresh lint), so helpers live in `lib/`.
  - The list is an agenda (`EventList`): `NowCard` for events that are live or start within 30 minutes (`isUrgent`), `AgendaRow` for the rest and for anything likely over. Each event shows its time once. `lib/status.ts` has the time logic, `lib/grouping.ts` the sections, `lib/hero.ts` the headline (computed from the list shown) and data freshness, `lib/badges.ts` the exception badges (members and RSVP only; never "Open to all", never anything for unknown).
  - The "Open to all" filter (`open=1`) shows only events whose listing says they're open; "Include unspecified" (`unspec=1`, API `include_unspecified`) adds unknown ones. Alert subscriptions' "Open to all only" is the strict form.
  - Show food only from extracted `foodItems` or the classifier's `mealType` (`foodText`); with neither, show nothing.
  - `[demo]` events are hidden unless `VITE_SHOW_DEMO=true`.
  - Components that show a time read the shared clock (`useNow`) themselves; don't pass `now` down through the list.
  - Keep the first bundle small: pages other than Home are lazy (`pages/lazy.ts`), `motion` is only in the lazy drawer, and the map starts on idle. `index.html` holds a static header and preloads the Now tab's requests; keep those URLs in step with `api/events.ts`.
  - The phone bottom sheet is a plain region, not a dialog, so the map behind it stays reachable.
  - `EventMap` and `MiniMap` are lazy-loaded and import MapLibre from `lib/maplibre.ts`, which bundles its worker explicitly (`?worker&url`); don't remove that. The basemap is `lib/map-style.ts` over OpenFreeMap tiles.
  - The service worker (`src/sw/sw.ts`, injectManifest) precaches the shell only and never caches `/api`. Offline, Home shows the last list saved in `localStorage` (`lib/offline-cache.ts`) under a banner.
  - `pnpm --filter @maize-bites/web screenshots` captures the review set (three sizes, light and dark, drawer, peek card, sheet) with the locally installed Chromium. It needs `pnpm db:seed:demo` and the site started with `VITE_SHOW_DEMO=true pnpm dev`.
- **Auth:**
  - Magic links go only to @umich.edu (`umichEmailSchema`).
  - Tokens and sessions are 32 random bytes; only SHA-256 hashes are stored.
  - Links are single-use (atomic `consumeMagicLink`) and expire in 15 min. Sessions last 30 days in the httpOnly, SameSite=Lax `mb_session` cookie.
  - The emailed link opens `/auth/verify` in the web app, which calls the API from JS, so link scanners can't burn tokens.
  - Admins: `ADMIN_EMAILS` (API env, comma-separated @umich.edu) grants `is_admin` at sign-in in `/api/auth/verify`, for new accounts and existing ones on their next sign-in (`upsertUserByEmail(..., { grantAdmin })`). Removing an address never demotes; clear `users.is_admin` in the database for that.
  - Protect routes with `requireUser` / `requireAdmin`. Writes pass `writeProtection` (Origin must be `WEB_ORIGIN`; bodies must be JSON).
- **Alerts** (`apps/worker/src/notify/`):
  - Instant alerts run after each ingestion. They cover only events published after the subscription was created; filters are ANDed; quiet hours (America/Detroit) defer rather than drop.
  - The digest runs at 7:30 AM and ignores quiet hours.
  - Always `claimNotification` (insert into notification_log, skip on conflict) _before_ sending. Delivery is at-most-once; failures are recorded in `notification_log.error`.
- **Analytics** (privacy-friendly, admin-only; `apps/api/src/analytics.ts`, `routes/analytics.ts`, `queries/analytics.ts`):
  - The web app sends one `navigator.sendBeacon` per page (`usePageViews` in `AppShell`: route changes and the Home drawer's `?event=`, not filter changes) to `POST /api/analytics/view` with `{ path, referrer host, screen bucket }`. No cookies, no localStorage ids, no third-party scripts, so no consent banner. Nothing is sent with Do Not Track or Global Privacy Control on.
  - `visitor_id = sha256(daily salt + client IP + User-Agent + site host)`. The salt is random, one per America/Detroit day, lives only in `analytics_salts`, and is deleted two days later (on the next day's first view and by housekeeping), so old ids can't be recomputed or linked across days. Unique visitors are per day; a 30-day figure is a sum of daily uniques. The IP and User-Agent are never stored or logged. The IP is `req.ip`, which needs `TRUST_PROXY` right (2 in production: Vercel's rewrite, then Render's load balancer).
  - Not counted: no User-Agent, `BOT_USER_AGENT` (crawlers, link unfurlers, monitors, headless browsers, HTTP libraries), prefetch/prerender (`Sec-Purpose`, `Purpose`), DNT/GPC headers, `/admin`, and an admin with `users.exclude_from_analytics` on (default; the toggle is on the admin page).
  - Paths are stored as routes (`normalizePath` in shared: no query strings, ids → `/events/:id`, unknown → `/404`). The endpoint always answers 204 (invalid input, failures, and over `pageViewsPerIp` too).
  - Retention: the `analytics-rollup` housekeeping job (daily 4:37 AM; also in `cleanup:once`) rolls finished days into `analytics_daily` (kept forever), then deletes raw `page_views` older than 90 days and expired salts. Rollup comes first, so no day is lost.
  - Testing in a headless browser: set a normal desktop User-Agent, or the visit is filtered as a bot.
- **Publishing rule** (`listPublishedEvents`): an event shows when its status is active and its _active classification_ says `has_free_food`, with confidence ≥ `PUBLISH_CONFIDENCE` (0.7). A manual verdict skips the threshold. Machine free-food verdicts from 0.4 up to 0.7, and flagged events, make up `listReviewQueue`. The active classification is the newest manual row for the event, whatever content it was made against. Otherwise it is the newest row matching the event's current `content_hash`. `upsertEvent` computes that hash, so callers never set it.
- **Logging:** both apps log through pino (`createLogger` in the api, `createPinoLogger` in the worker, same options): readable in development, JSON lines otherwise, credentials redacted. Worker jobs take the console-shaped `Logger` from `scheduler.ts`; `toJobLogger` adapts pino to it, turning a leading `[ingest]`-style tag into a `component` field. Only the CLIs (`apps/worker/src/cli/`) print with `console`.
- Timestamps are `timestamptz` in the db, `Date` in server code, and ISO-8601 strings on the wire. The UI always displays `America/Detroit` time.
- Node packages use ESM with `.js` extensions on relative imports (NodeNext). Web uses extensionless imports (Bundler).
- Add dependency versions to the `catalog:` in `pnpm-workspace.yaml`, then reference them as `"catalog:"`.
- TypeScript is strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Don't use `any`, and don't silence errors without a comment explaining why.
