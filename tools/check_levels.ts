/**
 * Runs every level through the real Level loader and checks the invariants
 * Phase 0 established. Guards Phase 2, where all 21 levels come into play.
 *
 * Run:  node --experimental-strip-types tools/check_levels.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Level, type ColorMapping } from "../src/game/level.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const root = join(HERE, "..");

const levelData = JSON.parse(
  readFileSync(join(root, "public", "assets", "data", "levels.json"), "utf8"),
) as { mappings: ColorMapping[]; levels: string[] };

let failures = 0;
const row = (c: (string | number)[]): string =>
  String(c[0]).padEnd(14) +
  String(c[1]).padStart(6) +
  String(c[2]).padStart(8) +
  String(c[3]).padStart(7) +
  String(c[4]).padStart(8) +
  String(c[5]).padStart(8) +
  String(c[6]).padStart(9);

console.log(row(["level", "width", "solid", "stars", "spikes", "boosts", "spawns"]));

for (let i = 0; i < levelData.levels.length; i++) {
  const grid = JSON.parse(
    readFileSync(join(root, "extracted", `grid_${i}.json`), "utf8"),
  ) as { width: number; height: number };
  const raw = readFileSync(join(root, "extracted", `level_${i}.rgba`));

  const level = new Level(
    { width: grid.width, height: grid.height, data: new Uint8Array(raw) },
    levelData.mappings,
  );

  let solid = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (level.isSolid(x, y)) solid++;
  }

  const spawns = (level.spawnP1 ? 1 : 0) + (level.spawnP2 ? 1 : 0);
  const bad: string[] = [];
  if (spawns !== 2) bad.push("missing spawn");
  if (level.stars.length !== 3) bad.push(`${level.stars.length} stars`);
  if (level.height !== 20) bad.push(`height ${level.height}`);
  if (solid === 0) bad.push("no solid tiles");

  if (bad.length) failures++;
  console.log(
    row([
      levelData.levels[i]!,
      level.width,
      solid,
      level.stars.length,
      level.obstacles.length,
      level.boosts.length,
      `${spawns}/2`,
    ]) + (bad.length ? `   <-- ${bad.join(", ")}` : ""),
  );
}

console.log();
if (failures) {
  console.log(`${failures} level(s) failed invariants`);
  process.exitCode = 1;
} else {
  console.log(`all ${levelData.levels.length} levels load with valid spawns, 3 stars, height 20`);
}
