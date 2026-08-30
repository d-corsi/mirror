/**
 * DOM screen management, replacing GameMain.cs's SetActive juggling.
 *
 * UI is HTML rather than canvas-drawn: it is far easier to make responsive and
 * accessible, and only the playfield actually needs the canvas.
 */

export type ScreenName = "menu" | "select" | "tutorial" | "death" | "win" | "endgame";

const ids: ScreenName[] = ["menu", "select", "tutorial", "death", "win", "endgame"];

export class Screens {
  private els = new Map<ScreenName, HTMLElement>();
  private active: ScreenName | null = null;

  constructor() {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) throw new Error(`missing screen element #${id}`);
      this.els.set(id, el);
    }
  }

  show(name: ScreenName | null): void {
    for (const [id, el] of this.els) el.classList.toggle("on", id === name);
    this.active = name;
  }

  get current(): ScreenName | null {
    return this.active;
  }

  /** True when no overlay is up, i.e. the player is actually playing. */
  get inPlay(): boolean {
    return this.active === null || this.active === "tutorial";
  }
}

export const el = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
};

/** Renders "★★☆" for a 0-3 star score. */
export const starMarkup = (n: number): string =>
  [0, 1, 2]
    .map((i) => (i < n ? "<span>★</span>" : '<span class="off">★</span>'))
    .join("");
