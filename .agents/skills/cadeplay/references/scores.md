# Leaderboards and achievements

## Contents

- [🛑 Read this first — these values cannot be trusted](#-read-this-first--these-values-cannot-be-trusted)
- [Leaderboards](#leaderboards)
- [Achievements must be registered first](#achievements-must-be-registered-first)
- [Registering achievement definitions](#registering-achievement-definitions)
- [`set_by` — who is allowed to unlock](#set_by--who-is-allowed-to-unlock)
- [Unlocking from the game](#unlocking-from-the-game)
- [Rarity and statistics](#rarity-and-statistics)
- [Design guidance](#design-guidance)

---

## 🛑 Read this first — these values cannot be trusted

**Scores and achievements sent by a client are fundamentally untrustworthy.**
Game code runs in the player's browser and the player can change it.

Achievements are **easier** to fake than scores. A score has to be a plausible
number; an achievement is just a key:

```js
CadeplaySDK.unlockAchievement('secret_ending');   // one line in devtools
```

The platform makes abuse *harder* with single-use play-session tokens, but it
cannot make the values correct.

| Prevented | Not prevented |
|---|---|
| Submitting a score without ever opening the game (no token) | Opening the game and editing memory for a high score |
| Reusing one session repeatedly (single use) | Automating the game to farm plays |
| Submitting the instant play starts (minimum play time) | Calling an achievement key from devtools |
| Reusing another game's token (bound to the game) | |

Preventing the right-hand column would mean the server replaying your game
logic, which differs per game and is not something a platform can do for you.

**So do not let scores or achievements decide prize money, payouts, cash-value
rewards, or ranking tiers.** Know this limit before you design "prize for
first place."

What they are good for: **fun and motivation.** Ranking boards, comparing with
friends, collectibles, progress display. Anywhere nothing is lost when a number
is wrong, use them freely.

## Leaderboards

**A board is created on first submission.** No registration needed.

```js
// only works after gameplayStart()
const r = await CadeplaySDK.submitScore('main', 12500, { stage: 3, combo: 41 });
// { ok: true, improved: true, rank: 42 }
// { ok: false, error: 'no_session' }     ← gameplayStart() was never called

if (r?.improved) showNewRecordEffect();
```

```js
const r = await CadeplaySDK.getLeaderboard('main', {
  limit: 20,        // how many
  offset: 0,        // paging — these two are the ONLY options that reach the server
});
// { entries: [{ rank, score, player, metadata, at }, …],
//    me: { rank, score, … } | null,
//    direction: 'desc' }
// | null   ← the request failed
```

| Thing | Rule |
|---|---|
| `board` | A name, created on first submission. Namespaced per game |
| `score` | Integer |
| `metadata` | String or object. **Objects are JSON-serialised by the SDK** |
| `improved` | Whether it is a personal best. **Drive your celebration off this** |

Multiple boards are fine — `'main'`, `'time-attack'`, `'endless'` per mode is
a common split.

🛑 **Without `gameplayStart()` submission fails outright.** That call is what
makes the server mint the single-use play-session token. Call it at the start
of every run.

## Achievements must be registered first

**Unlike leaderboards.** Unlocking a key that was never registered is refused
with `unknown_key`.

Why the asymmetry — a score has a *value*, so auto-creating a board is
harmless. **An achievement key is the unlock.** Allowing auto-creation means a
typo becomes an achievement (`bos_kill` versus `boss_kill`) and rarity, listings
and translations all stop meaning anything. It cannot be undone either, because
players have already unlocked it.

## Registering achievement definitions

```bash
curl -X PUT "https://cadeplay.com/v1/games/$GAME_ID/achievements/boss_1" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "set_by": "client",
    "hidden": false,
    "localizations": {
      "en": { "name": "First Blood",  "description": "Defeat the stage 3 boss" },
      "ko": { "name": "첫 보스 격파", "description": "3스테이지 보스를 쓰러뜨렸다" }
    }
  }'
```

`PUT` is idempotent — calling it again with the same key updates the definition.
**It is safe to run on every deploy**, with two caveats:

🛑 **`PUT` replaces every translation, it does not merge them.** The server
deletes the existing `localizations` rows and re-creates them from what you sent.
A sync script that ships only `en` therefore **wipes the Korean and Japanese
names** somebody added later — and nothing reports it, because the call
succeeds. Send the full set every time, or `GET` first and merge.

🛑 **`set_by` is frozen once a player has unlocked the achievement.** Changing it
after that returns **409**. Leave the field out of your sync payload unless you
are deliberately changing it — that is why the example below omits it.

| Field | Required | Notes |
|---|---|---|
| `localizations` | ✅ | Per language. **Must include the game's `default_locale`** |
| `localizations.*.name` | ✅ | 100 chars |
| `localizations.*.description` | | 255 chars |
| `set_by` | | `client` (default) · `server` |
| `hidden` | | Default `false`. Hides name and description until unlocked |

**The key** goes in the URL path and must match the string in your game code.
Lowercase letters, digits and underscores are recommended — `boss_1`,
`secret_ending`, `all_coins`.

```bash
# list
curl "https://cadeplay.com/v1/games/$GAME_ID/achievements" -H "Authorization: Bearer $CADEPLAY_TOKEN"

# one
curl "https://cadeplay.com/v1/games/$GAME_ID/achievements/boss_1" -H "Authorization: Bearer $CADEPLAY_TOKEN"

# delete — think twice if players have already unlocked it
curl -X DELETE "https://cadeplay.com/v1/games/$GAME_ID/achievements/boss_1" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

Reading needs `games:read`; registering and deleting need `games:write`.

### Wiring it into your deploy

Keep the definitions in a file and push them on every deploy. It is the simplest
way to stop the keys in your code from drifting from the ones on the server.

```json
// achievements.json
{
  "boss_1": {
    "localizations": {
      "en": { "name": "First Blood",  "description": "Defeat the stage 3 boss" }
    }
  },
  "secret_ending": {
    "hidden": true,
    "localizations": {
      "en": { "name": "True Ending", "description": "Reach the true ending" }
    }
  }
}
```

```bash
#!/usr/bin/env bash
# sync-achievements.sh — reconcile definitions with the server (PUT, so idempotent)
set -euo pipefail
: "${CADEPLAY_TOKEN:?}" "${GAME_ID:?}"

jq -r 'to_entries[] | @base64' achievements.json | while read -r row; do
  entry=$(echo "$row" | base64 --decode)
  key=$(echo "$entry" | jq -r .key)
  body=$(echo "$entry" | jq -c .value)

  curl -sS -X PUT "https://cadeplay.com/v1/games/$GAME_ID/achievements/$key" \
    -H "Authorization: Bearer $CADEPLAY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" >/dev/null

  echo "  ✓ $key"
done
```

```js
// the game reads keys from the same file — typos become impossible
import ACHIEVEMENTS from './achievements.json';

export const KEYS = Object.keys(ACHIEVEMENTS);

export async function unlock(key) {
  if (!KEYS.includes(key)) throw new Error(`unregistered achievement: ${key}`);

  const r = await CadeplaySDK.unlockAchievement(key);
  if (r?.newlyUnlocked) showAchievementToast(r.name);

  return r;
}
```

## `set_by` — who is allowed to unlock

The same idea as Steam's `Set By`. **It does not put a trust badge on individual
unlocks; it decides at registration time who may set the achievement.**

| Value | Who | What it means |
|---|---|---|
| `client` (default) | Game JS through the SDK | That browser **claimed** the achievement |
| `server` | Your own server through `/v1` | Your server **confirmed** it |

Game JS attempting to unlock an achievement registered as `server` is **refused
with 422**. It is not silently discarded.

🚧 **The server unlock path is not open yet.** Registering something as `server`
today means **nobody can unlock it**. Wait until authentication for developer
servers (`player_ref` exchange) exists. Until then leave everything `client`.

🛑 **`server` does not mean "honest" either.** Your server is yours to do with as
you please. This makes forgery harder; it does not certify facts.

## Unlocking from the game

```js
const r = await CadeplaySDK.unlockAchievement('boss_1');

// { ok: true,  newlyUnlocked: true,  name: 'First Blood' }  ← celebrate
// { ok: true,  newlyUnlocked: false }                       ← already had it
// { ok: false, error: 'unknown_key' }                       ← not registered
// { ok: false, error: 'unsupported_context' }               ← outside the iframe, e.g. PWA
// { ok: false, error: 'set_by_server' }                     ← a server achievement

if (r?.newlyUnlocked) showAchievementToast(r.name);
```

🛑 **Without checking `newlyUnlocked` you show the popup every launch.**
Unlocking is idempotent so repeated calls are safe, but from the second one it
returns `false`.

🛑 **It does not require `gameplayStart()`.** Unlike scores — a single run can
unlock several achievements, and the play-session token is single-use, so the
first unlock would consume it and the rest would all be refused. That failure
shows up as **"I earned it but it never registered", and it cannot be recovered
after the fact.**

### Listing them

```js
const r = await CadeplaySDK.getAchievements();
// { ok: true, achievements: [
//     { key, name, description, hidden, unlocked, unlocked_at, source }, … ] }
```

A hidden achievement that is still locked has `null` for `name` and
`description`. Masking happens on the server, so devtools cannot reveal it
either. Draw those as "???".

```js
function renderAchievement(a) {
  const locked = !a.unlocked;
  const masked = a.hidden && locked;

  return {
    title: masked ? '???' : a.name,
    body:  masked ? 'Hidden achievement' : a.description,
    dim:   locked,
  };
}
```

Signed-out players see everything as locked. Reading the list does not create an
account.

### Do not swallow failures

Achievements are not recorded in PWA runs. Queue them rather than dropping them.

```js
const pending = JSON.parse(localStorage.getItem('ach:pending') || '[]');

async function unlock(key) {
  const r = await CadeplaySDK.unlockAchievement(key);

  if (!r?.ok && r?.error === 'unsupported_context') {
    if (!pending.includes(key)) {
      pending.push(key);
      localStorage.setItem('ach:pending', JSON.stringify(pending));
    }
    return;
  }

  if (r?.newlyUnlocked) showAchievementToast(r.name);
}

// flush when a portal session starts
async function flushPending() {
  if (window.__CADEPLAY__?.mode !== 'embed') return;

  for (const key of [...pending]) {
    const r = await CadeplaySDK.unlockAchievement(key);
    if (r?.ok) pending.splice(pending.indexOf(key), 1);
  }
  localStorage.setItem('ach:pending', JSON.stringify(pending));
}
```

## Rarity and statistics

🚧 **There is no rarity figure yet.** `getAchievements()` returns
`{ key, name, description, hidden, unlocked, unlocked_at, source }` and nothing
else — **no `rarity`, no `unlocked_count`.** If your UI wants "3% of players
have this", you have to count it yourself or leave it out.

When it does arrive, two things are already decided and worth designing around:

- **`client` and `server` rarity will be reported separately.** There will be no
  combined single percentage — mixing a number anyone can fake with one a server
  vouched for produces a figure that means neither.
- 🛑 **Do not use rarity for payouts or prizes.** The trust limits above apply
  unchanged.

And a display rule that does not depend on the feature: **do not badge individual
achievements as "unverified".** Client-only games are the overwhelming majority,
so nearly everything would carry the same mark — zero information, and the
player feels accused for nothing. Show totals instead:
`42 unlocked (12 server-confirmed)`, from the `source` field you do have.

## Design guidance

**How many**: 10–30 works well. Three feels thin; a hundred means nobody sees
them all.

**Distribution**: build a range, from something almost everyone gets (finish the
tutorial) to something very few do (no-death clear). If they are all hard, the
list stays grey forever.

**Naming**: make it clear what to do. The `description` *is* the objective.

```
✅  "First Blood" / "Defeat the stage 3 boss"
❌  "Achievement 1" / "You did it"
```

**Use `hidden` sparingly**: only for genuine spoilers — true endings, secret
stages. Overuse hides the objectives and removes the motivation.

**Languages**: `default_locale` is required, the rest optional. Missing
translations fall back to the default — leave out Korean in an English game and
Korean players read English.

**Never change a key**: a different key is a **different achievement**. Players
who already unlocked the old one do not carry over. Names and descriptions can
change freely; keys are fixed for the life of the game.
