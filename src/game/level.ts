/**
 * Level loading: decode a level PNG into a tile grid.
 *
 * Two Unity behaviours are load-bearing and must NOT be "fixed" (see
 * PHASE0-FINDINGS.md section 1):
 *
 *  1. Alpha is tested BEFORE colour. Thousands of level pixels carry a real RGB
 *     at alpha 0 and are empty cells; matching colour first would add phantom
 *     tiles all over every level.
 *  2. The FIRST matching mapping entry wins. Entries 14/15 (the "Bridge" tiles)
 *     were left white, colliding with Tile_Star at entry 13, so they can never
 *     spawn. Correcting that would change level layouts.
 */
import { asset } from "../core/paths.ts";
import { LEVEL_HEIGHT } from "./constants.ts";
import type { SolidGrid } from "./physics.ts";
import { TILES, type TileDef } from "./tiles.ts";

/** Max per-channel drift accepted by the tolerant colour fallback. */
const TOLERANCE = 8;

export interface ColorMapping {
  rgba: [number, number, number, number];
  tile: string;
}

export interface LevelData {
  mappings: ColorMapping[];
  levels: string[];
}

export interface PlacedTile {
  x: number;
  y: number;
  name: string;
  def: TileDef;
}

/** A star that has not been collected yet. */
export interface Star {
  x: number;
  y: number;
  collected: boolean;
}

/**
 * Decoded RGBA pixels. Kept DOM-free so the loader -- which enforces the two
 * Unity quirks above -- can be exercised headlessly by tools/sim.ts.
 */
export interface PixelSource {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Browser-side decode of a loaded <img> into raw pixels.
 *
 * Pinned to sRGB explicitly: Safari colour-manages images drawn into a canvas,
 * so reading back without this can shift channel values by a few units (e.g.
 * #000080 -> #000082). Levels are keyed on exact colours, so an unpinned decode
 * silently yields an empty level.
 */
export function decodeImage(image: HTMLImageElement): PixelSource {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
    colorSpace: "srgb",
  });
  if (!ctx) throw new Error("2D context unavailable for level decode");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height, { colorSpace: "srgb" });
}

export class Level implements SolidGrid {
  readonly width: number;
  readonly height = LEVEL_HEIGHT;

  /** Solid lookup, indexed [y * width + x]; y is Unity-space (0 = bottom). */
  private solid: Uint8Array;
  /** Non-solid decorative/trigger tiles, drawn and tested per frame. */
  readonly tiles: PlacedTile[] = [];
  readonly obstacles: PlacedTile[] = [];
  readonly boosts: PlacedTile[] = [];
  readonly stars: Star[] = [];

  spawnP1: { x: number; y: number } | null = null;
  spawnP2: { x: number; y: number } | null = null;

  /** How many pixels needed the tolerant fallback -- 0 on a well-behaved decode. */
  approxMatches = 0;
  /** Non-empty pixels that matched nothing at all. */
  unmatched = 0;

  constructor(source: PixelSource, mappings: ColorMapping[]) {
    this.width = source.width;
    this.solid = new Uint8Array(this.width * this.height);

    const { data } = source;

    for (let row = 0; row < source.height; row++) {
      // Unity's GetPixel is bottom-left origin; ImageData is top-left.
      const y = source.height - 1 - row;
      for (let x = 0; x < source.width; x++) {
        const i = (row * source.width + x) * 4;
        const a = data[i + 3]!;
        if (a === 0) continue; // (1) alpha first

        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;

        const name = this.match(mappings, r, g, b, a);
        if (!name) {
          this.unmatched++;
          continue; // unmatched colour -> empty, exactly as Unity
        }

        const def = TILES[name];
        if (!def) continue;

        if (name === "Player 1") {
          this.spawnP1 = { x, y };
          continue;
        }
        if (name === "Player 2") {
          this.spawnP2 = { x, y };
          continue;
        }

        const placed: PlacedTile = { x, y, name, def };
        this.tiles.push(placed);

        if (def.solid) this.solid[y * this.width + x] = 1;
        else if (def.tag === "Obstacle") this.obstacles.push(placed);
        else if (def.tag === "BoostUp") this.boosts.push(placed);
        else if (def.tag === "Stars") this.stars.push({ x, y, collected: false });
      }
    }
  }

  /**
   * (2) linear scan, first match wins -- mirrors LevelGenerator.GenerateTile.
   *
   * Exact match is tried first and is what the original did. The tolerant
   * fallback exists only because some browsers (Safari) colour-manage canvas
   * readback and shift channels slightly; the palette's entries are >=64 apart
   * per channel, so a tolerance of 8 cannot conflate two distinct tiles.
   * Alpha is always compared exactly -- it is not colour-managed, and the
   * alpha-0 and stray-alpha cases depend on it.
   */
  private match(
    mappings: ColorMapping[],
    r: number,
    g: number,
    b: number,
    a: number,
  ): string | null {
    for (const m of mappings) {
      const c = m.rgba;
      if (c[0] === r && c[1] === g && c[2] === b && c[3] === a) return m.tile;
    }

    let best: string | null = null;
    let bestDist = TOLERANCE * TOLERANCE * 3;
    for (const m of mappings) {
      const c = m.rgba;
      if (c[3] !== a) continue;
      const dr = c[0] - r;
      const dg = c[1] - g;
      const db = c[2] - b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        best = m.tile;
      }
    }
    if (best) this.approxMatches++;
    return best;
  }

  isSolid(gx: number, gy: number): boolean {
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return false;
    return this.solid[gy * this.width + gx] === 1;
  }
}

export async function loadLevelData(): Promise<LevelData> {
  const res = await fetch(asset("data/levels.json"));
  if (!res.ok) throw new Error(`level data ${res.status}`);
  return (await res.json()) as LevelData;
}
