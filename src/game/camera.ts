/**
 * Port of CameraController.cs, plus the Bound/* triggers that were authored as
 * children of the camera prefab and therefore travel with it.
 *
 * The camera only ever moves in x; its y is pinned at 9.
 */
import {
  BOUND_BOTTOM_Y,
  BOUND_TOP_Y,
  CAMERA_HEIGHT,
  CAMERA_SPEED,
  CAMERA_Y,
  SHIPPED_BOUND_LEFT_X,
  SHIPPED_BOUND_WIN_X,
} from "./constants.ts";

/**
 * The shipped bound offsets were authored for a 16:9 landscape viewport
 * (half-width 17.778). Verified: with that half-width, Bound/win lands just past
 * the level's last column once the camera clamps at levelEnd -- no other aspect
 * makes the numbers consistent.
 *
 * We keep the bounds at the same distance *beyond the visible edge* rather than
 * copying the literals, so the win line and the fall-behind line stay fair on
 * any viewport. This is the one place the plan deliberately does not port the
 * raw number.
 */
const SHIPPED_HALF_WIDTH = (CAMERA_HEIGHT * (16 / 9)) / 2;
export const WIN_MARGIN = SHIPPED_BOUND_WIN_X - SHIPPED_HALF_WIDTH; // ~1.23
export const LEFT_MARGIN = -SHIPPED_BOUND_LEFT_X - SHIPPED_HALF_WIDTH; // ~5.37

export class Camera {
  x = 0;
  readonly y = CAMERA_Y;
  isMoving = false;
  private levelEnd = 2000;

  /** Visible half-width in world units, from the canvas aspect ratio. */
  halfWidth = SHIPPED_HALF_WIDTH;

  setViewport(aspect: number): void {
    this.halfWidth = (CAMERA_HEIGHT * aspect) / 2;
  }

  /** CameraController.setCameraStartPosition */
  reset(): void {
    this.x = this.halfWidth;
    this.isMoving = false;
  }

  /** CameraController.setLevelEnd(map.width) */
  setLevelEnd(levelWidth: number): void {
    this.levelEnd = levelWidth - this.halfWidth - 1;
  }

  /**
   * Starts scrolling once any player reaches the camera's x, then runs at a
   * constant speed until the level end.
   */
  update(dt: number, playerXs: number[]): void {
    if (this.isMoving) {
      this.x = Math.min(this.x + CAMERA_SPEED * dt, this.levelEnd);
    } else if (playerXs.some((px) => px >= this.x)) {
      this.isMoving = true;
    }
  }

  get leftBoundX(): number {
    return this.x - this.halfWidth - LEFT_MARGIN;
  }

  get winBoundX(): number {
    return this.x + this.halfWidth + WIN_MARGIN;
  }

  get topBoundY(): number {
    return this.y + BOUND_TOP_Y;
  }

  get bottomBoundY(): number {
    return this.y + BOUND_BOTTOM_Y;
  }
}
