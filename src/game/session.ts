/**
 * One playable run of one level: the pieces GameMain.cs juggled per level,
 * extracted so screens can start, restart and tear down a level cleanly.
 */
import type { Input } from "../core/input.ts";
import type { Renderer } from "../core/renderer.ts";
import { Camera } from "./camera.ts";
import { GRAVITY_MODIFIER_P1, GRAVITY_MODIFIER_P2 } from "./constants.ts";
import { drawBackground, drawDebug, drawLevel, drawPlayer, type Sheets } from "./draw.ts";
import { autopilot } from "./autopilot.ts";
import type { Level } from "./level.ts";
import { Particles } from "./particles.ts";
import { Player } from "./player.ts";
import type { Rig } from "./rig.ts";
import { SPIKE_AABB_UP, STAR_RADIUS } from "./tiles.ts";

export type Phase = "playing" | "dead" | "won";

export const P1_COLOR = "#EEFF00"; // matches its floor's neon edge
export const P2_COLOR = "#00D5FF"; // matches its ceiling's neon edge

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const overlaps = (b: Box, cx: number, cy: number, shape: Box): boolean =>
  b.maxX > cx + shape.minX &&
  b.minX < cx + shape.maxX &&
  b.maxY > cy + shape.minY &&
  b.minY < cy + shape.maxY;

export class Session {
  readonly camera = new Camera();
  readonly p1: Player;
  readonly p2: Player;
  readonly players: Player[];

  readonly particles = new Particles();
  /** Previous grounded state per player, to detect the landing frame. */
  private wasGrounded = [false, false];
  private trailCooldown = [0, 0];

  /** Bone rig for the stick figures; null falls back to boxes. */
  rig: Rig | null = null;
  /** Animation clock, advanced with the simulation. */
  private animTime = 0;

  /** Debug: drive both runners with the heuristic autopilot (?autoplay). */
  autoplay = false;

  phase: Phase = "playing";
  stars = 0;
  /** Set once when the run ends, so the caller can react exactly once. */
  justEnded: Phase | null = null;

  readonly level: Level;

  constructor(level: Level, aspect: number) {
    this.level = level;
    this.p1 = new Player(level, GRAVITY_MODIFIER_P1, true);
    this.p2 = new Player(level, GRAVITY_MODIFIER_P2, false);
    this.players = [this.p1, this.p2];
    this.setViewport(aspect);
    this.restart();
  }

  setViewport(aspect: number): void {
    this.camera.setViewport(aspect);
    this.camera.setLevelEnd(this.level.width);
    // The start position derives from the half-width, so re-derive it while
    // the run has not begun.
    if (!this.camera.isMoving) this.camera.reset();
  }

  restart(): void {
    const { spawnP1, spawnP2 } = this.level;
    if (!spawnP1 || !spawnP2) throw new Error("level is missing a player spawn");
    this.p1.spawn(spawnP1.x, spawnP1.y);
    this.p2.spawn(spawnP2.x, spawnP2.y);
    for (const s of this.level.stars) s.collected = false;
    this.stars = 0;
    this.camera.setLevelEnd(this.level.width);
    this.camera.reset();
    this.phase = "playing";
    this.justEnded = null;
    this.animTime = 0;
    this.particles.clear();
    this.wasGrounded = [false, false];
    this.trailCooldown = [0, 0];
  }

  step(dt: number, input: Input): void {
    this.justEnded = null;
    if (this.phase !== "playing") return;

    this.animTime += dt;

    if (this.autoplay) autopilot(this.level, this.players);

    // Right half drives the floor runner, left the ceiling runner.
    if (input.consume("right")) this.p1.requestJump();
    if (input.consume("left")) this.p2.requestJump();

    this.players.forEach((p, i) => {
      if (p.endLevel) return;
      const wasJumped = p.jumped;
      p.update(dt);
      p.fixedUpdate(dt);

      const colour = i === 0 ? P1_COLOR : P2_COLOR;
      // Jump burst: the latch flips false -> true exactly on take-off.
      if (!wasJumped && p.jumped) {
        this.particles.jump(p.position.x, p.position.y, colour, p.gravitySign);
      }
      // Land burst on the airborne -> grounded transition.
      if (!this.wasGrounded[i] && p.grounded) {
        this.particles.land(p.position.x, p.position.y, colour, p.gravitySign);
      }
      // Trail while running, rate-limited so it reads as a streak not a smear.
      this.trailCooldown[i] = (this.trailCooldown[i] ?? 0) - dt;
      if (p.grounded && !p.dead && (this.trailCooldown[i] ?? 0) <= 0) {
        this.particles.trail(p.position.x, p.position.y, colour, p.gravitySign);
        this.trailCooldown[i] = 0.03;
      }
      this.wasGrounded[i] = p.grounded;
    });

    this.particles.update(dt);

    this.camera.update(
      dt,
      this.players.map((p) => p.position.x),
    );

    const leftLine = this.camera.leftBoundX + 0.5;
    const winLine = this.camera.winBoundX - 0.5;
    const topLine = this.camera.topBoundY - 0.5;
    const bottomLine = this.camera.bottomBoundY + 0.5;

    for (const p of this.players) {
      if (p.endLevel) continue;
      const b = p.box();

      for (const o of this.level.obstacles) {
        // Ceiling spikes (Tile_7) are rotated, so the dangerous half of the
        // cell differs per tile.
        if (overlaps(b, o.x, o.y, o.def.hitbox ?? SPIKE_AABB_UP)) p.kill();
      }

      let boosting = false;
      for (const t of this.level.boosts) {
        if (overlaps(b, t.x, t.y, { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 })) {
          boosting = true;
        }
      }
      p.jumpBoost = boosting;

      for (const s of this.level.stars) {
        if (s.collected) continue;
        const r = STAR_RADIUS;
        if (overlaps(b, s.x, s.y, { minX: -r, maxX: r, minY: -r, maxY: r })) {
          s.collected = true;
          this.stars += 1;
        }
      }

      // Bounds are children of the camera, so they close in as it scrolls.
      if (b.minX <= leftLine) p.kill();
      if (p.playerUp && b.minY <= bottomLine) p.kill();
      if (!p.playerUp && b.maxY >= topLine) p.kill();
      if (b.maxX >= winLine) p.endLevel = true;
    }

    if (this.players.some((p) => p.dead)) {
      this.phase = "dead";
      this.justEnded = "dead";
    } else if (this.players.every((p) => p.endLevel)) {
      this.phase = "won";
      this.justEnded = "won";
    }
  }

  render(r: Renderer, sheets: Sheets, showDebug: boolean): void {
    r.clear("#05060a");
    r.begin(this.camera.x, this.camera.y);
    const bg = this.phase === "won" ? sheets.backgroundDone : sheets.background;
    drawBackground(r, bg, this.camera.x);
    drawLevel(r, this.level, sheets, this.camera.x);
    this.particles.draw(r);
    drawPlayer(r, this.p1, P1_COLOR, this.rig, this.animTime);
    drawPlayer(r, this.p2, P2_COLOR, this.rig, this.animTime);
    if (showDebug) {
      drawDebug(r, this.players, {
        left: this.camera.leftBoundX,
        win: this.camera.winBoundX,
        top: this.camera.topBoundY,
        bottom: this.camera.bottomBoundY,
      });
    }
    r.end();
  }
}
