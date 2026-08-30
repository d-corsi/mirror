/**
 * Port of Unity's PhysicsObject.cs.
 *
 * The original is a hand-written kinematic integrator built on Rigidbody2D.Cast,
 * NOT Unity's dynamic solver -- which is why it can be reproduced exactly. The
 * order of operations below mirrors FixedUpdate() line for line; changing it
 * changes the game's feel.
 *
 * Phase 0 established that every solid tile in every shipped level is an exact
 * 1x1 axis-aligned square on an integer grid (the slope tiles are unused), so
 * the swept cast only ever needs to handle axis-aligned motion.
 */
import {
  MIN_GROUND_NORMAL_Y,
  MIN_MOVE_DISTANCE,
  SHELL_RADIUS,
  UNITY_GRAVITY_Y,
} from "./constants.ts";

export interface Vec2 {
  x: number;
  y: number;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Hit {
  distance: number;
  normal: Vec2;
}

/** Anything that can answer "is this grid cell solid?" */
export interface SolidGrid {
  isSolid(gx: number, gy: number): boolean;
}

/**
 * Cells are centred on integers: cell (gx, gy) spans [gx-0.5, gx+0.5].
 * So the cell containing a world coordinate is floor(w + 0.5).
 */
export const cellOf = (w: number): number => Math.floor(w + 0.5);

/**
 * Shrink the span slightly so a body resting flush on a surface does not also
 * register the surface as a wall when it moves along it.
 */
const EPS = 1e-4;

/**
 * Swept cast of an AABB along one axis, returning the nearest blocking plane.
 *
 * Mirrors Rigidbody2D.Cast closely enough for axis-aligned grid geometry: for
 * the first plane carrying any solid cell we emit a single hit, since every
 * cell on that plane shares the same normal.
 */
export function castAABB(
  box: AABB,
  dir: Vec2,
  maxDistance: number,
  grid: SolidGrid,
): Hit[] {
  if (dir.x !== 0 && dir.y !== 0) {
    throw new Error("castAABB expects axis-aligned motion");
  }

  if (dir.x !== 0) {
    const right = dir.x > 0;
    const lead = right ? box.maxX : box.minX;
    const rowStart = cellOf(box.minY + EPS);
    const rowEnd = cellOf(box.maxY - EPS);
    const first = cellOf(lead);
    const last = cellOf(lead + (right ? maxDistance : -maxDistance));

    for (let gx = first; right ? gx <= last : gx >= last; right ? gx++ : gx--) {
      // the plane of this cell that faces the incoming body
      const plane = right ? gx - 0.5 : gx + 0.5;
      const distance = right ? plane - lead : lead - plane;
      if (distance > maxDistance) break;
      for (let gy = rowStart; gy <= rowEnd; gy++) {
        if (grid.isSolid(gx, gy)) {
          return [{ distance: Math.max(0, distance), normal: { x: right ? -1 : 1, y: 0 } }];
        }
      }
    }
    return [];
  }

  if (dir.y !== 0) {
    const up = dir.y > 0;
    const lead = up ? box.maxY : box.minY;
    const colStart = cellOf(box.minX + EPS);
    const colEnd = cellOf(box.maxX - EPS);
    const first = cellOf(lead);
    const last = cellOf(lead + (up ? maxDistance : -maxDistance));

    for (let gy = first; up ? gy <= last : gy >= last; up ? gy++ : gy--) {
      const plane = up ? gy - 0.5 : gy + 0.5;
      const distance = up ? plane - lead : lead - plane;
      if (distance > maxDistance) break;
      for (let gx = colStart; gx <= colEnd; gx++) {
        if (grid.isSolid(gx, gy)) {
          return [{ distance: Math.max(0, distance), normal: { x: 0, y: up ? -1 : 1 } }];
        }
      }
    }
    return [];
  }

  return [];
}

/**
 * Kinematic body. Subclasses override computeVelocity() exactly as the Unity
 * script did.
 */
export abstract class PhysicsObject {
  position: Vec2 = { x: 0, y: 0 };
  velocity: Vec2 = { x: 0, y: 0 };
  protected targetVelocity: Vec2 = { x: 0, y: 0 };

  gravityModifier = 1;
  grounded = false;
  protected groundNormal: Vec2 = { x: 0, y: 1 };

  protected hitbox: AABB;
  protected grid: SolidGrid;

  constructor(hitbox: AABB, grid: SolidGrid) {
    this.hitbox = hitbox;
    this.grid = grid;
  }

  /** Sign of gravity: +1 for the floor runner, -1 for the ceiling runner. */
  get gravitySign(): number {
    return Math.sign(this.gravityModifier);
  }

  protected get gsign(): number {
    return this.gravitySign;
  }

  resetGroundNormal(): void {
    this.groundNormal = { x: 0, y: this.gsign };
  }

  /** World-space collision box at the current position. */
  box(): AABB {
    return {
      minX: this.position.x + this.hitbox.minX,
      maxX: this.position.x + this.hitbox.maxX,
      minY: this.position.y + this.hitbox.minY,
      maxY: this.position.y + this.hitbox.maxY,
    };
  }

  protected abstract computeVelocity(dt: number): void;

  /** PhysicsObject.Update() -- clears the target, then lets the subclass set it. */
  update(dt: number): void {
    this.targetVelocity = { x: 0, y: 0 };
    this.computeVelocity(dt);
  }

  /** PhysicsObject.FixedUpdate() -- order of operations is load-bearing. */
  fixedUpdate(dt: number): void {
    this.velocity.y += this.gravityModifier * UNITY_GRAVITY_Y * dt;
    this.velocity.x = this.targetVelocity.x;

    this.grounded = false;

    const delta = { x: this.velocity.x * dt, y: this.velocity.y * dt };
    const s = this.gsign;

    // Tangent of the ground plane, oriented by gravity. With axis-aligned
    // normals this is always (1, 0), but it is ported faithfully.
    const along: Vec2 = { x: this.groundNormal.y * s, y: -this.groundNormal.x * s };

    // Scale the tangent so horizontal displacement stays exactly delta.x --
    // this is what keeps forward speed constant regardless of surface.
    const k = delta.x / along.x;
    this.movement({ x: along.x * k, y: along.y * k }, false);

    this.movement({ x: 0, y: delta.y }, true);
  }

  private movement(move: Vec2, yMovement: boolean): void {
    const length = Math.hypot(move.x, move.y);
    let distance = length;

    if (length > MIN_MOVE_DISTANCE) {
      const dir = { x: move.x / length, y: move.y / length };
      const hits = castAABB(this.box(), dir, distance + SHELL_RADIUS, this.grid);

      // Losing contact resets the reference plane to straight "down".
      if (hits.length === 0) this.resetGroundNormal();

      for (const hit of hits) {
        const normal: Vec2 = { x: hit.normal.x, y: hit.normal.y };

        if (this.gsign * normal.y > MIN_GROUND_NORMAL_Y) {
          this.grounded = true;
          if (yMovement) {
            this.groundNormal = { x: normal.x, y: normal.y };
            normal.x = 0;
          }
        }

        const projection = this.velocity.x * normal.x + this.velocity.y * normal.y;
        if (projection < 0 && yMovement) {
          this.velocity.x -= projection * normal.x;
          this.velocity.y -= projection * normal.y;
        }

        const modified = hit.distance - SHELL_RADIUS;
        if (modified < distance) distance = modified;
      }

      this.position.x += dir.x * distance;
      this.position.y += dir.y * distance;
    }
  }
}
