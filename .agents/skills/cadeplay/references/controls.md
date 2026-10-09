# Controls — touch first, mouse second, keyboard last

**Most people who play a Cadeplay game are on a phone.** They have no keyboard,
no mouse, no right-click, and no hover. Design for that player and the desktop
player still gets a good game. Design for the desktop player first and the
majority cannot play at all.

This is the single most common reason a finished, working, well-made game gets
no players: it needs `WASD`.

## Contents

- [The rule](#the-rule)
- [One pointer path, not two](#one-pointer-path-not-two)
- [Moving the character without a keyboard](#moving-the-character-without-a-keyboard)
- [Zoom and pan](#zoom-and-pan)
- [`touch-action` — the setting that decides whether your game works at all](#touch-action--the-setting-that-decides-whether-your-game-works-at-all)
- [Sizing and placing touch targets](#sizing-and-placing-touch-targets)
- [Keyboard, kept to a minimum](#keyboard-kept-to-a-minimum)
- [What phones do not have](#what-phones-do-not-have)
- [Orientation and safe areas](#orientation-and-safe-areas)
- [Declaring it: `controls` and `orientation`](#declaring-it-controls-and-orientation)
- [Testing it](#testing-it)
- [What breaks quietly](#what-breaks-quietly)

---

## The rule

> **The game must be completable with one thumb on a touchscreen, with no
> keyboard and no mouse anywhere in the path.**

Everything below follows from that sentence.

| Input | Role |
|---|---|
| **Touch** | **Primary.** Every action reachable. No exceptions, including menus, pause, restart, settings |
| **Mouse** | **Primary on desktop.** Movement is mouse-driven — click or drag to move, aim, select |
| Keyboard | **Optional accelerator.** Attack, jump, dash, sprint — a handful of keys, never the only way |
| Gamepad | Bonus. Never assume it |

**"Optional" is a hard constraint, not a preference.** If one action — a hidden
level, a rebind screen, a debug console, a name entry field — can only be reached
from a key, the game is not playable on a phone and it will be reported as
broken.

### 🛑 Ask the developer before you build the control scheme

If you are an AI helping build the game, this is a decision to surface early,
because retrofitting touch onto a keyboard game means rewriting the input layer
and often the level design with it.

Ask:

- **How does the character move?** Propose tap-to-move or drag-to-move first, and
  say why: both work identically with a finger and a mouse.
- **Which actions get a keyboard shortcut?** Keep the list to three or four, and
  confirm each one also has a touch path.
- **Portrait or landscape?** It decides the HUD layout and it is awkward to
  change later.

Then build touch first and add keys afterwards. The other order does not
converge — a keyboard game retrofitted for touch ends up with a virtual D-pad
sitting over the play area, which is the worst result available.

---

## One pointer path, not two

Pointer Events cover mouse, touch, and pen in one API. **Write the input layer
once.** Two code paths drift, and the touch one drifts first because you are not
testing on a phone as often.

```js
// ✅ one path — mouse, finger and stylus all arrive here
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup',   onUp);
canvas.addEventListener('pointercancel', onUp);   // a call arrives, OS takes over

// ❌ two paths that will not stay in sync
canvas.addEventListener('mousedown', …);
canvas.addEventListener('touchstart', …);
```

**Do not forget `pointercancel`.** The browser fires it when a gesture is taken
away — an incoming call, a system swipe, a scroll the browser decided to own.
Without it the character keeps running in the direction it was last told, and
the player comes back to a dead avatar.

Two more things that only bite on touch:

```js
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);   // keep events after the finger leaves the canvas
  e.preventDefault();                       // no synthetic click, no text selection
});
```

**Act on `pointerdown`, not on `click`.** A `click` on touch arrives after the
browser has ruled out a double-tap, and that delay is felt as sluggishness in
anything action-paced.

### Multi-touch: moving and acting at the same time

A phone player needs to move with one thumb and attack with the other. Track
pointers by id — a single "is the screen pressed" boolean cannot express this,
and games built on one always end up with movement cancelling attacks.

```js
const active = new Map();   // pointerId → { role, x, y }

function onDown(e) {
  const role = e.clientX < innerWidth / 2 ? 'move' : 'action';
  active.set(e.pointerId, { role, x: e.clientX, y: e.clientY });
}

function onMove(e) {
  const p = active.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
}

function onUp(e) { active.delete(e.pointerId); }
```

---

## Moving the character without a keyboard

Pick one and commit to it. All three work with a finger **and** with a mouse,
which is the whole point — the desktop player uses the same scheme.

**① Tap / click to move.** Tap a spot, the character walks there. The most
forgiving scheme on a small screen, and it needs no on-screen furniture at all.
Best for adventure, puzzle, strategy, RPG.

**② Drag to steer.** Hold anywhere and the character follows the offset from
where the press started. A floating stick, without the artwork of one — and
because it originates wherever the thumb landed, it never needs to be aimed at.

```js
// a floating stick: the origin is wherever the finger went down
const DEAD_ZONE = 8;    // CSS px — thumbs are not steady, and a resting thumb must read as zero
const FULL_TILT = 60;   // CSS px from the origin to full speed

function stickVector(p) {
  const dx = p.x - p.startX, dy = p.y - p.startY;
  const len = Math.hypot(dx, dy);

  if (len < DEAD_ZONE) return { x: 0, y: 0 };

  // direction × strength, strength clamped to 1 beyond FULL_TILT
  const strength = Math.min(len, FULL_TILT) / FULL_TILT;
  return { x: dx / len * strength, y: dy / len * strength };
}
```

🛑 **Clamp the strength, do not scale it by distance.** Getting this wrong is
easy and it fails in a way you will not notice: within the stick radius it
behaves correctly, and only a long swipe — which you do not make while
debugging, and players make constantly — comes out **slower** than a short one.

**③ Auto-run, tap to act.** The character moves on its own; touch is only for
jump, turn, or attack. Endless runners and one-button platformers. The lowest
possible input burden and it works identically everywhere.

🛑 **A fixed on-screen D-pad is the weakest option.** It occupies a corner of a
screen that is already small, the thumb has to find it without looking, and it
misses constantly. If you use one, make it *floating* — spawn it wherever the
thumb lands, which is scheme ②.

### Desktop uses the same scheme

The mouse drives movement. Do not build a second control scheme for desktop with
`WASD` at its centre — you would then be maintaining two designs, and the touch
one gets tested less.

| Scheme | Mouse |
|---|---|
| Tap to move | Click to move |
| Drag to steer | Hold the left button and drag |
| Auto-run | Click to act |

Add pointer-only refinements where they are free — hover highlights, a cursor
that changes over an interactive object, right-click for a secondary action —
but never make one of them the only way to reach something.

---

## Zoom and pan

Any game with a map, a board, or a world larger than the viewport needs both, by
gesture. **Pinch to zoom, one or two fingers to pan.** Implement them yourself
against the canvas; do not rely on the browser's page zoom, which is disabled
inside the portal iframe and scales your HUD along with the world.

Track the gesture **frame to frame**, not against a fixed starting point. One
midpoint and one distance describe both gestures at once, so pinch and drag fall
out of the same three lines.

```js
const pointers = new Map();   // pointerId → { x, y }
let last = null;              // the previous frame's gesture, or null to re-anchor

/** midpoint of every finger down, and the spread between two of them */
function gesture() {
  const pts = [...pointers.values()];
  const mid = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
  const dist = pts.length === 2
    ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    : null;                                   // one finger: pan only, no zoom
  return { mid, dist };
}

function onDown(e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  last = null;              // finger count changed — re-anchor, do not jump
}

function onMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  const now = gesture();
  if (!last) { last = now; return; }         // first frame after a change: anchor only

  if (now.dist && last.dist) zoomBy(now.dist / last.dist, now.mid);
  panBy(now.mid.x - last.mid.x, now.mid.y - last.mid.y);

  last = now;   // 🛑 without this line the same delta is applied every frame
}

function onUp(e) {
  pointers.delete(e.pointerId);
  last = null;              // re-anchor on whatever fingers remain
}
```

🛑 **The two `last = null` lines are what stop the camera jumping.** Lift one
finger of a pinch and the midpoint moves instantly from between two fingers to
under the remaining one; measured against a stale anchor, that is a large delta
applied in a single frame, and the world leaps sideways at the end of every
pinch.

**Zoom about the pinch midpoint, not about the screen centre.** `zoomBy(k,
anchor)` should keep the world point under `anchor` where it is:

```js
function zoomBy(k, anchor) {
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.scale * k));
  const applied = next / camera.scale;              // may differ from k once clamped

  camera.x = anchor.x - (anchor.x - camera.x) * applied;
  camera.y = anchor.y - (anchor.y - camera.y) * applied;
  camera.scale = next;
}
```

Zooming about the centre instead makes the thing being examined slide away,
which reads as the game fighting the player. And **re-deriving the ratio after
clamping matters** — using the raw `k` at the zoom limit keeps translating the
camera while the scale no longer changes, so the world drifts under a pinch that
appears to do nothing.

Clamp the zoom range and keep the camera inside the world bounds — a player who
pinches out to grey emptiness with no way back thinks the game crashed.

**On desktop map the same two:** wheel to zoom (about the cursor), middle-drag or
space-drag to pan.

---

## `touch-action` — the setting that decides whether your game works at all

By default the browser owns touch gestures: it scrolls, it pull-to-refreshes, it
double-tap-zooms. Inside the portal that means **your drag scrolls the portal
page behind the iframe** while the character stands still.

```css
canvas, .game-root {
  touch-action: none;          /* the game owns every gesture */
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;   /* no grey flash on tap */
  overscroll-behavior: contain;
}
```

`touch-action: none` on the play surface only. If you have a scrollable list —
a level select, a leaderboard — leave that element alone or it stops scrolling.

Also suppress the long-press menu, which otherwise interrupts any hold-to-charge
mechanic:

```js
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
```

🛑 **Do not try to block the browser's own system gestures** — the iOS edge
swipe, the Android back gesture. They cannot be blocked, and a design that
depends on a swipe from the very edge of the screen will lose that swipe on
every phone. Keep gestures away from the outer 20 px.

---

## Sizing and placing touch targets

A finger is not a cursor. It is roughly 9 mm across and it hides what it is
touching.

| Thing | Value |
|---|---|
| Minimum touch target | **44 × 44 CSS px.** Below that, misses become routine |
| Comfortable target | 48–56 px for anything pressed repeatedly |
| Gap between targets | ≥ 8 px, so a near miss is not the wrong button |
| Distance from screen edge | ≥ 16 px, clear of system gestures |

**The visual can be smaller than the target.** Draw a 32 px icon and give it a
48 px hit rectangle; nobody sees the padding and everybody feels it.

**Place controls where a thumb reaches.** Holding a phone one-handed, the thumb
covers the bottom third and the near side. The top corners are the worst place on
the screen — and that is exactly where desktop habits put a pause button.

```
┌─────────────────┐
│  ✗   hard    ✗  │   status, score — display only, never pressed
│                 │
│      reach      │   the play area
│                 │
│  ✓   easy    ✓  │   move, act, pause — everything pressed goes here
└─────────────────┘
```

Keep the HUD out of the middle-bottom too: that is where the thumb rests, and
whatever sits under it is invisible while playing.

---

## Keyboard, kept to a minimum

Keys are an accelerator for players who have them. Three or four, no more:

| Action | Typical key |
|---|---|
| Jump / primary | `Space` |
| Attack / secondary | `J` or `Z` or left click |
| Dash / sprint | `Shift` |
| Pause | `Esc` or `P` |

Rules for every one of them:

- **The same action has a touch path.** The key is a shortcut, never an entry point
- **No key combinations.** No `Ctrl+Shift+…`, nothing that needs two hands
- **No text entry.** Player names, seeds, cheat codes — if it needs typing, offer
  a picker or generate it. A mobile keyboard covers half the screen and its
  appearance resizes the viewport mid-game
- **`Esc` is not yours to keep.** Inside a fullscreen iframe the browser takes it

```js
// arrow keys and space scroll the page — stop that, but only for keys you use
const HANDLED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

addEventListener('keydown', (e) => {
  if (HANDLED.has(e.code)) e.preventDefault();
  …
});
```

🛑 **The game must not need focus to start.** A game that waits for a key press
before doing anything is dead on a phone — and inside an iframe it may not have
keyboard focus at all until the player taps it. Start on `pointerdown`, and if
you show "press any key", make the whole screen tappable.

---

## What phones do not have

Every one of these is a habit from desktop that silently removes something on
touch.

| Not available | What to do instead |
|---|---|
| **Hover** | Never hide information behind hover. Tooltips need a tap target |
| **Right-click** | Long press, or a second button. Not the only way to anything |
| **Cursor position when nothing is pressed** | No aim-follows-cursor. Aim on drag, or auto-aim |
| **Scroll wheel** | Pinch to zoom, drag to scroll |
| **Precise pixel pointing** | Widen hitboxes. Snap to the nearest valid target |
| **Pointer lock** | It does not exist on touch. No mouse-look-only camera |
| **A keyboard that does not steal the screen** | Avoid text entry entirely |
| **Reliable double-click** | Double-tap collides with zoom. Use hold, or a button |

Feature-detect instead of sniffing the user agent — hybrids exist, and a laptop
with a touchscreen should get both:

```js
const canHover  = matchMedia('(hover: hover)').matches;
const coarse    = matchMedia('(pointer: coarse)').matches;   // finger

// show on-screen controls when there is a coarse pointer, not when "mobile"
onScreenControls.hidden = !coarse;
```

`matchMedia` is live — a player who plugs in a mouse should see the UI change.
Listen for it rather than reading it once at boot.

---

## Orientation and safe areas

Declare what the game needs and **actually handle the other one.** A game that
demands landscape and shows nothing in portrait loses the player who arrived
with their phone upright.

```css
/* notches, home indicators, curved corners */
.hud {
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}
```

```js
// the viewport changes on rotate, on keyboard, on browser chrome hiding
addEventListener('resize', relayout);
visualViewport?.addEventListener('resize', relayout);
```

🛑 **Never size the canvas to `window.innerHeight` once at boot.** Mobile browser
chrome hides and shows while scrolling, changing the height mid-game; the game
ends up drawn partly under the address bar. Re-read it on every resize, and use
`visualViewport` where present.

If the game is landscape-only, show a "rotate your device" overlay in portrait —
and make sure the game keeps running underneath rather than resetting.

---

## Declaring it: `controls` and `orientation`

```bash
curl -sS -X PATCH "https://cadeplay.com/v1/games/$GAME_ID" \
  -H "Authorization: Bearer $CADEPLAY_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "controls": ["touch", "mouse", "keyboard"],
    "orientation": "any"
  }'
```

| Field | Values |
|---|---|
| `controls` | `touch` · `mouse` · `keyboard` · `gamepad`. Shown as icons on the card |
| `orientation` | `any` · `portrait` · `landscape` |

**`touch` belongs in that array. If it does not, that is a design bug, not a
metadata one** — it means a phone player cannot play, and listing it honestly
only makes the problem visible earlier.

Prefer `orientation: "any"` and lay out for both. `portrait` and `landscape` are
for games that genuinely cannot work in the other, and each one you declare cuts
off the players who arrived holding the phone the other way.

---

## Testing it

**On a real phone.** DevTools emulation catches layout; it does not catch a
target being too small for an actual thumb, and it will never catch the game
being unplayable one-handed.

- [ ] Play from the first screen to the end **with one thumb**, no keyboard
- [ ] Every menu, pause, restart, and settings screen reachable by touch
- [ ] Two-finger: move and act at the same time, no dropped input
- [ ] Pinch zoom and pan, if the game has a world larger than the screen
- [ ] Dragging on the game does **not** scroll the portal page behind it
- [ ] Rotate mid-game — the layout adapts and the run survives
- [ ] Nothing important under a notch or the home indicator
- [ ] Incoming call or app switch mid-game: `pointercancel` handled, no stuck input
- [ ] Desktop: fully playable with the mouse alone
- [ ] Desktop: keys work but nothing needs them

Test inside the portal iframe as well as fullscreen — `touch-action` problems
only appear when there is a scrollable page behind the game.

---

## What breaks quietly

| Symptom | Cause |
|---|---|
| Character keeps walking after the finger lifts | No `pointercancel` handler |
| Dragging scrolls the page instead of moving | Missing `touch-action: none` |
| Movement stops as soon as the attack button is pressed | Single-pointer input, no `pointerId` tracking |
| Input dies when the finger leaves the canvas | No `setPointerCapture` |
| Feels laggy on phones, fine on desktop | Acting on `click` instead of `pointerdown` |
| Buttons "sometimes" do not work | Target below 44 px, or too close to a neighbour |
| Half the HUD invisible while playing | Controls under where the thumb rests |
| Game drawn under the address bar | Canvas sized once from `innerHeight` |
| Nothing happens until the player taps twice | The game waited for keyboard focus |
| Charge attack opens a text menu | `contextmenu` not suppressed on long press |
| Tutorial tells phone players to press `Space` | Instructions written for one input |
