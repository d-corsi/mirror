# Phase 0 — Extraction & Verification Findings

**Status: complete.** Every open question from `PLAN.md` §9 is resolved. No blockers found.

Artifacts produced:

| Path | Contents |
|---|---|
| `extracted/colormap.json` | 16 colour→prefab mappings + level ordering |
| `extracted/tiles.json` | Per-tile tag, collider geometry, sprite layers |
| `extracted/sprites.json` | Atlas slicing (Unity + canvas coordinates) |
| `public/assets/` | 21 levels, images, UI, music, woff2 font — 20 MB |
| `tools/*.py` | Re-runnable extractors (venv at `.venv`) |

---

## 1. Colour → tile mapping (recovered in full)

The mapping lives in `Prefabs/GameManager.prefab` and is partly overridden by prefab-instance
overrides in `Scenes/GameScene.unity`. Both were merged, scene winning.

| # | Colour | Prefab | Tag | Used? |
|---|---|---|---|---|
| 0 | `#000080` | Tile_1 | Platform | ✅ 2,056 px |
| 1 | `#808000` | Tile_2 | Platform | ✅ 2,069 px |
| 2 | `#004000` | Tile_3 | Platform | ❌ never |
| 3 | `#400000` | Tile_4 | Platform | ❌ never |
| 4 | `#000000` | Tile_0 | Platform | ✅ 12,103 px |
| 5 | `#000040` | Tile_5 | Platform | ❌ never |
| 6 | `#404040` | Tile_6 | Platform | ❌ never |
| 7 | `#0000FF` | **Player 1** | Player | ✅ 21 px (1/level) |
| 8 | `#FFFF00` | **Player 2** | Player | ✅ 21 px (1/level) |
| 9 | `#FF00FF` | Tile_8 | Obstacle | ✅ 39 px |
| 10 | `#FF8000` | Tile_7 | Obstacle | ✅ 39 px |
| 11 | `#00FF80` | Tile_9 | BoostUp | ✅ 8 px |
| 12 | `#80FF00` | Tile_10 | BoostUp | ✅ 7 px |
| 13 | `#FFFFFF` | Tile_Star | Stars | ✅ 63 px |
| 14 | `#FFFFFF` | Tile_11 | Bridge | ❌ **shadowed** |
| 15 | `#FFFFFF` | Tile_12 | Bridge | ❌ **shadowed** |

**Verified empirically** by histogramming all 21 level PNGs — every non-transparent colour present
resolves to a mapping entry, and vice versa.

### Two quirks that must be replicated

1. **Entries 14 and 15 are dead.** Both were left at white (`#FFFFFF`), colliding with entry 13
   (`Tile_Star`). `LevelGenerator.GenerateTile` does a linear scan and takes the **first** match, so
   `Tile_11`/`Tile_12` (the "Bridge" tiles) could never spawn. They are not in the shipped game.
   Reproduce the first-match rule, and do not "fix" this — it would change level layouts.

2. **Alpha is checked before colour.** Many level pixels carry a real RGB with `a: 0`
   (e.g. `#808000` at alpha 0 — 2,899 pixels). Unity's `if (pixelColor.a == 0) return null;` runs
   *first*, so these are empty cells despite looking like tiles. **Importers must test alpha before
   matching colour**, or levels gain thousands of phantom tiles.

3. One stray pixel — `#FFFFFF37` (alpha 55) at `level_2.png` unity `(7, 15)`. Alpha ≠ 0 so it isn't
   skipped by the alpha test, but it matches no mapping → `GenerateTile` returns `null`. Net effect:
   empty cell. Any implementation that skips unmatched colours handles it correctly by accident.

---

## 2. Level format — confirmed

- **21 levels**, `levels[i]` = `level_i.png`. The game indexes `levels[currentLevel - 1]`, so
  in-game **"LEVEL 1" is `level_0.png`**. Off-by-one is a real trap here.
- All levels are **20 px tall**; widths range 92–162 px.
- 1 pixel = 1 tile = 1 world unit = 108 texture pixels (`spritePixelsToUnits: 108`).
- **Unity `GetPixel` is bottom-left origin; canvas `ImageData` is top-left.** Flip Y on import.
- Two files in `Assets/Levels/` are dev leftovers never wired into `levels[]` and must not ship:
  `level_z.png`, `test-level.png`. `prepare_assets.py` excludes them.

### Player spawns — **answered**
Spawn positions come from **reserved pixel colours**, not the scene: blue `#0000FF` = Player 1,
yellow `#FFFF00` = Player 2. Verified: **exactly one of each in all 21 levels.**

`LevelGenerator` instantiates the player prefab at the pixel coordinate, overriding the prefab's
authored position — so only the pixel matters.

### Stars — **answered**
**Every level contains exactly 3 star pixels.** The rating rule is simply the count collected (0–3);
`GameState.setStarsForLevel` keeps the per-level maximum.

---

## 3. ⚠️ The single most important finding: **there are no slopes**

`PLAN.md` flagged slope handling as a medium risk. It is **eliminated**.

The four slope tiles — `Tile_3`, `Tile_4`, `Tile_5`, `Tile_6`, each a 5-point polygon with a
diagonal edge — **appear in zero levels**. The only Platform tiles actually used are:

| Tile | Collider |
|---|---|
| `Tile_0` | `[-0.5,0.5] [-0.5,-0.5] [0.5,-0.5] [0.5,0.5]` — exact unit square |
| `Tile_1` | identical unit square |
| `Tile_2` | identical unit square |

**All solid geometry in the shipped game is axis-aligned unit squares on an integer grid.**

Consequences:
- `groundNormal` is always `(0, ±1)`. The `moveAlongGround` tangent computation still runs but is a
  no-op rotation — port it for fidelity, but it can never produce a diagonal.
- Collision becomes plain **swept AABB against a grid** — no polygon tests, no `minGroundNormalY`
  edge cases, no slope-induced divergence.
- This retires the "slope collision subtleties" risk entirely.

### Tile roles (validated by rendering levels from the recovered mapping)

`Tile_1` and `Tile_2` occur in **near-exactly equal counts in every level** — they are the two faces
of the same platform:

- **`Tile_1` (`#000080`)** — platform **top** face, the surface Player 1 runs on.
- **`Tile_2` (`#808000`)** — platform **bottom** face, the surface Player 2 runs along upside down.
- **`Tile_0` (`#000000`)** — plain black **interior fill**, used where a platform is thicker than
  two tiles. It is the most common tile overall (12,103 px) but carries no distinct role.

This is the game's central conceit made literal: a single platform is simultaneously Player 1's
floor and Player 2's ceiling.

### Content distribution — useful for sequencing

| Feature | Appears in |
|---|---|
| Platforms only (`Tile_0/1/2`) | every level |
| Obstacles (`Tile_7`, `Tile_8`) | **only levels 17 and 18** |
| Boost pads (`Tile_9`, `Tile_10`) | **only level 20** |
| Stars | every level (exactly 3) |

`level_0.png` (in-game "LEVEL 1") uses **only `Tile_1` + `Tile_2`** — no fill, no hazards. It is the
simplest possible case and therefore the right target for the Phase 1 vertical slice.

### Other collider shapes

| Tile | Tag | Collider | Trigger |
|---|---|---|---|
| `Tile_7`, `Tile_8` | Obstacle | identical 9-point spike, occupying `y ∈ [-0.5, -0.157]` | ✅ |
| `Tile_9`, `Tile_10` | BoostUp | 1×1 box | ✅ |
| `Tile_Star` | Stars | 19-point star outline | ✅ |

Only `Platform` tiles are solid. Everything else is a trigger — obstacles kill on overlap rather
than blocking. The star's 19-point outline can safely be approximated by a circle or AABB.

---

## 4. Player hitbox

The `EdgeCollider2D` is on the **root** Player GameObject, which is scaled **0.375**. Raw points
therefore overstate the hitbox by ~2.7×.

```
local  bounds : x[-0.8577, 0.7019]  y[-0.9241, 0.8280]   (1.5596 × 1.7521)
world  size   : 0.5848 × 0.6570      ← tiles are 1 × 1
world  bounds : x[-0.3216, 0.2632]  y[-0.3465, 0.3105]  (relative to transform origin)
```

Note the shape is a **slanted closed polyline** (a leaning stickman), not a box, and it is
**not centred** on the origin — it sits slightly left and low. An AABB of `0.585 × 0.657` at the
above offsets is the recommended approximation; treat the exact outline as a fidelity knob if the
feel is off in Phase 1.

Both players share identical collider geometry and scale — they differ only in `gravityModifier`
(`+3` / `-3`).

---

## 5. Level bounds & camera — **answered**

The four `Bound/*` triggers are **children of the Main Camera prefab**, so they travel with the
camera rather than being derived from level dimensions.

Camera root transform: **`(15, 9, −10)`**, `orthographicSize: 10` → 20 units tall.
`CameraController` only ever moves **x**; **camera Y is fixed at 9**.

| Object | Tag | Offset from camera | Size |
|---|---|---|---|
| `LimitEnd` | `Bound/win` | `x + 19.01` | 1 × 40 |
| `LimitStart` | `Bound/left` | `x − 23.15` | 1 × 40 |
| `LimitTop` | `Bound/top` | `y + 15` → world y 24 | 50 × 1 |
| `LimitBottom` | `Bound/bottom` | `y − 15` → world y −6 | 50 × 1 |

With the camera at y = 9 the visible band is y ∈ [−1, 19], while the level occupies y ∈ [−0.5, 19.5].
Top/bottom death therefore triggers ~5 units **beyond** the visible edge — a deliberately generous
margin.

Camera motion (from `CameraController`):
- starts at `x = cameraWidth / 2`, stationary
- begins scrolling at **7 u/s** once any player's `x` reaches the camera's `x`
- clamps at `levelEnd = map.width − cameraWidth/2 − 1`

> ⚠️ **Aspect-ratio dependency — new risk.** `cameraWidth` is computed at runtime from
> `Screen.width / Screen.height`, but the bound offsets (`+19.01`, `−23.15`) are **hard-coded for
> whatever aspect the game shipped at**. On the web, where the viewport is arbitrary, these offsets
> would place the win/left bounds at inconsistent distances from the visible edge — changing when a
> player dies for falling behind, and when the level ends.
>
> **Recommendation:** re-derive both from the camera half-width at runtime rather than copying the
> literals, and pin the design to the shipped aspect. Decide this explicitly in Phase 1 — it is the
> one place where "port the numbers exactly" is the wrong instinct.

---

## 6. Sprites & atlases

Both sheets are clean 3×3 grids of 108×108 at `spritePixelsToUnits: 108` (1 sprite = 1 unit):

- `Images/sprites.png` — 324×324, 6 sub-sprites (`sprites_0`…`sprites_5`)
- `Images/tileset.png` — 324×324, 9 sub-sprites (`tileset_0`…`tileset_8`)

`extracted/sprites.json` carries both Unity (bottom-left) and `canvasY` (top-left) coordinates.

Tiles render as **up to three stacked layers** — e.g. `Tile_1` draws `sprites` + `sprite_glow` +
`tileset`. The glow layer is a separate texture (`sprite_glow.png`), which means **the neon look does
not depend on the MK Glow post-processing shader** for tiles; it is baked into an alpha sprite. That
makes the visual style far cheaper to reproduce than the plan assumed.

`Tile_9`, `Tile_10`, `Tile_Star`, and both players carry Animators.

---

## 7. Assets prepared

```
public/assets/
├── levels/     21 PNGs (dev leftovers excluded)
├── images/     8 sprites + 2 backgrounds (4K → 1920, 515 KB → 253 KB)
│   └── ui/     34 UI PNGs
├── music/      6 MP3s, filenames lowercased/underscored
└── font/       quicksand-regular.woff2 (28 KB → 18 KB)
                                              total: 20 MB
```

Music dominates the payload (~15 MB). Worth lazy-loading per-track, or re-encoding to a lower
bitrate / Opus, during Phase 4.

The Unity project at `../mirror` was treated as **read-only** throughout; nothing was modified.

---

## 8. Updated risk register

| Risk (from `PLAN.md` §9) | Status |
|---|---|
| Colour→tile map unrecoverable | ✅ **Resolved** — recovered from prefab + overrides, verified against level pixels |
| Slope collision subtleties | ✅ **Eliminated** — no slope tile appears in any level |
| Player spawn positions unknown | ✅ **Resolved** — reserved pixel colours, 1 per player per level |
| `Bound/*` authored vs derived | ✅ **Resolved** — camera children, offsets documented |
| Obstacle vs Platform per tile | ✅ **Resolved** — full table in `tiles.json` |
| Star rating rule | ✅ **Resolved** — exactly 3 per level, count collected |
| 4K backgrounds heavy | ✅ **Resolved** — downscaled |
| **Aspect-ratio-dependent bounds** | 🆕 **New** — hard-coded offsets; must re-derive (§5) |
| Jump feel doesn't match | ⏳ Open — Phase 1 concern; all constants extracted |

---

## 9. Recommended amendments to `PLAN.md`

1. **§6.3 / Phase 1** — drop polygon collision from the plan. Solid tiles are unit squares only;
   implement swept AABB vs. integer grid. Keep the spike/star/boost triggers as simple overlap tests.
2. **§9** — retire the slope and spawn risks; add the aspect-ratio bounds risk.
3. **Phase 4** — the glow is a baked sprite layer, not post-processing. Reproducing the look is
   mostly "draw three layers in order", so it can move earlier and cheaper than planned.
4. **Phase 2** — only 8 tile types need rendering support, not 14.

**Phase 1 is unblocked.** The remaining unknown is jump feel, which is exactly what the vertical
slice exists to settle.
