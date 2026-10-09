import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run against the real (dev) database from .env.local. Not run in CI.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
