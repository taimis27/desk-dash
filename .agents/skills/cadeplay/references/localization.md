# Ship the game in every language

Cadeplay is a global portal. **A game that only speaks English loses everyone
else at the first screen** — they cannot find the start button, cannot read what
a power-up does, and they leave. This page is how you avoid that.

## Contents

- [The three rules](#the-three-rules)
- [The languages](#the-languages)
- [🛑 `CadeplaySDK.locale` is not the player's language](#-cadeplaysdklocale-is-not-the-players-language)
- [Detecting the player's language](#detecting-the-players-language)
- [Right-to-left — `ar` and `he`](#right-to-left--ar-and-he)
- [Fonts — where the size budget goes](#fonts--where-the-size-budget-goes)
- [String files, fallback, and the things `Intl` does for you](#string-files-fallback-and-the-things-intl-does-for-you)
- [What the platform accepts — the asymmetry](#what-the-platform-accepts)
- [Declaring it: `supported_locales`](#declaring-it-supported_locales)
- [Checking it](#checking-it)
- [What breaks quietly](#what-breaks-quietly)

---

## The three rules

### ① Author in English

Source strings, keys, comments, and the game's `default_locale` are **English**.

English is the fallback for every other language on the platform, it is the
source your translations are made from, and it is what the human reviewer reads.
A game authored in another language ends up with an English translation that is
a translation of a translation, and the reviewer cannot check it.

```js
// ✅  keys describe meaning, values are English
{ "hud.score": "Score", "menu.start": "Start Game" }

// ❌  the key is the Korean string — now nothing can be looked up or fixed
{ "점수": "점수" }
```

### ② Ship all of them

Every language in the table below. Not "English plus the two we care about" —
**all of them.** These are short strings; a typical game has 80–300 of them, and
translating that set is one pass of work for an AI, not a project.

The one thing worth paying a human for is a proofread of the languages you
expect the most players in. Everything else is better machine-translated than
missing: a slightly awkward Turkish menu still lets a Turkish player play.

### ③ Pick the language from the browser, never from a server round-trip

`navigator.languages` on first run, remembered in `localStorage` once the player
picks something explicitly. Never ask a server, and never wait for a network
call before drawing the first frame.

**Do not send `Accept-Language` to us and expect different HTML back.** The game
document is cached (`Cache-Control: public, max-age=60`, plus a server-side
cache) and **every player receives the same bytes**. A language decided on the
server would leak one player's language to the next.

---

## The languages

Twenty-one. The codes are exactly the values Cadeplay uses, so you can pass them
straight to `supported_locales`.

| Code | Name | Dir | Portal UI |
|---|---|---|---|
| `en` | English | ltr | live |
| `ko` | Korean | ltr | live |
| `zh` | Chinese (Simplified) | ltr | live |
| `ja` | Japanese | ltr | live |
| `pt` | Portuguese (Brazil) | ltr | live |
| `es` | Spanish | ltr | live |
| `tr` | Turkish | ltr | live |
| `vi` | Vietnamese | ltr | live |
| `id` | Indonesian | ltr | live |
| `th` | Thai | ltr | defined |
| `fr` | French | ltr | defined |
| `it` | Italian | ltr | defined |
| `pl` | Polish | ltr | defined |
| `uk` | Ukrainian | ltr | defined |
| `de` | German | ltr | defined |
| `nl` | Dutch | ltr | defined |
| `zh-hant` | Chinese (Traditional) | ltr | defined |
| `ar` | Arabic | **rtl** | defined |
| `he` | Hebrew | **rtl** | defined |
| `hi` | Hindi | ltr | defined |
| `ru` | Russian | ltr | defined |

**"live" versus "defined" is about the portal's own UI, not about your game.**
Your game should display all twenty-one regardless — a Thai player browsing the
English portal still wants a Thai game. The distinction only matters for
[store listings](#what-the-platform-accepts).

Use these names in your own language picker if you build one, in the language's
own script — a player looking for Korean is looking for `한국어`, not for
"Korean" spelled in a language they do not read.

🛑 **The code for Traditional Chinese is `zh-hant`, lowercase, with a hyphen.**
Not `zh-Hant`, not `zh-TW`. Browsers send `zh-TW` and `zh-HK`; mapping those onto
`zh-hant` is your job and the code below does it.

---

## 🛑 `CadeplaySDK.locale` is not the player's language

It is the **game's** `default_locale` — the one you chose when you created the
game. It is identical for every player, because the document carrying it is
cached and served to everyone.

```js
CadeplaySDK.locale        // "en" — always, for everybody
navigator.languages       // ["ko-KR", "ko", "en-US"] — this player
```

This one is worth stating twice, because **it does not fail during development.**
You are almost certainly testing in the game's default language, so
`CadeplaySDK.locale` gives you exactly what you expected. It only goes wrong for
players, and no error is ever raised.

Use `CadeplaySDK.locale` for what it is: the language to fall back to when the
browser asks for something you did not translate.

---

## Detecting the player's language

This matches the way the portal picks a language, so the game and the page around
it agree. Copy it as-is.

```js
/* locale.js — pick a display language for this player */

export const LOCALES = [
  { code: 'en',      tag: 'en'      }, { code: 'ko', tag: 'ko' },
  { code: 'zh',      tag: 'zh-Hans' }, { code: 'ja', tag: 'ja' },
  { code: 'pt',      tag: 'pt-BR'   }, { code: 'es', tag: 'es' },
  { code: 'tr',      tag: 'tr'      }, { code: 'vi', tag: 'vi' },
  { code: 'id',      tag: 'id'      }, { code: 'th', tag: 'th' },
  { code: 'fr',      tag: 'fr'      }, { code: 'it', tag: 'it' },
  { code: 'pl',      tag: 'pl'      }, { code: 'uk', tag: 'uk' },
  { code: 'de',      tag: 'de'      }, { code: 'nl', tag: 'nl' },
  { code: 'zh-hant', tag: 'zh-Hant' }, { code: 'ar', tag: 'ar' },
  { code: 'he',      tag: 'he'      }, { code: 'hi', tag: 'hi' },
  { code: 'ru',      tag: 'ru'      },
];

/*
 * Region → script, for browsers that send a region but no script.
 *
 * Without this, `zh-TW` scores the same against Simplified and Traditional,
 * and Taiwanese and Hong Kong players get served Simplified Chinese.
 */
const REGION_SCRIPT = {
  'zh-tw': 'hant', 'zh-hk': 'hant', 'zh-mo': 'hant',
  'zh-cn': 'hans', 'zh-sg': 'hans', 'zh-my': 'hans',
};

/** `zh-Hant-TW` → `{ language: 'zh', script: 'hant', region: 'tw' }` */
export function parseTag(tag) {
  const parts = String(tag).toLowerCase().split('-').filter(Boolean);
  const out = { language: parts[0] ?? '', script: null, region: null };

  for (const part of parts.slice(1)) {
    // BCP 47: a script subtag is 4 letters, a region is 2 letters or 3 digits
    if (part.length === 4 && !/\d/.test(part)) out.script ??= part;
    else if (part.length === 2 || (part.length === 3 && /^\d+$/.test(part))) out.region ??= part;
  }

  if (out.script === null && out.region !== null) {
    out.script = REGION_SCRIPT[`${out.language}-${out.region}`] ?? null;
  }

  return out;
}

/*
 *   3  language and script both match      zh-TW  ↔ zh-Hant
 *   2  language matches, script unknown    ko-KR  ↔ ko
 *   1  language matches, script differs    zh-TW  ↔ zh-Hans
 *   0  different language
 */
function score(want, cand) {
  if (!want.language || want.language !== cand.language) return 0;
  if (want.script && cand.script) return want.script === cand.script ? 3 : 1;
  return 2;
}

const STORAGE_KEY = 'game:locale';

/**
 * @param {string[]} requested  usually navigator.languages
 * @returns {string} one of the codes in LOCALES
 */
export function pickLocale(requested = navigator.languages ?? [navigator.language]) {
  // An explicit choice always wins — never drag someone back off their pick
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LOCALES.some((l) => l.code === saved)) return saved;
  } catch { /* private mode: fall through to detection */ }

  let weak = null;   // a score-1 match, used only if nothing better turns up

  for (const tag of (requested?.length ? requested : ['en'])) {
    const want = parseTag(tag);
    let best = null, bestScore = 0;

    for (const cand of LOCALES) {
      const s = score(want, parseTag(cand.tag));
      if (s > bestScore) { bestScore = s; best = cand.code; }
    }

    // 2 or 3 means the language itself matched — stop, this is their top choice
    if (bestScore >= 2) return best;
    if (bestScore === 1) weak ??= best;
  }

  return weak ?? 'en';
}

export function setLocale(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  applyLocale(code);
}
```

**Order matters and the loop respects it.** `navigator.languages` is the
player's preference list, so a language match on the first entry beats a better
script match on the second. A score of 1 (right language, wrong script) is held
back until every preference has been tried — offering a Traditional Chinese
reader the Simplified build is a last resort, not a first choice.

### Applying it

```js
const RTL = new Set(['ar', 'he']);

export function applyLocale(code) {
  document.documentElement.lang = code === 'zh-hant' ? 'zh-Hant' : code;
  document.documentElement.dir = RTL.has(code) ? 'rtl' : 'ltr';

  window.__t = STRINGS[code] ?? STRINGS.en;
  redrawAllText();          // canvas games: nothing re-renders on its own
}
```

🛑 **`document.documentElement.lang` takes the BCP 47 tag, not our code.** For
twenty of the twenty-one they are the same string; `zh-hant` is the exception and
belongs there as `zh-Hant`. Getting it wrong costs you correct font selection and
correct line breaking in Chinese.

---

## Right-to-left — `ar` and `he`

`dir="rtl"` on the root element flips DOM layout for free. **It does nothing for
a canvas.**

```js
// HTML/DOM UI — the browser does the work
document.documentElement.dir = 'rtl';

// Canvas — you do the work
ctx.direction = isRTL ? 'rtl' : 'ltr';
ctx.textAlign  = isRTL ? 'right' : 'left';
```

What still needs your hand in an RTL layout:

| Thing | What to do |
|---|---|
| HUD anchors | Score on the left becomes score on the right. Mirror the layout |
| Progress bars, timers | Fill direction reverses |
| Back / forward arrows | Mirror the glyphs. A "next" arrow pointing left is wrong |
| **Gameplay itself** | **Do not mirror it.** A platformer still runs left to right |
| Numbers | Stay LTR inside RTL text. `Intl.NumberFormat` handles this |

That fourth row is the one people get wrong by being thorough: RTL is a property
of *reading*, not of *the world*. Mirroring the level flips the controls out from
under the player.

---

## Fonts — where the size budget goes

The Latin font you shipped has **no glyphs** for Chinese, Japanese, Korean, Thai,
Arabic, Hebrew, or Devanagari. Those players see empty boxes — tofu — and the
browser reports nothing.

A full CJK webfont is 5–15 MB each. Loading one per language blows the
[99,000,000 byte archive limit](build.md#limits) on fonts alone.

**Order of preference:**

**① System fonts.** Zero bytes, and every platform already ships coverage for all
twenty-one.

```css
font-family: system-ui, -apple-system, "Segoe UI", Roboto,
             "Noto Sans", "Noto Sans CJK KR", "Noto Sans CJK SC", "Noto Sans CJK TC",
             "Noto Sans Thai", "Noto Sans Arabic", "Noto Sans Hebrew",
             "Noto Sans Devanagari", sans-serif;
```

Canvas games: pass the **same stack** to `ctx.font`. A bare `ctx.font = '16px
sans-serif'` resolves differently per platform and is where CJK tofu usually
comes from.

**② Subset the font to the glyphs you actually use.** Your strings need a few
hundred CJK characters, not twenty thousand.

```bash
# collect every character across all 21 string files, then cut the font down
jq -r '.. | strings' locales/*.json | tr -d '\n' \
  | python3 -c "import sys; print(''.join(sorted(set(sys.stdin.read()))))" > glyphs.txt

pyftsubset NotoSansCJK.otf --text-file=glyphs.txt \
  --output-file=fonts/cjk-subset.woff2 --flavor=woff2
```

A subset like that is typically 40–150 KB. **Regenerate it whenever strings
change** — a new sentence with an unseen character renders as tofu, and only in
that one language.

**③ `unicode-range` so each script downloads only when used.**

```css
@font-face {
  font-family: 'GameFont';
  src: url('fonts/cjk-subset.woff2') format('woff2');
  unicode-range: U+4E00-9FFF, U+3040-30FF, U+AC00-D7AF;
}
```

---

## String files, fallback, and the things `Intl` does for you

One file per language, all twenty-one bundled. At 5–20 KB each this is a rounding
error against the archive limit.

```
locales/en.json  ko.json  zh.json  ja.json  pt.json  es.json  tr.json
        vi.json  id.json  th.json  fr.json  it.json  pl.json  uk.json
        de.json  nl.json  zh-hant.json  ar.json  he.json  hi.json  ru.json
```

**Never show a key to a player.** Missing translation falls back to English:

```js
export function t(key, vars = {}) {
  const s = STRINGS[current]?.[key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}
```

If `key` ever reaches the screen, your build is missing a string in **English**,
which is a bug in the source, not in a translation.

**Numbers and plurals are not string concatenation.**

```js
// ❌ wrong in most of the twenty-one
`${n} coins`                       // Polish and Russian have three plural forms
`Score: ${score}`                  // 1234567 renders differently per locale

// ✅
new Intl.NumberFormat(locale).format(score);         // 1,234,567 · 1.234.567 · ١٢٣٤٥٦٧
new Intl.PluralRules(locale).select(n);              // "one" | "few" | "many" | "other"
new Intl.RelativeTimeFormat(locale).format(-3, 'day');
```

```jsonc
// keyed by plural category, chosen at runtime
"coins": { "one": "{n} coin", "few": "{n} monety", "many": "{n} monet", "other": "{n} coins" }
```

**Leave room for the text to grow.** German and Russian run 30–50% longer than
English; a button sized to "Play" clips "Wiedergeben". Size buttons to their
content, or check the longest string across all languages when you lay out.

---

## What the platform accepts

**Store listings take all twenty-one.** This changed on 2026-08-29 — they used
to take only the nine the portal itself had launched in, and that produced a 422
that read like a bug.

| What | Languages accepted |
|---|---|
| Text your game displays | **all 21** — that is your code, our rules do not reach it |
| `content.supported_locales` | **all 21** |
| `PUT /v1/games/{id}/listings/{locale}` | **all 21** |
| `games.default_locale` | **the 9 the portal has launched in** |
| achievement `localizations` keys | **the 9 the portal has launched in** |

The nine: `en` `ko` `zh` `ja` `pt` `es` `tr` `vi` `id`.

**Why listings are wider than the portal's own UI.** Whether we have translated
*our* pages into Thai and whether *your game* has a Thai description are
unrelated facts. Search already reads every listing in every language, so a Thai
description is found by Thai players today — even before the portal itself
speaks Thai. When it does, your listing is already there.

`default_locale` and achievement names stay on the nine. Those appear inside our
own chrome, where an untranslated string sits next to translated ones.

---

## 🛑 You do not write twenty-one listings by hand

**This skill writes them.** That is the single biggest reason to publish through
it rather than by hand.

Write your listing once, in whatever language you think in. Then:

```
You:   the listing in English (or Korean, or anything)
Skill: reads it → writes the other twenty → PUT ×21 → submits for review
```

### Doing it

1. **Read the source listing** — `GET /v1/games/{id}/listings/{default_locale}`.
2. **Keep the whole object.** Translate `title`, `short_description`,
   `description` — and **carry `categories`, `keywords` and `what_is_new`
   across unchanged**, except that `keywords` should be translated too.
3. **`PUT` the complete object** for each of the other twenty. Twenty-one calls;
   the rate limit is per minute and far above that.
4. **Submit for review** — `POST /v1/games/{id}/review`.

🛑 **`PUT` replaces the whole listing, so a field you leave out is a field you
delete.** Sending only the three translated strings wipes `categories` — and
because review only checks the *default* language, the game still passes and
still publishes. The German page simply has no category, so it appears in no
category listing. Nothing anywhere reports this.

```js
// ✅ start from the source object, override only what you translated
const src = await get(`/v1/games/${id}/listings/${defaultLocale}`);

for (const locale of others) {
  await put(`/v1/games/${id}/listings/${locale}`, {
    ...src,                                  // categories · what_is_new survive
    title:             src.title,            // the game's NAME is not translated
    short_description: await translate(src.short_description, locale),
    description:       await translate(src.description, locale),
    keywords:          await translateEach(src.keywords, locale),
  });
}
```

**`categories` values stay in English.** They are enum keys (`arcade`,
`puzzle`), not display text — translating them fails validation.

### 🛑 Four rules that decide whether the result is usable

**① Respect the length caps, in the target language.** `title` is 50
characters, `short_description` 120, `description` 4000. German and Russian run
30–50% longer than English — a translation that fits in your head returns
**422** here. Shorten in the target language; do not truncate mid-word.

**② Do not translate the game's name.** "Neon Drift" stays "Neon Drift" in all
twenty-one. Translating it splits one game into twenty-one brands, and players
searching the name you advertise will not find it. Translate the *descriptions*
around it. A subtitle may be translated if the name itself is kept.

**③ Never overwrite a language somebody already wrote.** `PUT` replaces the
whole listing. Fetch the list first (`GET /v1/games/{id}/listings`) and skip
locales that already have a `short_description` — the developer may have had a
native speaker polish it, and silently replacing that is worse than leaving a
language empty.

**④ `ar` and `he` are right-to-left.** The text is just text to the API, but
read [right-to-left](#right-to-left--ar-and-he) before you write UI strings for
them.

### What this is not

It is machine translation with a good model, **not a native speaker's review.**
Tell the developer that, and tell them which languages they should have somebody
read. A confident-sounding wrong translation in a store listing is worse than an
obviously machine one, because nobody goes back to check it.

Same for the game's own text — this skill can translate the strings inside your
build too, since that source is right here on disk. The API cannot check any of
it, so quality is entirely on the two of you.

---

## Declaring it: `supported_locales`

Part of the [content survey](store.md#content-survey--requirement-), and
**submission is blocked while it is empty**. It takes all twenty-one.

```bash
curl -sS -X PUT "https://cadeplay.com/v1/games/$GAME_ID/content" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "supported_locales": [
      "en","ko","zh","ja","pt","es","tr","vi","id","th","fr",
      "it","pl","uk","de","nl","zh-hant","ar","he","hi","ru"
    ]
  }'
```

🛑 **Declare what the game actually displays, not what you hope to add.** This
is what players filter the catalog by, and a player who picks Thai and lands on
an English-only game does not file a bug — they leave and do not come back.

---

## Checking it

**Every language, on a real browser.** Nothing here fails loudly.

```js
// a debug override, so you do not have to change browser settings 21 times
const forced = new URLSearchParams(location.search).get('lang');
applyLocale(forced && LOCALES.some(l => l.code === forced) ? forced : pickLocale());
```

Then `?lang=ar`, `?lang=zh-hant`, `?lang=th`, and so on.

🛑 **Strip that override, or gate it behind a debug flag, before you ship** — it
is one more thing between the player and their own language, and it makes shared
links carry someone else's locale.

Check per language:

- [ ] No tofu. Every glyph draws — CJK, Thai, Arabic, Hebrew, Devanagari
- [ ] Nothing clipped or overflowing. German and Russian are the long ones
- [ ] No English left in the middle of a translated screen
- [ ] No raw key text on screen
- [ ] `ar` and `he`: HUD mirrored, gameplay **not** mirrored, numbers still LTR
- [ ] `zh-TW` in the browser gives Traditional, not Simplified
- [ ] Numbers formatted through `Intl`, not string-concatenated

And verify the detection itself, which is easier to unit-test than to click
through:

```js
console.assert(pickLocale(['ko-KR', 'en'])   === 'ko');
console.assert(pickLocale(['zh-TW'])         === 'zh-hant');
console.assert(pickLocale(['zh-CN'])         === 'zh');
console.assert(pickLocale(['pt-PT'])         === 'pt');       // one Portuguese build
console.assert(pickLocale(['sv-SE', 'de'])   === 'de');       // no Swedish → next choice
console.assert(pickLocale(['xx'])            === 'en');       // unknown → English
```

---

## What breaks quietly

Every one of these ships without an error, a console message, or a failed
request. They are found by looking, in the language they break in.

| Symptom | Cause |
|---|---|
| Everyone sees the same language | Used `CadeplaySDK.locale` as the player's language |
| Second-choice language ignored | Read `navigator.language` (singular) instead of `.languages` |
| Taiwan and Hong Kong get Simplified | No region → script mapping; `zh-TW` fell through to `zh` |
| Empty boxes instead of text | Font has no glyphs for that script |
| Empty boxes **only in one language** | Subset regenerated before that language's strings were added |
| Buttons clipped in German | Layout sized against English |
| `hud.score` on screen | Key missing from the **English** file, so the fallback failed too |
| Arabic HUD looks wrong | `dir="rtl"` set, but the canvas was never told |
| Arabic gameplay feels wrong | The level got mirrored along with the UI |
| "1,5" where "1.5" belongs | Number built with string concatenation |
| Language resets every launch | Explicit choice never written to `localStorage` |
| Store listing rejected with 422 | **Not the locale** — all twenty-one are accepted. Read the body: a length cap exceeded in the target language, a `categories` value that is not one of the twelve, or `<`/`>` in the title |
| A language's page has no category | `PUT` sent only the translated strings — `categories` was dropped. `PUT` replaces the whole listing |
