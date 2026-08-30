# Mirror — HTML5 Rebuild Plan

**Source project:** `/Users/dcorsi/Developer/Mirror/mirror` (Unity 2019, `develop` @ `d41de28`)
**Target:** `/Users/dcorsi/Developer/Mirror/HTMLl_rebuild`
**Date:** 2026-08-29
**Approach:** Full rewrite in TypeScript from scratch, reusing the original assets and using the C# source as behavioural specification. No Unity WebGL export.

---

## 1. Verdict

**This is a very favourable port.** Far more so than a typical Unity→web project. Three findings drive that conclusion:

1. **The real game logic is ~1,380 lines of C#**, not 6,292. `Libs/clipper.cs` (4,913 lines) is a third-party polygon-clipping library used purely as a build-time optimisation, and **the web port does not need it at all** (see §6.3).
2. **Levels are PNG images** — one pixel per tile, colour-keyed to a tile type. All 21 levels port across losslessly with a pixel-read loop. No level rebuilding, no scene parsing.
3. **The physics is hand-written and kinematic**, not Unity's dynamic rigidbody solver. `PhysicsObject.cs` is a self-contained ~120-line integrator we can reimplement exactly. This removes the single biggest risk in most Unity ports — that gameplay feel is locked inside an opaque physics engine.

The parts that *don't* port (Unity Animator state machines, ParticleSystem, the MK Glow post-processing shader, AdMob/IAP) are all cosmetic or mobile-monetisation concerns and are either trivially re-created or dropped outright.

**Realistic scope: a small project.** The vertical slice is a few days of work; full feature parity including menus, 21 levels, audio and polish is a moderate but very tractable effort.

---

## 2. What the game actually is

Reconstructed from the source — this is the design spec to build against.

**Mirror** is a 2D auto-runner with a two-body twist:

- **Two players run simultaneously**, left to right, at constant speed.
  - `Player 1` — `gravityModifier: +3` — runs along the **floor**.
  - `Player 2` — `gravityModifier: -3` — runs along the **ceiling**, upside down.
- Both are mirrored through the horizontal centre line. The level geometry is what differs between the two halves — that's the whole design tension.
- **Input:** tap/click the **right half** of the screen to jump Player 1; the **left half** to jump Player 2. (In `PlayerController.ComputeVelocity`, gated on `gravityModifier` sign.) A debug `jumpKey` exists for keyboard.
- **Single jump only** — `jumped` latches true until the player is `grounded` again. No double jump.
- **Fail:** if *either* player hits an `Obstacle`, or leaves the play bounds (`Bound/left`, and `Bound/top`/`Bound/bottom` depending on which player), the run ends → death screen.
- **Win:** *both* players must reach `Bound/win`. `GameMain.Update` waits until no player reports `!levelEnd()`.
- **Collectibles:** `Stars` — up to 3 per level, stored as a per-level best score.
- **Boost pads:** `BoostUp` trigger raises jump velocity from `12` to `20` while overlapping.
- **Camera** auto-scrolls right at a constant `7 units/s`, starting once a player crosses its x position, and clamps at the level end.

### Progression / meta
- 21 levels, unlocked sequentially (`unlockedLevel` increments on first completion).
- Per-level star record (`starsForLevel_1[500]`).
- Level-select grid, menu, death screen, win screen, end-of-game screen, tutorial overlay on level 1.
- Music toggle.
- Three "game versions" (free / premium / developer) gating ads and level unlocks — **drop this entirely for web** (§4).

---

## 3. Exact physics specification

This is the highest-fidelity part of the port and must be reproduced precisely or the game will feel wrong.

### Constants (extracted from prefabs & project settings)

| Constant | Value | Source |
|---|---|---|
| `Physics2D.gravity` | `(0, -9.81)` | `ProjectSettings/Physics2DSettings.asset` |
| `gravityModifier` | `+3` (P1) / `-3` (P2) | `Prefabs/Player 1.prefab`, `Player 2.prefab` |
| **Effective gravity** | **∓29.43 u/s²** | derived |
| `speed` (horizontal) | `6.5` | player prefabs (script default is `6.25` — prefab wins) |
| `jumpTakeOffSpeed` | `12` | player prefabs |
| `jumpBoostSpeed` | `20` | player prefabs |
| `speedDecay` | `4.0` | `PlayerController.cs` |
| `minGroundNormalY` | `0.7` | `PhysicsObject.cs` |
| `minMoveDistance` | `0.001` | `PhysicsObject.cs` |
| `shellRadius` | `0.01` | `PhysicsObject.cs` |
| Camera scroll speed | `7` | `CameraController.cs` |
| Camera `orthographicSize` | `10` → 20 units tall | `Prefabs/Main Camera.prefab` |
| Target framerate | `60`, vSync off | `GameMain.Awake` |

### Integration algorithm (`PhysicsObject.FixedUpdate`)

Reproduce this order of operations exactly:

1. `velocity += gravityModifier * gravity * dt`
2. `velocity.x = targetVelocity.x` (horizontal speed is *always* forced, never integrated)
3. `grounded = false`
4. `deltaPosition = velocity * dt`
5. `moveAlongGround = perpendicular(groundNormal) * sign(gravityModifier)`
6. **Pass A (horizontal):** move along the ground tangent, scaled so x-displacement stays exactly `deltaPosition.x` — this keeps forward speed constant on slopes.
7. **Pass B (vertical):** move `(0, deltaPosition.y)`.

Each pass is a swept cast: find the nearest hit, clamp travel to `hit.distance - shellRadius`, and for surfaces where `sign(gravityModifier) * normal.y > 0.7`, set `grounded = true`. On the vertical pass only, project out the velocity component into the surface (`velocity -= dot(velocity, normal) * normal`) and adopt the new `groundNormal`. If a pass hits nothing, reset `groundNormal` to straight up (times gravity sign).

> ⚠️ **Note a quirk worth preserving:** the original uses `Time.deltaTime` inside `FixedUpdate`, not `Time.fixedDeltaTime`. Combined with `targetFrameRate = 60` this made physics frame-rate-coupled. **Recommendation:** run the web port on a *fixed 1/60 s accumulator* — this reproduces the intended feel while being deterministic and frame-rate independent, which is strictly better than the original.

### Player state
- `jump()` is refused when `jumped || dead`. It sets `velocity.y = jumpSpeed * sign(gravityModifier)`.
- `grounded` clears `jumped` each frame it is true.
- On death, `speed` decays by `speedDecay * dt` toward 0 (the runner skids to a halt) while the death animation plays.

---

## 4. Code inventory — what ports, what changes, what's dropped

| File | Lines | Disposition |
|---|---|---|
| `PhysicsObject.cs` | 121 | **Port precisely.** Core game feel. → `physics.ts` |
| `PlayerController.cs` | 116 | **Port**, swap Unity input for pointer events. → `player.ts` |
| `PlayerCollision.cs` | 87 | **Port** as trigger/tag resolution. → merge into `player.ts` |
| `LevelGenerator.cs` | 72 | **Port**, simplified — pixel read → tile grid. → `level.ts` |
| `CameraController.cs` | 57 | **Port** directly, trivial. → `camera.ts` |
| `GameMain.cs` | 293 | **Rewrite** as a screen/state machine. Much of its bulk is Unity `SetActive` juggling that DOM/scene states replace. → `game.ts` + `ui/` |
| `GameState.cs` + `GameStateData.cs` | 100 | **Rewrite** onto `localStorage` JSON. → `save.ts` |
| `SaveSystem.cs` | 35 | **Replace** (binary formatter → JSON). |
| `AudioController.cs` | 49 | **Rewrite** on WebAudio / Howler. → `audio.ts` |
| `Parallax.cs` | 29 | **Port**, trivial. |
| `ColliderUtils.cs` | 122 | **Drop** — see §6.3 |
| `Libs/clipper.cs` | 4,913 | **Drop** — see §6.3 |
| `AdController.cs` | 38 | **Drop** — AdMob, mobile-only |
| `IAPController.cs` | 197 | **Drop** — Google Play billing, mobile-only |
| `ShowFPS.cs` | 28 | Optional dev overlay, re-write in 5 lines |
| `UpdateGameMargin.cs` | 26 | **Re-think** — was notch/safe-area handling; web needs its own responsive strategy (§6.4) |

**Net: ~600 lines of real logic to port, ~5,300 lines dropped.**

Dropping ads + IAP also removes the free/premium/developer version split — for a web build, **all 21 levels should simply be unlockable by play**, which deletes a whole axis of conditional logic from `GameMain`.

---

## 5. Asset inventory

All assets are reusable as-is or with a trivial conversion.

| Asset | Detail | Action |
|---|---|---|
| `Assets/Levels/level_0..20.png` | 21 levels, ~98–162 × **20** px | **Use directly.** Read pixels at load. |
| `Assets/Images/tileset.png` | 324×324 | Reuse; needs frame-rect extraction from `.meta` |
| `Assets/Images/sprites.png` | 324×324, 6 sub-sprites (`sprites_0..5`) | Reuse; character frames |
| `Assets/Sprites/stickman.png`, `circle.png` | — | Reuse |
| `Assets/Images/background.png` | 3840×2160 | Reuse, **downscale** for web (see §8) |
| `Assets/Images/background_completed.png` | 3840×2160 | Reuse, downscale |
| `Assets/Images/UI/*.png` | ~20 UI sprites | Reuse |
| `Assets/Music/*.mp3` | 6 tracks | Reuse directly; MP3 is web-native |
| `Assets/Font/Quicksand-Regular.otf` | — | Convert to `.woff2` |
| `Assets/Animations/*.anim` | 9 clips + 2 controllers | **Re-author** — read for frame order/timing, rebuild as JSON frame lists |
| `Assets/GlowMaterial`, `Assets/_MK` | MK Glow post-FX | **Re-create** as CSS/canvas bloom, or drop |

### Tile types
14 tile prefabs (`Tile_0` … `Tile_12`, `Tile_Star`). Confirmed sample semantics:
- `Tile_0` — full 1×1 square, tag `Platform`
- `Tile_3` — **slope** (diagonal polygon), tag `Platform`
- `Tile_9`, `Tile_10` — animated, tag `BoostUp` (trigger, no solid collision)
- `Tile_Star` — collectible trigger

Tags in use: `Platform`, `Obstacle`, `BoostUp`, `Stars`, `Bound/left`, `Bound/top`, `Bound/bottom`, `Bound/win`, `Player`.

---

## 6. Key technical decisions

### 6.1 Engine: **plain TypeScript + Canvas2D (no game framework)**

I recommend **not** using Phaser here, reversing my earlier default suggestion — the recon changed the picture:

- The physics is bespoke and must be reproduced *exactly*. Phaser's Arcade physics would fight us; we'd end up bypassing it anyway.
- There is no tilemap authoring need — levels are already a pixel grid.
- Rendering is a scrolling grid of 1×1 sprites plus two characters. Canvas2D handles this comfortably at 60 fps.
- No physics engine, no scene graph, no asset pipeline needed → **zero dependencies, tiny bundle, total control.**

Use **Vite + TypeScript** for dev server, HMR and bundling. If profiling later shows fill-rate limits, swapping the renderer for WebGL (PixiJS) is a contained change behind a `Renderer` interface.

### 6.2 Level loading

Decode each `level_N.png` to an `ImageData` via an offscreen canvas, then walk the pixels. Unity's `GetPixel(x, y)` is **bottom-left origin**; canvas `ImageData` is **top-left origin** — the y axis must be flipped during import or every level will be upside down.

Build the colour→tile map once (§9, Phase 0) and bake it to `tiles.json`, rather than resolving Unity GUIDs at runtime.

### 6.3 Why `clipper.cs` and `ColliderUtils.cs` are dropped

`LevelGenerator` instantiated one `PolygonCollider2D` per tile, then used Clipper to **union thousands of tile polygons into a few merged colliders** — purely to stop Unity's broadphase from choking.

The web port has no such constraint. Because tiles live on a **1×1 integer grid**, collision becomes a direct grid lookup: from the player's swept AABB, compute the small range of candidate cells and test only those. That's O(handful) per step with no preprocessing and no library.

> **Phase 0 update — this got simpler still.** The slope tiles (`Tile_3`…`Tile_6`) turn out to appear
> in **zero levels**. Every solid tile actually used (`Tile_0`, `Tile_1`, `Tile_2`) is an exact unit
> square, so **all solid geometry is axis-aligned on an integer grid** — plain swept AABB, no polygon
> tests at all. `groundNormal` is therefore always `(0, ±1)`; port the `moveAlongGround` tangent
> logic for fidelity, but it can never produce a diagonal.
>
> Non-solid shapes (spikes, stars, boost pads) are all **triggers**, so they need only cheap overlap
> tests — the 9-point spike and 19-point star outlines can be approximated by an AABB or circle.

### 6.4 Responsive layout

The original targeted portrait mobile with a fixed 20-unit-tall viewport. For web:
- Keep the **20-unit vertical extent authoritative** — it defines the playfield and must never change, or levels become unfair.
- Letterbox horizontally: width in units = `20 * (canvasWidth / canvasHeight)`.
- Render at `devicePixelRatio`, cap at 2 for performance.
- Input halves are screen-relative, so they adapt automatically.

### 6.5 Animation

Unity `.anim` clips are YAML with sprite keyframes. Rather than writing an importer, read them once for frame order and timing, then hand-author a small JSON:

```json
{ "run": { "frames": [0,1,2,3], "fps": 12, "loop": true },
  "jump": { "frames": [4], "loop": false },
  "death": { "frames": [5], "loop": false } }
```

States needed, from the Animator params in `PlayerController`: `grounded`, `up`, `jump` (trigger), `dead`/`death` (trigger).

### 6.6 Particles

`landParticles`, `jumpParticles`, `trail` are Unity ParticleSystems. Re-create as a **minimal custom emitter** (~80 lines: position, velocity, lifetime, fade). Cosmetic — defer to the polish phase.

---

## 7. Proposed architecture

```
HTMLl_rebuild/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tools/
│   ├── extract-tiles.ts      # Unity prefabs → tiles.json (build-time, run once)
│   └── prepare-assets.ts     # copy/downscale/convert from ../mirror/Assets
├── public/assets/
│   ├── levels/               # level_0..20.png (copied as-is)
│   ├── images/               # tileset, sprites, UI, backgrounds
│   ├── music/                # 6 mp3
│   └── font/quicksand.woff2
└── src/
    ├── main.ts               # bootstrap, canvas, resize, RAF loop
    ├── core/
    │   ├── loop.ts           # fixed-timestep accumulator (1/60)
    │   ├── input.ts          # pointer/touch/keyboard → left|right jump intents
    │   ├── assets.ts         # preloader
    │   └── renderer.ts       # Canvas2D draw layer (swappable)
    ├── game/
    │   ├── physics.ts        # PhysicsObject port — swept AABB vs grid
    │   ├── player.ts         # PlayerController + PlayerCollision
    │   ├── level.ts          # PNG → tile grid; triggers; stars
    │   ├── tiles.ts          # tiles.json types + collision shapes
    │   ├── camera.ts         # auto-scroll
    │   ├── parallax.ts
    │   └── particles.ts
    ├── state/
    │   ├── save.ts           # localStorage progression
    │   └── screens.ts        # menu/select/game/death/win/end state machine
    ├── ui/                   # DOM-based menus & HUD overlaid on canvas
    └── audio/audio.ts
```

**UI as DOM, not canvas.** Menus, level select and buttons are far easier, more accessible and more responsive as HTML/CSS layered over the canvas than as hand-drawn canvas widgets. Only the HUD elements that must align with the playfield get drawn in-canvas.

---

## 8. Phased plan

### Phase 0 — Asset & data extraction ✅ **COMPLETE**
1. ✅ Resolved the **colour → tile mapping** (16 entries) from `GameManager.prefab` merged with scene overrides, cross-checked against a histogram of all 21 level PNGs.
2. ✅ Extracted every tile's tag + collider geometry → `extracted/tiles.json`.
3. ✅ Extracted atlas slicing → `extracted/sprites.json` (Unity *and* canvas coordinates).
4. ✅ Populated `public/assets/` — 21 levels, images, 34 UI sprites, 6 tracks, woff2 font; backgrounds downscaled.
5. ✅ Answered all four open questions; found one new risk (aspect-dependent bounds).

**Full write-up: `PHASE0-FINDINGS.md`.** Extractors are re-runnable (`tools/*.py`, venv at `.venv`).

> This phase de-risked everything downstream, and paid off: it eliminated the slope-collision risk entirely and revealed two Unity quirks (alpha-before-colour, first-match-wins) that would each have silently corrupted every level.

### Phase 1 — Vertical slice ⚙️ **BUILT, AWAITING PLAYTEST**

Implemented and verified numerically; **not yet confirmed by actually playing it** (see below).

**Run it:** `npm run dev` → http://localhost:5173 (`?debug` for hitboxes and bounds, `?level=N` to pick a level).
**Test it:** `npm run test` — typecheck + physics sim + all-levels loader check.

Built:
- Fixed 1/60 timestep loop, Canvas2D renderer, 20-unit playfield with horizontal letterboxing.
- `PhysicsObject` ported line-for-line; swept AABB against the integer grid.
- Both players, gravity ±3, tap-half / keyboard input, single-jump latch, boost pads.
- Camera auto-scroll with camera-carried bounds; death, win, restart.
- Real tileset sprites for platforms, spikes and stars; neon edges per tile role.

Verified headlessly (`tools/sim.ts`, `tools/check_levels.ts`):
- Jump apex 2.347u vs analytic 2.446u; airtime 0.800s vs 0.815s; reach 5.20u vs 5.30u.
- **Mirror symmetry exact to 1e-9** — P1 rises exactly as far as P2 falls.
- Zero penetration into solid tiles across 3,000 stress steps.
- Level loader cross-validated cell-by-cell against the independent Python extraction: **0 mismatches**.
- All 21 levels load with valid spawns, exactly 3 stars, height 20.
- Autopilot traverses all 162 units of level_0 with both players.

Bugs found and fixed after first run in a real browser:
- **Vite bound IPv6 (`[::1]`) only** — Safari resolves localhost to IPv4 and got connection-refused.
  Fixed with `server.host: true` in `vite.config.ts`. This was the "black screen".
- **No background drawn** — platform bodies are pure black, so the level was black-on-black.
- **Camera start position not re-derived on resize**, mis-framing the level start.
- **`Tile_7` is rotated 180° in the prefab** (ceiling spikes) but was drawn unrotated *and* given
  the floor-spike hitbox — so ceiling spikes had an invisible hitbox in the wrong half of the cell.
  Same top/bottom pairing as `Tile_1`/`Tile_2`.

⚠️ **Outstanding: the feel check.** The game now runs, but has not been A/B'd against `run.apk`.
"Matches the analytic envelope" is not "feels like the original" — that judgement needs a human at
the keyboard, and it is the stated exit criterion for this phase.

Known gaps (deliberate for this phase): players draw as rectangles (no stickman animation),
no audio, no menus, star collection is not persisted, boosted jump not yet play-tested.

Original goal for reference: **one level, fully playable, correct feel.**
- Fixed-timestep loop, canvas, asset loading.
- `level_1.png` → tile grid → rendered with the tileset.
- Both players spawning, running, gravity ±3, jumping on left/right tap.
- Swept AABB collision incl. slopes; `grounded` logic.
- Camera auto-scroll.
- Death on obstacle/bounds; win on reaching the end; restart.
- **No** menus, audio, particles, stars, animation — placeholder rectangles are fine.

**Exit criterion:** the level plays and *feels* like the original APK (`run.apk` is on hand for side-by-side comparison — install it on a device or emulator to A/B the jump arc). This is where fidelity is won or lost; do not move on until it matches.

### Phase 2 — Content complete ✅ **DONE**
- ✅ All 21 levels load and play; decoded on demand and cached.
- ✅ Stars: collection, per-level best, persisted.
- ✅ Boost pads — verified against the analytic boosted apex (6.63u vs 6.80u).
- ✅ **Player animation from the original bone rig.** The Unity character is a
  sprite-rigged mesh, which Canvas2D cannot skin — but it is a stick figure made of
  capsules, so `tools/extract_rig.py` exports the 11-bone hierarchy and the real
  euler curves from all 6 `.anim` clips (6 KB), and `rig.ts` does forward kinematics
  and draws the bones. Run / fly-up / fly-down / death clips are wired to the same
  Animator parameters the original used.
- ✅ Save system on `localStorage` (`state/save.ts`), replacing the BinaryFormatter blob.

### Phase 3 — Shell & meta ✅ **DONE**
- ✅ Menu, level-select grid with lock states and per-level stars, death / win /
  end-of-game screens, level-1 tutorial overlay.
- ✅ Music: 6 tracks, cycling per level, menu theme, mute toggle persisted,
  unlocked on first gesture (browser autoplay policy).
- ✅ Responsive layout, safe-area insets, touch + mouse + keyboard.
- Dropped deliberately: the free/premium/developer split, ads and IAP. Every level
  unlocks by play, as in the original's premium build.

### Phase 4 — Polish ✅ **DONE**
- ✅ Particles: running trail, jump burst, landing burst (fixed-capacity pool, no
  per-particle allocation inside the fixed step).
- ✅ Parallax background; `background_completed` swaps in on win.
- ✅ Glow: achieved via canvas `shadowBlur` on the neon edges, stars and players —
  no post-processing needed, because the original's glow was a baked sprite layer.
- ✅ **Playfield pinned to the shipped 16:9 and letterboxed** (`PLAYFIELD_ASPECT`).
  This closes the last open risk from Phase 0: view distance and the win /
  fall-behind lines all derive from the camera half-width, so a portrait phone
  would otherwise see ~9 tiles ahead instead of 35. Every viewport now gets the
  playfield the levels were designed against. Portrait phones get a rotate hint.
- ✅ Perf: locked 60 fps on the densest level (1,357 tiles) with particles and rig
  animation — median 16.7 ms, worst 16.8 ms, and that was software-rendered.
- ✅ Audio: streamed (never blocks load), unlocked on first gesture, re-encoded to
  96k AAC — 17.1 MB → 10.5 MB (39% smaller).
- ✅ Payload trim: the 34 UI sprites and the unused character/tile sheets are no
  longer shipped (the shell is HTML/CSS and the player is drawn from the rig),
  cutting ~3.7 MB.
- ✅ Production build verified end-to-end via `vite preview`.

**Shipping size:** `dist/` is 12 MB total, of which 12 MB is music that streams on
demand. **Initial load is 395 KB** (26 KB JS / 9.6 KB gzipped, plus the tileset,
backgrounds, font and level PNGs).

### Deploying
`npm run build` produces a fully static `dist/` — no server logic, no environment
config. It can be dropped on any static host (Netlify, Vercel, GitHub Pages, S3,
Cloudflare Pages). The only requirement is that `.m4a` is served with a sensible
content type, which every mainstream host does by default.

---

## 9. Risks & open questions

> **Updated after Phase 0 — see `PHASE0-FINDINGS.md` for evidence.**

| Risk | Severity | Status / Mitigation |
|---|---|---|
| **Jump feel doesn't match** | Medium | ⏳ **Open** — the one real remaining unknown. Constants all extracted (§3); reproduce integration order exactly and A/B against `run.apk`. This is what Phase 1 exists to settle. |
| **Aspect-ratio-dependent bounds** | Medium | 🆕 **New.** The `Bound/win` / `Bound/left` triggers sit at hard-coded camera offsets (`+19.01` / `−23.15`) authored for the shipped mobile aspect, while `cameraWidth` is computed at runtime. On an arbitrary web viewport these place the win and death lines inconsistently. **Re-derive both from camera half-width; don't copy the literals.** Decide in Phase 1. |
| Mobile browser audio autoplay policy | Low | Standard unlock-on-first-tap. |
| Original had frame-rate-coupled physics | Low | Fixed timestep is a deliberate, documented improvement. |
| ~~Colour→tile map unrecoverable~~ | — | ✅ **Resolved** — recovered from `GameManager.prefab` + scene overrides, verified against every level pixel. |
| ~~Slope collision subtleties~~ | — | ✅ **Eliminated** — no slope tile appears in any level (§6.3). |
| ~~Player spawn positions unknown~~ | — | ✅ **Resolved** — reserved pixel colours, exactly one per player per level. |
| ~~`Bound/*` authored vs derived~~ | — | ✅ **Resolved** — children of the camera; geometry documented. |
| ~~Obstacle vs Platform per tile~~ | — | ✅ **Resolved** — full table in `extracted/tiles.json`. |
| ~~Star rating rule~~ | — | ✅ **Resolved** — exactly 3 stars per level; rating = count collected. |
| ~~4K backgrounds heavy~~ | — | ✅ **Resolved** — downscaled to 1920 (515 KB → 253 KB). |

### Open questions from Phase 0 — all answered
1. ~~Where do the two players spawn?~~ → **Reserved pixel colours**: `#0000FF` = P1, `#FFFF00` = P2. Exactly one of each in all 21 levels.
2. ~~Are `Bound/*` authored or derived?~~ → **Authored as camera children**, moving with the camera. Offsets in `PHASE0-FINDINGS.md` §5.
3. ~~Which tiles are `Obstacle` vs `Platform`?~~ → Only 8 tile types are used at all; `Tile_0/1/2` = Platform, `Tile_7/8` = Obstacle, `Tile_9/10` = BoostUp, `Tile_Star` = Stars.
4. ~~Star rating rule?~~ → Every level holds exactly 3 stars; rating is simply how many were collected.

### Two behaviours that must be replicated, not "fixed"
- **Alpha is tested before colour.** Many level pixels carry a real RGB at `a: 0` and are empty cells. Matching colour first would add thousands of phantom tiles.
- **First colour match wins.** Mapping entries 14/15 (`Tile_11`/`Tile_12`, "Bridge") were left white, colliding with `Tile_Star` at entry 13, so they can never spawn. Correcting this would change level layouts.

---

## 10. Recommendation

Proceed. Start with **Phase 0**, which is mostly mechanical extraction and answers every open question above, then hold a checkpoint before committing to Phase 1.

The single most important discipline for this port: **treat Phase 1 as a feel-matching exercise, not a feature-delivery exercise.** Everything after it is straightforward content and UI work; nothing after it can rescue a jump arc that's subtly wrong.
