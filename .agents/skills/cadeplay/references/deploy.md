# Shipping — the `/v1` public API

Everything it takes to get a game from your machine into players' browsers.
**Anything the web console can do, this API can do** — there are no private
UI-only endpoints.

- Base URL: `https://cadeplay.com/v1`
- Spec: `https://cadeplay.com/console/api/openapi.yaml` (OpenAPI 3.1)
- Auth: `Authorization: Bearer cdp_…`

## Contents

- [Tokens](#tokens)
- [Response conventions](#response-conventions)
- [① Create the game](#-create-the-game)
- [② Upload — the bytes skip our servers](#-upload--the-bytes-skip-our-servers)
- [③ Create a build and poll it](#-create-a-build-and-poll-it)
- [④ Promote and roll back](#-promote-and-roll-back)
- [Full deploy script (bash)](#full-deploy-script-bash)
- [Full deploy script (Node.js)](#full-deploy-script-nodejs)
- [GitHub Actions](#github-actions)
- [Idempotency](#idempotency)
- [Errors you will actually hit](#errors-you-will-actually-hit)

---

## Tokens

**The first token can only be created on the web** —
`https://cadeplay.com/console/tokens`. `/v1/tokens` needs a token to call, so it
cannot bootstrap itself. That is the only time you need the console.

A token's value is shown **once**, at creation. Store it then.

### Scopes — take only what you need

| Scope | What it allows |
|---|---|
| `account:read` / `account:write` | Read and change account settings, manage tokens |
| `games:read` | Read games, builds, listings, achievements, stats |
| `games:write` | Create/edit/**delete** games, listings, media, achievements, **host label**, submit for review |
| `builds:write` | Create builds, promote, roll back |
| `uploads:write` | Create and complete upload sessions |
| `stats:read` | Read stats |
| `webhooks:manage` | Register and remove webhooks |

🛑 **A CI token needs `uploads:write`, `builds:write`, and `games:read`.**
The first two do the work; **`games:read` is what lets it poll the build and
read the logs** (`GET …/builds/{id}` and `…/logs` both require it). Leave it out
and the upload succeeds, then the polling loop gets 403 and the job reports a
failure that has nothing to do with the build.
`games:write` includes **deleting the game** and **requesting the host label**,
and the host label locks permanently at first publication. A CI job that touches
either by accident cannot be undone.

🛑 **A token can only issue tokens within its own scopes.** That stops a leaked
token from widening its own reach.

```bash
# issue a new token (needs account:write)
curl -X POST https://cadeplay.com/v1/tokens \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ci-deploy",
    "scopes": ["uploads:write", "builds:write"],
    "expires_in_days": 90
  }'
# → { "id": "…", "name": "ci-deploy", "value": "cdp_…", "expires_at": "…" }
#                                       ^^^^^ visible only in this response
```

Omitting `expires_in_days` means it never expires. **Set it.**

### Where the token lives — `.env`

```bash
bash scripts/init.sh          # .env slot + .gitignore + .env.example
```

`/cadeplay:init` does the same if you installed the plugin. Then paste the
issued value after `CADEPLAY_TOKEN=` in `.env` and read it from the file.

```bash
set -a; . ./.env; set +a
curl -H "Authorization: Bearer $CADEPLAY_TOKEN" https://cadeplay.com/v1/games
```

🛑 **Do not type `export CADEPLAY_TOKEN="cdp_…"` on a command line.** It lands in
your shell history in plain text, and that file gets backed up and synced.

🛑 **Adding `.env` to `.gitignore` does nothing if it is already tracked.**
Ignore rules only apply to untracked files. Check with
`git ls-files --error-unmatch .env` and run `git rm --cached .env` if it is.
`init.sh` checks this and exits with **code 1** when it finds it.

🛑 Keep tokens out of code, logs, and commit messages. The `cdp_` prefix is what
GitHub's secret scanner looks for — it does not make a leak harmless. Mask when
printing: `${CADEPLAY_TOKEN:0:8}…`

**In CI use that system's secret store, not `.env`** — for GitHub Actions,
`secrets.CADEPLAY_TOKEN`. `.env` is for your own machine.

## Response conventions

**Only collections are wrapped in `data`. A single resource is not.**

```jsonc
// GET /v1/games        → collection
{ "data": [ {…}, {…} ], "next_cursor": "…" }

// GET /v1/games/{id}   → single
{ "id": "…", "slug": "…", "status": "draft", … }
```

**Errors are RFC 9457 Problem Details** (`application/problem+json`):

```jsonc
{
  "type":   "https://cadeplay.com/problems/validation-failed",
  "title":  "We could not process that request",
  "status": 422,
  "detail": "size_bytes exceeds the limit",
  "errors": { "size_bytes": ["must be at most 99,000,000 bytes"] }
}
```

Pick a human-readable message in this order: `title` → `message` → `detail` →
the first value in `errors`.

```js
async function readError(response) {
  let body = null;
  try { body = await response.json(); } catch { return `HTTP ${response.status}`; }

  const message = body?.title ?? body?.message ?? body?.detail;
  if (typeof message === 'string' && message !== '') return message;

  const first = Object.values(body?.errors ?? {})[0];
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];

  return `HTTP ${response.status}`;
}
```

## ① Create the game

```bash
curl -X POST https://cadeplay.com/v1/games \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "slug": "space-runner",
    "default_locale": "en",
    "orientation": "landscape",
    "controls": ["touch", "keyboard"],
    "age_rating": "all"
  }'
```

| Field | Required | Value |
|---|---|---|
| `slug` | ✅ | `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–60 chars. Becomes the portal URL (`/g/{slug}`) |
| `default_locale` | ✅ | Fallback language when a translation is missing |
| `orientation` | | `any` (default) · `portrait` · `landscape` |
| `controls` | | `touch` · `keyboard` · `mouse` · `gamepad` |
| `age_rating` | | `all` (default) · `12+` · `15+` · `18+`. Not a review requirement, but a mismatch with the content is grounds for rejection |

The response carries the **immutable identifier**:

```jsonc
{
  "id": "a1b2c3d4e5f6",                  // ← never changes
  "slug": "space-runner",
  "status": "draft",
  "host": {
    "label": "a1b2c3d4e5f6",
    "hostname": "a1b2c3d4e5f6.cadeplay.com",
    "locked": false,                     // ← locks at first publication
    "locked_at": null
  },
  "active_build_id": null,
  …
}
```

🛑 **The host is an object, not a `pwa_host` string.** Read
`host.hostname` for the address and `host.locked` to know whether the label can
still be changed.

`slug` can be changed later; `id` cannot. **Reference games by `id` in
scripts** — the moment someone renames the slug, every slug-based script breaks.

### Game states

```
draft → in_review → published → unlisted / suspended → deleting
              ↘ rejected (fix and resubmit)
```

| State | In the catalog? | Playable at `play_url`? |
|---|---|---|
| `draft` | No | **Yes** — share the link with anyone |
| `in_review` | No | **Yes** |
| `published` | Yes | Yes |
| `rejected` | No | **Yes** — fix and resubmit meanwhile |
| `unlisted` | No | Yes — by link only, on purpose |
| `suspended` | No | No — an operator took it down |
| `deleting` | No | No — permanent after 30 days |

🛑 **Being playable and being listed are different things.** Every state above
with a deployed build has a working address; only `published` puts the game in
the home page, the catalog, search, and the sitemap. Pages that are not listed
carry `noindex, nofollow`, so the link reaches only the people you send it to.

The game object says both, separately — `play_url` (the address, or `null`) and
`listed` (a boolean). A **rejection does not close the link**; suspension does
→ [sharing before you publish](store.md#sharing-before-you-publish)

## ② Upload — the bytes skip our servers

Three steps. **The file itself goes straight to storage and never passes through
our application servers** — otherwise a single 99 MB upload would occupy a
worker for its whole duration.

```
POST /v1/uploads                 → returns a presigned URL
PUT  {presigned}                 → bytes go straight to storage
POST /v1/uploads/{id}/complete   → the server checks the stored object
```

### 2-1. Create the session

```bash
SIZE=$(wc -c < game.zip)

curl -X POST https://cadeplay.com/v1/uploads \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"purpose\": \"build\",
    \"filename\": \"game.zip\",
    \"size_bytes\": $SIZE,
    \"content_type\": \"application/zip\"
  }"
```

```jsonc
{
  "id": "6f1c…",
  "status": "pending",
  "purpose": "build",
  "upload_url": "https://s3.cadeplay.com/…?X-Amz-Signature=…",
  "upload_headers": { "Content-Type": "application/zip" },
  "expires_at": "2026-08-29T12:15:00Z"        // 15 minutes
}
```

| Field | Required | Notes |
|---|---|---|
| `purpose` | ✅ | `build` for game archives · `image` for pictures · `video` for the card clip (`media` is a legacy alias for `image`) → [store.md](store.md#card-video--one-slot-optional) |
| `filename` | ✅ | 255 chars or fewer |
| `size_bytes` | ✅ | **The exact byte count.** Compared against the stored object |
| `sha256` | | Recorded on the session. ⚠️ **Not currently compared** — see below |
| `content_type` | | `application/zip` |

⚠️ **`sha256` is stored but not verified today.** The completion check compares
the **size** of the stored object and records its ETag; the declared digest is
kept for future use. Send it if you like, but do not treat a successful
`complete` as proof of content integrity.

Constraints:
- A presigned URL expires in **15 minutes**. After that, create a new session
- **Five** incomplete sessions at a time
- Size caps are **per `purpose`**, checked when the session is created (**413**):

  | `purpose` | Cap |
  |---|---|
  | `build` | 99,000,000 bytes |
  | `image` | 2,000,000 — and **1,000,000** for `screenshot` / `screenshot_listing` |
  | `video` | 8,000,000 (`trailer_listing`) |

### 2-2. PUT it as-is

```bash
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/zip" \
  --data-binary @game.zip
```

🛑 **Send exactly the headers in `upload_headers`.** A missing header, a
different value, or an *extra* header all break the signature and return 403.

🛑 **Use `--data-binary`.** Plain `-d` mangles newlines and corrupts the file.

From a browser it is `fetch(url, {method:'PUT', body: file, headers})`. The
CORS preflight is handled server-side, so there is nothing to configure.

### 2-3. Completion — the only checkpoint

```bash
curl -X POST "https://cadeplay.com/v1/uploads/$UPLOAD_ID/complete" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

```jsonc
{ "id": "6f1c…", "status": "verified", "verified_size_bytes": 4823910 }
```

The server asks storage for the real object and compares its size against what
you declared. A mismatch marks the session `rejected` and deletes the object.

**A build cannot be created from a session that is not `verified`.**

| status | Meaning |
|---|---|
| `pending` | Not PUT yet, or completion not called |
| `verified` | Passed — usable as a build or media |
| `rejected` | Size mismatch |
| `expired` | Past 15 minutes |

## ③ Create a build and poll it

```bash
curl -X POST "https://cadeplay.com/v1/games/$GAME_ID/builds" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{
    \"upload_id\": \"$UPLOAD_ID\",
    \"version\": \"1.4.2\"
  }"
```

| Field | Required | Notes |
|---|---|---|
| `upload_id` | ✅ | Must be **`verified`** |
| `version` | | Display string, 40 chars or fewer |
| `entrypoint` | | Detected automatically when omitted |

🛑 **There is no `auto_promote`.** It appears in the OpenAPI schema marked
`x-status: planned`, and the endpoint does not accept it — sending it changes
nothing. Call `promote` explicitly.

The response is `202` with a `queued` build. **Processing is asynchronous.**

### Polling

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/builds/$BUILD_ID" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

```
queued → processing → succeeded → promoted → superseded
                    ↘ failed
```

| State | Meaning | What to do |
|---|---|---|
| `queued` | Accepted, waiting for a worker | Wait |
| `processing` | Extracting and checking | Wait |
| `succeeded` | Passed | **Call `promote`** |
| `failed` | Rejected | Read `logs` for the reason |
| `promoted` | Currently serving | — |
| `superseded` | Replaced by another build | Can be a rollback target |

A successful build carries what the checker found:

```jsonc
{
  "id": "9f8e…", "version": "1.4.2", "status": "succeeded",
  "engine": "unity",              // detected (may be null)
  "size_bytes": 4823910,
  "extracted_bytes": 18234110,
  "file_count": 47,
  "entrypoint": "index.html"
}
```

### Reading failure logs

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/builds/$BUILD_ID/logs" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

[build.md](build.md) explains what to do about each cause.

## ④ Promote and roll back

**Uploading does not put anything in front of players.** `promote` moves the
active pointer. It is atomic, so nobody sees a half-deployed state.

```bash
curl -X POST "https://cadeplay.com/v1/games/$GAME_ID/builds/$BUILD_ID/promote" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)"
```

🛑 **Once a game has been published, you cannot promote a new build yourself.**
That call returns **409** — branch on the status code, not on a string, because
the body carries a translated message and **no stable error code**. Updates go
through review, and approval does the deploying — meanwhile players stay on the current version. This is the
most common 409 on this endpoint.

### Current release

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/release" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

### Rollback — move the pointer back

```bash
curl -X POST "https://cadeplay.com/v1/games/$GAME_ID/release/rollback" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"build_id": "previous-build-id"}'
```

**Rollback works on published games**, unlike promote. It returns you to a build
that was already reviewed and already served, so there is no new content to
review. Omit `build_id` to go back to the previous build.

It takes effect **immediately** — build assets carry the `build_id` in their
path so they never overwrite each other, which means no CDN purge is needed.

🛑 **A review that is `pending` blocks rollback too** (409). While a reviewer is
looking at a specific build, the served build must not change underneath them.
Wait for the decision.

🛑 **Players who installed the PWA do not roll back immediately.** Their service
worker is serving a cached version and picks up the change on a later launch →
[pwa.md](pwa.md)

## Full deploy script (bash)

```bash
#!/usr/bin/env bash
# deploy.sh — one archive, uploaded and released
set -euo pipefail

: "${CADEPLAY_TOKEN:?CADEPLAY_TOKEN is required}"
: "${GAME_ID:?GAME_ID is required}"
ZIP="${1:?usage: deploy.sh game.zip [version]}"
VERSION="${2:-$(date +%Y%m%d-%H%M%S)}"
API="https://cadeplay.com/v1"
AUTH="Authorization: Bearer $CADEPLAY_TOKEN"

# 🛑 `--fail-with-body` — without it curl exits 0 on a 4xx and the script
#    happily continues with an error body as if it were data.
api() { curl -sS --fail-with-body -H "$AUTH" -H "Content-Type: application/json" "$@"; }
fail() { echo "❌ $*" >&2; exit 1; }

# ── ① upload session ──────────────────────────────────────
SIZE=$(wc -c < "$ZIP")
echo "▸ creating upload session ($SIZE bytes)"

SESSION=$(api -X POST "$API/uploads" -d "{
  \"purpose\":\"build\", \"filename\":\"$(basename "$ZIP")\",
  \"size_bytes\":$SIZE, \"content_type\":\"application/zip\"
}")

UPLOAD_ID=$(echo "$SESSION" | jq -r '.id // empty')
UPLOAD_URL=$(echo "$SESSION" | jq -r '.upload_url // empty')
[ -n "$UPLOAD_ID" ] || fail "session failed: $(echo "$SESSION" | jq -r '.title // .')"

# ── ② PUT — straight to storage ───────────────────────────
echo "▸ uploading…"
curl -sS -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/zip" \
  --data-binary @"$ZIP" >/dev/null || fail "PUT failed"

# ── ③ completion check ────────────────────────────────────
VERIFIED=$(api -X POST "$API/uploads/$UPLOAD_ID/complete" | jq -r '.status')
[ "$VERIFIED" = "verified" ] || fail "verification failed: $VERIFIED"

# ── ④ build ───────────────────────────────────────────────
echo "▸ creating build ($VERSION)"
BUILD=$(api -X POST "$API/games/$GAME_ID/builds" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"upload_id\":\"$UPLOAD_ID\",\"version\":\"$VERSION\"}")

BUILD_ID=$(echo "$BUILD" | jq -r '.id // empty')
[ -n "$BUILD_ID" ] || fail "build failed: $(echo "$BUILD" | jq -r '.title // .')"

# ── ⑤ poll ────────────────────────────────────────────────
echo "▸ waiting for the check"
for _ in $(seq 1 120); do
  STATUS=$(api "$API/games/$GAME_ID/builds/$BUILD_ID" | jq -r '.status')
  case "$STATUS" in
    succeeded) break ;;
    failed)
      echo "❌ build failed:"
      api "$API/games/$GAME_ID/builds/$BUILD_ID/logs" | jq -r '.reason // .detail // .'
      exit 1 ;;
  esac
  sleep 2
done
[ "$STATUS" = "succeeded" ] || fail "timed out (last state: $STATUS)"

# ── ⑥ promote ─────────────────────────────────────────────
# 🛑 A published game returns 409 here — updates are deployed by review.
echo "▸ promoting"
# 🛑 The response has NO `status` field. It is
#    { game_id, active_build_id, previous_build_id, promoted_at, play_url }
#    so success is "active_build_id is now my build".
BODY=$(mktemp)
CODE=$(curl -sS -o "$BODY" -w '%{http_code}' -X POST \
  "$API/games/$GAME_ID/builds/$BUILD_ID/promote" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)")

case "$CODE" in
  200|201)
    ACTIVE=$(jq -r '.active_build_id // empty' < "$BODY")
    [ "$ACTIVE" = "$BUILD_ID" ] || fail "promote returned $CODE but active is '$ACTIVE'"
    echo "✅ live — $VERSION  ($(jq -r '.play_url' < "$BODY"))" ;;
  409)
    # Published games deploy through review — this is expected, not a failure.
    echo "ℹ️  not promoted: $(jq -r '.title // .detail // .' < "$BODY")"
    echo "    Submit an update for review instead — see store.md." ;;
  *)
    cat "$BODY"; fail "promote failed with HTTP $CODE" ;;
esac
rm -f "$BODY"
```

## Full deploy script (Node.js)

```js
#!/usr/bin/env node
// deploy.mjs — no dependencies, Node 18+
//
// 🛑 This file is not part of the skill package. Copy it into your own
//    repository (scripts/deploy.mjs) — the workflow below expects it there.
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const API = 'https://cadeplay.com/v1';
const TOKEN = process.env.CADEPLAY_TOKEN;
const GAME_ID = process.env.GAME_ID;
const [, , zipPath, version = new Date().toISOString()] = process.argv;

if (!TOKEN || !GAME_ID || !zipPath) {
  console.error('usage: CADEPLAY_TOKEN=… GAME_ID=… deploy.mjs game.zip [version]');
  process.exit(1);
}

const auth = { Authorization: `Bearer ${TOKEN}` };

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { ...auth, 'Content-Type': 'application/json', ...options.headers },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.title ?? body?.detail ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

const bytes = await readFile(zipPath);
const { size } = await stat(zipPath);

console.log(`▸ upload session (${size} bytes)`);
const session = await api('/uploads', {
  method: 'POST',
  body: JSON.stringify({
    purpose: 'build',
    filename: zipPath.split('/').pop(),
    size_bytes: size,
    content_type: 'application/zip',
  }),
});

console.log('▸ uploading…');
const put = await fetch(session.upload_url, {
  method: 'PUT',
  body: bytes,
  headers: session.upload_headers ?? {},
});
if (!put.ok) throw new Error(`PUT failed: ${put.status}`);

const verified = await api(`/uploads/${session.id}/complete`, { method: 'POST' });
if (verified.status !== 'verified') throw new Error(`verification: ${verified.status}`);

console.log(`▸ build (${version})`);
const build = await api(`/games/${GAME_ID}/builds`, {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ upload_id: session.id, version }),
});

console.log('▸ waiting for the check');
let status = build.status;
for (let i = 0; i < 120 && status !== 'succeeded'; i++) {
  await new Promise(r => setTimeout(r, 2000));
  ({ status } = await api(`/games/${GAME_ID}/builds/${build.id}`));

  if (status === 'failed') {
    const logs = await api(`/games/${GAME_ID}/builds/${build.id}/logs`);
    throw new Error(`build failed: ${logs.reason ?? 'unknown'}`);
  }
}
if (status !== 'succeeded') throw new Error(`timed out (${status})`);

// 🛑 409 here means the game is published — updates deploy through review.
try {
  await api(`/games/${GAME_ID}/builds/${build.id}/promote`, {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
  });
  console.log(`✅ live — ${version}`);
} catch (error) {
  console.log(`ℹ️  not promoted: ${error.message}`);
  console.log('    A published game deploys through review — submit an update.');
}
```

## GitHub Actions

```yaml
name: Deploy to Cadeplay

on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build the game
        run: npm ci && npm run build

      - name: Package
        run: cd dist && zip -qr ../game.zip .

      - name: Deploy
        env:
          # 🛑 uploads:write + builds:write only — never games:write in CI
          CADEPLAY_TOKEN: ${{ secrets.CADEPLAY_TOKEN }}
          GAME_ID: ${{ vars.CADEPLAY_GAME_ID }}
        # 🛑 `deploy.mjs` is NOT shipped with this skill — it is the example
        #    above. Save it into your own repository at this path first.
        run: node scripts/deploy.mjs game.zip "${GITHUB_REF_NAME}"
```

## Idempotency

🚧 **`Idempotency-Key` is accepted but not yet acted on.** The header is part of
the published contract and nothing rejects it, but **no replay of a previous
result happens today** — a retried request does the work again.

So until it is implemented, **make retries safe yourself:**

| Call | How to retry safely |
|---|---|
| `POST /uploads` | A duplicate session is harmless — it expires unused |
| `POST /builds` | **Check first** — `GET …/builds` and look for one already made from that `upload_id` |
| `promote` · `rollback` | Naturally idempotent: they set a pointer. Re-running lands on the same state |
| `POST …/review` | **Check first** — `GET …/review`; submitting twice while `pending` is refused anyway |

Keep sending the header if you like — it costs nothing and your code will not
need changing when replay lands. Just do not build a retry loop that **assumes**
it.

## Errors you will actually hit

| Status | Where | Cause | Fix |
|---|---|---|---|
| `401` | anywhere | Missing or invalid token | Check `Authorization` |
| `403` | anywhere | Token lacks the scope | Issue one with the right scopes |
| `403` | PUT to storage | Signature mismatch | Send `upload_headers` exactly — no more, no fewer |
| `409` | promote | **The game is published** | Submit an update for review instead |
| `409` | promote · rollback | A review is `pending` | Wait for the decision |
| `409` | build create | Upload session is not `verified` | Call `complete` first |
| `409` | rollback | No rollback target | Check `superseded` builds |
| `413` | upload session | Declared size over the limit | See the limits above — **413, not 422** |
| `422` | upload complete | Actual size does not match what you declared | Re-create the session with the real size |
| `422` | review submit | Requirements missing | Read `missing_requirements` → [store.md](store.md) |
| `429` | anywhere | Rate limited | Back off; read `Retry-After` |

🛑 **A pending review does not lock the listing, media, or the survey.** Those
stay writable at every stage — only deploying a build waits for the decision.
What you change is recorded, and approval compares it against what the reviewer
saw → [store.md](store.md#you-can-edit-at-every-stage-including-during-review)

For build failures (`failed` status rather than an HTTP error), read the logs
and see [build.md](build.md).
