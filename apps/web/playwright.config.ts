import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:5175",
    trace: "on-first-retry",
    screenshot: "on",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // Keep the existing (infrastructure-sensitive) suite on its original
      // desktop project.  The responsive release gate below is deliberately
      // selected for the two additional viewports so an unavailable API or
      // browser service cannot multiply unrelated live-test failures.
      name: "chromium-tablet",
      testMatch: /accessibility-release\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "chromium-mobile",
      testMatch: /accessibility-release\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 800 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    cwd: ".",
    url: "http://localhost:5175",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
