# Cadeplay SDK

The only channel between a game and the portal. Ads, cloud saves, leaderboards,
and achievements all go through it.

## Contents

- [Loading — you do nothing](#loading--you-do-nothing)
- [`window.__CADEPLAY__` — what the server gives you](#window__cadeplay__--what-the-server-gives-you)
- [Execution context — embed and standalone](#execution-context--embed-and-standalone)
- [Lifecycle — skip these and you lose quietly](#lifecycle--skip-these-and-you-lose-quietly)
- [Ads](#ads)
- [Cloud saves](#cloud-saves)
- [Leaderboards](#leaderboards)
- [Achievements](#achievements)
- [Install (A2HS)](#install-a2hs)
- [Service worker updates](#service-worker-updates)
- [A complete integration](#a-complete-integration)
- [Return values at a glance](#return-values-at-a-glance)

---

## Loading — you do nothing

🛑 **Do not put `<script src=".../sdk.js">` in your game.** The server injects it
into your HTML. Adding it yourself either loads the SDK twice (duplicate
listeners) or resolves against the CDN because of `<base>` and fails silently.

Just use it:

```js
if (window.CadeplaySDK) {
  CadeplaySDK.gameLoadingStart();
}
```

Injection order is guaranteed, so **even an inline script can reference it
immediately**. Guard for its absence only if your game must also run without it
(local development, for instance).

A mock for local work:

```js
// Load this only in dev. It is safe to ship, but the guard keeps it from
// overwriting the real SDK once that is injected.
window.CadeplaySDK = window.CadeplaySDK || {
  version: 0, game: 'local', build: 'local', mode: 'embed', locale: 'en',
  gameLoadingStart:    () => Promise.resolve(null),
  gameLoadingFinished: () => Promise.resolve(null),
  gameplayStart:       () => Promise.resolve(null),
  gameplayStop:        () => Promise.resolve(null),
  commercialBreak:     () => Promise.resolve(null),
  // 🛑 `false`, like the real bridge. A mock that always rewards hides the
  //    strict `=== true` check you need, and the bug only appears in production.
  rewardedBreak:       () => Promise.resolve(false),
  saveData:  (k, v) => { localStorage.setItem('cp:'+k, v); return Promise.resolve({ ok: true, version: 1, bytes: v.length }); },
  // 🛑 no `ok`, and `value` is a STRING — exactly like the real one
  loadData:  (k)    => { const v = localStorage.getItem('cp:'+k);
                         return Promise.resolve(v === null ? null : { value: v, version: 1, updatedAt: null }); },
  submitScore:    () => Promise.resolve({ ok: true, improved: true, rank: 1, score: 0 }),
  getLeaderboard: () => Promise.resolve({ entries: [], me: null, direction: 'desc' }),
  unlockAchievement: () => Promise.resolve({ ok: true, newlyUnlocked: true }),
  getAchievements:   () => Promise.resolve({ ok: true, achievements: [] }),
  install: { isStandalone: () => false, available: false, prompt: () => {}, dismiss: () => {} },
};
```

## `window.__CADEPLAY__` — what the server gives you

A configuration object injected before the SDK. Your game may read it directly.

```js
{
  gameId:       "a1b2c3d4e5f6",              // the game's immutable public id
  buildId:      "9f8e7d6c5b4a",              // the build currently running
  engine:       "unity",                      // detected engine (may be null)
  mode:         "embed",                      // "embed" | "standalone"
  locale:       "en",                         // the GAME's default language — not the player's
  portalOrigin: "https://cadeplay.com",       // the parent portal's origin
  origin:       "https://a1b2c3d4e5f6.cadeplay.com",  // this game host's origin
  i18n:         { … }                         // install strings (SDK internal)
}
```

🛑 **There is no user identity here.** The game document response is cached
(`max-age=60` plus six hours of server cache), so putting per-user values in it
would send player A's data to player B. When you need to know who is playing,
ask through an SDK call such as `getAchievements()`.

🛑 **`locale` is the game's default language, not the player's.** It comes from
`default_locale` and is identical for everyone, for the same caching reason.
Display language is decided on the client from `navigator.languages`:

```js
CadeplaySDK.locale     // "en" — the same string for every player
navigator.languages    // ["ko-KR", "ko", "en-US"] — this player
```

This one does not fail while you develop — you are almost certainly testing in
the game's default language, so it returns exactly what you expected. It only
goes wrong for players, and nothing is logged →
[references/localization.md](localization.md)

Use `origin` to build absolute URLs to the game host — under `<base>`, `/foo`
resolves to the CDN (see [build.md](build.md)).

## Execution context — embed and standalone

A game runs one of two ways, and **calls behave differently**.

| | `embed` (portal iframe) | `standalone` (PWA or direct) |
|---|---|---|
| Parent window | The portal | None |
| Ad hooks | Work | Quietly `null` — ignoring that is correct |
| Saves and scores | Work | Do not work |
| Achievements | Work | `{ok:false, error:'unsupported_context'}` |
| Install prompt | **Impossible** — top-level documents only | Works |
| Multithreading | Falls back to one thread | Works |

```js
const mode = window.__CADEPLAY__?.mode;   // "embed" | "standalone"
```

🛑 **Saves, scores, and achievements not working in standalone is a current
limitation**, because the game origin has no authentication yet. Ad hooks fail
silently, but achievements return an explicit reason —

> A broken save reads as "my progress did not carry over."
> A broken achievement reads as **"I earned it and it never registered"** ←
> which cannot be recovered afterwards.

That is why achievement failures are observable: your game can queue them for
retry or tell the player.

```js
const r = await CadeplaySDK.unlockAchievement('boss_1');
if (!r?.ok && r?.error === 'unsupported_context') {
  pendingAchievements.push('boss_1');   // retry during the next portal session
}
```

## Lifecycle — skip these and you lose quietly

```js
CadeplaySDK.gameLoadingStart();      // loading begins — as early as possible
CadeplaySDK.gameLoadingFinished();   // the game is playable
CadeplaySDK.gameplayStart();         // actual play begins
CadeplaySDK.gameplayStop();          // pause, game over, back to menu
```

### 🛑 Without `gameLoadingStart` the loading screen clears too early

The portal manages the loading overlay from three signals:

| Signal | Meaning | What the portal does |
|---|---|---|
| iframe `load` | The document arrived | Counts it **briefly** (3 seconds) |
| `gameLoadingStart` | This game uses the SDK | Cancels that grace and waits |
| `gameLoadingFinished` | Genuinely ready | Clears immediately |

Without `gameLoadingStart` the overlay clears three seconds after the document
loads — and at that point Unity and Godot are still downloading wasm, so **the
player sees a black screen.**

The opposite mistake, calling `gameLoadingStart` but never
`gameLoadingFinished`, waits for the timeout. There was a production case where
**the overlay stayed for 18.9 seconds** — the game was already running beneath
it, every HTTP call returned 200, and the console had zero errors.

**Call both.**

### 🛑 Without `gameplayStart`, score submission fails

`submitScore` requires a single-use play-session token that the server mints at
`gameplayStart`. Without it you get `{ok:false, error:'no_session'}`.

`gameplayStart`/`Stop` also drive ad timing and background music. The more
accurate they are, the less play gets interrupted.

```js
// call it at the start of every run — not once
function startRound() {
  CadeplaySDK.gameplayStart();
  …
}

function endRound(score) {
  CadeplaySDK.gameplayStop();
  CadeplaySDK.submitScore('main', score);
}
```

## Ads

**The portal owns ads.** Do not put an ad SDK inside the game iframe — the
portal cannot control it, and it can get the game suspended for policy
violations.

🚧 **No ads are running yet.** `commercialBreak()` resolves immediately and
`rewardedBreak()` **always returns `false`**. Wire both calls in now — they are
the insertion points and the contract will not change — but **do not design an
economy that depends on rewarded ads today**, because nothing grants a reward
until ads are switched on. A "watch an ad for a free life" button will simply
never pay out.

```js
// interstitial — no return value, resolves when it is over
await CadeplaySDK.commercialBreak();

// rewarded — grant only on true
const watched = await CadeplaySDK.rewardedBreak();
if (watched === true) {
  grantReward();
}
```

🛑 **Check `rewardedBreak()` strictly against `true`.** Both `null` (the parent
did not answer) and `false` (skipped) must not be rewarded. `if (watched)` is
fine because `null` is falsy, but a habitual `!== false` grants rewards when
nobody watched anything.

**Call `gameplayStop`/`gameplayStart` around an ad**, so the music does not
overlap and your game clock does not advance through it.

```js
async function showRewardedAd() {
  CadeplaySDK.gameplayStop();
  const watched = await CadeplaySDK.rewardedBreak();
  CadeplaySDK.gameplayStart();

  if (watched === true) grantReward();
  else showToast('Watch the whole ad to get the reward');
}
```

## Cloud saves

**The server is authoritative. Local storage is only a cache.**

🛑 iOS does not copy anything but cookies when a site is added to the home
screen, and Safari may partition even a same-site iframe. **Treat
`localStorage` as the authority and iOS players lose their progress.**

```js
// save — value is anything JSON-serialisable
const r = await CadeplaySDK.saveData('progress', {
  level: 12, coins: 340, unlocked: ['sword', 'shield'],
});
// r = { ok: true, version: 7, bytes: 82 } | { ok: false, status | error }

// load — 🛑 read the two notes below before writing this line
const r = await CadeplaySDK.loadData('progress');
// r = { value: '{"level":12,…}', version: 7, updatedAt: '…' }  ← a hit
//   | null                                                      ← nothing saved, or failed
const progress = r ? JSON.parse(r.value) : null;
```

🛑 **`loadData` does not return `ok`, and the two mistakes it invites are both
silent.**

| Mistake | What happens |
|---|---|
| `r?.ok ? r.value : null` | `r.ok` is `undefined`, so progress is **always `null`** — every player starts over, every session |
| Using `r.value` directly | It is the **JSON string you saved**, not an object. `value.level` is `undefined` |

`saveData` *does* return `ok` — the two calls are not symmetric, because a read
that finds nothing and a read that failed are both simply `null`. If you need to
tell them apart, you cannot: treat `null` as "no save" and keep a local cache
for offline safety (below).

| Rule | Value |
|---|---|
| Key | Namespaced per game. No collisions with other games |
| Value | Anything JSON-serialisable. The server enforces a size limit |
| Signed-out players | **A guest account is created on the first save** |

A guest account's identity is its session, and it is cleaned up after the
retention period (30 days). Give the player somewhere in-game to hear "create
an account and your progress is kept."

**The pattern — local cache, server authority:**

```js
async function loadProgress() {
  const r = await CadeplaySDK.loadData('progress');

  if (r?.value) {
    localStorage.setItem('progress', r.value);   // cache the string as-is
    try { return JSON.parse(r.value); } catch { /* corrupt — fall through */ }
  }

  // use the cache only when the server did not answer — offline safety
  try { return JSON.parse(localStorage.getItem('progress') || 'null'); }
  catch { return null; }
}

async function saveProgress(data) {
  localStorage.setItem('progress', JSON.stringify(data));   // local first
  const r = await CadeplaySDK.saveData('progress', data);   // then the server

  if (!r?.ok) queueForRetry(data);   // never swallow the failure
}
```

## Leaderboards

```js
// submit — only works after gameplayStart()
const r = await CadeplaySDK.submitScore('main', 12500, { stage: 3, combo: 41 });
// r = { ok: true, improved: true, rank: 42 } | { ok: false, error: 'no_session' }

if (r?.improved) showNewRecordEffect();   // ← celebrate personal bests only

// read — 🛑 no `ok` here either, and `null` means the request failed
const r = await CadeplaySDK.getLeaderboard('main', { limit: 20, offset: 0 });
// r = { entries: [{ rank, score, player, metadata, at }, …],
//        me: { rank, score, … } | null,
//        direction: 'desc' }
//   | null
const rows = r?.entries ?? [];
```

🛑 **`limit` and `offset` are the only options that reach the server.** Anything
else you pass is dropped silently. The player's own row comes back as `me`, so
you do not scan `entries` for it — and on a long board `me` is often not in
`entries` at all.

**The display name is `player`, not `name`, and there is no `isMe` flag** —
compare against `me.rank` instead.

| Argument | Description |
|---|---|
| `board` | Board name. **Created on first submission** (unlike achievements) |
| `score` | Integer |
| `metadata` | String or object. **Objects are JSON-serialised by the SDK** |

🛑 **You may pass an object as `metadata`.** The server takes strings only, but
the SDK converts. Before that conversion existed, a developer passed
`{cleared: true}`, the server returned 422, and the game showed nothing at all —
just one red line in the console. They believed the score had been recorded.

`improved` tells you whether it is a personal best. **Showing a celebration
without checking it** means celebrating a worse score.

**Do not use scores for prizes or payouts** → [scores.md](scores.md)

## Achievements

🛑 **Achievements must be registered in advance.** They are not created on
demand the way leaderboards are. Unlocking an unregistered key returns
`{ok:false, error:'unknown_key'}`. Registration is covered in
[scores.md](scores.md).

```js
const r = await CadeplaySDK.unlockAchievement('secret_ending');
// r = { ok: true, newlyUnlocked: true, name: 'True Ending' }
//   | { ok: true, newlyUnlocked: false }          ← already had it
//   | { ok: false, error: 'unknown_key' }         ← not registered
//   | { ok: false, error: 'unsupported_context' } ← outside the iframe, e.g. PWA

if (r?.newlyUnlocked) showAchievementToast(r.name);   // ← this condition matters
```

🛑 **Without checking `newlyUnlocked` the popup fires every launch.** Unlocking
is idempotent so repeat calls are safe, but from the second one it is `false`.

🛑 **It does not require `gameplayStart`.** Unlike scores — one run can unlock
several achievements, and the play-session token is single-use, so the first
unlock would consume it and the rest would all be refused.

```js
// the list, with what this player has
const r = await CadeplaySDK.getAchievements();
// r = { ok: true, achievements: [
//        { key, name, description, hidden, unlocked, unlocked_at, source }, … ] }
```

A hidden achievement (`hidden: true`) that is still locked has `null` for `name`
and `description`. Draw those as "???". Masking happens server-side, so devtools
cannot reveal them either.

## Install (A2HS)

In standalone runs the SDK **shows an install banner at the bottom
automatically**. Usually there is nothing to do. Use the following only when you
want your own install button in the game UI.

```js
const { isStandalone, available, prompt, dismiss } = CadeplaySDK.install;

if (isStandalone()) {
  // already running from the home screen — nothing to suggest
} else if (available) {
  installButton.onclick = () => CadeplaySDK.install.prompt();   // ← inside the click
}
```

🛑 **`prompt()` only works inside a user gesture.** Calling it on load is
ignored by the browser. And **inside the portal iframe `available` is always
`false`** — install prompts reach top-level documents only.

iOS cannot be prompted programmatically, so the SDK draws share-sheet guidance
instead. Details in [pwa.md](pwa.md).

## Service worker updates

In standalone (PWA) runs the SDK registers a service worker. When a new version
is ready it **does not swap during play** — it raises an event.

```js
window.addEventListener('cadeplay:updateready', (e) => {
  // call this at a safe moment — between runs, on a menu screen
  showToast('A new version is ready', {
    action: () => e.detail.apply(),      // applying reloads the page
  });
});
```

🛑 **Never call `apply()` while loading or mid-run.** It destroys the run in
progress.

## A complete integration

```js
/**
 * Cadeplay integration — this much, at minimum.
 */
const SDK = window.CadeplaySDK;
const hasSDK = Boolean(SDK);

async function boot() {
  hasSDK && SDK.gameLoadingStart();          // ① as early as possible

  await loadAssets();                        // engine init, asset loading
  const progress = await loadProgress();     // ② restore the cloud save

  hasSDK && SDK.gameLoadingFinished();       // ③ the moment it is playable

  showTitleScreen(progress);
}

async function loadProgress() {
  if (!hasSDK) return null;
  const r = await SDK.loadData('progress');

  return r ? JSON.parse(r.value) : null;
}

function startRound() {
  hasSDK && SDK.gameplayStart();             // ④ every run
  runGameLoop();
}

async function endRound(score, stage) {
  hasSDK && SDK.gameplayStop();              // ⑤ when the run ends

  if (!hasSDK) return;

  await SDK.saveData('progress', currentProgress());

  const r = await SDK.submitScore('main', score, { stage });
  if (r?.improved) showNewRecordEffect();

  if (stage >= 10) {
    const a = await SDK.unlockAchievement('stage_10');
    if (a?.newlyUnlocked) showAchievementToast(a.name);
  }

  // ⑥ ads between runs — never in the middle of one
  if (roundCount % 3 === 0) {
    await SDK.commercialBreak();
    hasSDK && SDK.gameplayStart();
  }
}

boot();
```

## Return values at a glance

| Call | `embed` returns | `standalone` returns | Precondition |
|---|---|---|---|
| `gameLoadingStart()` | `null` | `null` | — |
| `gameLoadingFinished()` | `null` | `null` | — |
| `gameplayStart()` | `null` | `null` | — |
| `gameplayStop()` | `null` | `null` | — |
| `commercialBreak()` | `null` (resolves when done) | `null` (immediately) | — |
| `rewardedBreak()` | `true` \| `false` | `false` | — |
| `saveData(k, v)` | `{ok, version, bytes}` | `null` | — |
| `loadData(k)` | **`{value, version, updatedAt}` \| `null`** — no `ok`, `value` is a string | `null` | — |
| `submitScore(b, s, m?)` | `{ok, improved, rank, score}` | `null` | **`gameplayStart()`** |
| `getLeaderboard(b, o?)` | **`{entries, me, direction}` \| `null`** — no `ok` | `null` | — |
| `unlockAchievement(k)` | `{ok, key, newlyUnlocked, name, description, unlockedAt}` | `{ok:false, error}` | **prior registration** |
| `getAchievements()` | `{ok, achievements}` | `{ok:false, error}` | — |
| `install.prompt()` | does nothing | shows the prompt | a user gesture |

**Every call resolves to `null` after 15 seconds.** That keeps a game from
hanging forever when the parent does not answer. Treat a `null` from an `await`
as a failure.

🛑 **Two calls do not carry `ok` — `loadData` and `getLeaderboard`.** They
answer with the data itself, or `null`. Writing `r?.ok ? … : …` against either
one always takes the failure branch, and nothing anywhere reports it.
