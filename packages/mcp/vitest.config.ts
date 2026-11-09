import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@storymapper/mcp": fileURLToPath(new URL("./src", import.meta.url)), "@storymapper/contracts": fileURLToPath(new URL("../contracts/src", import.meta.url)) } },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}"],
      exclude: ["src/**/*.test.*", "src/**/*.spec.*", "src/**/*.d.{ts,mts,cts}", "src/**/fixtures/**", "src/**/test-fixtures/**", "src/**/*-test-fixture.*"],
      reporter: ["text", "json-summary", "json"],
      thresholds: { lines: 60 }
    }
  },
});
