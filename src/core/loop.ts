/**
 * Fixed-timestep game loop.
 *
 * The original ran physics in FixedUpdate but integrated with Time.deltaTime at
 * a capped 60 fps, making it frame-rate coupled. Pinning the step to 1/60 keeps
 * the intended feel while being deterministic on any display refresh rate.
 */
import { FIXED_DT } from "../game/constants.ts";

/** Never simulate more than this much wall time in one frame (tab-switch guard). */
const MAX_FRAME_TIME = 0.25;

export interface LoopHandlers {
  /** Fixed-rate simulation step. */
  step(dt: number): void;
  /** Called once per rendered frame; alpha is the interpolation factor. */
  render(alpha: number): void;
}

export function startLoop(handlers: LoopHandlers): () => void {
  let previous = performance.now();
  let accumulator = 0;
  let running = true;
  let raf = 0;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    let elapsed = (now - previous) / 1000;
    previous = now;
    if (elapsed > MAX_FRAME_TIME) elapsed = MAX_FRAME_TIME;

    accumulator += elapsed;
    while (accumulator >= FIXED_DT) {
      handlers.step(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    handlers.render(accumulator / FIXED_DT);
  };

  raf = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
  };
}
