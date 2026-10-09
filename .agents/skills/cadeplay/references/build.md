# Packaging the archive

What you upload to Cadeplay is **one zip file**. This page defines what has to
be in it and what gets rejected. Checking happens in a sandboxed container with
no network access, and **nothing you upload is executed** — the sandbox only
extracts and inspects.

## Contents

- [The entry point — this one thing decides pass or fail](#the-entry-point--this-one-thing-decides-pass-or-fail)
- [Limits](#limits)
- [What gets rejected](#what-gets-rejected)
- [🛑 `<base>` — absolute paths resolve to the CDN](#-base--absolute-paths-resolve-to-the-cdn)
- [What the server does to your HTML](#what-the-server-does-to-your-html)
- [Per-engine notes](#per-engine-notes)
- [How the engine is detected](#how-the-engine-is-detected)
- [Making the zip](#making-the-zip)
- [Check it yourself before uploading](#check-it-yourself-before-uploading)

---

## The entry point — this one thing decides pass or fail

**There must be an `index.html` at the root of the zip or one level down.**
Without it the build is rejected with `entrypoint_not_found`.

```
✅  game.zip
    ├── index.html          ← root (depth 0)
    ├── game.js
    └── assets/…

✅  game.zip
    └── build/
        ├── index.html      ← one level down (depth 1)
        └── …

❌  game.zip
    └── dist/build/
        └── index.html      ← two levels down — not found
```

This is the check, and it is case-insensitive, so `Index.HTML` counts:

```php
/** The entry file — only index.html at the root or one level down */
private function isEntrypoint(string $name): bool
{
    $depth = substr_count(trim($name, '/'), '/');

    return $depth <= 1 && mb_strtolower(basename($name)) === 'index.html';
}
```

🛑 **The most common mistake** is zipping the build folder itself and ending up
with two wrapper directories. Compressing from Finder on macOS adds a folder
level. After making the zip, run `unzip -l game.zip | head` and **look at it**.

You can also name the entry point explicitly when creating the build (the
`entrypoint` field on `POST /v1/games/{id}/builds`). Omit it and the rule above
applies.

🚧 **That field is accepted but not honoured yet.** The sandbox finds the entry
point itself and the worker records **what it found**, not what you asked for.
So a build whose `index.html` is nowhere the rule allows fails with
`entrypoint_not_found` even when you named the file — move it to the root or one
level down instead of relying on this field.

## Limits

| Thing | Value | What happens if exceeded |
|---|---|---|
| Zip file size | **99,000,000 bytes** (about 94.4 MiB) | Upload session creation returns 422 |
| Total size once extracted | **400,000,000 bytes** (about 381 MiB) | The build ends `failed` |
| File count | **10,000** | The build ends `failed` |

The extracted size is measured by **accumulating the bytes actually written,
not by trusting the central directory**. That is a zip-bomb defence: shrinking
the declared numbers does not get anything past it.

If you are close to the limit, reduce in this order — ① texture compression
(Crunch in Unity, WebP/AVIF on the web) ② audio bitrate ③ unused assets
④ Brotli compression (below).

🛑 **Fonts are the usual surprise once the game is localized.** A full CJK
webface is 5–15 MB each, and Thai, Arabic, Hebrew and Devanagari each need their
own coverage — bundling one per language exceeds the archive limit on fonts
alone. Use system fonts, or subset to the glyphs your strings actually use →
[references/localization.md](localization.md#fonts--where-the-size-budget-goes)

## What gets rejected

### Executable extensions

```
php phtml php3 php4 php5 php7 phps pht phar
jsp jspx asp aspx cgi pl py rb sh bash
exe dll so dylib bat cmd com scr msi
htaccess htpasswd
```

`.htaccess` and `.htpasswd` are matched as **whole filenames**, not extensions.
None of these have any business in a game, and a single one rejects the entire
build.

Files your build tooling produced — `build.sh`, `deploy.py` — often slip in.
Remove them before zipping.

### Dangerous paths and names

| Rejected | Example |
|---|---|
| Parent references | `../../etc/passwd` |
| Absolute paths | `/etc/passwd`, `C:\Windows\…` |
| Symlinks and hard links | (detected from unix attributes) |
| Null bytes in a name | `shell.php\x00.png` |
| Control characters or newlines in a name | `a.txt\nFAKE LOG LINE` |

🛑 **Names are checked by reading the raw bytes of the zip central directory.**
What a zip library hands back has already been transformed (null bytes become
spaces, for instance), so checking that means inspecting **what the library
did**, not what the attacker wrote. This bypass was reproduced and closed.

Paths are compared **as literal strings**, without normalisation — normalisation
functions differ between implementations, so "normalise and it becomes safe"
does not hold.

## 🛑 `<base>` — absolute paths resolve to the CDN

**This is the most common reason a game breaks after deployment.**

Game assets are served from the CDN (`cdn.cadeplay.com`) while the game HTML
comes from the game host (`{id}.cadeplay.com`). To bridge those, the server
injects `<base href="https://cdn.cadeplay.com/…/{build_id}/">`.

`<base>` does not only affect relative paths — **root-absolute paths (`/foo`)
resolve against the CDN origin too.** Measured, not assumed:

| What the game wrote | Where it actually goes | Result |
|---|---|---|
| `src="game.js"` | CDN | ✅ fine |
| `src="./assets/x.png"` | CDN | ✅ fine |
| `src="/assets/x.png"` | CDN **origin root** — the build prefix is gone | ❌ **404** |
| `<link rel="manifest" href="/manifest.webmanifest">` | CDN → **403** | ❌ PWA install impossible |
| `navigator.serviceWorker.register('/sw.js')` | CDN → cross-origin | ❌ registration fails |
| `fetch('/api/…')` | CDN → 404 | ❌ cannot call your own endpoints |

🛑 **The third row is the one that surprises people.** `<base>` is
`{cdn}/games/{game}/builds/{build}/`, but a root-absolute path ignores the path
part of it and resolves against the **origin** — so `/assets/x.png` asks for
`{cdn}/assets/x.png`, where nothing is. Your file is under the build prefix. It
is not "the same place"; it is a different directory, and the only symptom is a
404 for something that exists.

**Three rules:**

1. **Use relative paths for assets** — `./assets/…`. Not `/assets/…`.
   **This is a build-tool setting, not a habit**, and it is the single most
   common reason a game that runs locally shows a blank screen here:

   | Tool | Setting |
   |---|---|
   | Vite | `base: './'` |
   | webpack | `output.publicPath: './'` |
   | Unity WebGL | default output is relative — do not add a leading `/` |
   | Godot | default export is relative |
2. **Do not touch the manifest or the service worker.** The server provides
   both, and a `<link rel="manifest">` you declare is stripped.
3. **To call a path on the game host, build an absolute URL.**
   `window.__CADEPLAY__.origin` holds it.

```js
// ❌ goes to the CDN
fetch('/my-endpoint');

// ✅ goes to the game host
fetch(window.__CADEPLAY__.origin + '/my-endpoint');
```

If your game **already has its own `<base>` tag**, the server does not inject
one — a build that declares it is assumed to manage its own paths. In that case
pointing assets at the CDN is on you.

## What the server does to your HTML

At deploy time the entry HTML is transformed like this. **The stored file is
untouched; only the response changes** — you do not have to edit your game.

```
① strip any <link rel="manifest"> the game declared
② insert this immediately after <meta charset>:
     <base href="https://cdn.cadeplay.com/games/{game}/{build}/">
     <link rel="manifest" href="https://{id}.cadeplay.com/manifest.webmanifest">
     <script>window.__CADEPLAY__={…};</script>
     <script src="https://{id}.cadeplay.com/sdk.js?v=…"></script>
```

🛑 **Inserting *after* `<meta charset>` matters.** The HTML spec requires the
charset declaration within the first 1024 bytes of the document, and the
injected config JSON alone exceeds 300 bytes. **Put the charset declaration
first** and you are safe.

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">        <!-- ← first line -->
  <title>My Game</title>
  …
```

With no `<meta charset>` the block goes right after `<head>`; with no `<head>`
at all, at the very top. Either works, but the charset gets pushed back and
non-ASCII titles can be mangled.

## Per-engine notes

### Unity WebGL

**Use Brotli, and turn Decompression Fallback off.**

```
Player Settings → Publishing Settings
  Compression Format          : Brotli
  Decompression Fallback      : ☐ (off)
  Data Caching                : ☑ (recommended)
```

The server attaches `Content-Encoding: br` and the correct `Content-Type` to
`.br` files automatically, so the JavaScript fallback decompressor is
unnecessary. Turning it off makes the loader smaller and the first load faster.

How it is decided — strip `.br`/`.gz` and look up the underlying type:

| File | `Content-Type` | `Content-Encoding` |
|---|---|---|
| `game.wasm.br` | `application/wasm` | `br` |
| `game.data.br` | `application/octet-stream` | `br` |
| `game.framework.js.br` | `text/javascript` | `br` |
| `game.wasm.gz` | `application/wasm` | `gzip` |

🛑 **Without those headers the game does not start and the console shows only
inscrutable errors.** This was verified in a browser: the compressed script
executed, `WebAssembly.compile` succeeded, and the wasm magic number
(`00 61 73 6d`) was visible before it was called done.

**Multithreaded builds (SharedArrayBuffer) are constrained.** Cross-origin
isolation requires COOP+COEP across every parent, and a portal page carrying ads
cannot provide that. So **threads only work when `{id}.cadeplay.com` is opened
as a top-level page** (installed or full screen); inside the portal iframe the
build falls back to a single thread. If your game truly needs threads, set
`threading: multi` on the game and drive installs with [pwa.md](pwa.md).

### Godot 4

Export with the Web platform preset and you get:

```
index.html  index.js  index.wasm  index.pck  index.audio.worklet.js
```

The `.pck` file is what identifies Godot. Keep everything in one folder and zip
that.

- **Export Type**: `Regular` (Extensions only if you need GDExtension)
- **Thread Support**: enabling it requires SharedArrayBuffer, which means the
  game will not run in the portal iframe. **Leave it off** without a specific
  reason.
- Godot lets you customise `index.html` (Custom HTML Shell). Keep
  `<meta charset="utf-8">` on the first line if you do.

### Construct 2 / 3

Export → HTML5 and zip the resulting folder as-is. `c2runtime.js` or
`c3runtime.js` identifies it. Construct's "Compress export" option reduces the
file count, which helps.

### Phaser and plain JavaScript

Zip the output folder from your bundler (Vite, webpack, esbuild). There is one
thing to watch — **the base path**.

```js
// vite.config.js
export default {
  base: './',          // ← relative, not absolute ('/')
  build: { outDir: 'dist' },
};
```

Vite's default `base: '/'` produces absolute paths like
`/assets/index-abc.js`. Those happen to work because assets come from the CDN,
but `'./'` keeps local testing and production identical, which is less
confusing.

## How the engine is detected

Processing guesses the engine and stores it on `Build.engine`. It is
informational — it routes support questions — so a wrong guess does not affect
the game. **When it cannot tell, it is `null`**; it does not force a choice.

Detection looks at **file structure first**, because HTML strings alone miss
things: Unity 2020+ uses `createUnityInstance` (code looking for the old
`unityInstance` missed modern builds), and Godot 4 writes `GODOT_CONFIG` in all
caps (searching for `Godot` did not match).

```php
// ① file structure — artifacts an engine always emits
$byFiles = match (true) {
    // Unity: Build/*.loader.js together with .data(.br)
    $this->matches($files, '/\.loader\.js(\.br|\.gz)?$/i')
        && $this->matches($files, '/\.(data|wasm)(\.br|\.gz)?$/i') => 'unity',

    // Godot: only this engine uses .pck
    $this->matches($files, '/\.pck$/i') => 'godot',

    // Construct: fixed runtime filenames
    $this->matches($files, '/c[23]runtime\.js$/i') => 'construct',

    default => null,
};

if ($byFiles !== null) {
    return $byFiles;
}

// ② then the HTML (first 64 KB) — bundled builds mangle filenames
return match (true) {
    (bool) preg_match('/unityinstance|unityloader|unity-canvas/i', $html) => 'unity',
    (bool) preg_match('/godot|gdengine/i', $html) => 'godot',
    (bool) preg_match('/c[23]runtime|construct\s*[23]/i', $html) => 'construct',
    (bool) preg_match('/\bphaser\b/i', $html) => 'phaser',
    default => null,
};
```

Possible values: `unity` · `godot` · `construct` · `phaser` · `custom` · `null`

## Making the zip

Compress from **inside** the build folder. Zipping the folder itself adds a
level.

```bash
cd dist                                    # into the build output
zip -r -9 -X ../game.zip . \
  -x '.*' -x '__MACOSX/*' -x '*/.DS_Store'

cd ..
unzip -l game.zip | head -20               # ← actually look at this
ls -l game.zip                             # under 99,000,000 bytes?
```

| Flag | Why |
|---|---|
| `-r` | Include subdirectories |
| `-9` | Maximum compression — the upload limit is on the compressed size |
| `-X` | Skip extended attributes — macOS resource forks inflate the file count |
| `-x '.*'` | Skip hidden files — stops `.git` and `.env` from sneaking in |

Windows PowerShell:

```powershell
Compress-Archive -Path dist\* -DestinationPath game.zip -CompressionLevel Optimal
```

## Check it yourself before uploading

```bash
#!/usr/bin/env bash
# check-build.sh — a five-second check before you upload
set -euo pipefail
ZIP="${1:?usage: check-build.sh game.zip}"

SIZE=$(wc -c < "$ZIP")
echo "size: $SIZE bytes (limit 99,000,000)"
[ "$SIZE" -le 99000000 ] || { echo "❌ too large"; exit 1; }

COUNT=$(unzip -l "$ZIP" | tail -1 | awk '{print $2}')
echo "files: $COUNT (limit 10,000)"
[ "$COUNT" -le 10000 ] || { echo "❌ too many files"; exit 1; }

# entry point — index.html at the root or one level down
if unzip -l "$ZIP" | awk '{print $4}' \
   | grep -Eiq '^([^/]+/)?index\.html$'; then
  echo "✅ entry point found"
else
  echo "❌ no index.html at the root or one level down"
  unzip -l "$ZIP" | head -20
  exit 1
fi

# rejected extensions
if unzip -l "$ZIP" | awk '{print $4}' | grep -Eiq \
   '\.(php[0-9s]?|phtml|pht|phar|jspx?|aspx?|cgi|pl|py|rb|sh|bash|exe|dll|so|dylib|bat|cmd|com|scr|msi)$|(^|/)\.ht(access|passwd)$'; then
  echo "❌ rejected extensions present:"
  unzip -l "$ZIP" | awk '{print $4}' | grep -Ei \
    '\.(php[0-9s]?|phtml|pht|phar|jspx?|aspx?|cgi|pl|py|rb|sh|bash|exe|dll|so|dylib|bat|cmd|com|scr|msi)$|(^|/)\.ht(access|passwd)$'
  exit 1
fi

echo "✅ looks good — upload it"
```

Passing this check does not cover the extracted-size limit (400 MB) or
symlinks, which are only judged server-side. When a build ends `failed`, read
the reason with `GET /v1/games/{id}/builds/{buildId}/logs` → [deploy.md](deploy.md)
