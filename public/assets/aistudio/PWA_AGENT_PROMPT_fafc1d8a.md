# Prompt for the phone app (PWA) agent

Paste everything below the line into the session that builds the ParkLabs phone PWA.

---

The ParkLabs dashboard on the developer PC is the core of the system, and its PWA sync is now
built and tested. It sends exactly the payload you specified. Please adapt the PWA's ingest and
read side to the rules below. Most of them exist so the public app never goes blank or shows
wrong numbers when the PC is off. When you're done, reply with the items in **Report back**.

## 1. What the PC sends (unchanged from your spec)

`POST <PWA_SYNC_URL>`, with these headers:
- `Content-Type: application/json`
- `Authorization: Bearer <PWA_INGEST_KEY>`
- a fixed `Content-Length`

The body is about 2.2 KB:
```json
{
  "lotName": "Main Parking Area",
  "capacity": 120,
  "entered": 58,
  "left": 16,
  "occupied": 42,
  "mode": "edge",
  "source": "pc",
  "timestamp": "2026-11-24T23:43:55.000Z",
  "events": [ { "id": "1795563833881-in", "direction": "in", "timestamp": "2026-11-24T23:43:53.881Z" } ]
}
```
- **When it's sent:** within about 3 s of any change to entered, left or occupied (never more often
  than once every 2 s), plus a keepalive every 60 s when nothing changes.
- **`timestamp`** is when the counter **read** these numbers, not when the push was sent. Use it
  for freshness.
- **`events`** holds up to 25 recent crossings, newest first.
  - Each `id` is `<event time in ms>-<in|out>`, taken from the counter's own clock. It stays the
    same on every push.
  - **Deduplicate on `id`.** The same events are re-sent on every push.
- **`mode`** is `"edge"` today; `"server"` comes later. Display only; it doesn't change your logic.
- **`occupied`** is `initial + entered − left` from the counter, never below 0. It can be higher
  than `capacity` if the counter miscounts.
- **When the counter is unreachable,** the PC sends nothing rather than old numbers. Your
  freshness display then shows the gap.

## 2. Accept a second publisher: the Pi (`source: "pi"`)

The PC is a laptop. When it's off, asleep, rebooting or has the dashboard closed, the Pi counter
publishes to you instead, with the **same body** and the same key, but with `"source": "pi"`. The
phones are public and not on Tailscale, so pushing to you is the only fallback that reaches them.

Arbitrate on your side, because only you know what actually arrived:
- Always accept `source: "pc"`.
- Accept `source: "pi"` only if no `pc` push has been accepted in the last **90 s**. Otherwise answer
  `200 {"accepted": false, "reason": "pc active"}`. That isn't an error, so the Pi won't retry it.
- Store which source the current numbers came from, and show it on the app ("Live · from Pi"
  versus "Live").
- Both sources report the same counter, so the numbers agree: no merging needed.

## 3. Ingest rules

- **Auth:** compare the bearer token in constant time. Answer `401 {"error": "..."}` if it's wrong
  or missing.
- **Validation:**
  - Reject bodies over **16 KB** with 413.
  - Integers must be ≥ 0, `timestamp` must be ISO-8601, `events` must be an array of 25 at most,
    and `direction` must be `in` or `out`.
  - Otherwise answer `400 {"error": "<one sentence>"}`.
- **Unknown fields:** ignore them, don't reject. The PC will add an optional `since` (see the
  reset rule below) once you confirm you accept it, and new fields must not break ingest.
- **Out of order:** if `timestamp` is older than the stored one, keep the stored data and answer
  `200 {"accepted": false, "reason": "stale"}`. Retries can arrive late.
- **Resets:** when the operator sets a starting count, `entered` and `left` drop to 0 and
  `occupied` jumps to the new number.
  - If `entered` or `left` goes **down** with a newer `timestamp`, treat it as a reset: replace the
    totals and clear stored events.
  - Accept an optional `since` (ISO-8601, when the current count started), and treat a changed
    `since` as a definite reset.
- **Success:** answer `200 {"accepted": true}`. The PC and the Pi treat any 2xx as success and
  anything else as a failure, retried about 3 s later.
- **Abuse:** a per-key rate limit of about 1 request per second, with a short burst, is fine.
  Answer 429 beyond that.

## 4. Storage that fits the free tier

- **Don't keep the state in Workers KV.** The free tier allows about 1,000 writes a day, and the
  60 s keepalive alone is 1,440 a day before any car moves.
- **Use D1 or a Durable Object.** Write the latest snapshot row and new events (by `id`).
- A keepalive with no change should only update a `last_seen` timestamp, or nothing at all if your
  store can't do that cheaply.

## 5. What the phones read

- **One small JSON read endpoint** for the phones (you choose the path) returns:
  - `lotName`, `capacity`, `occupied`, `free` (= max(0, capacity − occupied)), `entered`, `left`;
  - `updatedAt`: the latest `timestamp`;
  - `source`;
  - the last 10 events.

  Never return the ingest key or anything else from the request headers.
- **Caching:** cache that response at the edge (`Cache-Control: public, s-maxage=5`), and have the
  PWA poll every **10–15 s**. Free-tier Functions allow about 100,000 requests a day, and 10 phones
  polling every 2 s would be about 430,000 a day.
- **Freshness on the phone:**
  - show "Updated X ago" from `updatedAt`;
  - after **150 s** (two missed keepalives), show the numbers as stale ("Count may be out of date")
    instead of hiding them;
  - if nothing has arrived for 15 minutes, show "Counter offline".
- **Display:** show free spaces as the headline (clamped at 0), and occupied out of capacity
  (clamped at 100% for any bar).
- **Plain text:** also serve `GET /api/text`, which returns `text/plain`, for example
  `42 of 120 spaces taken (78 free) · updated 12 s ago`. It's for Siri Shortcuts and widgets, and
  uses the same cache.

## 6. Hard rules

- **Never** store or display camera images, stream URLs, device addresses or Tailscale IPs. None
  are sent, and none should be added.
- The ingest key lives only in Cloudflare secrets. It never goes into the client bundle or the
  repository.

## Report back

1. The deployed `PWA_SYNC_URL` and the phone read URL.
2. Which store you used (D1 or a Durable Object) and the write pattern.
3. Confirmation that `source: "pi"` arbitration (90 s), ignoring unknown fields, the stale-timestamp
   rule and the reset rule are live.
4. Whether to start sending `since` now.
5. The exact responses for: accepted, ignored as stale, ignored because the PC is active, and each
   error.
