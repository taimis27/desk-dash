# Store listing · media · review

Everything players see on the catalog and detail pages, and what it takes to get
a game approved.

## Contents

- [What review requires — nine things](#what-review-requires--nine-things)
- [Store listings (per language)](#store-listings-per-language) · [translate every listing](#-translate-every-listing-then-verify-before-submitting)
- [Media — icon, cover, screenshots, video](#media--icon-cover-screenshots-video) · [fill every screenshot slot](#-one-screenshot-passes-review-one-screenshot-does-not-get-played) · [card video](#card-video--one-slot-optional)
- [🛑 One missing icon silently blocks PWA install](#-one-missing-icon-silently-blocks-pwa-install)
- [Content survey — requirement ⑨](#content-survey--requirement-)
- [Sharing before you publish](#sharing-before-you-publish)
- [Submitting for review](#submitting-for-review) · [After a rejection or hold](#after-a-rejection-or-hold--fix-it-and-resubmit)
- [Editing game settings](#editing-game-settings)
- [Full script](#full-script)

> **This file gets you all the way to review with no web console.** Every step
> here is a `/v1` call.

---

## What review requires — nine things

All of the following must be in place before `POST /v1/games/{gameId}/review`
will accept a submission. Miss any one and you get a `422` that names exactly
which.

| # | Requirement | How you satisfy it | What the response says when it is missing |
|---|---|---|---|
| ① | A store listing in `default_locale` | `PUT /v1/games/{id}/listings/{locale}` | store listing for the default language |
| ② | `short_description` in that language | same call | a short description… |
| ③ | `description` in that language | same call | a full description… |
| ④ | At least one `category` in that language | same call | at least one category |
| ⑤ | An **icon** | `POST …/media` (`kind: icon`) | an icon (used as the home screen icon and favicon) |
| ⑥ | A **cover** image | `POST …/media` (`kind: cover`) | a cover image (the catalog thumbnail) |
| ⑦ | At least one **screenshot** | `POST …/media` (`kind: screenshot`) | at least one screenshot |
| ⑧ | A build that passed verification | run `promote` → [deploy.md](deploy.md) | a deployed build |
| ⑨ | The **content survey** | `PUT /v1/games/{id}/content` | the content questionnaire |

🛑 **⑨ is the one people miss.** No other portal asks for it, and it has nothing
to do with your game files, so it reads as "I uploaded everything, why won't it
submit?" The [content survey](#content-survey--requirement-) section below
covers it on its own.

🛑 **⑤ ⑥ ⑦ are three separate requirements.** Uploading an icon and screenshots
while forgetting the cover is a common mistake — the cover is the catalog
thumbnail, so without it your game cannot be drawn in a list. And **the icon
also serves as the favicon**; there is no separate favicon to upload.

🛑 **Media only counts once it is `ready`.** Conversion is asynchronous, so
right after registration a file is still `processing`. Submit immediately and
you get "an icon is missing" — check `status` with `GET …/media` first.

🛑 **⑦ says "at least one". Ship all of them anyway.** Passing review and
getting played are different bars, and screenshots are most of what decides the
second one → [fill every slot](#-one-screenshot-passes-review-one-screenshot-does-not-get-played)

Note that ⑧ means *deployed*, not merely *uploaded*. Before a game's first
publication the active build is what review looks at, so uploading without
`promote` gets you rejected. (Updates to a published game work the other way
round — review does the deploying.)

**Age rating (`age_rating`) is not a requirement.** The default `all` submits
fine. Set the real rating anyway: if it contradicts the game's content, that is
grounds for rejection.

## Store listings (per language)

One per language. The default language must exist; a request for a language with
no listing falls back to it.

> 🛑 **"The rest are optional" is a fact about the API, not permission to skip
> them.** Write the listing in **every language the portal accepts**, and see
> [translate every listing](#-translate-every-listing-then-verify-before-submitting)
> below before you submit.

```bash
curl -X PUT "https://cadeplay.com/v1/games/$GAME_ID/listings/en" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Space Runner",
    "short_description": "Run through an endless universe. A one-thumb runner.",
    "description": "## Controls\n\nTap to jump.\n\n## Features\n\n- Endless stages\n- Online ranking",
    "keywords": ["runner", "arcade", "one-hand", "endless"],
    "categories": ["arcade", "casual"],
    "what_is_new": "Three new stages and a boss fight."
  }'
```

| Field | Required | Limit | Where it shows |
|---|---|---|---|
| `title` | ✅ | 50 chars | Card, detail page, browser tab |
| `short_description` | ✅ | 120 chars | **The one line on a catalog card** |
| `description` | **review requires it in the default language** | 4000 chars, Markdown | Detail page body |
| `keywords` | | 10 items, 25 chars each | Search |
| `categories` | **review requires ≥1 in the default language** | 3 items | Category listings |
| `what_is_new` | | 500 chars | Changes in this version |

🛑 **Two different meanings of "required" above.** `title` and
`short_description` cannot be *saved* without; `description` and `categories`
save fine but **block review submission** when absent from the default
language. In other languages both are optional.

**Category values** (only these):

```
action  puzzle  arcade  strategy  sports  racing
rpg     simulation  casual  io  horror  educational
```

`description` supports basic Markdown — headings (`##`), lists (`-`), bold
(`**`), links. HTML is stripped.

### 🛑 Translate every listing, then verify before submitting

A store listing is what a player reads **before** deciding to click. In the
languages you did not write, they read the English one — which for most of the
portal's visitors means they read nothing and move on. The game itself being
localized does not help if the page that sells it is not.

**Write all twenty-one.** They are short — a title, one line, a description, and
a few categories.

| Code | Language | | Code | Language | | Code | Language |
|---|---|---|---|---|---|---|---|
| `en` | English | | `id` | Indonesian | | `nl` | Dutch |
| `ko` | Korean | | `th` | Thai | | `zh-hant` | Chinese (Traditional) |
| `zh` | Chinese (Simplified) | | `fr` | French | | `ar` | Arabic |
| `ja` | Japanese | | `it` | Italian | | `he` | Hebrew |
| `pt` | Portuguese (Brazil) | | `pl` | Polish | | `hi` | Hindi |
| `es` | Spanish | | `uk` | Ukrainian | | `ru` | Russian |
| `tr` | Turkish | | `de` | German | | | |

#### All twenty-one are accepted — a 422 means your content is wrong

`PUT …/listings/{locale}` takes **every language in the table above**. There is
nothing to hold back and nothing to retry later.

🛑 **So treat a 422 as a real failure and read the body.** It is telling you
about *this* listing — a `title` over 50 characters, a `short_description` over
120, a `categories` value that is not one of the twelve, an unescaped `<` or `>`
in the title — and every one of those is something you can fix right now. A
script that swallows 422 publishes a game whose German page is silently empty,
and **nothing on our side records that.**

```bash
#!/usr/bin/env bash
# push-listings.sh — write every translation. A failure is a failure.
set -euo pipefail
: "${CADEPLAY_TOKEN:?}" "${GAME_ID:?}"

ALL="en ko zh ja pt es tr vi id th fr it pl uk de nl zh-hant ar he hi ru"
MISSING=""

for loc in $ALL; do
  if [ ! -f "listings/$loc.json" ]; then
    MISSING="$MISSING $loc"; echo "  ✗ $loc  — no translation file"; continue
  fi

  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' \
    -X PUT "https://cadeplay.com/v1/games/$GAME_ID/listings/$loc" \
    -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
    --data @"listings/$loc.json")

  case "$code" in
    200|201) echo "  ✓ $loc" ;;
    *)       echo "  ✗ $loc  — HTTP $code"; cat "$body"; rm -f "$body"; exit 1 ;;
  esac
  rm -f "$body"
done

# a language with no file is not an error, but it must not pass unnoticed
[ -z "$MISSING" ] || { echo "  ⚠ untranslated:$MISSING"; exit 1; }
```

**Keep every translation in the repository.** A translation that only ever lived
in a chat window is a translation you will pay for twice.

#### Verify before you submit — this is a required step

Do not submit for review with half-written translations. Once it is live, a
broken listing is what a player sees, and nobody reports it — they just leave.

```bash
# what is actually stored, per language
curl -sS "https://cadeplay.com/v1/games/$GAME_ID/listings" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  | jq -r '.data[] | [.locale, (.title // "—"), ((.short_description // "") | length),
                      ((.description // "") | length), ((.categories // []) | length)] | @tsv'
```

Check each row, in the language itself:

- [ ] `title` is translated — **not the English title copied across**
- [ ] `short_description` is present, under 120 characters **after** translation
      (German and Russian overrun an English line that just fits)
- [ ] `description` reads naturally and its Markdown survived
- [ ] `categories` present — **the values stay in English** (`arcade`, `puzzle`);
      they are enum keys, not display text, and translating them fails validation
- [ ] `keywords` are in that language — English keywords do not match what a
      Korean or Turkish player types into search
- [ ] No placeholder text, no `TODO`, no untranslated fragment mid-sentence
- [ ] The language is the right one — an off-by-one in a loop puts Spanish under
      `pt`, and nothing on our side will ever tell you

🛑 **Machine translation is fine; unreviewed machine translation of the *title*
is not.** Titles are short enough to be mangled beyond recognition, and the
title is the one string players search for. Read all twenty-one titles yourself
before submitting.

🛑 **Review only requires the default language.** Everything above is beyond what
the `422` will tell you — so nothing checks it but you.

### Reading and deleting

```bash
# every language
curl "https://cadeplay.com/v1/games/$GAME_ID/listings" -H "Authorization: Bearer $CADEPLAY_TOKEN"

# one language
curl "https://cadeplay.com/v1/games/$GAME_ID/listings/en" -H "Authorization: Bearer $CADEPLAY_TOKEN"

# delete — the default language cannot be deleted
curl -X DELETE "https://cadeplay.com/v1/games/$GAME_ID/listings/ja" -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

### Writing a good `short_description`

It is the only sentence most players read. 120 characters.

| | |
|---|---|
| ❌ | "The best game ever! Download now!!" — says nothing about the game |
| ❌ | "A runner game" — true and useless |
| ✅ | "Run through an endless universe. A one-thumb runner." — what you do, how it plays |

Say what the player does. Skip the adjectives.

## Media — icon, cover, screenshots, video

Media uses the same upload pipeline as builds. Upload the file, get it to
`verified`, then attach that `upload_id` to the game.

```
POST /v1/uploads                  (purpose: "image" — or "video" + media_kind)
PUT  {presigned}
POST /v1/uploads/{id}/complete
POST /v1/games/{gameId}/media     (kind, upload_id)
```

### Specifications

| Kind | Slots | Upload `purpose` | Review | Notes |
|---|---|---|---|---|
| `icon` | 1 | `image` | **required** | **must be square**, longest side ≥ 512px |
| `cover` | 1 | `image` | **required** | longest side ≥ 640px. Brand art — logo, key art |
| `screenshot` | several | `image` | **≥ 1 required** | longest side ≥ 640px. **Fill every slot** |
| `screenshot_listing` | 1 | `image` | | The gameplay still shown **on the catalog card** |
| `trailer_listing` | 1 | `video` | | Short, **silent** clip played on card hover |
| `trailer_intro` | — | — | | 🛑 **Retired.** See below |
| `trailer` | — | — | | 🛑 **Retired.** Sending it returns 422 naming `trailer_listing` |

🛑 **There is no intro video, and you should not make one.** A Cadeplay game
**runs on its own detail page** — the player clicks the card and it starts.
Steam needs a trailer because installing and paying stand between the shopper
and the game; here nothing does, so **the play session is the trailer**. Putting
a video above a game that is already running tells the visitor nothing new.

The one video we take is `trailer_listing`, and it exists for people who have
**not yet opened the page** — it plays on the catalog card. Sending
`trailer_intro` returns 422 pointing you at it.

🛑 **`cover` and `screenshot_listing` are not the same picture.** The cover is
your **brand** — logo, key art, the thing that says which game this is. The
listing screenshot is **actual play**. Steam splits these the same way, and the
catalog draws them in different places. Sending key art as both means the card
never shows anyone what the game looks like.

🛑 **There is no separate favicon API — `icon` covers that too.** The same image
becomes the home screen icon (PWA manifest), the browser tab favicon, and the
catalog icon. That is why it has to be square.

🛑 **Do not hard-code the slot counts or size limits into a deploy script.**
They move — the screenshot count was widened once already — and a number copied
into a script goes stale with no error. Read them from
`https://cadeplay.com/console/api/openapi.yaml`, or keep registering until the
API answers **409 too many**; that response is the authority and it follows the
limit when it changes.

### 🛑 One screenshot passes review. One screenshot does not get played.

The review requirement is **at least one**. That is the floor, not the target.

The catalog card, the detail page, and every share preview are built from these
images — they are the entire basis on which somebody decides to click a game
they have never heard of. A game with one screenshot next to a game with eight
loses, and the difference is not the game.

**Fill every slot.** Treat "one screenshot" the way you would treat a store page
with no description.

If you are an AI working on this game, do not quietly settle for the minimum:

1. Count what is already registered — `GET /v1/games/{id}/media`
2. If the screenshot slots are not full, **say so and ask the developer for the
   rest**, naming how many are missing
3. **Offer to make them — and mean it.** You have a browser and `ffmpeg`; this is
   faster than the developer digging through folders. Two ways, both ordinary work:

   ```bash
   # A. play it and screenshot — serve the build, open it, capture at good moments
   python3 -m http.server 8123 --directory ./dist
   #   then drive the page and screenshot with your browser tooling

   # B. record once, harvest stills from the recording
   ffmpeg -ss 7 -i raw.mov -frames:v 1 -vf "scale=1920:-2" -q:v 3 shot-01.jpg
   #   repeat with different -ss for each moment (measured: ~100 KB per shot)
   ```

   **B is usually better.** One recording gives you the trailer *and* every
   screenshot, and the stills are guaranteed to be real gameplay from the same
   session. `-q:v 3` lands around 100 KB at 1920×1080 — far under the 1 MB cap.
4. Only stop when the slots are full or the developer says stop

What makes a screenshot worth a slot:

| ✅ | ❌ |
|---|---|
| Actual gameplay, mid-action | The title screen, the menu, the loading screen |
| Different moments — levels, mechanics, enemies, UI | Eight shots of the same room |
| Legible at thumbnail size | Fine detail that dissolves when scaled down |
| The default language, or the game's `default_locale` | A language nobody browsing can read |
| No debug overlays, FPS counters, or placeholder art | A watermark, a dev console, `TODO` text |

Register them in the order you want them shown — `position` starts at 0, and
position 0 is the one the detail page opens on.

**And set `screenshot_listing`** — one gameplay still, the one shown on the
catalog card. Without it the card falls back to your `cover`, which is brand
art: the player scrolling the catalog never sees what the game actually looks
like. It is a separate `kind`, not a screenshot at position 0.

### Card video — one slot, optional

A short gameplay clip is the strongest thing you can put on a catalog card.
**There is exactly one video slot**, and it is optional:

| | `trailer_listing` |
|---|---|
| Where | Catalog card, played on hover |
| Length | **≤ 20 seconds** |
| Size | **≤ 8,000,000 bytes** |
| Audio | 🛑 **stripped by the server** |
| Container | MP4 (H.264) or WebM (VP9) |

**Skipping it costs you nothing structural.** With no video the card shows your
`screenshot_listing`; with neither, your `cover`; with none of the three, the
first letter of the title. So the honest ranking of effort is:
**`screenshot_listing` first, video second.** A card with a good gameplay still
beats a card with a bad video.

**The audio row is a design constraint, not a limitation.** Card videos play
without sound — nobody browsing a catalog wants ten videos talking at once — so
anything communicated only through audio is lost. Put it on screen. You do not
have to strip it yourself; the server does it.

**A poster frame is generated for you** (from one second in), so the card has
something to show before the video plays. You do not upload one.

🛑 **The format is judged from the actual bytes, not from what you declare.**
The `content_type` you send and the file extension are both yours to choose, so
neither is trusted. A `.mp4` that is really a `.mov` is rejected as a `.mov`.

#### If you are an AI: ask, and offer to make it

Most developers do not have a trailer, and most will say yes if offered one.

> "Do you want a gameplay video for the store page? I can record one — play
> through a few good moments, cut 15–20 seconds, and encode it. It plays on the
> catalog card, silent, so I'll make sure nothing important is audio-only."

Producing it is ordinary work, and you can do all of it headless.

**Step 1 — record a real run.** Serve the build, drive it, capture the page.
Playwright records the whole page to WebM without any screen-capture permission,
which is what makes this work on a build server:

```js
// record.mjs — measured: 22s of 1280×720 came out at 3.3 MB before re-encoding
import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: './rec', size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);        // let the engine draw its first frame

await page.click('#start-btn');         // whatever starts YOUR game
await page.waitForTimeout(800);

// Play it. Most casual games need far less input than you expect — steer and
// the game does the rest. Check the on-screen control hints first.
const t0 = Date.now();
await page.mouse.move(640, 360);
await page.mouse.down();
while (Date.now() - t0 < 22_000) {
  const t = (Date.now() - t0) / 1000;
  await page.mouse.move(640 + Math.sin(t * 0.9) * 420, 340 + Math.sin(t * 1.7) * 150);
  await page.waitForTimeout(33);
}
await page.mouse.up();

await context.close();                  // ← the video is only flushed here
await browser.close();
```

🛑 **`context.close()` is what writes the file.** Kill the process without it and
you get a truncated or empty WebM, and nothing tells you — you find out when
`ffprobe` reports a duration you did not record.

🛑 **Record longer than you need, then cut.** The first seconds are a title
screen or a "wave incoming" banner, not gameplay. Recording 22s and keeping
18s from the 4s mark is why the clip below opens on action.

🛑 **Watch what you recorded before you upload it.** Pull four frames and look:

```bash
for t in 2 6 10 14; do ffmpeg -v error -ss $t -i rec/*.webm -frames:v 1 -q:v 3 chk-$t.jpg; done
# a frame that compresses to ~1 KB is a black screen. Real gameplay lands 10–30 KB.
```

This is not a formality. A published game on this platform shipped a trailer
that was **black from 5 seconds onward for 4 minutes** — the poster frame was
fine, so the card looked correct until someone hovered it. Nothing errored.

**Step 2 — cut and encode.**

**MP4 (H.264)** — the safe default, plays everywhere including Safari:

```bash
# -ss 4 skips the title card; -t 18 leaves headroom under the 20s cap.
# -an because the server strips audio anyway.
ffmpeg -ss 4 -i rec/*.webm -t 18 -an -vf "scale=1280:-2,fps=30" \
       -c:v libx264 -crf 24 -preset slow -movflags +faststart trailer-listing.mp4
```

**WebM (VP9)** — smaller at the same quality, and the server accepts it equally:

```bash
# measured 666 KB from the 22s 720p recording above — 8 % of the 8 MB cap
ffmpeg -ss 4 -i rec/*.webm -t 18 -an -vf "scale=1280:-2,fps=30" \
       -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
       trailer-listing.webm
```

If the source has audio and you would rather keep the command simple, drop
`-an` — the server removes the track during processing either way. WebM cannot
carry AAC, so use `-c:a libopus -b:a 128k` if you do keep it.

🛑 **`-b:v 0` is not optional with VP9.** Without it `-crf` is treated as a
ceiling on a bitrate target rather than a quality target, and the file comes out
several times larger for no visible gain. `-row-mt 1` is what keeps the encode
from taking minutes.

🛑 **One slot, one file.** Do not upload the same video as both MP4 and WebM
"for compatibility" — each slot holds one file, and a second upload spends the
slot rather than adding a fallback. Pick one; MP4 if you are unsure.

Check the size before uploading — the limits are hard, and `-crf` is the dial
(higher is smaller). Keep the files in the repository so re-uploading later
costs nothing.

> Numbers above are measured, not estimated: a 25-second 1920×1080 source
> produced **3.8 MB** as a silent 20-second VP9 WebM on 2026-08-29. The same
> source with Opus audio and a 90-second cap came out at 6.7 MB — still under
> the limit, but there is no slot that long any more.

#### Uploading one

Same four steps as an image, with **two differences that will stop you** if you
copy the image flow:

🛑 **`purpose` is `video`, not `image`.** That is what sets the size limit on the
session. `media_kind` is optional now that `trailer_listing` is the only video
kind — send it anyway if your script already does, it still validates.

⚠️ **It used to be mandatory, and the session limit used to be 30 MB.** Both
changed on 2026-08-29 when the intro slot was retired. A script that still sends
`media_kind: "trailer_listing"` keeps working; one that sends `"trailer_intro"`
now gets a 422 telling it why.

```bash
SIZE=$(wc -c < trailer-listing.mp4)

SESSION=$(curl -sS -X POST https://cadeplay.com/v1/uploads \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
  -d "{\"purpose\":\"video\",\"media_kind\":\"trailer_listing\",
       \"filename\":\"trailer-listing.mp4\",\"size_bytes\":$SIZE,
       \"content_type\":\"video/mp4\"}")

UPLOAD_ID=$(echo "$SESSION" | jq -r .id)

curl -sS -X PUT "$(echo "$SESSION" | jq -r .upload_url)" \
  -H "Content-Type: video/mp4" --data-binary @trailer-listing.mp4

curl -sS -X POST "https://cadeplay.com/v1/uploads/$UPLOAD_ID/complete" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"

curl -sS -X POST "https://cadeplay.com/v1/games/$GAME_ID/media" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
  -d "{\"kind\":\"trailer_listing\",\"upload_id\":\"$UPLOAD_ID\"}"
```

🛑 **A session opened for one kind cannot be spent on another.** A `screenshot`
session (1 MB) registered as an `icon` (2 MB) is refused — otherwise the tighter
limit would be one substitution away from meaningless. The same rule guards
videos if a second video kind ever appears.

**Processing is asynchronous and it can fail after the upload succeeded.**
Transcoding runs in a sandbox with no network; a file that is not really the
format it claims, or is longer than the slot allows, ends `failed` there rather
than at upload time. Poll `GET …/media` and read `status` — do not assume a
`201` from the attach call means the video is live.

### Registering

```bash
# ① upload session
SIZE=$(wc -c < icon.png)
SESSION=$(curl -sS -X POST https://cadeplay.com/v1/uploads \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
  -d "{\"purpose\":\"image\",\"filename\":\"icon.png\",\"size_bytes\":$SIZE,\"content_type\":\"image/png\"}")

UPLOAD_ID=$(echo "$SESSION" | jq -r .id)
UPLOAD_URL=$(echo "$SESSION" | jq -r .upload_url)

# ② PUT
curl -sS -X PUT "$UPLOAD_URL" -H "Content-Type: image/png" --data-binary @icon.png

# ③ verify
curl -sS -X POST "https://cadeplay.com/v1/uploads/$UPLOAD_ID/complete" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"

# ④ attach to the game
curl -sS -X POST "https://cadeplay.com/v1/games/$GAME_ID/media" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
  -d "{\"kind\":\"icon\",\"upload_id\":\"$UPLOAD_ID\"}"
```

🛑 **`purpose` is `image` for pictures and `video` for the two trailer slots.**
(`media` still works as an alias for `image`, from before the split — new code
should say `image`.) A session opened as one cannot carry the other; the check
runs at session creation *and* again at attach, so a mismatch never costs you
the upload bandwidth.

Fields on `POST …/media`:

| Field | Required | Notes |
|---|---|---|
| `kind` | ✅ | `icon` · `cover` · `screenshot` · `screenshot_listing` · `trailer_listing` |
| `upload_id` | ✅ | an upload session in **`verified`** state, opened for a matching purpose |
| `locale` | | for language-specific screenshots |
| `position` | | screenshot order, from 0 |
| `alt_text` | | 200 chars. Accessibility and SEO |

**Conversion is asynchronous.** Right after registration the file may still be
processing. Check with `GET …/media` — "I uploaded it but it does not show up"
is almost always conversion that has not finished.

```bash
curl "https://cadeplay.com/v1/games/$GAME_ID/media" -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

### Reordering and deleting

```bash
curl -X PATCH "https://cadeplay.com/v1/games/$GAME_ID/media/$MEDIA_ID" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"position": 0}'

curl -X DELETE "https://cadeplay.com/v1/games/$GAME_ID/media/$MEDIA_ID" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN"
```

These work at every stage, including while a review is `pending` — see
[editing during review](#you-can-edit-at-every-stage-including-during-review).

## 🛑 One missing icon silently blocks PWA install

Measured in a browser, not inferred.

**Chrome never fires `beforeinstallprompt` when there is no icon of at least
192px.** The failure is completely quiet: the manifest returns 200, the service
worker registers, the console shows nothing, every request succeeds. The install
button simply never appears.

We give games without an icon a default one so install is not blocked outright,
but the default is generic. Upload a real icon — it is a review requirement
anyway.

Three things that break installability, all silently:

| What | Result |
|---|---|
| No icon ≥ 192px | No install prompt, no error anywhere |
| Icon on a different origin | The fetch fails, installability disappears |
| `type` not matching the real format | The browser may discard the icon |

We handle the last two for you; the first is on you.

## Content survey — requirement ⑨

**You declare what is in the game.** Age rating, category visibility, and ad
policy are decided from these answers. It is a review requirement, so it has to
be filled in at least once.

```
GET /v1/games/{gameId}/content     read it (everything null when untouched)
PUT /v1/games/{gameId}/content     save — partial updates are fine
```

`PUT` only changes the fields you send, so you can fill it in over several
calls. The scope is `games:write`.

### The sixteen yes/no answers

**Every one must be `true` or `false`.** A single `null` (unanswered) blocks
submission with a 422 that tells you how many are left.

| Group | Fields |
|---|---|
| How it is played | `single_player` · `multiplayer` · `pvp` · `coop` |
| Progression | `level_up` · `character_stats` |
| Depiction | `realistic_graphics` · `has_combat` · `blood` · `violence` · `horror` |
| Sensitive | `adult_content` · `gambling_real_money` · `gambling_simulated` |
| Audience | `child_directed` · `family_friendly` |

🛑 **"Not applicable" is still an answer.** A puzzle game with no fighting still
has to send `has_combat: false`. Leaving it out means "not answered yet" — we
distinguish *unanswered* from *answered no*.

### If there is combat, say what kind

If you answered `has_combat: true`, at least one of these must be `true`. If you
answered `false`, they are not asked about.

| Field | What |
|---|---|
| `combat_melee` | Hand-to-hand, blunt weapons |
| `combat_blade` | Bladed weapons |
| `combat_firearm` | Guns |

### Supported languages — declare all of them

```jsonc
"supported_locales": [
  "en","ko","zh","ja","pt","es","tr","vi","id","th","fr",
  "it","pl","uk","de","nl","zh-hant","ar","he","hi","ru"
]
```

The languages **the game itself displays** — a different thing from the
languages your store listing has, and it takes **all twenty-one**, including the
twelve the portal has not launched its own UI in. An empty list blocks
submission.

🛑 **A game should display all twenty-one, and this field should list all
twenty-one.** Players filter the catalog by it. Declaring English only puts your
game behind a filter that most of the portal's visitors have switched on.

How to build the game that way — browser language detection, right-to-left,
fonts, and **how you fill all twenty-one listings for the developer** →
[references/localization.md](localization.md)

### Collecting account information requires a privacy policy

```jsonc
"collects_account_info": true,
"privacy_policy_url": "https://example.com/privacy"   // required in that case
```

With `collects_account_info: true` and no `privacy_policy_url`, submission is
refused. `signup_url` is optional — use it when the game has its own sign-up
page.

🛑 **Both URLs accept `http`/`https` only.** They are rendered as links, so
`javascript:` is rejected.

### Filling it in one call

The minimum for a single-player puzzle game with no combat and no adult content:

```bash
curl -sS -X PUT "https://cadeplay.com/v1/games/$GAME_ID/content" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "single_player": true,  "multiplayer": false,
    "pvp": false,           "coop": false,
    "level_up": true,       "character_stats": false,
    "realistic_graphics": false,
    "has_combat": false,    "blood": false,
    "violence": false,      "horror": false,
    "adult_content": false,
    "gambling_real_money": false,
    "gambling_simulated": false,
    "child_directed": false, "family_friendly": true,
    "collects_account_info": false,
    "supported_locales": [
      "en","ko","zh","ja","pt","es","tr","vi","id","th","fr",
      "it","pl","uk","de","nl","zh-hant","ar","he","hi","ru"
    ]
  }'
```

### Checking what is left

```bash
curl -sS "https://cadeplay.com/v1/games/$GAME_ID/content" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" | jq
```

Any field that is `null` has not been answered. Checking here before you submit
saves a 422 round trip.

## Sharing before you publish

**A game with a deployed build is playable at its address right away — before
review, during review, and after a rejection.** Send that link to anyone and
they can play it in the browser, with no account.

```bash
curl -sS "https://cadeplay.com/v1/games/$GAME_ID" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" | jq '{play_url, listed, status}'
```

```json
{ "play_url": "https://cadeplay.com/g/neon-runner", "listed": false, "status": "in_review" }
```

| Field | Answers |
|---|---|
| `play_url` | **Does the address work?** Present as soon as a build is deployed |
| `listed` | **Is the game in the catalog?** `true` only after review approves it |

🛑 **These are two different questions — do not read one as the other.** Getting
a `play_url` is not publication. A game that has not passed review is absent
from the home page, the catalog, search, and our sitemap, and its page carries
`noindex, nofollow`. Only people you send the link to will find it.

🛑 **The address does not change when the game is approved.** It is derived from
`slug`, so a link you shared during development keeps working after launch. You
never have to re-share.

🛑 **Visitors are told the game is not listed yet.** A line at the top of the
page says so — but not *why*. Whether a game is awaiting review or was turned
down stays between you and us.

**`play_url` is `null` in exactly two cases:**

| Cause | What to do |
|---|---|
| No deployed build | `promote` a build → [deploy.md](deploy.md) |
| The game was suspended by an operator | The link is closed on purpose. Contact us |

A **rejection does not close the link.** `rejected` means "not in the catalog",
not "taken down" — you keep fixing and showing it around while you work toward
resubmission. A game that genuinely has to come down gets `suspended`, and that
closes both the catalog entry and the link.

**Saves, scores, and achievements work on the shared link too.** They use the
same reachability rule the page does, so a friend playing your unreleased build
gets real cloud saves and real leaderboard entries — the feedback you get is
about the game people will actually play.

## Submitting for review

```bash
curl -X POST "https://cadeplay.com/v1/games/$GAME_ID/review" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "notes": "Test account: guest / 1234. The boss appears on stage 3."
  }'
```

`notes` (2000 chars) goes to the reviewer. If something needs a login or only
appears under certain conditions, say so here. **Without it a reviewer may never
see that content and reject the game over it.**

| Response | Meaning |
|---|---|
| `202` | Accepted |
| `409` | Already under review, or the game is in a state that cannot be submitted |
| `422` | Requirements not met — the list is in the response |

🛑 **A published game stays `published` while its update is under review.** The
game does not drop out of the catalog and players keep playing the current
version. Only a game that has never been published moves to `in_review`.

### 🛑 Ask before you submit

The same endpoint answers **GET** with `missing_requirements`. You can find out
what is missing without a failed submission.

```bash
curl -sS "https://cadeplay.com/v1/games/$GAME_ID/review" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" | jq .missing_requirements
# []  ← empty means you can submit
```

In CI, check this and submit only when it is empty. That removes one whole
failure round trip.

#### 🛑 An empty `missing_requirements` is not "ready to submit"

It means the **server** has nothing left to refuse. It says nothing about
whether the page is any good, and everything below is invisible to it — no 422
will ever mention any of it, and a reviewer approving a thin listing does not
make it work.

Run this list before every submission, including resubmissions:

| Check | How |
|---|---|
| **Every language written** | `GET …/listings` → one row per accepted locale, none half-empty → [translate every listing](#-translate-every-listing-then-verify-before-submitting) |
| **Translations read correctly** | Look at each `title` and `short_description` in the language itself. Machine output goes wrong shortest-first, and the title is the shortest |
| **Screenshot slots full** | `GET …/media` → not one screenshot, all of them → [fill every slot](#-one-screenshot-passes-review-one-screenshot-does-not-get-played) |
| **All media `ready`** | Same call → no `processing`, no `failed` |
| **`supported_locales` complete** | `GET …/content` → matches what the game actually displays |
| **Playable with one thumb** | No keyboard anywhere in the path → [references/controls.md](controls.md) |
| **`controls` and `orientation` honest** | `GET /v1/games/{id}` → `touch` is in the list, and the orientation matches reality |
| **Trailer uploaded** | `GET …/media` → `trailer_listing` present and `ready`. It is the strongest thing on the page and most games do not have one |
| **Listing screenshot set** | `screenshot_listing` present — otherwise the card shows brand art, not play |

If you are an AI submitting on a developer's behalf: **run this list, report what
is thin, and ask before submitting anyway.** Submitting is not the goal —
"submitted a listing nobody clicks" and "did not submit" cost the same.

### Reading the result

```bash
curl -sS "https://cadeplay.com/v1/games/$GAME_ID/review" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" | jq
```

| Field | What |
|---|---|
| `status` | `not_submitted` · `pending` · `on_hold` · `approved` · `rejected` |
| `submitted_at` · `decided_at` | Timestamps |
| `rejection_reasons` | **Why it was rejected or held.** This is your to-do list |
| `decision_notes` | A free-text note from the reviewer |
| `previous_decision` | **The decision before this one** — where the reasons go after you resubmit |
| `missing_requirements` | What is missing right now |

Results also arrive by webhook — `review.approved`, `review.rejected`,
`review.held` → [webhooks.md](webhooks.md)

### After a rejection or hold — fix it and resubmit

There are three outcomes. **Two of them are recoverable.**

| Outcome | Game state | What happens next |
|---|---|---|
| `approved` | `published` | Done. It goes live |
| `rejected` | `rejected` | Fix it and **submit again** |
| `on_hold` | stays `in_review` | Held for changes — fix what was asked and **submit again** |

```bash
# ① read the reasons
curl -sS "https://cadeplay.com/v1/games/$GAME_ID/review" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  | jq '{status, rejection_reasons, decision_notes}'

# ② fix whatever was named — listing, media, content survey, build, anything

# ③ submit again, same endpoint
curl -sS -X POST "https://cadeplay.com/v1/games/$GAME_ID/review" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"notes": "Replaced the screenshot you flagged."}'
```

🛑 **After you resubmit, the old reasons live in `previous_decision`.** The
moment you submit, `rejection_reasons` belongs to the new (empty, `pending`)
review and reads as `[]`. If your CI reads the reasons, read that field.

🛑 **`rejected` and `on_hold` continue differently.** A rejection starts a new
review row; a hold **resumes the existing one** (and re-points it at whatever
build is current now). What you do is the same either way, but the distinction
matters if you track review history.

### You can edit at every stage, including during review

The listing, media, and content survey stay writable no matter what the review
is doing. Fixing a typo never means waiting days for a decision.

| Review state | Can you edit content? | Can you `promote` a build? |
|---|---|---|
| `pending` | ✅ yes | ❌ **409** |
| `on_hold` | ✅ yes | ❌ **409** |
| `rejected` · `not_submitted` | ✅ yes | ✅ before first publication |
| approved / `published` | ✅ yes — then submit again for review | ❌ approval deploys |

🛑 **This changed on 2026-08-29.** Content edits used to return `409` while a
review was `pending`.

**What the reviewer sees.** Editing during a `pending` review is recorded on
the review, and the reviewer's queue flags it as `edited` with the time of the
last change. The review detail shows each changed field side by side —
submitted next to current — so they read what changed before deciding.

**Why approval can still fail.** The reviewer approves with a fingerprint of
the content they were looking at. If you edit between their page load and
their click, approval is refused and they reload to see your change. So an
edit never blocks approval permanently — it only makes sure nobody publishes
something they never read. Nothing is required of you here.

🛑 **Deploying a build is the exception.** `promote` returns `409` while a
review is `pending`. A code change cannot be shown to a reviewer as a diff —
they would have to play the game again — so that one still waits for the
decision. Uploading and building are fine; only the release pointer is held.

### When resubmission is accepted

| Game state | Can you submit? |
|---|---|
| `draft` · `rejected` | ✅ |
| `in_review` | only while the review is `on_hold` ✅ |
| `published` · `unlisted` | ✅ — an update review. **The current version keeps serving** |
| `suspended` · `deleting` | ❌ 409 |

For updates to a published game, approval does the deploying — you cannot call
`promote` yourself and will get a 409. Players stay on the previous version
throughout.

## Editing game settings

```bash
curl -X PATCH "https://cadeplay.com/v1/games/$GAME_ID" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orientation": "landscape", "age_rating": "12+"}'
```

| Field | Values | Notes |
|---|---|---|
| `slug` | `^[a-z0-9]+(-[a-z0-9]+)*$` | Portal URL. Changing it breaks old links |
| `orientation` | `any` · `portrait` · `landscape` | Mobile rotation hint |
| `controls` | `touch` `keyboard` `mouse` `gamepad` | Shown as icons on the card |
| `threading` | `single` · `multi` | `multi` only works at top level |
| `age_rating` | `all` · `12+` · `15+` · `18+` | Not a review requirement (default `all`), but a mismatch with the content is grounds for rejection |
| `default_locale` | locale code | The fallback language |
| `monetization.ads_enabled` | boolean | Interstitial ads |
| `monetization.rewarded_ads_enabled` | boolean | Rewarded ads |

🛑 **`visibility` and `mobile_install_policy` are not accepted yet.** They appear
in the OpenAPI schema, but the endpoint does not validate them — send them and
you get a 200 with the value discarded. Do not build on them until the spec
drops the `x-status: planned` marker.

This endpoint works during review too. Changing `age_rating` while a review is
`pending` is recorded and shown to the reviewer like any other edit.

## Full script

Takes one game from nothing to submitted.

```bash
#!/usr/bin/env bash
# publish.sh — listing, media, content survey, review submission
set -euo pipefail
: "${CADEPLAY_TOKEN:?}" "${GAME_ID:?}"
API="https://cadeplay.com/v1"
AUTH="Authorization: Bearer $CADEPLAY_TOKEN"
api() { curl -sS -H "$AUTH" -H "Content-Type: application/json" "$@"; }

# upload one file and attach it as media
upload_media() {
  local file="$1" kind="$2" type="$3"
  local size sid url s

  size=$(wc -c < "$file")
  s=$(api -X POST "$API/uploads" -d "{
    \"purpose\":\"image\",\"filename\":\"$(basename "$file")\",
    \"size_bytes\":$size,\"content_type\":\"$type\"}")

  sid=$(echo "$s" | jq -r .id)
  url=$(echo "$s" | jq -r .upload_url)

  curl -sS -X PUT "$url" -H "Content-Type: $type" --data-binary @"$file" >/dev/null
  api -X POST "$API/uploads/$sid/complete" >/dev/null
  api -X POST "$API/games/$GAME_ID/media" -d "{\"kind\":\"$kind\",\"upload_id\":\"$sid\"}" >/dev/null

  echo "  ✓ $kind ← $file"
}

echo "▸ game settings"
api -X PATCH "$API/games/$GAME_ID" -d '{"age_rating":"all","orientation":"landscape"}' >/dev/null

echo "▸ store listing (en)"
api -X PUT "$API/games/$GAME_ID/listings/en" -d '{
  "title": "Space Runner",
  "short_description": "Run through an endless universe. A one-thumb runner.",
  "description": "## Controls\n\nTap to jump.\n\n## Features\n\n- Endless stages\n- Online ranking",
  "categories": ["arcade", "casual"]
}' >/dev/null

echo "▸ media — all three kinds are required"
upload_media assets/icon.png       icon       image/png
upload_media assets/cover.png      cover      image/png
upload_media assets/shot-1.png     screenshot image/png
upload_media assets/shot-2.png     screenshot image/png

# 🛑 Media only counts once conversion finishes. Submitting straight after
#    upload gets you "an icon is missing".
echo "▸ waiting for image conversion"
PENDING=1
for _ in $(seq 1 30); do
  PENDING=$(api "$API/games/$GAME_ID/media" | jq '[.data[] | select(.status != "ready")] | length')
  FAILED=$(api "$API/games/$GAME_ID/media" | jq '[.data[] | select(.status == "failed")] | length')
  [ "$FAILED" = "0" ] || fail "$FAILED media file(s) failed conversion — check GET …/media"
  [ "$PENDING" = "0" ] && break
  sleep 2
done
# 🛑 The loop ending is not the same as the work finishing.
[ "$PENDING" = "0" ] || fail "timed out with $PENDING still converting"
echo "  ✓ all ready"

# 🛑 The content survey. No other portal asks for this, so it is the step
#    people skip. All sixteen answers are required — "no" is an answer.
echo "▸ content survey"
api -X PUT "$API/games/$GAME_ID/content" -d '{
  "single_player": true,  "multiplayer": false,
  "pvp": false,           "coop": false,
  "level_up": true,       "character_stats": false,
  "realistic_graphics": false,
  "has_combat": false,    "blood": false,
  "violence": false,      "horror": false,
  "adult_content": false,
  "gambling_real_money": false,
  "gambling_simulated": false,
  "child_directed": false, "family_friendly": true,
  "collects_account_info": false,
  "supported_locales": [
    "en","ko","zh","ja","pt","es","tr","vi","id","th","fr",
    "it","pl","uk","de","nl","zh-hant","ar","he","hi","ru"
  ]
}' >/dev/null

# 🛑 Ask before submitting — removes a whole failed round trip.
echo "▸ pre-flight check"
MISSING=$(api "$API/games/$GAME_ID/review" | jq -r '.missing_requirements[]?')

if [ -n "$MISSING" ]; then
  echo "❌ still missing:"
  echo "$MISSING" | sed 's/^/  - /'
  exit 1
fi
echo "  ✓ requirements met"

echo "▸ submitting for review"
RESULT=$(api -X POST "$API/games/$GAME_ID/review" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"notes":"No test account needed. Playable from the first screen."}')

STATUS=$(echo "$RESULT" | jq -r '.status // empty')

if [ -z "$STATUS" ]; then
  echo "❌ submission failed:"
  echo "$RESULT" | jq -r '.title, (.errors // {} | to_entries[] | "  - \(.key): \(.value[0])")'
  exit 1
fi

echo "✅ submitted — $STATUS"
```

### Pulling out what to fix after a rejection

```bash
api "$API/games/$GAME_ID/review" | jq -r '
  "status: \(.status)",
  (.rejection_reasons[]? | "  reason: \(.)"),
  (.decision_notes // empty | "  note: \(.)"),
  (.previous_decision.rejection_reasons[]? | "  previous reason: \(.)")'
```

That last line exists because **after you resubmit, `rejection_reasons` is
empty** and the decision you are acting on has moved to `previous_decision`.
