import { test, expect } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "e2e-screenshots");

test.describe("Reports Summary & About Documentation Features", () => {
  test("should render Reports Summary with metrics cards and recharts trend", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click Laporan tab
    const reportsBtn = page.getByRole("button", { name: "Laporan" }).first();
    await reportsBtn.click();

    // Verify key metrics cards
    await expect(page.getByText("Total Wilayah")).toBeVisible();
    await expect(page.getByText("Total Nominal")).toBeVisible();

    // Take high-resolution screenshot of Reports Summary
    const screenshotPath = path.join(SCREENSHOT_DIR, `12-reports-summary-cards-and-chart-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should render About Page documentation and system features", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click Tentang tab
    const aboutBtn = page.getByRole("button", { name: "Tentang" }).first();
    await aboutBtn.click();

    // Verify system architecture items
    await expect(page.getByText("Enterprise Platform").first()).toBeVisible();

    // Take screenshot of About documentation
    const screenshotPath = path.join(SCREENSHOT_DIR, `13-about-system-documentation-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should test mobile view responsive layout and sidebar drawer navigation", async ({ page }, testInfo) => {
    // Force mobile viewport size
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify mobile hamburger / toggle menu button exists
    const menuBtn = page.getByRole("button", { name: "Buka navigasi" });
    await expect(menuBtn).toBeVisible();

    // Take screenshot of mobile map view
    const mobileMapScreenshot = path.join(SCREENSHOT_DIR, `14-mobile-map-view-${testInfo.project.name}.png`);
    await page.screenshot({ path: mobileMapScreenshot, fullPage: true });

    // Open mobile sidebar drawer
    await menuBtn.click();
    await expect(page.getByTestId("mobile-sidebar-drawer")).toBeVisible();

    // Take screenshot of mobile sidebar drawer open
    const mobileDrawerScreenshot = path.join(SCREENSHOT_DIR, `15-mobile-sidebar-drawer-open-${testInfo.project.name}.png`);
    await page.screenshot({ path: mobileDrawerScreenshot, fullPage: true });
  });
});
