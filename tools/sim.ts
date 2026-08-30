/**
 * Headless physics harness.
 *
 * Runs the real PhysicsObject/Player code against a decoded level grid, with no
 * DOM involved, so the ported physics can be verified and tuned without a
 * browser. Checks the analytic jump numbers, then simulates an actual playthrough
 * with a simple "jump when a gap is coming" autopilot.
 *
 * Run:  node --experimental-strip-types tools/sim.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  FIXED_DT,
  GRAVITY_MODIFIER_P1,
  GRAVITY_MODIFIER_P2,
  JUMP_BOOST_SPEED,
  JUMP_TAKEOFF_SPEED,
  PLAYER_SPEED,
  UNITY_GRAVITY_Y,
} from "../src/game/constants.ts";
import { Player } from "../src/game/player.ts";
import { Level, type ColorMapping } from "../src/game/level.ts";
import { Session } from "../src/game/session.ts";
import type { Input } from "../src/core/input.ts";
import type { SolidGrid } from "../src/game/physics.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

interface Grid {
  name: string;
  width: number;
  height: number;
  solid: number[][];
  spawn: { p1: [number, number]; p2: [number, number] };
  stars: [number, number][];
}

const grid = JSON.parse(
  readFileSync(join(HERE, "..", "extracted", "grid_0.json"), "utf8"),
) as Grid;

/**
 * Load the level through the REAL loader, from raw pixels, so the alpha-first
 * and first-match-wins rules are covered by these checks rather than only by
 * the Python extractor that produced the reference grid.
 */
const levelData = JSON.parse(
  readFileSync(join(HERE, "..", "public", "assets", "data", "levels.json"), "utf8"),
) as { mappings: ColorMapping[]; levels: string[] };

const loadLevel = (index: number): Level => {
  const meta = JSON.parse(
    readFileSync(join(HERE, "..", "extracted", `grid_${index}.json`), "utf8"),
  ) as { width: number; height: number };
  const bytes = readFileSync(join(HERE, "..", "extracted", `level_${index}.rgba`));
  return new Level(
    { width: meta.width, height: meta.height, data: new Uint8Array(bytes) },
    levelData.mappings,
  );
};

const real = loadLevel(0);

const level: SolidGrid = real;

const ok = (label: string, pass: boolean, detail: string) => {
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${label.padEnd(34)} ${detail}`);
  if (!pass) process.exitCode = 1;
};

console.log(`level: ${grid.name}  ${grid.width}x${grid.height}\n`);

// -------------------------------------------------- loader cross-validation
// The reference grid was produced by an independent Python implementation of
// the same rules; if the two disagree, one of them got a quirk wrong.
console.log("=== level loader vs independent extraction ===");
{
  let mismatches = 0;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (real.isSolid(x, y) !== (grid.solid[y]![x] === 1)) mismatches++;
    }
  }
  ok("solid grid matches exactly", mismatches === 0, `${mismatches} mismatched cells`);
  ok(
    "P1 spawn matches",
    real.spawnP1?.x === grid.spawn.p1[0] && real.spawnP1?.y === grid.spawn.p1[1],
    `loader ${JSON.stringify(real.spawnP1)} vs ${JSON.stringify(grid.spawn.p1)}`,
  );
  ok(
    "P2 spawn matches",
    real.spawnP2?.x === grid.spawn.p2[0] && real.spawnP2?.y === grid.spawn.p2[1],
    `loader ${JSON.stringify(real.spawnP2)} vs ${JSON.stringify(grid.spawn.p2)}`,
  );
  ok("star count matches", real.stars.length === grid.stars.length,
     `loader ${real.stars.length} vs ${grid.stars.length}`);
  ok("exactly 3 stars", real.stars.length === 3, `${real.stars.length}`);
}
console.log();

// ---------------------------------------------------------------- analytics
const g = Math.abs(GRAVITY_MODIFIER_P1 * UNITY_GRAVITY_Y);
const apex = (JUMP_TAKEOFF_SPEED * JUMP_TAKEOFF_SPEED) / (2 * g);
const airtime = (2 * JUMP_TAKEOFF_SPEED) / g;
const reach = airtime * PLAYER_SPEED;
const apexB = (JUMP_BOOST_SPEED * JUMP_BOOST_SPEED) / (2 * g);
const reachB = ((2 * JUMP_BOOST_SPEED) / g) * PLAYER_SPEED;

console.log("=== analytic jump envelope (effective gravity %s u/s^2) ===", g.toFixed(2));
console.log(`  normal jump : apex ${apex.toFixed(2)}u  airtime ${airtime.toFixed(3)}s  reach ${reach.toFixed(2)}u`);
console.log(`  boosted jump: apex ${apexB.toFixed(2)}u  airtime ${((2 * JUMP_BOOST_SPEED) / g).toFixed(3)}s  reach ${reachB.toFixed(2)}u`);
console.log();

// ------------------------------------------------------- measured jump arc
console.log("=== measured jump (simulated, must match analytics) ===");
{
  const p = new Player(level, GRAVITY_MODIFIER_P1, true);
  p.spawn(grid.spawn.p1[0], grid.spawn.p1[1]);

  // settle on the ground first
  for (let i = 0; i < 240 && !p.grounded; i++) {
    p.update(FIXED_DT);
    p.fixedUpdate(FIXED_DT);
  }
  const groundY = p.position.y;
  ok("player settles on ground", p.grounded, `y=${groundY.toFixed(3)}`);

  p.requestJump();
  let maxY = p.position.y;
  let steps = 0;
  const startX = p.position.x;
  for (let i = 0; i < 600; i++) {
    p.update(FIXED_DT);
    p.fixedUpdate(FIXED_DT);
    maxY = Math.max(maxY, p.position.y);
    steps++;
    if (i > 2 && p.grounded) break;
  }
  const measuredApex = maxY - groundY;
  const measuredTime = steps * FIXED_DT;
  const measuredReach = p.position.x - startX;

  ok(
    "jump apex matches analytic",
    Math.abs(measuredApex - apex) < 0.12,
    `measured ${measuredApex.toFixed(3)}u vs analytic ${apex.toFixed(3)}u`,
  );
  ok(
    "airtime matches analytic",
    Math.abs(measuredTime - airtime) < 0.05,
    `measured ${measuredTime.toFixed(3)}s vs analytic ${airtime.toFixed(3)}s`,
  );
  ok(
    "horizontal reach matches",
    Math.abs(measuredReach - reach) < 0.35,
    `measured ${measuredReach.toFixed(2)}u vs analytic ${reach.toFixed(2)}u`,
  );
  ok("lands back on ground", p.grounded, `y=${p.position.y.toFixed(3)}`);
}
console.log();

// --------------------------------------------------- mirrored player parity
console.log("=== mirror symmetry (P2 must behave as P1 inverted) ===");
{
  const p1 = new Player(level, GRAVITY_MODIFIER_P1, true);
  const p2 = new Player(level, GRAVITY_MODIFIER_P2, false);
  p1.spawn(grid.spawn.p1[0], grid.spawn.p1[1]);
  p2.spawn(grid.spawn.p2[0], grid.spawn.p2[1]);

  // Only ~1s: level_0's first gap is at x=19, and this check is about landing
  // symmetry, not traversal.
  for (let i = 0; i < 60; i++) {
    for (const p of [p1, p2]) {
      p.update(FIXED_DT);
      p.fixedUpdate(FIXED_DT);
    }
  }
  ok("P1 grounded on floor", p1.grounded, `y=${p1.position.y.toFixed(3)}`);
  ok("P2 grounded on ceiling", p2.grounded, `y=${p2.position.y.toFixed(3)}`);
  ok(
    "both advanced equally in x",
    Math.abs(p1.position.x - p2.position.x) < 1e-9,
    `p1.x=${p1.position.x.toFixed(3)} p2.x=${p2.position.x.toFixed(3)}`,
  );

  const y1 = p1.position.y;
  const y2 = p2.position.y;
  p1.requestJump();
  p2.requestJump();
  for (let i = 0; i < 25; i++) {
    for (const p of [p1, p2]) {
      p.update(FIXED_DT);
      p.fixedUpdate(FIXED_DT);
    }
  }
  const d1 = p1.position.y - y1;
  const d2 = p2.position.y - y2;
  ok(
    "jumps are exact mirrors",
    Math.abs(d1 + d2) < 1e-9,
    `P1 rose ${d1.toFixed(4)}u, P2 fell ${d2.toFixed(4)}u`,
  );
}
console.log();

// ----------------------------------------------------------- no tunnelling
console.log("=== collision integrity ===");
{
  const p = new Player(level, GRAVITY_MODIFIER_P1, true);
  p.spawn(grid.spawn.p1[0], grid.spawn.p1[1]);
  let worstPenetration = 0;
  for (let i = 0; i < 3000; i++) {
    p.update(FIXED_DT);
    p.fixedUpdate(FIXED_DT);
    if (i % 37 === 0) p.requestJump(); // jump constantly, stress the solver
    const b = p.box();
    for (let gx = Math.floor(b.minX + 0.5); gx <= Math.floor(b.maxX + 0.5); gx++) {
      for (let gy = Math.floor(b.minY + 0.5); gy <= Math.floor(b.maxY + 0.5); gy++) {
        if (!level.isSolid(gx, gy)) continue;
        const overlapX = Math.min(b.maxX, gx + 0.5) - Math.max(b.minX, gx - 0.5);
        const overlapY = Math.min(b.maxY, gy + 0.5) - Math.max(b.minY, gy - 0.5);
        if (overlapX > 0 && overlapY > 0) {
          worstPenetration = Math.max(worstPenetration, Math.min(overlapX, overlapY));
        }
      }
    }
    if (p.position.x > grid.width) break;
  }
  ok(
    "never sinks into solid tiles",
    worstPenetration < 0.05,
    `worst penetration ${worstPenetration.toFixed(4)}u`,
  );
}
console.log();

// ------------------------------------------------------------- playthrough
console.log("=== autopilot playthrough of level_0 ===");
{
  const p1 = new Player(level, GRAVITY_MODIFIER_P1, true);
  const p2 = new Player(level, GRAVITY_MODIFIER_P2, false);
  p1.spawn(grid.spawn.p1[0], grid.spawn.p1[1]);
  p2.spawn(grid.spawn.p2[0], grid.spawn.p2[1]);

  /**
   * Autopilot heuristics. level_0 has two tiers, so "gap ahead" alone is not
   * enough -- the runner also has to hop up onto a raised platform, which
   * presents as a wall in front of it.
   */
  const gapAhead = (p: Player, lookahead: number): boolean => {
    const dir = p.gravitySign;
    const foot = dir > 0 ? p.box().minY - 0.6 : p.box().maxY + 0.6;
    const gy = Math.floor(foot + 0.5);
    for (let d = 1; d <= lookahead; d++) {
      const gx = Math.floor(p.position.x + 0.5) + d;
      if (!level.isSolid(gx, gy)) return true;
    }
    return false;
  };

  const wallAhead = (p: Player): boolean => {
    const b = p.box();
    for (let d = 1; d <= 2; d++) {
      const gx = Math.floor(b.maxX + 0.5) + d;
      const gyLo = Math.floor(b.minY + 0.5);
      const gyHi = Math.floor(b.maxY + 0.5);
      for (let gy = gyLo; gy <= gyHi; gy++) {
        if (level.isSolid(gx, gy)) return true;
      }
    }
    return false;
  };

  let steps = 0;
  const limit = 60 * 90;
  let p1Fell = false;
  let p2Fell = false;
  while (steps < limit && (p1.position.x < grid.width - 2 || p2.position.x < grid.width - 2)) {
    for (const p of [p1, p2]) {
      // Jump as LATE as possible. level_0 steps up onto a raised tier, and
      // jumping early makes the runner slam into that tier's side rather than
      // clearing it -- the level is designed around edge-of-platform timing.
      if (p.grounded && (gapAhead(p, 1) || wallAhead(p))) p.requestJump();
      p.update(FIXED_DT);
      p.fixedUpdate(FIXED_DT);
    }
    if (p1.position.y < -4) p1Fell = true;
    if (p2.position.y > 24) p2Fell = true;
    steps++;
  }

  console.log(
    `  ran ${steps} steps (${(steps * FIXED_DT).toFixed(1)}s)  P1 x=${p1.position.x.toFixed(1)}  P2 x=${p2.position.x.toFixed(1)}  of ${grid.width}`,
  );
  ok("P1 traversed the level", p1.position.x > grid.width - 3 && !p1Fell, `x=${p1.position.x.toFixed(1)}`);
  ok("P2 traversed the level", p2.position.x > grid.width - 3 && !p2Fell, `x=${p2.position.x.toFixed(1)}`);
}

// ------------------------------------------------------- trigger coverage
// Session is DOM-free at simulation time, so the real trigger logic (stars,
// spikes, bounds) can be exercised headlessly with a stub input.
console.log("=== triggers (stars & spike orientation) ===");
{
  const noInput = { consume: () => false, clear: () => {} } as unknown as Input;
  const ASPECT = 16 / 9;

  const s = new Session(real, ASPECT);
  const star = real.stars[0]!;
  s.p1.position = { x: star.x, y: star.y };
  s.step(FIXED_DT, noInput);
  ok("star is collected on overlap", s.stars === 1 && star.collected, `stars=${s.stars}`);

  const s2 = new Session(real, ASPECT);
  s2.p1.position = { x: real.stars[1]!.x, y: real.stars[1]!.y + 4 };
  s2.step(FIXED_DT, noInput);
  ok("distant star is not collected", s2.stars === 0, `stars=${s2.stars}`);

  // Spike orientation: Tile_8 is floor spikes (dangerous in the BOTTOM half of
  // its cell), Tile_7 is the same tile rotated 180deg for ceilings (dangerous
  // in the TOP half). Getting this wrong kills players on nothing.
  const lvl17 = loadLevel(17);
  const floorSpike = lvl17.obstacles.find((o) => o.name === "Tile_8");
  const ceilSpike = lvl17.obstacles.find((o) => o.name === "Tile_7");
  ok("level 18 has both spike types", !!floorSpike && !!ceilSpike,
     `Tile_8=${!!floorSpike} Tile_7=${!!ceilSpike}`);

  if (floorSpike && ceilSpike) {
    // A body sitting in the lower half of a floor-spike cell must die...
    const a = new Session(lvl17, ASPECT);
    a.p1.position = { x: floorSpike.x, y: floorSpike.y - 0.35 };
    a.step(FIXED_DT, noInput);
    ok("floor spike kills from below-centre", a.p1.dead, `dead=${a.p1.dead}`);

    // ...but the same body in the UPPER half of that cell must not.
    const b = new Session(lvl17, ASPECT);
    b.p1.position = { x: floorSpike.x, y: floorSpike.y + 0.75 };
    b.step(FIXED_DT, noInput);
    ok("floor spike safe above it", !b.p1.dead, `dead=${b.p1.dead}`);

    // Ceiling spikes are the mirror image.
    const c = new Session(lvl17, ASPECT);
    c.p2.position = { x: ceilSpike.x, y: ceilSpike.y + 0.35 };
    c.step(FIXED_DT, noInput);
    ok("ceiling spike kills from above-centre", c.p2.dead, `dead=${c.p2.dead}`);

    const d = new Session(lvl17, ASPECT);
    d.p2.position = { x: ceilSpike.x, y: ceilSpike.y - 0.75 };
    d.step(FIXED_DT, noInput);
    ok("ceiling spike safe below it", !d.p2.dead, `dead=${d.p2.dead}`);
  }
}

// ------------------------------------------------------------ boost pads
console.log("\n=== boost pads (level 21) ===");
{
  const lvl20 = loadLevel(20);
  ok("level 21 has boost pads", lvl20.boosts.length > 0, `${lvl20.boosts.length} pads`);

  // A boosted jump uses jumpBoostSpeed (20) instead of jumpTakeOffSpeed (12).
  const plain = new Player(lvl20, GRAVITY_MODIFIER_P1, true);
  plain.spawn(lvl20.spawnP1!.x, lvl20.spawnP1!.y);
  for (let i = 0; i < 240 && !plain.grounded; i++) {
    plain.update(FIXED_DT);
    plain.fixedUpdate(FIXED_DT);
  }
  const baseY = plain.position.y;
  plain.requestJump();
  let plainApex = baseY;
  for (let i = 0; i < 200; i++) {
    plain.update(FIXED_DT);
    plain.fixedUpdate(FIXED_DT);
    plainApex = Math.max(plainApex, plain.position.y);
    if (i > 2 && plain.grounded) break;
  }

  const boosted = new Player(lvl20, GRAVITY_MODIFIER_P1, true);
  boosted.spawn(lvl20.spawnP1!.x, lvl20.spawnP1!.y);
  for (let i = 0; i < 240 && !boosted.grounded; i++) {
    boosted.update(FIXED_DT);
    boosted.fixedUpdate(FIXED_DT);
  }
  const boostBase = boosted.position.y;
  boosted.jumpBoost = true;
  boosted.requestJump();
  let boostApex = boostBase;
  for (let i = 0; i < 300; i++) {
    boosted.update(FIXED_DT);
    boosted.fixedUpdate(FIXED_DT);
    boostApex = Math.max(boostApex, boosted.position.y);
    if (i > 2 && boosted.grounded) break;
  }

  const gained = boostApex - boostBase;
  ok(
    "boosted jump matches analytic apex",
    Math.abs(gained - apexB) < 0.2,
    `measured ${gained.toFixed(2)}u vs analytic ${apexB.toFixed(2)}u`,
  );
  ok(
    "boost is clearly higher than a normal jump",
    gained > (plainApex - baseY) * 2,
    `boost ${gained.toFixed(2)}u vs normal ${(plainApex - baseY).toFixed(2)}u`,
  );
}

console.log(`\n${process.exitCode ? "SOME CHECKS FAILED" : "all checks passed"}`);
