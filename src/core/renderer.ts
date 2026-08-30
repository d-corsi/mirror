/**
 * Canvas2D renderer.
 *
 * World space is Unity-style: +y is up, 1 unit = 1 tile. The vertical extent is
 * pinned to 20 units (the camera's orthographic height) and must never change --
 * it defines the playfield, and altering it would make levels unfair. Width
 * follows the viewport aspect, letterboxing horizontally.
 */
import { CAMERA_HEIGHT } from "../game/constants.ts";

/**
 * The playfield is pinned to the aspect the game shipped at (16:9 landscape,
 * established in Phase 0 from the Bound/* offsets) and letterboxed on any
 * other viewport.
 *
 * This is a fairness constraint, not a cosmetic one: how far ahead you can see,
 * and where the win and fall-behind lines sit, all derive from the camera's
 * half-width. Letting the viewport decide them would make the game markedly
 * harder in portrait and easier on ultrawide. Pinning keeps every player on the
 * playfield the levels were designed against.
 */
export const PLAYFIELD_ASPECT = 16 / 9;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  /** World units per CSS pixel. */
  private scale = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  /** Sizes the backing store to the viewport at up to 2x DPR. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.cssWidth = w;
    this.cssHeight = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);

    // Fit the fixed 16:9 playfield inside the viewport; the shorter axis
    // letterboxes rather than revealing or hiding play area.
    this.scale = Math.min(w / (CAMERA_HEIGHT * PLAYFIELD_ASPECT), h / CAMERA_HEIGHT);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Always the shipped aspect -- see PLAYFIELD_ASPECT. */
  get aspect(): number {
    return PLAYFIELD_ASPECT;
  }

  get worldWidth(): number {
    return CAMERA_HEIGHT * PLAYFIELD_ASPECT;
  }

  /** Viewport aspect, for diagnostics only. */
  get viewportAspect(): number {
    return this.cssWidth / this.cssHeight;
  }

  /**
   * Applies the camera transform: world coordinates in, screen pixels out,
   * with +y up. Restore with ctx.restore().
   */
  begin(cameraX: number, cameraY: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(this.cssWidth / 2, this.cssHeight / 2);
    ctx.scale(this.scale, -this.scale);
    ctx.translate(-cameraX, -cameraY);
  }

  end(): void {
    this.ctx.restore();
  }

  clear(color: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }
}
