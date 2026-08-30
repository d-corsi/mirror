/**
 * Port of PlayerController.cs + PlayerCollision.cs.
 *
 * Player 1 runs on the floor (gravityModifier +3); Player 2 runs upside down
 * along the ceiling (-3). They are otherwise identical -- same speed, same jump,
 * same collider.
 *
 * Note the death bounds are the inverse of intuition, straight from the
 * prefabs: Player 1 has playerUp = true and dies at Bound/bottom (it falls into
 * the pit); Player 2 has playerUp = false and dies at Bound/top (it floats off
 * the ceiling).
 */
import {
  JUMP_BOOST_SPEED,
  JUMP_TAKEOFF_SPEED,
  PLAYER_HITBOX,
  PLAYER_SPEED,
  SPEED_DECAY,
} from "./constants.ts";
import { PhysicsObject, type AABB, type SolidGrid } from "./physics.ts";

export class Player extends PhysicsObject {
  speed = PLAYER_SPEED;
  jumped = false;
  jumpBoost = false;
  dead = false;
  endLevel = false;

  /** Queued jump intent for this step, set by input. */
  private wantJump = false;

  /** true for Player 1: dies at the bottom bound rather than the top. */
  readonly playerUp: boolean;

  constructor(grid: SolidGrid, gravityModifier: number, playerUp: boolean) {
    super(PLAYER_HITBOX as AABB, grid);
    this.playerUp = playerUp;
    this.gravityModifier = gravityModifier;
    this.resetGroundNormal();
  }

  spawn(x: number, y: number): void {
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.speed = PLAYER_SPEED;
    this.jumped = false;
    this.jumpBoost = false;
    this.dead = false;
    this.endLevel = false;
    this.grounded = false;
    this.wantJump = false;
    this.resetGroundNormal();
  }

  requestJump(): void {
    this.wantJump = true;
  }

  protected computeVelocity(dt: number): void {
    // The runner skids to a halt after dying.
    if (this.dead && this.speed > 0) {
      this.speed = Math.max(0, this.speed - SPEED_DECAY * dt);
    }

    // Landing clears the single-jump latch.
    if (this.grounded) this.jumped = false;

    if (this.wantJump) {
      this.jump();
      this.wantJump = false;
    }

    this.targetVelocity.x = this.speed;
  }

  jump(): void {
    if (this.jumped || this.dead) return;
    this.jumped = true;
    this.grounded = false;
    const speed = this.jumpBoost ? JUMP_BOOST_SPEED : JUMP_TAKEOFF_SPEED;
    this.velocity.y = speed * this.gsign;
  }

  kill(): void {
    this.dead = true;
  }
}
