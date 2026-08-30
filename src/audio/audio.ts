/**
 * Music playback, replacing AudioController.cs.
 *
 * Browsers block audio until a user gesture, so playback is armed on the first
 * pointer/key event rather than at load. Tracks are streamed rather than
 * preloaded, and are re-encoded to 96k AAC by tools/prepare_assets.py.
 */
import { asset } from "../core/paths.ts";

const TRACKS = [
  "mirror_phase_zero.m4a",
  "mirror_phase_one_edit.m4a",
  "mirror_phase_two.m4a",
  "mirror_phase_three.m4a",
  "mirror_legacy.m4a",
];

const MENU_TRACK = "mirror_phase_main_theme_no_end.m4a";

export class Audio {
  private el: HTMLAudioElement;
  private unlocked = false;
  private enabled: boolean;
  private wanted: string | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    this.el = new window.Audio();
    this.el.loop = true;
    this.el.volume = 0.55;
    this.el.preload = "none";

    const unlock = () => {
      this.unlocked = true;
      if (this.wanted) void this.start(this.wanted);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  private async start(file: string): Promise<void> {
    const src = asset(`music/${file}`);
    if (!this.el.src.endsWith(file)) {
      this.el.src = src;
    }
    if (!this.enabled || !this.unlocked) return;
    try {
      await this.el.play();
    } catch {
      /* autoplay still blocked; will retry on the next gesture */
    }
  }

  playMenu(): void {
    this.wanted = MENU_TRACK;
    void this.start(MENU_TRACK);
  }

  /** Levels cycle through the phase tracks, so the music varies as you progress. */
  playLevel(level: number): void {
    const track = TRACKS[(level - 1) % TRACKS.length]!;
    this.wanted = track;
    void this.start(track);
  }

  stop(): void {
    this.el.pause();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.el.pause();
    else if (this.wanted) void this.start(this.wanted);
  }
}
