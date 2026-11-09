import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
      "@storymapper/server": fileURLToPath(new URL("./src", import.meta.url)),
      "@storymapper/web": fileURLToPath(new URL("../web/src", import.meta.url)),
      "@storymapper/ui-strings": fileURLToPath(new URL("../web/src/ui-strings/index.ts", import.meta.url)),
      "@storymapper/contracts": fileURLToPath(new URL("../../packages/contracts/src", import.meta.url)),
      "@storymapper/core": fileURLToPath(new URL("../../packages/core/src", import.meta.url)),
      "@storymapper/db": fileURLToPath(new URL("../../packages/db/src", import.meta.url)),
      "@storymapper/github": fileURLToPath(new URL("../../packages/github/src", import.meta.url)),
      "@storymapper/importers": fileURLToPath(new URL("../../packages/importers/src/index.ts", import.meta.url)),
      "@storymapper/mcp": fileURLToPath(new URL("../../packages/mcp/src", import.meta.url))
    }
  }
});
