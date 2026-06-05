import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// In dev (Replit), PORT and BASE_PATH are required and injected by the workflow.
// In production builds (Vercel CI), fall back to safe defaults — the dev server
// config block is never used during `vite build`, only during `vite dev`.
const port = parseInt(process.env.PORT ?? "5000");
const basePath = process.env.BASE_PATH ?? "/";

const plugins: any[] = [
  react(),
  tailwindcss(),
  VitePWA({
    strategies: "injectManifest",
    srcDir: "src",
    filename: "sw.ts",
    registerType: "autoUpdate",
    injectRegister: false,
    includeAssets: ["favicon.svg", "apple-touch-icon.png"],
    manifest: {
      id: "/",
      name: "GreenLink OS",
      short_name: "GreenLink",
      description: "Professional retail management for agrovet businesses.",
      theme_color: "#0A0A0A",
      background_color: "#0A0A0A",
      display: "standalone",
      display_override: ["standalone", "minimal-ui"],
      orientation: "portrait",
      scope: "/",
      start_url: "/",
      icons: [
        { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
        { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    injectManifest: {
      globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
    },
    devOptions: {
      enabled: false,
    },
  }),
];

if (!isProd) {
  // Replit-only plugins — only loaded in dev, never in Vercel builds
  plugins.push(
    await import("@replit/vite-plugin-runtime-error-modal").then(
      (m) => m.default(),
    ),
  );
  if (process.env.REPL_ID !== undefined) {
    plugins.push(
      await import("@replit/vite-plugin-cartographer").then((m) =>
        m.cartographer({ root: path.resolve(import.meta.dirname, "..") }),
      ),
      await import("@replit/vite-plugin-dev-banner").then((m) =>
        m.devBanner(),
      ),
    );
  }
}

export default defineConfig({
  base: basePath,
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress sourcemap warnings from third-party packages (Radix UI etc.)
        if (warning.code === "SOURCEMAP_ERROR") return;
        if (warning.message?.includes("Can't resolve original location")) return;
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Recharts + D3: only loaded on /reports — keep isolated
          if (
            id.includes("/recharts/") ||
            id.includes("/d3-") ||
            id.includes("/d3/") ||
            id.includes("/victory")
          ) {
            return "vendor-charts";
          }
          // Everything else in node_modules goes in a single vendor chunk —
          // avoids circular cross-chunk dependencies
          return "vendor";
        },
      },
      chunkSizeWarningLimit: 600,
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: false,
      allow: [path.resolve(import.meta.dirname, "..", "..")],
    },
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
