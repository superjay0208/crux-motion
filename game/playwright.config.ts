import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./web-tests",
  workers: 1,
  timeout: 30000,
  reporter: [
    ["list"],
    ["json", { outputFile: "../validation/web-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4318",
    channel:
      process.env.CI || process.env.CRUX_CI === "1" ? undefined : "msedge",
  },
  webServer: {
    command: "node scripts/launch.mjs --no-open",
    url: "http://127.0.0.1:4318",
    reuseExistingServer: true,
  },
});
