# Mirror — HTML5 rebuild

**▶ Play: https://d-corsi.github.io/mirror/**

A browser rebuild of *Mirror*, a 2D auto-runner originally made in Unity (2019).
Not a Unity WebGL export — the game was rewritten from scratch in TypeScript,
reusing the original project's assets, physics constants, level data and
animation curves.

Two runners move through a mirrored world at once: one along the floor, one
upside down along the ceiling. Tap the right half of the screen to jump the
floor runner, the left half for the ceiling runner. Both have to survive to the
end.

**Controls** — tap/click either half of the screen, or `A` / `D` (arrow keys
also work; space jumps both).

---

## How it was rebuilt

The Unity project was treated as a strictly read-only reference. Everything the
web build needs was extracted from it programmatically (`tools/`), so the port is
reproducible rather than hand-copied:

- **Levels are PNG images.** Each pixel is one tile, keyed by colour. All 21
  levels port across losslessly — `tools/extract_unity.py` recovers the
  colour→tile mapping from the Unity prefab and scene overrides, and it is
  cross-checked against a histogram of every level pixel.
- **Physics is a faithful port.** The original's `PhysicsObject.cs` is a
  hand-written kinematic integrator (not Unity's dynamic solver), so it could be
  reproduced exactly — same order of operations, same constants. The jump arc is
  verified against its analytic envelope in the test suite.
- **The player is the original bone rig.** The Unity character is a sprite-rigged
  mesh, which Canvas2D cannot skin — but it is a stick figure built from capsules,
  so `tools/extract_rig.py` exports the 11-bone hierarchy and the real rotation
  curves from the `.anim` clips, and the game does forward kinematics and draws
  the bones.

Two Unity quirks are reproduced deliberately rather than "fixed", because
correcting either would change level layouts: alpha is tested before colour when
reading level pixels, and the first matching colour wins. See
[`PHASE0-FINDINGS.md`](PHASE0-FINDINGS.md).

## Design notes

- **The playfield is pinned to 16:9 and letterboxed.** How far ahead you can see,
  and where the win and fall-behind lines sit, all derive from the camera's
  half-width — so letting the viewport decide them would make the game much
  harder in portrait and easier on ultrawide. Every player gets the playfield the
  levels were designed against.
- **Fixed 1/60 s timestep.** The original ran physics frame-rate-coupled; pinning
  the step keeps the intended feel while staying deterministic.
- Ads, in-app purchases and the free/premium/developer split were dropped. Every
  level unlocks by playing.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm test           # typecheck + physics sim + all-levels loader check
```

Useful query params: `?level=N` (0-based), `?debug` (hitboxes, bounds, live
state), `?autoplay` (heuristic autopilot).

### Tests

`npm test` runs 27 headless checks with no browser: the jump arc against its
analytic envelope, mirror symmetry between the two runners, collision integrity,
star and spike triggers, boost pads, and a cross-validation of the level loader
against an independent implementation of the same decoding rules.

## Layout

```
src/
├── core/      loop, input, renderer, asset loading, path resolution
├── game/      physics, player, level, camera, rig, particles, session
├── state/     progression (localStorage)
├── ui/        DOM screens
└── audio/
tools/         Unity extractors (Python) + headless test harness (TypeScript)
extracted/     intermediates, committed so the tests run without Unity
public/assets/ levels, images, music, font
```

## Credits

Original game by the Uniteam team. This rebuild reuses that project's artwork,
music and level designs.
