/**
 * Minimal particle system, replacing the Unity ParticleSystems on the player
 * prefab: a running trail, a burst on jump, and a burst on landing.
 *
 * Deliberately tiny -- a fixed-capacity ring buffer with no allocation per
 * particle, since this runs inside the fixed-step loop.
 */
import type { Renderer } from "../core/renderer.ts";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

const MAX = 220;

export class Particles {
  private pool: Particle[] = [];
  private next = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0.05, color: "#fff" });
    }
  }

  private spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
  ): void {
    const p = this.pool[this.next]!;
    this.next = (this.next + 1) % MAX;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
  }

  /** A soft trail behind a grounded runner. */
  trail(x: number, y: number, color: string, gravitySign: number): void {
    this.spawn(
      x - 0.15,
      y - 0.28 * gravitySign,
      -1.1 - Math.random() * 0.7,
      (Math.random() - 0.5) * 0.5,
      0.34,
      0.035 + Math.random() * 0.025,
      color,
    );
  }

  /** Burst kicked out when a jump starts. */
  jump(x: number, y: number, color: string, gravitySign: number): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (0.15 + Math.random() * 0.7);
      this.spawn(
        x,
        y - 0.3 * gravitySign,
        -Math.cos(a) * (1.4 + Math.random()),
        -Math.sin(a) * (1.4 + Math.random()) * gravitySign,
        0.32 + Math.random() * 0.16,
        0.035 + Math.random() * 0.03,
        color,
      );
    }
  }

  /** Wider, flatter burst on landing. */
  land(x: number, y: number, color: string, gravitySign: number): void {
    for (let i = 0; i < 10; i++) {
      this.spawn(
        x,
        y - 0.31 * gravitySign,
        (Math.random() - 0.5) * 4.2,
        Math.random() * 1.1 * gravitySign,
        0.26 + Math.random() * 0.16,
        0.03 + Math.random() * 0.03,
        color,
      );
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
  }

  draw(r: Renderer): void {
    const { ctx } = r;
    ctx.save();
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t * 0.75;
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + t * 0.6);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  clear(): void {
    for (const p of this.pool) p.life = 0;
  }
}
