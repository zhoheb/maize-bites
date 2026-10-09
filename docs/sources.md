# Event sources: what we may use and how

Checked 2026-10-09. Recheck robots.txt and terms before building against any source; they change.

## Current status (2026-10-09)

- **Happening @ Michigan: off.** Its feed answers non-browser clients with a Cloudflare
  challenge (it loads in a browser; `curl` gets 403). `HAPPENING_ENABLED=false` locally until
  the owners allow our client. We do not work around it.
- **Maize Pages: on.** `/events.ics` is the live source (`MAIZEPAGES_ENABLED=true` locally).
- **Classifier: rules mode** locally (`CLASSIFIER_MODE=rules`), because there is no Anthropic
  key. Strict keyword rules decide what is published; see `CLAUDE.md`. Expect fewer events than
  the LLM would find, and the occasional wrong one.
- **No "Free Food" perk in the feeds.** Engage lets organizers tick a free-food perk, but
  neither `/events.ics` nor `/events.rss` carries it (checked both captured feeds: no perk
  field, and `CATEGORIES` holds themes like "Social" and "Athletics"). It is only served by
  `/api/discovery`, which robots.txt disallows, so we don't read it. If a feed ever lists it as
  a category, rules mode already treats a "Free Food" tag as a strong positive.

## Rules

1. Prefer an official feed or API (JSON, ICS, RSS) over HTML.
2. Obey robots.txt, including `Crawl-delay`.
3. If a source needs a login, UMich SSO, or membership, we don't collect from it.
4. If a site answers with a bot challenge or a block, we stop and ask the owner. We don't add
   headers, browsers, or proxies to get past it.
5. Identify ourselves in the User-Agent with a contact address, and fetch at most hourly.

## Summary

| Source                               | Verdict                         | How                                              |
| ------------------------------------ | ------------------------------- | ------------------------------------------------ |
| Happening @ Michigan                 | Use, **currently blocked**      | Official JSON feed; ask the owners for access    |
| Maize Pages public feeds             | Usable, pending one terms check | Official `/events.ics` (or `/events.rss`)        |
| Maize Pages `/api/discovery`         | No                              | robots.txt disallows `/api/`                     |
| Sessions @ Michigan                  | No direct collection            | Already arrives through Happening                |
| Department and unit sites            | Not worth it                    | They republish Happening; most are challenged    |
| Reddit (r/uofm)                      | No HTML; API only if ever       | OAuth Data API, non-commercial tier              |
| Instagram, Facebook, X               | No                              | Terms and robots.txt forbid automated collection |
| Handshake, MCommunity, Canvas        | No                              | Login or SSO                                     |
| GroupMe, Discord, Slack, email lists | No                              | Members only                                     |
| Eventbrite                           | No                              | Terms forbid scraping; no public search API      |
| User-submitted tips                  | Yes (our own data)              | Phase 7 `/api/submissions`, not built yet        |

## How confident each quote is

"Verbatim" means I fetched the file or page and copied the text. Where a page refused the
fetch, the entry says so and gives the source of the wording instead. Those need a human to
open the page in a browser before anyone relies on them.

---

## Happening @ Michigan (events.umich.edu)

- **Feed:** `https://events.umich.edu/list/json?v=2`, the one source the worker uses today.
  RSS, iCal, and CSV variants exist. The feeds page (`/feeds`) describes them as offered "for
  public consumption". That wording comes from a search-engine summary of the page; I could
  not load the page itself (see below).
- **robots.txt:** none. `GET /robots.txt` returned 404, so nothing is disallowed.
- **Login:** none. Public data.
- **Rate limits:** none published. We fetch hourly, 200 per page, 1s between pages.
- **Difficulty:** trivial when reachable (JSON). No coordinates; we match building names.
- **Status: blocked.** Since at least 2026-10-02 the feed answers non-browser clients with
  `HTTP 403` and `cf-mitigated: challenge` (a Cloudflare managed challenge). Evidence: the
  local `ingestion_runs` table has one complete run (2026-09-30, 1196 events) and one failed
  run (2026-10-02, HTTP 403); on 2026-10-09 I got the same answer for `/list/json`,
  `/day/json`, `/list/rss`, `/list/ical`, and `/feeds` with two honest User-Agents. I can't
  tell from here whether the challenge applies to everyone or to this network.
- **Verdict:** this is the right source and the right method. Do not work around the
  challenge. Ask the Happening team whether a contact-identified client can be allowed, or
  whether there is a supported route for campus projects. Until then ingestion fails cleanly
  and `/api/health` reports `degraded`.

## Maize Pages (maizepages.umich.edu, Anthology Engage)

- **Feeds:** `https://maizepages.umich.edu/events.ics` and `/events.rss`. Both returned 200
  with no login. They are the platform's standard "Data Sharing" feeds
  ([Anthology help](https://help.anthology.com/engage/en/options-for-sharing-engage-events-to-an-external-calendar.html)).
  - The RSS channel title reads "Public Events occurring between" today and seven days out:
    public events only, a 7-day window. 27 events on the day checked.
  - RSS declares `<ttl>300</ttl>` (minutes), so polling more than every 5 hours gains nothing.
  - ICS carries `GEO` coordinates on 17 of 27 events, plus `LOCATION`, `CATEGORIES`, and a
    plain-text description. RSS carries the host organization and an HTML description.
- **robots.txt (verbatim):**

  ```
  User-agent: *
  Disallow: /notfound
  Disallow: /forbidden
  Disallow: /error
  Disallow: /api/
  Disallow: /engage/
  ```

  `/events.ics` and `/events.rss` are not disallowed. `/api/discovery/event/search`, the JSON
  the site's own pages call, is. We don't use it.

- **Terms:** I found no terms page specific to Maize Pages. The vendor's general terms
  ([Blackboard/Anthology Terms of Use](https://www.blackboard.com/trust-center/terms-of-use),
  section 4.B, as returned by the page fetch) forbid using "any automated system, including
  without limitation "robots", "spiders", or "offline readers" to access a Product in a manner
  that sends more request messages to the Product than a human can reasonably produce in the
  same period of time." One request every few hours is well inside that. The terms don't say
  whether they cover institution-hosted Engage sites. Anthology's real API needs a key and
  the institution's approval, which we don't have.
- **Login:** none for public events. Members-only events don't appear in the feeds, which is
  what we want.
- **Overlap:** Happening imports some Maize Pages events. In the captured Happening sample, 12
  of 200 items carry `maizepages_import.maizepages_event_id`. Measured the other way on
  2026-10-09, 18 of the 27 events in the Maize Pages feed already had a Happening copy in our
  database, so most public Maize Pages events reach Happening.
- **Difficulty:** low. ICS parsing, no pagination.
- **Verdict:** in use, off by default (`MAIZEPAGES_ENABLED=true` turns it on). Still worth
  asking Student Life (Center for Campus Involvement, which runs Maize Pages) to confirm they're
  fine with a third-party reader of the public feed.

### How we read it

- `apps/worker/src/sources/maizepages/`. One GET of `/events.ics` per run, with
  `If-None-Match` / `If-Modified-Since` from the previous response; a 304 ends the run.
- At most every 5 hours (the RSS `<ttl>`), and never more than hourly whatever a feed says.
- `/events.rss` is read only when the ICS request fails for an ordinary reason (5xx, timeout,
  unreadable body). A bot challenge or a robots.txt refusal stops the run; the other feed is
  not tried.
- robots.txt is fetched once a day and checked before every request. If it can't be read, we
  don't fetch.
- The organizer email in the RSS `<author>` element is never read or stored.
- Coordinates from the feed are kept only inside Ann Arbor (the feed geocodes away games too).

### Duplicates with Happening

Both rows carry `events.maizepages_event_id`. Only one is ever active:

- While the Happening feed has listed its copy in the last 24 hours, that copy is the event.
  The Maize Pages item is skipped, and an existing Maize Pages row is marked `removed`.
- If Happening hasn't listed its copy for 24 hours (the feed is unreachable, or it dropped the
  event), the Maize Pages listing takes over and the stale Happening row is marked `removed`.
- Whichever row is hidden, its alert claims are copied to the survivor, so nobody is alerted
  twice. Admin overrides and reports on a hidden row are not carried over.

## Sessions @ Michigan (sessions.studentlife.umich.edu)

- No robots.txt (404). The site is built around signing in to register.
- Its events already reach us: "Sessions @ Michigan" is the largest single sponsor in the
  Happening sample (42 of 200).
- **Verdict:** nothing to collect directly.

## Department and unit sites

Checked: LSA, International Institute, Engineering, CSE, Rackham, UMMA, University Library,
Ross, Ford School, School of Information, Ginsberg Center, Center for Campus Involvement,
Student Life, University Unions.

- **robots.txt:** all permissive for event pages. Notable lines, verbatim:
  - cse.engin.umich.edu: `Crawl-delay: 10`
  - www.engin.umich.edu: `Content-Signal: ai-train=no, search=yes, ai-input=yes`
  - www.lib.umich.edu: `User-agent: *` / `Allow: /`
- **Reachability:** on 2026-10-09 the event pages for Engineering, Rackham, UMMA, Ross, Ford,
  SI, Ginsberg, CCI, Student Life, and University Unions all returned the same Cloudflare
  challenge as Happening (HTTP 403). Rackham's and UMMA's WordPress event APIs did too. Only
  the Library page loaded. I did not request CSE pages.
- **Value:** these units post to Happening, which is the university-wide calendar. The sample
  feed includes the Library, the International Institute, Stamps, SMTD, Math, and others as
  sponsors. I could not confirm unit by unit that nothing is missing, because the pages are
  challenged.
- **Verdict:** don't build per-site scrapers. Rule 4 applies, and the payoff is small.

## Reddit (r/uofm)

- **robots.txt (verbatim):**

  ```
  # Reddit believes in an open internet, but not the misuse of public content.
  User-agent: *
  Disallow: /
  ```

- **Terms:** the robots file points to Reddit's
  [Public Content Policy](https://support.reddithelp.com/hc/en-us/articles/26410290525844-Public-Content-Policy).
  The page refused my fetch (403), so no quote. Secondary sources describe the Data API free
  tier as OAuth-only, non-commercial, about 100 requests per minute.
- **Verdict:** never scrape HTML or the `.json` endpoints. The OAuth API would be permitted
  for a non-commercial app, but free-food posts there are rare and unstructured. Skip.

## Instagram and Facebook

- **robots.txt (verbatim, both):** `User-agent: *` / `Disallow: /`
- **Terms (verbatim, [Meta Terms of Service](https://www.facebook.com/legal/terms) 3.2):**
  "You may not access or collect data from our Products using automated means (without our
  prior permission) or attempt to access data you do not have permission to access,
  regardless of whether such automated access or collection is undertaken while logged-in to
  a Facebook account."
- **Verdict:** no. This is where a lot of student-org food posts live, and the answer is
  still no. User tips are the route for that content.

## X

- **robots.txt (verbatim):** `User-agent: *` / `Disallow: /`
- **Terms:** the terms page refused my fetch (402). As reported by
  [TechCrunch](https://techcrunch.com/2023/09/08/x-updates-its-terms-to-ban-crawling-and-scraping),
  the terms say "crawling or scraping the Services in any form, for any purpose without our
  prior written consent is expressly prohibited."
- **Verdict:** no. The API is paid.

## Handshake, MCommunity, Canvas, Wolverine Access

- All sit behind UMich SSO. Handshake's robots.txt ends with `Disallow: /` after a short
  allow-list of public pages, and its [terms](https://joinhandshake.com/tos) prohibit bulk
  collection by automated scripts (per a search summary; not quoted verbatim).
- **Verdict:** no, under rule 3.

## GroupMe, Discord, Slack, email lists

- Members-only spaces. Reading them with a bot means joining under false pretenses or using
  someone's account.
- **Verdict:** no. A member who sees free food can submit a tip.

## Eventbrite

- **robots.txt:** disallows `/api/v3/destination/events/`, `/events/rss/`, `/directory/`,
  and query-string variants (verbatim lines in the file fetched 2026-10-09).
- **Terms (verbatim, [Terms of Service](https://www.eventbrite.com/help/en-us/articles/251210/eventbrite-terms-of-service/) 13.1):**
  "You have no right to, and you agree not to, scrape, crawl, or employ any automated means to
  extract data from the Sites."
- **Verdict:** no.

## University policy

[SPG 601.07, Responsible Use of Information Resources](https://spg.umich.edu/policy/601.07)
applies to faculty, staff, students, affiliates, and alumni, so it covers a student running
this project. The page refused my fetch (403), so I have not quoted it. Read it yourself
before deploying, with attention to anything on automated or excessive use and on getting
around access controls.

## Open questions

1. Is the Cloudflare challenge on `events.umich.edu` universal, and will the Happening team
   allow a contact-identified client?
2. Will Student Life confirm that reading the public Maize Pages feed is fine?
3. Do any units publish events that never reach Happening? Needs a browser, not a bot.
