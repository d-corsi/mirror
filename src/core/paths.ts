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
 * `import.meta.env.BASE_URL` must be written out LITERALLY here: Vite replaces
 * that exact token at build time. Assigning `import.meta` to a variable first,
 * or reaching it via optional chaining, defeats the substitution -- the built
 * bundle then looks up `import.meta.env` at runtime, finds nothing, and every
 * asset URL silently falls back to an absolute path. That works from a domain
 * root and 404s everywhere else, which is exactly the deployment that breaks.
 *
 * The try/catch is for the headless harness (tools/sim.ts), which imports this
 * transitively and runs under plain Node where `import.meta.env` is undefined.
 */
function resolveBase(): string {
  try {
    return import.meta.env.BASE_URL || "/";
  } catch {
    return "/";
  }
}

const BASE = resolveBase();

/** `asset("images/tileset.png")` -> correct URL wherever the game is hosted. */
export function asset(path: string): string {
  const clean = path.replace(/^\/+/, "");
  return `${BASE}${BASE.endsWith("/") ? "" : "/"}assets/${clean}`;
}
