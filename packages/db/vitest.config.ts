import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 1,
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}"],
      exclude: ["src/**/*.test.*", "src/**/*.spec.*", "src/**/*.d.{ts,mts,cts}", "src/**/fixtures/**", "src/**/test-fixtures/**", "src/**/*-test-fixture.*"],
      reporter: ["text", "json-summary", "json"],
      thresholds: { lines: 60 }
    }
  },
  resolve: {
    alias: {
      "@storymapper/db": fileURLToPath(new URL("./src", import.meta.url)),
      "@storymapper/server": fileURLToPath(new URL("../../apps/server/src", import.meta.url)),
      "@storymapper/contracts": fileURLToPath(new URL("../contracts/src", import.meta.url)),
      "@storymapper/core": fileURLToPath(new URL("../core/src", import.meta.url)),
      "@storymapper/importers": fileURLToPath(new URL("../importers/src/index.ts", import.meta.url))
    }
  }
});
