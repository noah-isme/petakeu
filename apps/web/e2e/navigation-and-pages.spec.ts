import { test, expect } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "e2e-screenshots");

test.describe("Navigation and Page Layout Visual Tests", () => {
  test("should load Map Page by default and capture screenshot", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify Map Page elements are present
    await expect(page.getByRole("combobox", { name: "Pilih periode" })).toBeVisible();

    // Take screenshot of default Map Page
    const screenshotPath = path.join(SCREENSHOT_DIR, `01-map-page-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should navigate to Upload Page and capture screenshot", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click Unggah tab
    const uploadBtn = page.getByRole("button", { name: "Unggah" }).first();
    await uploadBtn.click();

    // Verify Upload Page elements
    await expect(page.getByText("Tarik berkas Excel / CSV ke area ini")).toBeVisible();

    // Take screenshot of Upload Page
    const screenshotPath = path.join(SCREENSHOT_DIR, `02-upload-page-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should navigate to Reports Page and capture screenshot", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click Laporan tab
    const reportsBtn = page.getByRole("button", { name: "Laporan" }).first();
    await reportsBtn.click();

    // Verify Metrics and Charts are present
    await expect(page.getByText("Total Wilayah")).toBeVisible();
    await expect(page.getByText("Total Nominal")).toBeVisible();

    // Take screenshot of Reports Page
    const screenshotPath = path.join(SCREENSHOT_DIR, `03-reports-page-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should navigate to About Page and capture screenshot", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click Tentang tab
    const aboutBtn = page.getByRole("button", { name: "Tentang" }).first();
    await aboutBtn.click();

    // Verify About Page elements
    await expect(page.getByText("Enterprise Platform").first()).toBeVisible();

    // Take screenshot of About Page
    const screenshotPath = path.join(SCREENSHOT_DIR, `04-about-page-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should toggle sidebar collapse state", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const sidebar = page.getByTestId("desktop-sidebar-wrapper").locator("aside");
    await expect(sidebar).toHaveClass(/w-72/);

    // Trigger sidebar toggle via browser dispatchEvent for React state update
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="desktop-sidebar-wrapper"] [data-testid="sidebar-toggle-button"]') as HTMLButtonElement;
      if (btn) btn.click();
    });

    // Verify sidebar collapses to w-20
    await expect(sidebar).toHaveClass(/w-20/);
  });
});
