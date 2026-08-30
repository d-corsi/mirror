/**
 * Input: which half of the screen was tapped, plus keyboard for desktop.
 *
 * The original split the screen at Screen.width / 4, not the midpoint --
 * `screenWidth` was pre-divided by 2 and then halved again in the comparison.
 * That is a bug, not a design choice (it makes the two players' tap zones wildly
 * asymmetric), so the port uses a clean 50/50 split. This is a deliberate,
 * documented divergence from the original.
 */

export type Side = "left" | "right";

export class Input {
  /** Edge-triggered jump intents, consumed once per simulation step. */
  private pending: Record<Side, boolean> = { left: false, right: false };
  private detach: Array<() => void> = [];

  constructor(private target: HTMLElement) {
    const press = (clientX: number) => {
      const rect = this.target.getBoundingClientRect();
      const side: Side = clientX - rect.left < rect.width / 2 ? "left" : "right";
      this.pending[side] = true;
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      press(e.clientX);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          this.pending.left = true;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          this.pending.right = true;
          break;
        case " ":
          // Space jumps both -- handy when tuning feel solo.
          this.pending.left = true;
          this.pending.right = true;
          e.preventDefault();
          break;
        default:
          break;
      }
    };

    target.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    this.detach.push(
      () => target.removeEventListener("pointerdown", onPointerDown),
      () => window.removeEventListener("keydown", onKeyDown),
    );
  }

  /** Reads and clears the intent for one side. */
  consume(side: Side): boolean {
    const v = this.pending[side];
    this.pending[side] = false;
    return v;
  }

  clear(): void {
    this.pending.left = false;
    this.pending.right = false;
  }

  dispose(): void {
    for (const fn of this.detach) fn();
    this.detach = [];
  }
}
