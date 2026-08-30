/**
 * Asset URL resolution.
 *
 * Vite rewrites asset paths it can see at build time, but URLs built as strings
 * at runtime (fetch, new Image().src) are invisible to it. Those must be
 * resolved against the deployment base, or the game 404s anywhere it is not
 * served from the domain root -- which includes GitHub Pages project sites
 * (username.github.io/<repo>/) and any hosting under a subdirectory.
 */
/**
 * `import.meta.env` only exists under Vite. The headless harness (tools/sim.ts)
 * imports this module transitively via level.ts and runs in plain Node, so this
 * must degrade instead of throwing.
 */
const meta = import.meta as ImportMeta & { env?: { BASE_URL?: string } };
const BASE = meta.env?.BASE_URL ?? "/";

/** `asset("images/tileset.png")` -> correct URL wherever the game is hosted. */
export function asset(path: string): string {
  const clean = path.replace(/^\/+/, "");
  return `${BASE}${BASE.endsWith("/") ? "" : "/"}assets/${clean}`;
}
