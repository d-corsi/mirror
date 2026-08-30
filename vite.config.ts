import { defineConfig } from "vite";

export default defineConfig({
  // Relative base, so the built site works from a domain root, from a
  // subdirectory, and from a GitHub Pages project site (user.github.io/<repo>/)
  // without needing to know the path at build time.
  base: "./",
  server: {
    // Bind all interfaces (IPv4 + IPv6). Vite's default binds IPv6 [::1] only,
    // which Safari cannot reach when it resolves localhost to 127.0.0.1 --
    // the page fails to connect rather than failing to render.
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
});
