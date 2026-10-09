# Draft email to the Happening @ Michigan team

Not sent. Find the current contact address on events.umich.edu before sending.

---

**Subject:** Feed access for a student project (HTTP 403 since early October)

Hello,

I'm Zachary Hoheb, a U-M computer science student (zhoheb@umich.edu). I'm building Maize Bites,
a small non-commercial site that lists campus events offering free food, with a link back to
each Happening listing.

It reads your public JSON feed (`/list/json?v=2`). Since about October 2, every request gets
an HTTP 403 Cloudflare challenge, as do the iCal feeds and the `/feeds` page. I have not tried
to get around it and won't.

How the client behaves:

- One pass per hour covering the next 14 days, up to 200 events per page, 1 second between pages
- User-Agent `MaizeBites/0.1` with my contact address
- 10-second timeout, exponential backoff on 429 and 5xx, Retry-After honored
- Results are stored, so visitors never trigger requests to you

Could you allow this client, issue an API key, or point me to the access method you prefer?
I'm glad to lower the frequency, fetch at set times, or change anything else. A sample
blocked request: cf-ray `a47abbbabb42e0b1-DTW`, 2026-10-09 04:45 UTC.

Thank you,
Zachary Hoheb
