# PWA — install, host, service worker

Every game gets its own installable app at its own address. When your game runs
as a top-level page the SDK shows the install banner for you, so most games need
no code at all.

## Contents

- [The host — a decision you cannot undo](#the-host--a-decision-you-cannot-undo)
- [The server owns the manifest](#the-server-owns-the-manifest)
- [How installing works](#how-installing-works)
- [Ask the server whether it is installable](#ask-the-server-whether-it-is-installable)
- [Service worker and updates](#service-worker-and-updates)
- [🛑 Saves — the server is authoritative](#-saves--the-server-is-authoritative)
- [Mobile install gate (`mobile_install_policy`)](#mobile-install-gate-mobile_install_policy)
- [Multithreading (SharedArrayBuffer)](#multithreading-sharedarraybuffer)
- [Telling whether you are installed](#telling-whether-you-are-installed)

---

## The host — a decision you cannot undo

Creating a game allocates an **immutable 12-character id** of lowercase letters
and digits.

```
https://a1b2c3d4e5f6.cadeplay.com/
```

You may request a custom label instead, **but only before the game is first
published**.

```bash
curl -X POST "https://cadeplay.com/v1/games/$GAME_ID/host" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"label": "spacerunner"}'
```

🛑 **Labels are `[a-z0-9]` only, 3–30 characters — no hyphens.** This is
narrower than a game's `slug`, which does allow them. `spacerunner` is valid;
`space-runner` returns 422. (This document used to show a hyphenated example
that could not work.)

```bash
# check availability first
curl "https://cadeplay.com/v1/hosts/availability?label=spacerunner" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"

# current host state
curl "https://cadeplay.com/v1/games/$GAME_ID/host" -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

The change is **immediate** — there is no approval step and no webhook. Reserved
labels (`www`, `api`, `cdn`, `admin`, `account`, `play`, `static`, `assets`, and
others) are refused, and **a deleted game's label is never reused**.

### 🛑 After first publication it can never change

Requesting a label on a game with `locked: true` returns `409`. **This is
physics, not policy** — from that moment on there may be players who installed
the PWA at that address, and changing it would leave those apps stranded on
their home screens, unable to ever receive an update. There is nothing we could
do to repair that.

| When | What you can do |
|---|---|
| From creation until first **publication** | Request a custom label |
| After first **publication** | **Permanently fixed** |

🛑 **The trigger is publication (review approval), not deployment (`promote`).**
This document said `promote` for a long time, and so did the code — which meant
**a single test deploy of a draft permanently locked the randomly generated
12-character address**, before anyone could even see the game. There were
production games stuck that way.

The rule is now `published_at`, the moment a game passes review and enters the
catalog. **So deploy and test as much as you like before publication** — the
address does not lock then.

**If you want a custom label, decide before you publish.** Afterwards the only
way to change it is to create a new game.

## The server owns the manifest

A `<link rel="manifest">` declared by your game is **stripped** and replaced
with ours. Two reasons.

① The injected `<base>` points at the CDN, so your `/manifest.webmanifest`
resolves there, returns 403, and **PWA install breaks entirely**
(see [build.md](build.md)).

② A manifest `id` is the app's identity. If you change it, browsers treat the
result as a different app — **a second icon appears on the home screen** and it
cannot be undone.

What the server serves:

```json
{
  "id": "https://a1b2c3d4e5f6.cadeplay.com/",
  "scope": "/",
  "start_url": "/?source=pwa",
  "display": "standalone",
  "name": "…",
  "short_name": "…",
  "icons": [
    { "src": "…", "sizes": "192x192", "type": "image/png" },
    { "src": "…", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**The icons come from the ones you registered in the store.** Without them a
default icon is used → [store.md](store.md)

🛑 A `manifest.json` or `manifest.webmanifest` inside your archive is ignored.
It does no harm; it just adds to the file count.

## How installing works

**The SDK handles it.** When the game is opened as a top-level page
(`mode: "standalone"`) an install banner appears at the bottom. You do not have
to write anything.

| Environment | Behaviour |
|---|---|
| Android Chrome | Catches `beforeinstallprompt`, shows an install button |
| iOS Safari | Programmatic install is **impossible** — an overlay points at the share sheet |
| In-app WebView (messaging apps) | "Open in browser" guidance plus a copyable URL |
| Already installed | No banner |

🛑 **The install prompt cannot be raised from inside the portal iframe.**
`beforeinstallprompt` is bound to the top-level origin's manifest. The portal
instead offers an "open in a new tab" link; installation happens after the game
host is opened as a top-level page.

To put your own install button in the game UI, see the `install` section of
[sdk.md](sdk.md).

## Ask the server whether it is installable

```bash
curl -sS "https://cadeplay.com/v1/games/$GAME_ID/install-readiness" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" | jq
```

```jsonc
{
  "origin": "https://a1b2c3d4e5f6.cadeplay.com",
  "hostname": "a1b2c3d4e5f6.cadeplay.com",
  "overall": "met",                    // met | attention | blocked
  "checks": [
    { "key": "host",     "status": "ok" },
    { "key": "manifest", "status": "ok" },
    { "key": "icon",     "status": "ok" },      // ok | warn | pending | blocked
    { "key": "https",    "status": "ok" }
  ],
  "installs": 12,
  "installs_days": 30
}
```

**Use this instead of guessing.** A2HS fails silently more than anything else in
this document — no console error, no failed request, just a button that never
appears — and these four checks are the conditions the server can actually see.
`icon` is the one that catches people: without a 192px-or-larger icon Chrome
never fires `beforeinstallprompt` at all.

🛑 **`overall: "met"` is not a promise that the prompt will fire.** It means
nothing *we* control is blocking it. Whether the browser offers installation also
depends on its version, the platform, and its own engagement heuristics — none of
which we can see. Treat `met` as "now go open it on a phone and check", not as
"installable".

The `installs` count is a **beacon** — the page tells us it was installed. It can
be missed or repeated, so use it as a trend, never for anything that must
balance.

## Service worker and updates

In standalone runs the SDK registers `/sw.js` for you. **Do not put a service
worker in your archive** — the `<base>` tag makes it resolve to the CDN, which
makes it a cross-origin script, and registration fails silently.

Update discipline:

| Rule | Why |
|---|---|
| **Never swap during play** (no `skipWaiting`) | It would destroy the run in progress |
| Announce a new version by event | The game picks a safe moment |
| Never `clients.claim()` an existing session | Same reason |
| Never delete the old cache before the new one is complete | A failure mid-way breaks offline |

```js
window.addEventListener('cadeplay:updateready', (e) => {
  // call this only between runs, or on a menu screen
  showToast('A new version is ready', { action: () => e.detail.apply() });
});
```

🛑 **iOS has no background service worker updates.** The app must be fully
closed and relaunched before a new version activates. That also means a rollback
does not reach installed users immediately — factor that delay in when rolling
back a critical bug.

## 🛑 Saves — the server is authoritative

**Never treat local storage as the authority for progress.**

- iOS **does not copy anything but cookies** when a site is added to the home
  screen. A player who plays in the browser and then installs starts with empty
  `localStorage` and IndexedDB
- Safari may partition even a same-site iframe separately

```js
// ✅ server is the authority, local is a cache
async function loadProgress() {
  const r = await CadeplaySDK.loadData('progress');
  // 🛑 loadData has no `ok`, and `value` is a JSON string → sdk.md
  if (r?.value) {
    localStorage.setItem('progress', r.value);
    try { return JSON.parse(r.value); } catch { /* corrupt — use the cache */ }
  }
  // fall back to the cache only when the server did not answer
  try { return JSON.parse(localStorage.getItem('progress') || 'null'); } catch { return null; }
}
```

🛑 **However, `saveData`/`loadData` do not work in standalone (PWA) runs today.**
The game origin has no authentication yet (see the execution-context table in
[sdk.md](sdk.md)). Right now a PWA **cannot pick up progress created in the
portal** — design for the game to accumulate offline progress locally and sync
it on the next portal session.

```js
// queue failed saves in the PWA, push them during a portal session
async function saveProgress(data) {
  localStorage.setItem('progress', JSON.stringify(data));

  const r = await CadeplaySDK.saveData('progress', data);
  if (!r?.ok) localStorage.setItem('progress:dirty', '1');
}

async function syncIfNeeded() {
  if (localStorage.getItem('progress:dirty') !== '1') return;
  if (window.__CADEPLAY__?.mode !== 'embed') return;      // only possible in the portal

  const local = JSON.parse(localStorage.getItem('progress') || 'null');
  if (!local) return;

  const r = await CadeplaySDK.saveData('progress', local);
  if (r?.ok) localStorage.removeItem('progress:dirty');
}
```

## Mobile install gate (`mobile_install_policy`)

# 🚧 This feature does not exist yet — do not try to use it

**Corrected 2026-08-28.** This document described the feature as usable for a
long time, complete with a `PATCH` example and a claim that *"requesting a
closed value is refused with 422"*. **Neither was true.**

What is actually the case:

- The `games` table has **no `mobile_install_policy` column**
- `PATCH /v1/games/{gameId}` does **not** validate that field
- So any value you send returns **`200`, not `422`, and is discarded**
- No screen code draws the gate

**It looks like it saved, which makes it the worst kind of failure.** A
developer following this document would believe their game requires
installation while players see no change at all — and nothing reveals it until
someone reads the field back.

**There is nothing you can do today.** If you need this, wait for it to open.

---

What follows is **the contract once it is implemented**, not current behaviour.

A game can require that mobile players install it to the home screen before
playing. **It never applies to desktop.**

| Value | Mobile browser | Home screen launch |
|---|---|---|
| `optional` (default) | Play immediately | Play immediately |
| `recommended_after_play` | A dismissible banner after a grace period | Play immediately |
| `required` | Does not load; shows install guidance | Play immediately |
| `required_after_play` | Stops after a grace period and demands install | Play immediately |

The two enforcing modes have further prerequisites even after the column
exists — `required` has no design for who owns ads in a PWA top-level page, and
`required_after_play` adds the problem of carrying an anonymous player's
progress across.

The grace period is set by the platform (60 seconds by default). **Developers
cannot set it** — a one-second grace would imitate `required` and route around
the policy.

### 🛑 It is a UX gate, not access control

The browser never tells the server "this document was opened from an installed
app" in any request header. The judgement is entirely client-side.

| Signal | Usable? | Why |
|---|---|---|
| `display-mode: standalone` | ✅ the only one | — |
| `?source=pwa` | ❌ | Anyone can type it. It is for traffic analysis |
| `appinstalled` event | ❌ | Means install finished, not "running standalone now" |
| A home screen icon existing | ❌ | iOS 26 lets users turn off "Open as Web App" |

So do not build balance or revenue on the assumption that only installed players
are playing. It will not hold.

### Reverting — the setting comes back, the installs do not

The policy is one column, so it can be set back to `optional` at any time. But
**the home screen icons of everyone who installed while it was on are
permanent.** The cost of reverting this feature accumulates on the player side,
not in the schema.

## Multithreading (SharedArrayBuffer)

Cross-origin isolation requires COOP+COEP across **the entire parent chain**. A
portal page carrying ads cannot enable it.

**So multithreaded builds only work when `{id}.cadeplay.com` is opened as a
top-level page** (installed or full screen). Inside the portal iframe they fall
back to a single thread.

If your game genuinely requires threads:

1. Set `threading: "multi"` with `PATCH /v1/games/{id}`
2. Detect `SharedArrayBuffer` availability in the game and branch
3. Point players at "open full screen" when it is unavailable

```js
if (typeof SharedArrayBuffer === 'undefined' || !crossOriginIsolated) {
  showNotice('This game performs best full screen or as an installed app.');
  // continue on the single-threaded path
}
```

**Most games do not need threads.** Unity defaults to single-threaded and Godot
defaults to Thread Support off. Leave it off unless you have a specific reason —
turning it on can produce a build that will not run in the portal iframe at all.

## Telling whether you are installed

```js
const standalone = CadeplaySDK.install.isStandalone();
// what it checks:
//   matchMedia('(display-mode: standalone)').matches
//   || matchMedia('(display-mode: fullscreen)').matches
//   || navigator.standalone === true        ← iOS
```

Or by execution mode:

```js
const mode = window.__CADEPLAY__?.mode;   // "embed" | "standalone"
```

`mode` tells you **whether you are in the portal iframe**; `isStandalone()`
tells you **whether you are running from the home screen**. Opening the game
host in a browser tab gives `mode === 'standalone'` but
`isStandalone() === false`.

| Situation | `mode` | `isStandalone()` |
|---|---|---|
| Playing in the portal | `embed` | `false` |
| Game address opened in a browser | `standalone` | `false` |
| Launched from the home screen icon | `standalone` | **`true`** |
