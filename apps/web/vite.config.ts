import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import { storyMapViewPaths, viewFlagName } from "./src/app/story-map-view-paths";

export default defineConfig({
  test: {
    testTimeout: 60_000,
    env: { ...Object.fromEntries(storyMapViewPaths.map((path) => [viewFlagName(path), "true"])), VITE_FEATURE_VIEW_SOURCES: "true", VITE_FEATURE_VIEW_RELEASES: "true", VITE_FEATURE_VIEW_ROADMAPS: "true", VITE_FEATURE_PERSONAS: "true" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}"],
      exclude: ["src/**/*.test.*", "src/**/*.spec.*", "src/**/*.d.{ts,mts,cts}", "src/**/fixtures/**", "src/**/test-fixtures/**", "src/**/*-test-fixture.*"],
      reporter: ["text", "json-summary", "json"],
      thresholds: { lines: 60 }
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@storymapper/web/docs": fileURLToPath(new URL("../../docs", import.meta.url)),
      "@storymapper/web": fileURLToPath(new URL("./src", import.meta.url)),
      "@storymapper/contracts": fileURLToPath(new URL("../../packages/contracts/src", import.meta.url)),
      "@storymapper/core": fileURLToPath(new URL("../../packages/core/src", import.meta.url)),
      "@storymapper/ui-strings": fileURLToPath(new URL("./src/ui-strings/index.ts", import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:4317", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:4317", changeOrigin: true }
    }
  }
});
