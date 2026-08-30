/**
 * Tile definitions.
 *
 * The colour -> tile mapping itself is DATA (public/assets/data/levels.json,
 * generated from the Unity project) because it must match byte-for-byte.
 * What each tile *does and looks like* is declared here.
 *
 * Only 8 of the 14 tile prefabs appear in any shipped level; the rest are
 * listed for completeness so an unexpected colour never silently vanishes.
 */

export type TileTag = "Platform" | "Obstacle" | "BoostUp" | "Stars" | "Player" | "Bridge";

export interface TileDef {
  /** Unity tag, which is what all the gameplay logic keyed off. */
  tag: TileTag;
  /** Solid tiles block movement. Everything else is a trigger. */
  solid: boolean;
  /** Index into the tileset atlas (3x3 of 108px cells), if it draws one. */
  sprite?: number;
  /** Neon edge highlight, drawn on the tile's play-facing side. */
  glow?: { color: string; edge: "top" | "bottom" };
  /** Fill colour for the solid body. */
  fill?: string;
  /**
   * The prefab carries a 180-degree Z rotation. Unity applied this to the
   * sprite AND the collider, so it changes both how the tile draws and which
   * half of the cell is dangerous.
   */
  rotated180?: boolean;
  /** Trigger hitbox in cell-local space, already accounting for rotation. */
  hitbox?: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * Spike colliders. The prefab polygon occupies only the lower part of its cell
 * (y -0.5 .. -0.157), so a full-cell test would kill the player far too early.
 * Tile_7 is that same tile rotated 180deg -- ceiling spikes for Player 2 --
 * which puts its collider in the TOP half instead.
 */
export const SPIKE_AABB_UP = { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: -0.157 } as const;
export const SPIKE_AABB_DOWN = { minX: -0.5, maxX: 0.5, minY: 0.157, maxY: 0.5 } as const;

/** tileset.png atlas indices, verified visually against the sheet. */
export const TILESET_SOLID = 4;
export const TILESET_SPIKES = 3;
export const TILESET_STAR = 5;

/**
 * Platform bodies are black; the neon edge is a separate sprite layer, which is
 * why the look never depended on the MK Glow post-processing shader.
 * Tile_1 is a platform's TOP face (Player 1's floor, yellow edge).
 * Tile_2 is the same block rotated 180deg -- its BOTTOM face (Player 2's
 * ceiling, cyan edge).
 */
export const TILES: Record<string, TileDef> = {
  Tile_0: { tag: "Platform", solid: true, sprite: TILESET_SOLID, fill: "#000000" },
  Tile_1: {
    tag: "Platform",
    solid: true,
    sprite: TILESET_SOLID,
    fill: "#000000",
    glow: { color: "#EEFF00", edge: "top" },
  },
  Tile_2: {
    tag: "Platform",
    solid: true,
    sprite: TILESET_SOLID,
    fill: "#000000",
    glow: { color: "#00D5FF", edge: "bottom" },
  },
  // Slope tiles -- present in the project, used by zero levels.
  Tile_3: { tag: "Platform", solid: true, fill: "#000000" },
  Tile_4: { tag: "Platform", solid: true, fill: "#000000" },
  Tile_5: { tag: "Platform", solid: true, fill: "#000000" },
  Tile_6: { tag: "Platform", solid: true, fill: "#000000" },

  // Tile_7 is rotated 180deg in the prefab: spikes hanging from a ceiling,
  // threatening Player 2. Tile_8 is upright: floor spikes, threatening Player 1.
  Tile_7: {
    tag: "Obstacle",
    solid: false,
    sprite: TILESET_SPIKES,
    rotated180: true,
    hitbox: SPIKE_AABB_DOWN,
  },
  Tile_8: {
    tag: "Obstacle",
    solid: false,
    sprite: TILESET_SPIKES,
    hitbox: SPIKE_AABB_UP,
  },
  Tile_9: { tag: "BoostUp", solid: false },
  Tile_10: { tag: "BoostUp", solid: false },
  // "Bridge" tiles: unreachable in the shipped game -- their mapping entries
  // were left white and are shadowed by Tile_Star. Kept for completeness.
  Tile_11: { tag: "Bridge", solid: true, fill: "#000000" },
  Tile_12: { tag: "Bridge", solid: true, fill: "#000000" },
  Tile_Star: { tag: "Stars", solid: false, sprite: TILESET_STAR },

  "Player 1": { tag: "Player", solid: false },
  "Player 2": { tag: "Player", solid: false },
};

/** Star pickup radius, approximating the 19-point outline. */
export const STAR_RADIUS = 0.45;
