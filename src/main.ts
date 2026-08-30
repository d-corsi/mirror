/**
 * Mirror -- HTML5 rebuild.
 *
 * Wires together the screen flow that GameMain.cs drove: menu -> level select
 * -> play -> death/win -> next level -> end of game, with progression in
 * localStorage and music per level.
 */
import { asset } from "./core/paths.ts";
import { Audio } from "./audio/audio.ts";
import { loadImage, loadImages } from "./core/assets.ts";
import { Input } from "./core/input.ts";
import { startLoop } from "./core/loop.ts";
import { Renderer } from "./core/renderer.ts";
import type { Sheets } from "./game/draw.ts";
import { Level, decodeImage, loadLevelData, type ColorMapping } from "./game/level.ts";
import { loadRig, type Rig } from "./game/rig.ts";
import { Session } from "./game/session.ts";
import { Save } from "./state/save.ts";
import { Screens, el, starMarkup } from "./ui/screens.ts";

const canvas = el<HTMLCanvasElement>("game");
const hud = el("hud");
const topLeft = el("topLeft");
const debugEl = el("debug");

const params = new URLSearchParams(location.search);
const showDebug = params.has("debug");
/** ?level=N jumps straight into a level (0-based), bypassing the menu. */
const directLevel = params.has("level") ? Number(params.get("level")) : null;
const autoplay = params.has("autoplay");

async function main(): Promise<void> {
  const data = await loadLevelData();
  const levelCount = data.levels.length;

  const sheets: Sheets = await loadImages({
    tileset: asset("images/tileset.png"),
    jumpArrow: asset("images/jump_arrow.png"),
    background: asset("images/background.png"),
    backgroundDone: asset("images/background_completed.png"),
  });

  // The rig is a nicety: if it fails, players fall back to boxes.
  let rig: Rig | null = null;
  try {
    rig = await loadRig();
  } catch (err) {
    console.warn("[mirror] rig unavailable, drawing boxes", err);
  }

  const renderer = new Renderer(canvas);
  const input = new Input(canvas);
  const screens = new Screens();
  const save = new Save(levelCount);
  const audio = new Audio(save.musicOn);

  renderer.resize();

  /** Level images are decoded on demand and cached. */
  const levelCache = new Map<number, Level>();
  const getLevel = async (level: number): Promise<Level> => {
    const cached = levelCache.get(level);
    if (cached) return cached;
    const file = data.levels[level - 1];
    if (!file) throw new Error(`no level ${level}`);
    const img = await loadImage(asset(`levels/${file}`));
    const built = new Level(decodeImage(img), data.mappings as ColorMapping[]);
    if (built.tiles.length === 0) {
      throw new Error(`${file} decoded to 0 tiles (unmatched: ${built.unmatched})`);
    }
    if (!built.spawnP1 || !built.spawnP2) {
      throw new Error(`${file} is missing a player spawn pixel`);
    }
    levelCache.set(level, built);
    return built;
  };

  let session: Session | null = null;
  let currentLevel = save.currentLevel;
  let tutorialPending = false;

  // ------------------------------------------------------------- rendering
  const renderHud = () => {
    if (!session || !screens.inPlay) {
      hud.textContent = "";
      topLeft.innerHTML = "";
      return;
    }
    hud.innerHTML =
      `<span>Level ${currentLevel}</span>` +
      `<span class="stars">${"★".repeat(session.stars)}${"·".repeat(3 - session.stars)}</span>`;
    if (!topLeft.querySelector("button")) {
      const menuBtn = document.createElement("button");
      menuBtn.textContent = "Menu";
      menuBtn.onclick = () => toMenu();
      topLeft.appendChild(menuBtn);
    }
  };

  // --------------------------------------------------------- screen flow
  const toMenu = () => {
    session = null;
    screens.show("menu");
    el("menuStars").textContent = `${save.totalStars} of ${levelCount * 3} stars`;
    audio.playMenu();
    renderHud();
  };

  const toSelect = () => {
    screens.show("select");
    const grid = el("levelGrid");
    grid.innerHTML = "";
    for (let i = 1; i <= levelCount; i++) {
      const b = document.createElement("button");
      b.className = "level" + (i === currentLevel ? " current" : "");
      const unlocked = save.isUnlocked(i);
      b.disabled = !unlocked;
      b.innerHTML =
        `<span>${unlocked ? i : "🔒"}</span>` +
        `<span class="stars">${unlocked ? "★".repeat(save.starsFor(i)) : ""}</span>`;
      b.onclick = () => void startLevel(i);
      grid.appendChild(b);
    }
  };

  const startLevel = async (level: number) => {
    currentLevel = level;
    save.setCurrentLevel(level);
    const lvl = await getLevel(level);
    session = new Session(lvl, renderer.aspect);
    session.autoplay = autoplay;
    session.rig = rig;
    audio.playLevel(level);
    input.clear();

    // The original showed a tutorial overlay on level 1 only.
    if (level === 1) {
      tutorialPending = true;
      screens.show("tutorial");
    } else {
      tutorialPending = false;
      screens.show(null);
    }
    renderHud();
  };

  const onDeath = () => {
    screens.show("death");
  };

  const onWin = () => {
    if (!session) return;
    save.recordStars(currentLevel, session.stars);
    save.unlockAfter(currentLevel);

    if (currentLevel >= levelCount) {
      el("endStars").textContent = `${save.totalStars} of ${levelCount * 3} stars`;
      screens.show("endgame");
      return;
    }
    el("winStars").innerHTML = starMarkup(session.stars);
    screens.show("win");
  };

  // ------------------------------------------------------------- controls
  el("btnPlay").onclick = () => void startLevel(save.currentLevel);
  el("btnLevels").onclick = () => toSelect();
  el("btnBackFromSelect").onclick = () => toMenu();
  el("btnReset").onclick = () => {
    save.reset();
    currentLevel = 1;
    toSelect();
  };

  const musicBtn = el<HTMLButtonElement>("btnMusic");
  const syncMusicLabel = () => {
    musicBtn.textContent = `Music: ${save.musicOn ? "on" : "off"}`;
  };
  musicBtn.onclick = () => {
    save.setMusicOn(!save.musicOn);
    audio.setEnabled(save.musicOn);
    syncMusicLabel();
  };
  syncMusicLabel();

  el("btnRetry").onclick = () => {
    session?.restart();
    screens.show(null);
    input.clear();
  };
  el("btnReplay").onclick = () => {
    session?.restart();
    screens.show(null);
    input.clear();
  };
  el("btnNext").onclick = () => void startLevel(Math.min(currentLevel + 1, levelCount));
  el("btnDeathMenu").onclick = () => toMenu();
  el("btnWinMenu").onclick = () => toMenu();
  el("btnEndMenu").onclick = () => toMenu();

  // Dismiss the tutorial with the first tap, as the original did.
  const dismissTutorial = () => {
    if (!tutorialPending) return;
    tutorialPending = false;
    screens.show(null);
    input.clear();
  };
  el("tutorial").addEventListener("pointerdown", dismissTutorial);
  canvas.addEventListener("pointerdown", dismissTutorial);

  window.addEventListener("resize", () => {
    renderer.resize();
    session?.setViewport(renderer.aspect);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (screens.inPlay && session) toMenu();
  });

  // Debug-only handle, so tooling can inspect live state (tools/drive.mjs).
  if (showDebug) {
    (window as unknown as Record<string, unknown>).__mirror = {
      get session() {
        return session;
      },
      get save() {
        return save;
      },
      renderer,
    };
  }

  // ----------------------------------------------------------------- loop
  startLoop({
    step: (dt) => {
      if (!session || !screens.inPlay || tutorialPending) {
        // Consume input so a menu click does not leak into the next run.
        input.clear();
        return;
      }
      session.step(dt, input);
      if (session.justEnded === "dead") onDeath();
      else if (session.justEnded === "won") onWin();
    },
    render: () => {
      if (session) {
        session.render(renderer, sheets, showDebug);
      } else {
        renderer.clear("#05060a");
      }
      renderHud();
      if (showDebug && session) {
        const { camera, p1, p2, level } = session;
        debugEl.textContent =
          `cam   x=${camera.x.toFixed(2)} moving=${camera.isMoving} halfW=${camera.halfWidth.toFixed(2)}\n` +
          `P1    x=${p1.position.x.toFixed(2)} y=${p1.position.y.toFixed(2)} grounded=${p1.grounded}\n` +
          `P2    x=${p2.position.x.toFixed(2)} y=${p2.position.y.toFixed(2)} grounded=${p2.grounded}\n` +
          `level ${currentLevel}/${levelCount}  ${level.width}x${level.height} tiles=${level.tiles.length}`;
      }
    },
  });

  if (directLevel !== null) await startLevel(directLevel + 1);
  else toMenu();
}

const showFatal = (what: string, err: unknown) => {
  const menu = document.getElementById("menu");
  if (menu) {
    menu.classList.add("on");
    menu.innerHTML = `<h2>${what}</h2><p class="sub" style="max-width:min(90vw,700px);text-transform:none;letter-spacing:.04em">${String(
      err,
    ).replace(/</g, "&lt;")}</p>`;
  }
  console.error(what, err);
};

// A throw inside requestAnimationFrame would otherwise stop the loop silently.
window.addEventListener("error", (e) => showFatal("Runtime error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => showFatal("Unhandled rejection", e.reason));

main().catch((err: unknown) => showFatal("Failed to start", err));
