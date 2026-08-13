import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.PETAKEU_E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? "http://localhost:5175";
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR ?? "test-results";
const reportDir = process.env.PLAYWRIGHT_REPORT_DIR ?? "playwright-report";
const jsonOutputFile = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? `${reportDir}/results.json`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  outputDir,
  reporter: [
    ["html", { open: "never", outputFolder: reportDir }],
    ["json", { outputFile: jsonOutputFile }],
    ["list"]
  ],
  use: {
    baseURL,
    trace: process.env.CI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 }
      }
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
        viewport: { width: 768, height: 1024 }
      }
    },
    {
      name: "chromium-mobile",
      testMatch: /accessibility-release\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 800 }
      }
    }
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: "pnpm --filter @petakeu/web dev --host 0.0.0.0",
        cwd: ".",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60000,
        env: {
          VITE_USE_MSW: process.env.VITE_USE_MSW ?? "true"
        }
      }
});
