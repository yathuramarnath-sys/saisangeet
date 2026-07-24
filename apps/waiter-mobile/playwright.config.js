import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir:    "./tests/e2e",
  testMatch:  "**/*.spec.js",
  timeout:    60_000,   // 1 min per test (KOT send includes network + print)
  retries:    0,        // no retries — retries re-run beforeAll and hit API rate limits
  workers:    1,        // serial — one device state at a time

  use: {
    headless:    true,
    baseURL:     process.env.CAPTAIN_URL || "https://captain.dinexpos.in",
    // Accept self-signed / proxied TLS in CI
    ignoreHTTPSErrors: false,
    // Slow down actions slightly so animations don't race assertions
    actionTimeout:     8_000,
    navigationTimeout: 30_000,
    // Record video on failure for debugging
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    trace:      "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use:  { ...devices["Desktop Chrome"] },
    },
  ],

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "playwright-results.xml" }],
  ],
});
