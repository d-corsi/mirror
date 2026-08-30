/**
 * Scene drawing.
 *
 * Tile visuals mirror the Unity prefabs: platform bodies are black, and the
 * neon edge is a separate sprite layer (which is why the look never depended on
 * the MK Glow post-processing shader). Tile_1 carries a yellow top edge --
 * Player 1's floor -- and Tile_2 a cyan bottom edge, Player 2's ceiling.
 */
import type { Renderer } from "../core/renderer.ts";
import type { Level } from "./level.ts";
import type { Player } from "./player.ts";
import { clipFor, segments, type Rig } from "./rig.ts";
import { STAR_RADIUS } from "./tiles.ts";

const ATLAS_CELL = 108;

/** Draws one atlas cell centred on a world position, correcting for the y-flip. */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  index: number,
  wx: number,
  wy: number,
  size = 1,
  rotated180 = false,
): void {
  const col = index % 3;
  const row = Math.floor(index / 3);
  ctx.save();
  ctx.translate(wx, wy);
  ctx.scale(1, -1);
  // Matches the prefab's 180-degree Z rotation (e.g. ceiling spikes).
  if (rotated180) ctx.rotate(Math.PI);
  ctx.drawImage(
    img,
    col * ATLAS_CELL,
    row * ATLAS_CELL,
    ATLAS_CELL,
    ATLAS_CELL,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  ctx.restore();
}

export interface Sheets {
  tileset: HTMLImageElement;
  jumpArrow: HTMLImageElement;
  background: HTMLImageElement;
  /** Shown once the level is complete, as the original did. */
  backgroundDone: HTMLImageElement;
}

/**
 * Parallax background. Platforms are pure black (as in the Unity prefabs), so
 * without a lit backdrop behind them the level is black-on-black and reads as
 * an empty screen.
 */
export function drawBackground(r: Renderer, img: HTMLImageElement, camX: number): void {
  const { ctx } = r;
  const worldH = 20;
  const worldW = worldH * (img.width / img.height);
  const parallax = 0.4;
  const shift = camX * parallax;

  // Cover the visible span with as many tiled copies as needed.
  const left = camX - r.worldWidth / 2;
  const right = camX + r.worldWidth / 2;
  const first = Math.floor((left - -shift) / worldW) - 1;
  const last = Math.ceil((right - -shift) / worldW) + 1;

  ctx.save();
  for (let i = first; i <= last; i++) {
    const x = -shift + i * worldW;
    ctx.save();
    ctx.translate(x, worldH / 2 - 0.5);
    ctx.scale(1, -1);
    ctx.drawImage(img, 0, -worldH / 2, worldW, worldH);
    ctx.restore();
  }
  ctx.restore();
}

export function drawLevel(r: Renderer, level: Level, sheets: Sheets, camX: number): void {
  const { ctx } = r;
  const half = r.worldWidth / 2 + 2;
  const minX = camX - half;
  const maxX = camX + half;

  // Solid bodies first.
  ctx.fillStyle = "#000000";
  for (const t of level.tiles) {
    if (!t.def.solid || t.x < minX || t.x > maxX) continue;
    ctx.fillRect(t.x - 0.5, t.y - 0.5, 1, 1);
  }

  // Neon edges. These are what actually communicate which surface belongs to
  // which player, so they get a glow.
  ctx.save();
  for (const t of level.tiles) {
    const glow = t.def.glow;
    if (!glow || t.x < minX || t.x > maxX) continue;
    const y = glow.edge === "top" ? t.y + 0.5 - 0.09 : t.y - 0.5;
    ctx.fillStyle = glow.color;
    ctx.shadowColor = glow.color;
    ctx.shadowBlur = 14;
    ctx.fillRect(t.x - 0.5, y, 1, 0.09);
  }
  ctx.restore();

  // Obstacles (spikes).
  for (const t of level.obstacles) {
    if (t.x < minX || t.x > maxX) continue;
    if (t.def.sprite !== undefined) {
      drawSprite(ctx, sheets.tileset, t.def.sprite, t.x, t.y, 1, t.def.rotated180);
    }
  }

  // Boost pads.
  ctx.save();
  ctx.globalAlpha = 0.9;
  for (const t of level.boosts) {
    if (t.x < minX || t.x > maxX) continue;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(1, -1);
    ctx.drawImage(sheets.jumpArrow, -0.5, -0.5, 1, 1);
    ctx.restore();
  }
  ctx.restore();

  // Stars.
  ctx.save();
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 12;
  for (const s of level.stars) {
    if (s.collected || s.x < minX || s.x > maxX) continue;
    drawSprite(ctx, sheets.tileset, 5, s.x, s.y, STAR_RADIUS * 2.2);
  }
  ctx.restore();
}

/**
 * Draws the stick figure from its posed bones.
 *
 * bone_11 is the head (drawn as a disc); every other bone is a capsule stroke.
 * The whole figure flips vertically for the ceiling runner, so Player 2 reads
 * as a true mirror of Player 1.
 */
export function drawPlayer(
  r: Renderer,
  p: Player,
  color: string,
  rig: Rig | null,
  time: number,
): void {
  const { ctx } = r;

  if (!rig) {
    // Fallback: the plain box, used if the rig failed to load.
    const b = p.box();
    ctx.save();
    ctx.fillStyle = p.dead ? "#7a2233" : color;
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    ctx.restore();
    return;
  }

  const flip = p.gravitySign < 0;
  const clip = clipFor({
    dead: p.dead,
    grounded: p.grounded,
    risingWithGravity: p.velocity.y * p.gravitySign > 0,
  });
  const pose = rig.pose(clip, time, flip);

  ctx.save();
  ctx.translate(p.position.x, p.position.y);
  ctx.strokeStyle = p.dead ? "#ff4d6d" : color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 10;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.085;

  const { limbs, head } = segments(rig, pose);
  ctx.beginPath();
  for (const s of limbs) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();

  if (head) {
    ctx.beginPath();
    ctx.arc(head.x, head.y, 0.075, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Debug overlay: hitboxes and the camera-carried bounds. */
export function drawDebug(
  r: Renderer,
  players: Player[],
  bounds: { left: number; win: number; top: number; bottom: number },
): void {
  const { ctx } = r;
  ctx.save();
  ctx.lineWidth = 0.04;

  ctx.strokeStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(bounds.left, -10);
  ctx.lineTo(bounds.left, 30);
  ctx.stroke();

  ctx.strokeStyle = "#4dff9d";
  ctx.beginPath();
  ctx.moveTo(bounds.win, -10);
  ctx.lineTo(bounds.win, 30);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  for (const y of [bounds.top, bounds.bottom]) {
    ctx.beginPath();
    ctx.moveTo(bounds.left, y);
    ctx.lineTo(bounds.win, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#ffffff";
  for (const p of players) {
    const b = p.box();
    ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  }
  ctx.restore();
}
