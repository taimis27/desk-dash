---
name: cadeplay
description: >-
  Ship HTML5 games to the Cadeplay game portal (cadeplay.com). Covers packaging a
  game archive, integrating the Cadeplay SDK (loading, ads, cloud saves, leaderboards,
  achievements), the /v1 public API for upload → build → promote → rollback, store
  listings and media, the content survey, review submission and resubmission after a
  rejection, PWA and home-screen install, webhooks, stats, and CI/CD deploy scripts.
  Use this whenever any of the following applies — the user mentions "cadeplay";
  they want to publish, update, or roll back an HTML5/WebGL game (Unity, Godot,
  Construct, Phaser, plain JS) on a web game portal; they want cloud saves,
  leaderboards, achievements, or rewarded ads in a browser game; they are handling a
  Cadeplay developer token (cdp_), an upload session, a build status, or a review
  result; or they are configuring a game's PWA install or its {id}.cadeplay.com host
  label. Also use it when designing a browser game's controls (touch, mobile-first,
  on-screen input) or its display languages, since Cadeplay games must be playable
  with a thumb and must display in twenty-one languages.
  Everything a developer needs can be done from the API alone — no web console.
  Keywords — cadeplay, HTML5 game deploy, game portal upload, CadeplaySDK, promote
  build, rollback build, cloud save, leaderboard, achievement, content survey,
  cdp_ token, cadeplay init, game localization, touch controls, mobile-first game,
  store screenshots, game trailer.
license: This skill is published for Cadeplay developers. Copy and modify it freely.
metadata:
  author: Cadeplay
  version: 1.9.0
  homepage: https://cadeplay.com/dev/skills/
---

# Cadeplay — build a game, ship it

Cadeplay is an HTML5 game portal. Players play in the browser with nothing to
install; developers upload one archive and it goes live. This skill covers the
whole path from a folder of files to a game people can play.

## Three things to know first

Get these wrong and everything after them is wrong too.

**① Games run on `{id}.cadeplay.com`, not on the portal.** Every game gets its
own origin and runs inside an iframe on portal pages. Your game code therefore
cannot reach the portal's cookies or DOM — and no other game can reach yours.

**② Do not add the SDK with a `<script>` tag.** The server injects it into your
game's HTML. Just use `window.CadeplaySDK`. Bundling the SDK in your archive or
loading it from a CDN breaks it → [references/sdk.md](references/sdk.md)

**③ Creating a build and releasing it are separate calls.** Uploading does not
put anything in front of players. `promote` moves the active pointer. Rolling
back moves it the other way and takes effect instantly.

## 🛑 Three rules that decide whether anyone plays it

These are about the game itself, not about the API. Every one of them is cheap
while you are building and expensive afterwards, and none of them is enforced by
a `422` — a game that breaks all three uploads, passes review, and goes live to
nobody.

### ① Touch first. The keyboard is optional, always.

**Most Cadeplay players are on a phone.** No keyboard, no mouse, no hover, no
right-click. So:

- **Touch reaches every action** — including menus, pause, restart, settings
- **On desktop the mouse drives movement** — click or drag to move, aim, select
- **Keys are an accelerator only** — three or four for attack, jump, dash. Never
  the only way to reach anything
- A world bigger than the screen needs **pinch to zoom and drag to pan**

> *"The game must be completable with one thumb, with no keyboard and no mouse
> anywhere in the path."*

**Ask the developer how the character moves before writing the input layer.**
Retrofitting touch onto a keyboard game means rewriting input and often the
level design → [references/controls.md](references/controls.md)

### ② Ship it in twenty-one languages — **you translate, not the developer**

Author in **English** (or whatever language the developer thinks in), then
display in all of these, chosen automatically from `navigator.languages`:

`en` `ko` `zh` `ja` `pt` `es` `tr` `vi` `id` `th` `fr` `it` `pl` `uk` `de` `nl`
`zh-hant` `ar` `he` `hi` `ru`

🛑 **This is your job, and it is the main reason to publish through this skill.**
The developer writes one language. You write the other twenty — both the store
listing (twenty-one `PUT` calls) and the strings inside the build. Nobody types
twenty-one listings by hand, and a developer who thinks they have to will ship
one language and lose the rest of the world.

Four rules make the difference between usable and embarrassing — length caps in
the *target* language, never translating the game's name, never overwriting a
language somebody already wrote, and right-to-left for `ar`/`he`.

🛑 **`CadeplaySDK.locale` is not the player's language** — it is the game's
default, identical for everyone, and it will look correct on your machine right
up until real players arrive. Fonts are what blows the archive size limit
→ [references/localization.md](references/localization.md)

### ③ Finish the store page, do not just pass it — **you make the media too**

Review requires one screenshot; **one screenshot is not a store page.** Fill
every screenshot slot, set the one that goes on the catalog card, write the
listing in **every language**, and — if you can — a short gameplay clip.

🛑 **The developer does not have to supply any of it.** Ask, and make it:

| They ask for | You do |
|---|---|
| "screenshots" | serve the build, play it, capture — or harvest stills from a recording with `ffmpeg` |
| "the catalog card" | pick the best gameplay still and register it as `screenshot_listing` — **do this before the video** |
| "a video" | drive the game headless with Playwright and record the page, cut to **20 seconds**, encode **MP4 or WebM** — then **look at four frames before uploading** (full script and commands in the reference) |
| "the listing in every language" | translate the default one into the other twenty and `PUT` them |

🛑 **Do not make an intro video.** A Cadeplay game runs on its own detail page,
so there is no slot for one and no place to show it — the play session is the
trailer. The only video is the card clip above.

Verify it all before submitting: none of this produces an error, and a thin page
is simply not clicked → [references/store.md](references/store.md)

## The whole flow

```
① Make the game       touch-first controls · 21 display languages   ← the rules above
                      an archive with index.html at the root or one level down
② Get a token         issue it in the console → keep it in .env (→ scripts/init.sh)
③ Create the game     POST /v1/games
④ Upload              POST /v1/uploads → PUT {presigned} → POST /v1/uploads/{id}/complete
⑤ Build               POST /v1/games/{id}/builds → poll → POST …/promote
⑥ Listing + media     PUT …/listings/{locale} for EVERY language
                      POST …/media — icon, cover, every screenshot, and a trailer
⑦ Content survey      PUT /v1/games/{id}/content        ← the step people miss
⑧ Verify, then submit GET …/review, then check what no 422 checks → store.md
⑨ Submit for review   POST /v1/games/{id}/review
⑩ Live                published once review approves
```

Steps ②–⑤ are enough to see the game running — and to **share it**. A game with
a deployed build is playable at `play_url` right away: before review, during
review, and after a rejection. Send that link to anyone and they can play it, no
account needed. Steps ⑥–⑩ are what it takes to get it into the catalog.

🛑 **Reachable is not listed.** A game that has not passed review is absent from
the home page, the catalog, search, and the sitemap, and its page is
`noindex` — only people you send the link to will find it. The game object says
both, separately: `play_url` (does the address work) and `listed` (is it in the
catalog). The address is derived from `slug`, so it does not change at
publication → [sharing before you publish](references/store.md#sharing-before-you-publish)

🛑 **Step ⑧ is not optional and no error will remind you of it.** An empty
`missing_requirements` means the server has nothing left to refuse — not that
the page is finished. Untranslated listings, one lonely screenshot, and a game
that needs a keyboard all pass it.

**Step ⑦ has no equivalent on other portals.** It is a survey about what is in
the game — combat, blood, gambling, and so on — answered as sixteen yes/no
questions. Because it has nothing to do with your files, it shows up as "I
uploaded everything, why won't it submit?" → [references/store.md](references/store.md)

## 🛑 You never need the web console — except once, for the first token

Creating games, editing them, uploading images, answering the content survey,
building, releasing, rolling back, submitting for review, reading a rejection,
and resubmitting are **all available on `/v1`**. The web console is just another
client of the same API; there is no feature it has that the API lacks.

There is exactly one exception: **the first token has to be issued on the web**
(`https://cadeplay.com/console/tokens`). `POST /v1/tokens` requires a token to
call, so it cannot bootstrap itself. After that one visit, tokens can issue
tokens and you never need the console again.

## Start here — where the token lives

Publishing needs a token, and that token belongs in `.env`, never in a command
line and never in the repository. A bundled script sets that up.

```bash
bash scripts/init.sh              # current folder
bash scripts/init.sh ../mygame    # somewhere else
```

If you installed this as a plugin, `/cadeplay:init` does the same thing.

It adds a `CADEPLAY_TOKEN=` line to `.env`, puts `.env` in `.gitignore`, and
creates `.env.example`. **Running it twice is safe** — anything already there is
left alone, because it may hold a value.

🛑 **Exit code 1 is not a failure.** It means `.env` is *already tracked by
git*. Ignore rules only apply to untracked files, so in that state the file
keeps getting committed and nothing anywhere says so. Run
`git rm --cached .env` to stop the tracking, and **treat a token that was
already pushed as leaked** — revoke it with `DELETE /v1/tokens/{id}` and issue a
new one with `POST /v1/tokens`. No console visit needed.

🛑 **Never put the token on a command line, in your reply, or in a summary.**
Shell history, the conversation log, and your own logs all keep what goes there.

There is one place the value may go: **straight into `.env`.** The console's
install prompt hands you a short-lived token for exactly that — write it, say
only that `CADEPLAY_TOKEN` was set, and do not warn the user that the value was
visible. That token is deliberately short-lived, and the prompt's step 5 tells
you to trade it for a long-lived one through `POST /v1/tokens` immediately.

If the user pastes a token at you outside that flow, the same rule holds: into
`.env`, nowhere else. Read it from the file when you use it.

```bash
set -a; . ./.env; set +a
curl -H "Authorization: Bearer $CADEPLAY_TOKEN" https://cadeplay.com/v1/games
```

## Which reference to read

**Read the relevant reference before you start.** The summaries below exist to
help you pick a file, not to implement from.

### Design the controls → [references/controls.md](references/controls.md)

**Read this before writing the input layer.** Why touch is primary and the
keyboard is an accelerator, one pointer path for mouse and finger alike
(including `pointercancel`, which is why characters keep walking after the
finger lifts), the three movement schemes that work with a thumb and a mouse
without becoming two designs, pinch-zoom and pan, `touch-action: none` — without
which dragging scrolls the portal page behind your game — touch target sizing
and thumb reach, what phones do not have (hover, right-click, pointer lock,
reliable double-tap), orientation and notch safe areas, and how to declare
`controls` and `orientation`.

### Localize it → [references/localization.md](references/localization.md)

The twenty-one languages and their codes, why `CadeplaySDK.locale` is not the
player's language, and a copy-and-run language picker that matches the portal's
own matching rules — including the region-to-script table without which
Taiwanese players get Simplified Chinese. Also right-to-left for `ar` and `he`
(mirror the HUD, **not** the gameplay), fonts and how to subset them so twenty-one
languages do not exceed the archive limit, and `Intl` for numbers and plurals.

**Most importantly: how you fill all twenty-one store listings for the
developer** — the procedure, and the four rules that decide whether the result
is usable. Store listings take all twenty-one as of 2026-08-29; `default_locale`
and achievement names still take only the nine the portal has launched in.

### Package the archive → [references/build.md](references/build.md)

What has to be in the archive and what gets rejected. The entry-point rule
(`index.html` at the root or one level down), the limits (99,000,000 bytes
compressed, 400 MB extracted, 10,000 files), the rejected extensions (`.php`,
`.sh`, `.exe` — anything executable), and the rules against path traversal,
symlinks, and control characters in names. Per-engine export notes for Unity
WebGL (Brotli files and their `Content-Encoding` requirement), Godot (`.pck`),
Construct 2/3, Phaser, and plain JavaScript, plus how the engine is detected.
Read the `<base>` trap before you debug a blank screen — the server injects that
tag, so **a root-absolute path (`/assets/…`) loses the build prefix and 404s**.
Set the build tool to emit relative paths (Vite `base: './'`) before anything
else.

### Wire up the SDK → [references/sdk.md](references/sdk.md)

Every `window.CadeplaySDK` call with its **exact return values** and failure
modes. Lifecycle (`gameLoadingStart`/`Finished`, `gameplayStart`/`Stop`), ads
(`commercialBreak`, `rewardedBreak` — **not running yet, `rewardedBreak` always
returns `false`**), cloud saves (`saveData`/`loadData`), leaderboards
(`submitScore`/`getLeaderboard`), achievements
(`unlockAchievement`/`getAchievements`), and install (`install.*`), each with
code.

🛑 **Two calls answer without an `ok` field — `loadData` and
`getLeaderboard`.** Writing `r?.ok ? … : …` against either always takes the
failure branch, so cloud saves appear empty on every launch and nothing is
logged. `loadData` also returns the **JSON string** you saved, not an object.

**Skipping `gameLoadingStart` shows Unity and Godot players a black screen after
three seconds** (the non-SDK grace period expires while wasm is still
downloading), and skipping `gameLoadingFinished` leaves the loading overlay up
for eighteen. **Skipping `gameplayStart` makes `submitScore` fail outright.**
A table shows what each call returns when the game runs outside the iframe, as
an installed PWA.

### Ship it → [references/deploy.md](references/deploy.md)

The whole `/v1` path from a local archive to a live game, in curl and
JavaScript. Choosing token scopes (CI needs only `uploads:write` and
`builds:write`), creating an upload session and doing the presigned PUT, the
`complete` check, creating a build and polling its status, reading build logs,
`promote` and `rollback`, `Idempotency-Key`, and how to read an RFC 9457 error
body. It also covers **why the bytes never pass through our servers** and the
constraints that follow (presigned URLs expire in 15 minutes; five incomplete
sessions at a time). The GitHub Actions workflow is copy-and-run.

### Get it into the store → [references/store.md](references/store.md)

Store listings **in every language** (title, descriptions, **categories**) —
`PUT …/listings/{locale}` takes **all twenty-one**, so there is nothing to hold
back. Media registration (**icon, cover, and screenshots — all three are review
requirements**, and the icon doubles as the favicon), **why one screenshot
passes review and still loses players**, **the one card video slot**
(`trailer_listing` — MP4/WebM, short and silent, played on the catalog card),
the **content survey** (sixteen yes/no answers, supported languages, and a
privacy policy when the game collects account information), review submission
and its **nine requirements**, **the pre-submission checks that no 422
performs**, and **the full path back from a rejection or a hold** — reading the
reasons, fixing them, resubmitting.

### Make it installable → [references/pwa.md](references/pwa.md)

How each game gets its own PWA. The host label (`{id}.cadeplay.com`), automatic
allocation and custom requests, **the rule that it locks permanently at first
publication** and why, why the server owns the manifest (a manifest link
declared by the game is stripped), service worker registration and update
discipline (never `skipWaiting`), why cloud saves are authoritative and
IndexedDB is only a cache, and the mobile install gate
(`mobile_install_policy`) — including **why it is a UX gate and not access
control**. iOS cannot be prompted programmatically; the workaround is there too.

### Add scores and achievements → [references/scores.md](references/scores.md)

The server contract for leaderboards and achievements. A leaderboard is created
on first submission, but **achievements must be registered through `/v1`
first** — the reason for that asymmetry, and how to register them (per-language
names and descriptions, `hidden`, `set_by`). Also why `submitScore` requires
`gameplayStart` and `unlockAchievement` does not. And the part worth reading
twice: **scores and achievements sent by a client cannot be trusted**, so they
must not decide prize money, payouts, or ranking tiers. A table lists exactly
what we can and cannot prevent.

### Automate it → [references/webhooks.md](references/webhooks.md)

Receiving build, review, and stats events on your own server. The event types,
HMAC-SHA256 signature verification in PHP and Node.js, the retry schedule, and
the stats API (`/v1/games/{id}/stats`) with its daily rollups and `final` flag.
Skip signature verification and anyone can send your server a fake deploy
notification.

### Something is broken → [references/troubleshooting.md](references/troubleshooting.md)

**The failures that stay silent.** Working incorrectly with no error and no log
entry is the most common way to lose an afternoon here. Black screen, loading
overlay that never clears, missing install button, scores that never appear,
rejected achievements, uploads blocked by CORS, Unity wasm that will not start,
saves that vanish on iOS — a symptom-to-cause table. Start here when something
does not work.

## Rules for working on a Cadeplay game

**Check what cannot be undone first.** Three things here are permanent: a game's
host label (locked at first publication), its manifest `id` (derived from the
host), and the scopes of an issued token (you can only issue a new one). Confirm
with the user before touching any of them.

**Never report a failure as a success.** Publishing has many steps and can stop
at any of them. If a build is `failed`, read the reason with
`GET /v1/games/{id}/builds/{buildId}/logs` and pass it on verbatim. Saying
"uploaded" while skipping `promote` leaves the user believing their game is
live when nobody can play it.

**Keep tokens out of code, logs, and commits.** Put the token in `.env` and put
that file in `.gitignore` (`scripts/init.sh` does both). The `cdp_` prefix
exists so GitHub's secret scanner can spot a leak — it does not make a leak
harmless. Read from the file, and mask when printing: `${CADEPLAY_TOKEN:0:8}…`

**The spec outranks this skill.** The authority for the public API is
`https://cadeplay.com/console/api/openapi.yaml` (OpenAPI 3.1). Where a reference
file and the spec disagree, the spec is right. An endpoint marked
`x-status: planned` **does not work yet** — do not write code that assumes it.

## Where things are

| What | Where |
|---|---|
| Developer console | https://cadeplay.com/console |
| Issue a token | https://cadeplay.com/console/tokens |
| API guide | https://cadeplay.com/console/api |
| OpenAPI spec | https://cadeplay.com/console/api/openapi.yaml |
| API base | `https://cadeplay.com/v1` |
| Health check | `GET https://cadeplay.com/v1/health` (no auth) |
