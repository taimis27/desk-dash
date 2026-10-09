# Troubleshooting — the failures that stay silent

**What costs the most time when shipping on Cadeplay is not the errors — it is
the absence of them.** Every HTTP call returns 200, the console is clean, tests
pass, and the thing simply does not work. This page maps those symptoms to
their causes.

## Contents

- [Quick symptom table](#quick-symptom-table)
- [The game does not appear](#the-game-does-not-appear)
- [The loading screen never clears](#the-loading-screen-never-clears)
- [No install button](#no-install-button)
- [Scores, saves, or achievements do not work](#scores-saves-or-achievements-do-not-work)
- [Uploads fail](#uploads-fail)
- [A build fails](#a-build-fails)
- [I deployed but players see the old version](#i-deployed-but-players-see-the-old-version)
- [How to narrow it down](#how-to-narrow-it-down)

---

## Quick symptom table

| Symptom | Most common cause | Where |
|---|---|---|
| Black screen only | `gameLoadingStart()` never called | [sdk.md](sdk.md) |
| Loading stays up a long time | `gameLoadingFinished()` never called | below |
| Game does not load at all | A root-absolute path resolving to the CDN | [build.md](build.md) |
| Unity wasm error | `.br` file missing `Content-Encoding` (rare — handled automatically) | below |
| No install button | No icon / inside the iframe / already installed | below |
| Scores never register | `gameplayStart()` never called | below |
| Achievement refused | Not registered beforehand | [scores.md](scores.md) |
| Saves do not work in the PWA | Standalone is not supported yet | [pwa.md](pwa.md) |
| `PUT` returns 403 | Presigned URL expired (15 min) / header mismatch | [deploy.md](deploy.md) |
| Build ends `failed` | Entry point, size, or extension | below |
| Deployed but the old version shows | `promote` never called, or the game is published | below |
| Webhooks stopped arriving | Auto-disabled after repeated failures | [webhooks.md](webhooks.md) |

---

## The game does not appear

### ① A root-absolute path resolves to the CDN

**The most common cause.** The server injects `<base href="{CDN}">`, so `/foo`
resolves against the CDN.

```js
❌  fetch('/config.json')                          // CDN → 404
❌  navigator.serviceWorker.register('/sw.js')     // CDN → cross-origin, fails
❌  <link rel="manifest" href="/manifest.json">    // CDN → 403

✅  fetch('./config.json')                                       // an asset — CDN is right
✅  fetch(window.__CADEPLAY__.origin + '/my-endpoint')           // to the game host
```

**How to check**: devtools → Network, look at the URL of the failing request. If
it went to `cdn.cadeplay.com` and returned 404 or 403, this is it.

### ② `<meta charset>` is too late, so the title is mangled

The server injects its configuration **immediately after `<meta charset>`**. If
the charset declaration is not within the first 1024 bytes of the document, the
browser guesses a different encoding — that is how non-ASCII titles break.

```html
✅  <head>
      <meta charset="utf-8">      <!-- first line -->
      <title>Space Runner</title>
```

### ③ The entry point was not found

A `failed` build with `entrypoint_not_found` means the zip structure is wrong.
Run `unzip -l game.zip | head` and **look at it** → [build.md](build.md)

### ④ Brotli headers (rare)

Without `Content-Encoding: br` on Unity/Godot `.wasm.br` and `.data.br` files,
the game does not start and the console shows only cryptic errors.

**The platform handles this automatically, so it is rarely the problem.** To
verify:

```bash
curl -sI "https://cdn.cadeplay.com/…/game.wasm.br" | grep -i 'content-'
# content-type: application/wasm
# content-encoding: br          ← this line must be there
```

If it is missing, check that the filename really ends in `.br`. Unity exporting
with `Decompression Fallback` on produces `.unityweb` instead, which the
detection skips — turn that option off to get standard `.br` files.

## The loading screen never clears

**There are three signals:**

| Signal | What the portal does |
|---|---|
| iframe `load` | Counts it **briefly** (3 seconds) |
| `gameLoadingStart()` | Cancels that grace period and waits for the next signal |
| `gameLoadingFinished()` | Clears immediately |

| Symptom | Cause |
|---|---|
| Loading clears after 3s and shows a **black screen** | `gameLoadingStart()` was not called. Unity and Godot are still fetching wasm at that point |
| Loading stays up **for a very long time** | `gameLoadingStart()` was called but `gameLoadingFinished()` was not |

There was a production case where **the loading overlay stayed for 18.9
seconds**. The game was already running underneath it, every HTTP call returned
200, the console had zero errors, and no test failed. **A screenshot is what
revealed it.**

```js
// just before engine initialisation
CadeplaySDK?.gameLoadingStart();

// the moment it is actually playable — after the first frame
CadeplaySDK?.gameLoadingFinished();
```

In Unity, call it inside `createUnityInstance(...).then(...)`; in Godot, inside
`engine.startGame().then(...)`.

## No install button

Work down this checklist.

| Check | How |
|---|---|
| ① Inside the portal iframe? | **It never appears there.** `beforeinstallprompt` only fires on top-level documents |
| ② Already installed? | The event does not fire for someone who has it |
| ③ On iOS? | Programmatic install is impossible; the SDK draws share-sheet guidance instead |
| ④ In-app browser? | Not possible in messaging apps — "open in browser" guidance appears |
| ⑤ Is there an icon? | below |

### 🛑 One icon silently blocks it

**Chrome never fires `beforeinstallprompt` without an icon of at least 192px.**
The failure is completely quiet — the manifest returns 200, the service worker
registers, the console shows nothing, and every request succeeds. **The install
button simply never appears.**

```bash
# read the manifest and look at the icons
curl -s "https://{id}.cadeplay.com/manifest.webmanifest" | jq .icons
```

- Games with no icon get a default one, so install is not blocked outright
- **Match `content_type` to the real format.** Declaring a PNG as `image/jpeg`
  can make the browser discard it, and you are back to "no install button"
- Icons must be **square, 512px or larger** → [store.md](store.md)

### The command to check

Chrome DevTools → Application → Manifest, look at "Installability". If something
blocks it, the reason is stated right there.

## Scores, saves, or achievements do not work

### `submitScore` returns `no_session`

**`gameplayStart()` was not called.** That call is what makes the server mint
the single-use play-session token.

```js
function startRound() {
  CadeplaySDK.gameplayStart();     // ← every run, not once
  …
}
```

### `unlockAchievement` returns `unknown_key`

**The achievement was never registered.** Unlike leaderboards, they are not
created on demand.

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/achievements" -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

Check the key is in that list. Typos (`bos_kill` versus `boss_kill`) are common
→ [scores.md](scores.md)

### The achievement returns `set_by_server`

An achievement registered with `set_by: "server"` cannot be unlocked by game JS.
And because **the server unlock path is not open yet**, nobody can unlock it at
all right now. Re-register it as `client` (`PUT` overwrites).

### Nothing persists when the game runs as an installed PWA

**You are in `standalone`.** Saves, scores, and achievements work only inside
the portal iframe (`mode: "embed"`) today, because the game origin has no
authentication yet.

🛑 **They do not all fail the same way, and this is the trap.** Only the
achievement calls give you a readable reason:

| Call | What you get in `standalone` |
|---|---|
| `saveData` · `loadData` · `submitScore` · `getLeaderboard` | **`null`** |
| `unlockAchievement` · `getAchievements` | `{ ok: false, error: 'unsupported_context' }` |

So a sync layer that branches on `r.error === 'unsupported_context'` **silently
drops every save** — the save call never produced an error string to match.
Branch on the context instead:

```js
if (window.__CADEPLAY__?.mode !== 'embed') {
  // accumulate locally, sync during the next portal session
}
```

→ the sync pattern in [pwa.md](pwa.md)

### The celebration popup fires every launch

`newlyUnlocked` is not being checked. Unlocking is idempotent so repeat calls
succeed, but from the second one it is `false`.

```js
if (r?.newlyUnlocked) showAchievementToast(r.name);   // ← this condition
```

### It celebrates a score that is not a record

`improved` is not being checked.

```js
if (r?.improved) showNewRecordEffect();
```

### Every call resolves to `null`

All SDK calls resolve to `null` after 15 seconds. If everything does:

- The game is embedded somewhere other than the portal (origin verification
  drops the messages)
- You are running locally without a mock

## Uploads fail

| Symptom | Cause | What to do |
|---|---|---|
| `PUT` returns 403 | Presigned URL expired (15 min) | Create a new session |
| `PUT` returns 403 | `upload_headers` missing or altered | Send them **exactly** — adding one also breaks it |
| `complete` returns `rejected` | Size mismatch | The upload was truncated, or `size_bytes` was wrong |
| Session creation returns **413** | Declared size over the cap | `build` 99,000,000 · `image` 2,000,000 (screenshots 1,000,000) · `video` 8,000,000 |
| `complete` returns 422 | The real size does not match what you declared | Re-create the session with the actual byte count |
| Session creation returns 429 | More than five incomplete sessions | Complete one or wait for expiry |
| CORS error in the browser | — | Handled by the platform; it does not happen on the normal path. Check you did not rewrite the presigned URL to another origin |

**Use `--data-binary`.** curl's `-d` mangles newlines and corrupts the file.

```bash
curl -X PUT "$UPLOAD_URL" -H "Content-Type: application/zip" --data-binary @game.zip
```

## A build fails

**Read the log first.** The cause is usually explicit.

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/builds/$BUILD_ID/logs" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

| `failure_reason` | Meaning | What to do |
|---|---|---|
| `entrypoint_not_found` | No `index.html` at the root or one level down | Zip from **inside** the build folder |
| `expanded_size_exceeded` | Over 400 MB extracted | Shrink assets |
| `too_many_files` | Over 10,000 | Combine into atlases and bundles |
| `denied_extension` | An executable extension | Remove `.sh`, `.py`, `.php`, etc. |
| `path_traversal` | `../` in an entry name | Change how you build the zip |
| `absolute_path` | An entry name starting with `/` | Zip from inside the folder, not by absolute path |
| `path_too_long` | An entry name over the length cap | Shorten the deepest paths |
| `symlink_rejected` | A symlink or hard link | Do not use `zip --symlinks` |
| `control_character_in_path` | Control characters or newlines in a name | Clean up the filenames |
| `null_byte_in_path` | A null byte in a name | Rebuild the zip with a normal tool |
| `empty_archive` | Nothing inside | Check what you actually zipped |
| `archive_unreadable` · `entry_unreadable` | The zip is damaged | Rebuild and upload again |

There is a pre-upload check script in [build.md](build.md).

## I deployed but players see the old version

### ① `promote` was never called

**The most common cause.** Uploading does not put anything in front of players.

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/release" -H "Authorization: Bearer $CADEPLAY_TOKEN"
# is active_build_id the build you just uploaded?
```

If not:

```bash
curl -X POST "https://cadeplay.com/v1/games/$GAME_ID/builds/$BUILD_ID/promote" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Idempotency-Key: $(uuidgen)"
```

### ② The game is published, so `promote` returns 409

Once a game has been published, developers cannot deploy directly — the update
has to go through review, and **approval does the deploying**. Meanwhile players
keep the current version, which is the intent.

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/review" -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  | jq '{status, missing_requirements}'
```

Submit an update for review instead → [store.md](store.md)

### ③ PWA players do not update immediately

Their service worker is serving a cached version. **Not swapping during play is
the design** — it would destroy a run in progress.

- If the game handles the `cadeplay:updateready` event, the swap happens when
  the player accepts
- **iOS has no background service worker updates.** The app must be fully closed
  and relaunched

Factor that delay in when rolling back a critical bug → [pwa.md](pwa.md)

### ④ Browser cache

The game document is `max-age=60`. Reopening within a minute can show the old
one. Enable "Disable cache" in devtools and reload.

Assets carry the `build_id` in their path so they never overwrite each other —
which is also why a rollback needs no CDN purge.

## How to narrow it down

When you are stuck, work in this order.

**① Establish where it stopped**

```bash
# game state
curl "https://cadeplay.com/v1/games/$GAME_ID" -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  | jq '{status, active_build_id, host}'

# builds, newest first
curl "https://cadeplay.com/v1/games/$GAME_ID/builds?limit=5" -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  | jq '.data[] | {id, version, status, engine, entrypoint, failure_reason}'

# current release
curl "https://cadeplay.com/v1/games/$GAME_ID/release" -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

**② Open it in a browser.** Passing tests and a working screen are different
things.

```
in the portal:  https://cadeplay.com/g/{slug}
the game host:  https://{id}.cadeplay.com/
```

At minimum, check:

- Does it render (take a screenshot)
- **Are there zero console errors**
- Any 404s or 403s in the Network tab — and if so, was that URL the CDN or the
  game host
- Does it hold together at a mobile width (390×844)
- Does Application → Manifest report "Installability" as passing

**③ Check the SDK is alive.** Open the game host and, in the console:

```js
window.__CADEPLAY__          // is the config object there
window.CadeplaySDK           // was the SDK injected
window.CadeplaySDK.version   // 1
```

If they are missing, HTML injection failed — check the `<head>` structure.

**④ If you still do not know**, say what you checked and what you could not.
"The tests passed so it is probably fine" is not a check.
