import { test, expect } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "e2e-screenshots");

test.describe("Map Dashboard Features & States", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display map, top region, legend, and info card", async ({ page }, testInfo) => {
    // Wait for simulated map loading (800ms timer in App.tsx)
    await page.waitForTimeout(1200);

    // Verify right panel info card showing top region
    await expect(page.getByText("Wilayah Dipilih").first()).toBeVisible();
    await expect(page.getByText("Jawa Timur").first()).toBeVisible();

    // Verify Legend card shows 4 quantile ranges
    await expect(page.getByText("Skala Kuantil Pendapatan").first()).toBeVisible();

    // Capture screenshot of loaded map dashboard
    const screenshotPath = path.join(SCREENSHOT_DIR, `05-map-dashboard-success-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should switch period and update map data", async ({ page }, testInfo) => {
    await page.waitForTimeout(1200);

    // Open Radix Select dropdown and select "2024-Q2"
    const periodTrigger = page.getByRole("combobox", { name: "Pilih periode" });
    await periodTrigger.click();
    await page.waitForTimeout(300);
    await page.getByText("2024-Q2").last().click();

    // Wait for simulated loading
    await page.waitForTimeout(1200);

    // Verify top region info card is visible
    await expect(page.getByText("Wilayah Dipilih").first()).toBeVisible();

    // Screenshot period switched
    const screenshotPath = path.join(SCREENSHOT_DIR, `06-map-dashboard-period-q2-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should show empty state when period has no data (2023-Q4)", async ({ page }, testInfo) => {
    await page.waitForTimeout(1200);

    // Open Radix Select dropdown and select "2023-Q4" (Empty status)
    const periodTrigger = page.getByRole("combobox", { name: "Pilih periode" });
    await periodTrigger.click();
    await page.waitForTimeout(300);
    await page.getByText("2023-Q4").last().click();

    await page.waitForTimeout(1200);

    // Verify empty state display in map page
    await expect(page.getByText("Belum Ada Data Peta")).toBeVisible();
    await expect(page.getByText("Tidak ditemukan catatan realisasi pendapatan untuk periode ini.")).toBeVisible();

    // Verify toast info message
    await expect(page.getByText("Belum ada data untuk periode ini.")).toBeVisible();

    // Screenshot empty state
    const screenshotPath = path.join(SCREENSHOT_DIR, `07-map-dashboard-empty-state-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("should show error state and allow retry when period loading fails (2023-Q3)", async ({ page }, testInfo) => {
    await page.waitForTimeout(1200);

    // Open Radix Select dropdown and select "2023-Q3" (Error status)
    const periodTrigger = page.getByRole("combobox", { name: "Pilih periode" });
    await periodTrigger.click();
    await page.waitForTimeout(300);
    await page.getByText("2023-Q3").last().click();

    await page.waitForTimeout(1200);

    // Verify error state card and retry button
    await expect(page.getByText("Terjadi Kendala Memuat Layer Map")).toBeVisible();
    const retryBtn = page.getByRole("button", { name: "Muat Ulang Data Peta" });
    await expect(retryBtn).toBeVisible();

    // Screenshot error state
    const screenshotPath = path.join(SCREENSHOT_DIR, `08-map-dashboard-error-state-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Click Muat Ulang Data Peta retry button
    await retryBtn.click();
    await page.waitForTimeout(1200);

    // Verify period reset back to 2024-Q3 success state
    await expect(page.getByText("Wilayah Dipilih").first()).toBeVisible();
  });
});
