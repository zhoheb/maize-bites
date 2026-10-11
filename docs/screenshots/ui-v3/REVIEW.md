# UI v3 screenshot review

Graded by looking at every screenshot in this folder against the brief's checklist. Two rounds
were captured and graded; the files here are from round 2. An unrecorded first pass before
round 1 led to the compact NowCard and to likely-over events becoming rows.

Captured with `pnpm --filter @maize-bites/web screenshots` against the dev server started with
`VITE_SHOW_DEMO=true`, after `pnpm db:seed:demo`, at about 10:15 PM campus time. At that hour
three demo events are live at once (plus one likely over), which is more than real data usually
has, and it matters for the density check below.

Files: `{week,now}-{desktop,laptop,mobile}-{light,dark}.png`, `today-desktop-*`,
`drawer-{desktop,mobile}-*`, `popover-{desktop,laptop}-*`, `sheet-half-mobile-*`,
`filters-desktop-*`, `about-desktop-*`. Desktop is 1440×900, laptop 1280×800, mobile 390×844.
The mobile `week` and `now` shots show the sheet at peek.

## Final grades (round 2)

| #   | Check                                                                    | Grade   | Notes                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Surfaces have visible depth in both themes; the map is a separate plane  | Partial | Light: pass. Paper page, white header, white cards with a soft shadow, and the list casts a shadow onto the map. Dark: cards, panels and the toolbar step up clearly, but the map's land (`#0F151C`, as specified) is close to the page (`#0C1117`), so the map is separated mostly by the list's edge shadow and its own road pattern. |
| 2   | Maize only for now/soon, selection and pins                              | Pass    | Maize appears on pins and clusters, the selected card's ring and row wash, the nav underline and the logo. Controls are ink. Status uses green and amber, not maize (see decision 2 in progress.md). A test fails if any other component names maize.                                                                                   |
| 3   | At least 7 events visible above the fold at 1440×900                     | Fail    | `week-desktop-*` shows 5 events fully and a 6th cut off. Three live NowCards take about 130px each; rows are 68px, so ten rows fit, and the count reaches 7 only when at most one event is live. `today-desktop-*` shows all 5 of its events.                                                                                           |
| 4   | The NowCard is clearly the most prominent element when events are live   | Pass    | Accent bar, live dot, countdown, progress bar and shadow; rows beneath are flat and quiet. The likely-over event is a grey row, not a card.                                                                                                                                                                                             |
| 5   | No duplicated times, no duplicate Open-to-all, no default "Lunch"        | Pass    | Each card has one `<time>` (tested). "Open to all" is the switch only; `filters-desktop-*` shows chips for the three dropdown choices and none for the switch. A meal shows only when extracted.                                                                                                                                        |
| 6   | The hero matches the selected range; the freshness dot matches the age   | Pass    | "3 spots with free food right now", "5 spots today", "72 spots this week" on their tabs. "Updated 17 min ago" has an amber dot; green is under 15 minutes.                                                                                                                                                                              |
| 7   | Pins are instantly findable; the selected pin and row are clearly linked | Pass    | Live pins are 30px maize with a pulse; clusters are maize-outlined counts. `popover-*` shows the selected pin enlarged with a ring under its peek card. Later pins (22px outline) are small at city zoom by design.                                                                                                                     |
| 8   | No clipped sticky headers, no overflow, no orphaned words in titles      | Partial | Headers are solid and nothing shows through them. No overflow. One-line row titles truncate with an ellipsis by design ("[demo] Cookies after the …"), and on rows with a badge the place is cut short ("Michigan Unio…"). NowCard titles wrap balanced.                                                                                |
| 9   | Text contrast AA; focus rings visible                                    | Pass    | Every text/background token pair is checked in `lib/tokens.test.ts` (96 cases, both themes); Lighthouse accessibility is 100. Focus rings are a 2px ink (light) or maize (dark) outline on everything; no screenshot shows one, since nothing is focused in them.                                                                       |
| 10  | It looks like a product someone would pay a designer for                 | Partial | The list, cards, filter row, peek card and drawer hold together and read as designed, in both themes. What a designer would still fix: the dark map sits too close to the page; the phone header's three bordered round buttons are heavy; row text truncates early beside a badge.                                                     |

## Round 1 → round 2

Round 1 findings, all fixed before round 2:

- Row titles were squeezed to about 16 characters by a badge at the right edge. The badge now
  sits on the title line and the food/place line gets the full width.
- NowCard's place was cut short by its badge. The badge moved up beside the status pill.
- The list and map met at a hairline only. The list column now casts a shadow onto the map.
- Rows were 80px with dietary labels on a third line. They are 68px on two lines, with at most
  two labels shown and "+N" for the rest.

Found and fixed before round 1:

- NowCards were about 190px, so 3.3 fit on screen. Merging the time and place onto one line
  and the dietary labels onto the food line brought them to about 130px.
- A likely-over event was drawn as a full NowCard. It is now a quiet row.
- The peek card stayed open under the detail drawer. It is hidden while the drawer is open.
- Opening the drawer put a focus ring on "Share". Focus now lands on the panel itself.
- The time rail wrapped "10:58" and "PM" onto separate lines.
- On phones the search field pushed the first card out of the sheet's peek. Search is behind
  an icon in the sheet header until wanted.
- Tapping the sheet's handle did nothing in a real browser (pointer capture swallowed the
  click); the tests had passed because jsdom has no pointer capture.
- The dark sheet was the same colour as the map behind it. It now uses the panel surface.

A third round was not run: what remains under checks 1, 3, 8 and 10 needs a design decision
(see "Decisions to review" in `docs/progress.md`), not another pass of fixes.

## Measured

Lighthouse 12, mobile, production build (`pnpm build` then `vite preview`), demo events hidden:

| View             | Performance | Accessibility | LCP   | TBT    | CLS   |
| ---------------- | ----------- | ------------- | ----- | ------ | ----- |
| `/` (three runs) | 78, 93, 92  | 100           | 3.0 s | 30 ms  | 0.002 |
| `/?view=list`    | 93          | 100           | 2.9 s | 0 ms   | 0.046 |
| `/?tab=week`     | 86          | 100           | 3.5 s | 180 ms | 0.002 |
| `/about`         | 93          | 100           | 2.9 s | 0 ms   | 0.002 |

The first run of `/` (78, LCP 4.5 s) was the first request after the build; the next two agree
with each other. The This Week tab is below the 90 target.

axe (vitest-axe) passes on the home page, the detail drawer, the filter row with a menu open,
NowCard and AgendaRow.
