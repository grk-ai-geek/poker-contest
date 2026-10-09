import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Tests talk to the same database as the dev server.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
