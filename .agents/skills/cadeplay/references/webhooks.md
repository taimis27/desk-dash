# Webhooks and stats

How to receive build and review results without polling, and how to read play
statistics.

## Contents

- [Events](#events)
- [Registering](#registering)
- [What a delivery looks like](#what-a-delivery-looks-like)
- [🛑 Verify the signature — without it, anyone can post](#-verify-the-signature--without-it-anyone-can-post)
- [Retries and auto-disable](#retries-and-auto-disable)
- [Writing the receiver](#writing-the-receiver)
- [Stats](#stats)

---

## Events

| Event | When |
|---|---|
| `build.succeeded` | A build passed its checks — you can promote it |
| `build.failed` | A build failed its checks |
| `build.promoted` | The active build changed to this one |
| `review.approved` | Review passed — the game is public |
| `review.rejected` | Review refused |
| `review.held` | Review held — more is needed from you |
| `game.suspended` | An operator suspended the game |
| `stats.daily` | Yesterday's numbers are **final** (once a day) |

🛑 **`stats.daily` only fires for final numbers.** Same-day provisional figures
refresh hourly but send no webhook — otherwise your aggregate would change 24
times a day.

⚠️ **`host.approved` and `host.rejected` are defined but never sent.** Custom
host labels are applied immediately with no approval step, so there is nothing
to notify about (see [pwa.md](pwa.md)). Do not build a flow that waits for them.

## Registering

```bash
curl -X POST https://cadeplay.com/v1/webhooks \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://my-server.example.com/hooks/cadeplay",
    "events": ["build.succeeded", "build.failed", "review.approved", "review.rejected"]
  }'
```

```jsonc
{
  "id": "wh_…",
  "url": "https://my-server.example.com/hooks/cadeplay",
  "events": […],
  "secret": "whsec_…",      // ← visible only now. Used for signature checks
  "active": true
}
```

🛑 **The `secret` is shown once, at creation.** Put it in an environment
variable immediately. If you lose it, the only recourse is to delete the webhook
and create another.

- **HTTPS only.** `http://` returns 422
- Scope required: `webhooks:manage`

```bash
curl https://cadeplay.com/v1/webhooks -H "Authorization: Bearer $CADEPLAY_TOKEN"            # list
curl -X DELETE https://cadeplay.com/v1/webhooks/$ID -H "Authorization: Bearer $CADEPLAY_TOKEN"  # remove
```

## What a delivery looks like

```http
POST /hooks/cadeplay HTTP/1.1
Content-Type: application/json
X-Cadeplay-Event: build.succeeded
X-Cadeplay-Delivery: 9f8e7d6c-…
X-Cadeplay-Timestamp: 1756400000
X-Cadeplay-Signature: 3a7f…

{
  "event": "build.succeeded",
  "created_at": "2026-08-29T12:00:00Z",
  "data": {
    "game_id": "a1b2c3d4e5f6",
    "build_id": "9f8e7d6c5b4a",
    "version": "1.4.2",
    "status": "succeeded"
  }
}
```

| Header | Meaning |
|---|---|
| `X-Cadeplay-Event` | Event name |
| `X-Cadeplay-Delivery` | Delivery id. **The same across retries** — use it to deduplicate |
| `X-Cadeplay-Timestamp` | The Unix time used in the signature |
| `X-Cadeplay-Signature` | HMAC-SHA256, below |

## 🛑 Verify the signature — without it, anyone can post

**Skip verification and anyone can send your server a fake "review approved"
notification.** The URL is not a secret; it ends up in logs, proxies, and error
reports eventually.

How the signature is computed:

```
signature = HMAC_SHA256(secret, timestamp + "." + raw_body)
```

`raw_body` is **the bytes as received, before parsing**. Parsing the JSON and
re-serialising it changes whitespace and key order, and the signature no longer
matches.

### PHP

```php
<?php
// Receiving a webhook — plain PHP, no framework
$secret    = getenv('CADEPLAY_WEBHOOK_SECRET');
$raw       = file_get_contents('php://input');          // ← untouched
$timestamp = $_SERVER['HTTP_X_CADEPLAY_TIMESTAMP'] ?? '';
$received  = $_SERVER['HTTP_X_CADEPLAY_SIGNATURE'] ?? '';

// ① replay protection — refuse anything older than five minutes
if (abs(time() - (int) $timestamp) > 300) {
    http_response_code(400);
    exit('stale');
}

// ② compare — hash_equals resists timing attacks
$expected = hash_hmac('sha256', $timestamp . '.' . $raw, $secret);

if (! hash_equals($expected, $received)) {
    http_response_code(401);
    exit('bad signature');
}

// ③ trustworthy from here on
$payload = json_decode($raw, true);

match ($payload['event']) {
    'build.succeeded'  => onBuildSucceeded($payload['data']),
    'review.approved'  => onReviewApproved($payload['data']),
    default            => null,       // unknown events: quietly 200
};

http_response_code(200);
```

### Node.js (Express)

```js
import express from 'express';
import crypto from 'node:crypto';

const app = express();
const SECRET = process.env.CADEPLAY_WEBHOOK_SECRET;

// 🛑 the raw body is required — do not use express.json() on this route
app.post('/hooks/cadeplay', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = req.get('X-Cadeplay-Timestamp') ?? '';
  const received  = req.get('X-Cadeplay-Signature') ?? '';
  const raw       = req.body;                          // Buffer

  // ① replay protection
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return res.status(400).send('stale');
  }

  // ② compare — timingSafeEqual throws on a length mismatch
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${timestamp}.${raw}`)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).send('bad signature');
  }

  // ③ trustworthy
  const payload = JSON.parse(raw.toString('utf8'));

  switch (payload.event) {
    case 'build.succeeded': onBuildSucceeded(payload.data); break;
    case 'review.approved': onReviewApproved(payload.data); break;
  }

  res.status(200).end();      // ← answer fast, do the work asynchronously
});
```

### Deduplicating

A retry delivers the same event again. `X-Cadeplay-Delivery` is stable across
retries, so use it as the key.

```js
if (await seen(deliveryId)) return res.status(200).end();
await markSeen(deliveryId, { ttl: 86400 * 7 });
```

## Retries and auto-disable

**Anything other than a 2xx is retried**, on a fixed schedule:

```
1 min → 5 min → 30 min → 2 hours → 6 hours     (five retries)
```

- There is a request timeout, so **answer fast and process asynchronously**.
  Doing heavy work before responding turns into timeouts and piles up retries
- **Repeated failures disable the webhook automatically.** Retrying a dead
  endpoint forever would fill the queue and delay everyone else's deliveries
- A disabled webhook shows `active: false` in `GET /v1/webhooks`. Fix the
  endpoint, then **switch it back on in place** — do not register a new one:

  ```bash
  curl -X PATCH "https://cadeplay.com/v1/webhooks/$WEBHOOK_ID" \
    -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
    -d '{"active": true}'
  ```

  🛑 **Registering again issues a new secret**, so every signature your receiver
  verifies against the old one starts failing — and that failure looks exactly
  like an attack. `PATCH` keeps the secret and resets the failure counter.

🛑 **Not noticing that a webhook has quietly switched off is the most common
accident here.** If your deploy pipeline depends on webhooks, check `active`
periodically or keep polling as a fallback.

## Writing the receiver

The typical shape of deploy automation:

```js
async function onBuildSucceeded({ game_id, build_id, version }) {
  // it passed the checks — release it
  await fetch(`https://cadeplay.com/v1/games/${game_id}/builds/${build_id}/promote`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CADEPLAY_TOKEN}`,
      'Idempotency-Key': `promote-${build_id}`,      // ← safe under retries
    },
  });

  await notifySlack(`✅ ${version} is live`);
}

async function onBuildFailed({ game_id, build_id, failure_reason }) {
  const logs = await fetchLogs(game_id, build_id);
  await notifySlack(`❌ build failed: ${failure_reason}\n\`\`\`${logs}\`\`\``);
}
```

Putting `build_id` in the `Idempotency-Key` means a duplicate delivery promotes
only once.

🛑 **This pattern stops working once the game is published.** From then on
`promote` returns `409 review_required` — updates deploy through review. Handle
that response instead of treating it as an error.

## Stats

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/stats?from=2026-08-01&to=2026-08-28&granularity=day" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

| Parameter | Required | Value |
|---|---|---|
| `from` / `to` | ✅ | `YYYY-MM-DD`, UTC, inclusive |
| `granularity` | | `day` (default) · `month` · `year` |
| `metrics` | | Comma-separated. All implemented ones when omitted |
| `group_by` | | `day` (default) · `country` · `locale` · `platform` |

Scope required: `stats:read`

```jsonc
{
  "data": [
    {
      "date": "2026-08-27",
      "group": null,
      "plays": 1420,
      "unique_players": 890,
      "installs": 37,
      "install_cta_clicks": 96,
      "install_prompt_shown": 71,
      "install_prompt_accepted": 44,
      "final": true
    }
  ],
  "meta": {
    "granularity": "day",
    "group_by": "day",
    "timezone": "UTC",
    "available_from": "2026-08-27"
  }
}
```

**Seven metrics work today**: `plays`, `unique_players`, `installs`,
`install_cta_clicks`, `install_prompt_shown`, `install_prompt_accepted`, and the
`final` flag. Everything else the OpenAPI schema lists — `revenue`,
`ad_impressions`, `gate_shown`, `gate_installed`, `gate_abandoned`,
`avg_session_seconds`, `gameplay_start_signals` — is marked `x-status: planned`
and comes back as `null`. Asking for one by name in `metrics` returns **422**.
Do not build dashboards that expect them.

### What the values mean, and their limits

| Metric | Caveat |
|---|---|
| `final` | `false` means **same-day provisional**. It refreshes hourly and settles overnight |
| `plays` | The number of times the game **document was served**, not rounds played. A refresh, a return visit, and a PWA relaunch each count as one; a request served from browser or CDN cache is not counted at all |
| `unique_players` | An **estimate**, and only for a single day — see below |
| `installs` | Reported by the client, so **not trustworthy**. Trends only, never settlement |
| `install_cta_clicks` | Arrivals with install intent, **not** clicks. These are excluded from `plays` as of 2026-08-30; before that date they inflated it |
| `install_prompt_shown` · `install_prompt_accepted` | Client beacons, **counts and not people**, and trivially forgeable |

🛑 **`unique_players` is an estimate, and you must not add it up across days.**
We count it without setting any cookie: `IP + User-Agent + that day's date` is
hashed and fed to a HyperLogLog (≈0.81% error). Two consequences follow.

1. People behind one shared IP — an office, a school, a mobile carrier's NAT —
   collapse into a single visitor, and one person on a phone and a laptop counts
   as two.
2. **The date is part of the hash**, so the same person is a different value
   tomorrow. Summing 30 days does not give you monthly uniques; it counts every
   returning player once per day they showed up.

That is why `granularity=month` and `granularity=year` return
`unique_players: null` rather than a sum. A number we cannot compute honestly is
not one we will invent. If you need a per-day series, ask for
`granularity=day`.

🛑 **`unique_players` is also `null` whenever you use `group_by`.** Per-country
and per-device rows count plays only. A `null` there means *"not measured"* — it
does not mean zero.

🛑 **`installs` is effectively Android and desktop only.** Safari never fires
`appinstalled`, and we have no substitute signal, so **iOS reads as 0** no matter
how many people actually add your game to their home screen. Do not compute a
conversion rate across mixed platforms, and do not read an iOS zero as a failure
to install.

### Install funnel

Four counters describe the path from the portal to an installed app. Each is a
separate event, and each drops some users the next one never sees:

| Step | Metric | Fires when |
|---|---|---|
| 1 | `install_cta_clicks` | Someone arrives at your game host with install intent — the `?install=1` document the portal's install button opens. Not the click itself: a click that never lands is not counted, and the URL can be typed by hand |
| 2 | `install_prompt_shown` | The install dialog actually renders on your game's own host |
| 3 | `install_prompt_accepted` | The browser's own prompt comes back `accepted` |
| 4 | `installs` | The browser fires `appinstalled` |

🛑 **All four are client-reported and therefore untrusted.** They are counts of
events, not counts of people — we do not track anonymous visitors, so the same
person clicking three times is three. Use them to see whether a change to your
icon or description moved the funnel, never as the basis for a payout, a reward,
or a ranking.

Steps 3 and 4 are **zero on iOS**, while steps 1 and 2 work everywhere. A funnel
that collapses between step 2 and step 3 usually means iOS traffic, not a broken
install.

### Collecting daily

```bash
#!/usr/bin/env bash
# collect-stats.sh — fetch and store only finalised numbers
set -euo pipefail
: "${CADEPLAY_TOKEN:?}" "${GAME_ID:?}"

FROM=$(date -u -d '30 days ago' +%F 2>/dev/null || date -u -v-30d +%F)
TO=$(date -u -d 'yesterday' +%F 2>/dev/null || date -u -v-1d +%F)

curl -sS "https://cadeplay.com/v1/games/$GAME_ID/stats?from=$FROM&to=$TO" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  | jq '[.data[] | select(.final == true)]' \
  > "stats-$TO.json"

echo "✅ saved finalised numbers for $FROM – $TO"
```

Filtering on `final == true` keeps provisional numbers out. Collect on the
`stats.daily` webhook instead and you do not need to poll at all.
