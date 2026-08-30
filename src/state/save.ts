/**
 * Progression, ported from GameState.cs + GameStateData.cs + SaveSystem.cs.
 *
 * The original persisted a BinaryFormatter blob to Application.persistentDataPath;
 * the web port uses a JSON document in localStorage.
 *
 * The `gameVersion` field (free / premium / developer) is deliberately dropped:
 * it existed only to gate ads and IAP unlocks, neither of which ships on the web.
 * Every level is unlocked by playing, as in the original's premium build.
 */

const KEY = "mirror.save.v1";

export interface SaveData {
  /** 1-based, matching the original's level numbering. */
  currentLevel: number;
  /** Highest level the player has unlocked (1-based). */
  unlockedLevel: number;
  /** Best star count per level, indexed by level-1. */
  stars: number[];
  musicOn: boolean;
}

const defaults = (levelCount: number): SaveData => ({
  currentLevel: 1,
  unlockedLevel: 1,
  stars: new Array<number>(levelCount).fill(0),
  musicOn: true,
});

export class Save {
  private data: SaveData;

  constructor(private levelCount: number) {
    this.data = this.load();
  }

  private load(): SaveData {
    const base = defaults(this.levelCount);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const stars = Array.isArray(parsed.stars) ? parsed.stars.slice(0, this.levelCount) : [];
      while (stars.length < this.levelCount) stars.push(0);
      return {
        currentLevel: clamp(parsed.currentLevel ?? 1, 1, this.levelCount),
        unlockedLevel: clamp(parsed.unlockedLevel ?? 1, 1, this.levelCount),
        stars: stars.map((n) => clamp(Number(n) || 0, 0, 3)),
        musicOn: parsed.musicOn ?? true,
      };
    } catch {
      // Private browsing, disabled storage, or corrupt JSON: play unsaved.
      return base;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable -- progression is in-memory only this session */
    }
  }

  get currentLevel(): number {
    return this.data.currentLevel;
  }

  get unlockedLevel(): number {
    return this.data.unlockedLevel;
  }

  get musicOn(): boolean {
    return this.data.musicOn;
  }

  get totalStars(): number {
    return this.data.stars.reduce((a, b) => a + b, 0);
  }

  starsFor(level: number): number {
    return this.data.stars[level - 1] ?? 0;
  }

  setCurrentLevel(level: number): void {
    this.data.currentLevel = clamp(level, 1, this.levelCount);
    this.persist();
  }

  setMusicOn(on: boolean): void {
    this.data.musicOn = on;
    this.persist();
  }

  /** GameState.setStarsForLevel -- keeps the best result only. */
  recordStars(level: number, stars: number): void {
    const i = level - 1;
    if (i < 0 || i >= this.levelCount) return;
    if ((this.data.stars[i] ?? 0) < stars) {
      this.data.stars[i] = stars;
      this.persist();
    }
  }

  /** Unlocks the next level, but only when finishing the newest one. */
  unlockAfter(level: number): void {
    if (level === this.data.unlockedLevel && level < this.levelCount) {
      this.data.unlockedLevel = level + 1;
      this.persist();
    }
  }

  isUnlocked(level: number): boolean {
    return level <= this.data.unlockedLevel;
  }

  reset(): void {
    this.data = defaults(this.levelCount);
    this.persist();
  }
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(n)));
