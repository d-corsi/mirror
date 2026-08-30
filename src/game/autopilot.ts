/**
 * Debug autopilot (?autoplay), sharing the heuristics used by tools/sim.ts.
 *
 * Jumps as LATE as possible: several levels step up onto a raised tier, and
 * jumping early makes the runner slam into that tier's side rather than
 * clearing it. It plays well enough to exercise the win path end to end, but
 * it is a test aid, not a solver -- it will not clear every level.
 */
import type { Level } from "./level.ts";
import type { Player } from "./player.ts";

const gapAhead = (level: Level, p: Player, lookahead: number): boolean => {
  const dir = p.gravitySign;
  const foot = dir > 0 ? p.box().minY - 0.6 : p.box().maxY + 0.6;
  const gy = Math.floor(foot + 0.5);
  for (let d = 1; d <= lookahead; d++) {
    if (!level.isSolid(Math.floor(p.position.x + 0.5) + d, gy)) return true;
  }
  return false;
};

const wallAhead = (level: Level, p: Player): boolean => {
  const b = p.box();
  for (let d = 1; d <= 2; d++) {
    const gx = Math.floor(b.maxX + 0.5) + d;
    for (let gy = Math.floor(b.minY + 0.5); gy <= Math.floor(b.maxY + 0.5); gy++) {
      if (level.isSolid(gx, gy)) return true;
    }
  }
  return false;
};

export function autopilot(level: Level, players: Player[]): void {
  for (const p of players) {
    if (p.dead || p.endLevel || !p.grounded) continue;
    if (gapAhead(level, p, 1) || wallAhead(level, p)) p.requestJump();
  }
}
