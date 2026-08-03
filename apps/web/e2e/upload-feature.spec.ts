import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "e2e-screenshots");

test.describe("Upload Feature & File Processing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Navigate to Unggah tab
    const uploadBtn = page.getByRole("button", { name: "Unggah" }).first();
    await uploadBtn.click();
  });

  test("should upload valid Excel file, display progress and summary, and allow reset", async ({ page }, testInfo) => {
    // Check initial dropzone screen
    await expect(page.getByText("Tarik berkas Excel / CSV ke area ini")).toBeVisible();

    // Trigger file selection using browser DataTransfer API
    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) {
        const file = new File(["kode_daerah,nama_daerah,periode,setoran\n3301,Cilacap,2024-Q3,1500000000\n"], "test-data.csv", { type: "text/csv" });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    // Verify toast success & summary box appear (.first() handles any duplicate toast notifications)
    await expect(page.getByText("Unggah berhasil diproses.").first()).toBeVisible();
    await expect(page.getByText("Validasi Berkas Berhasil").first()).toBeVisible();
    await expect(page.getByText("186 baris").first()).toBeVisible();

    // Take screenshot of Upload Success & Summary
    const screenshotPath = path.join(SCREENSHOT_DIR, `09-upload-success-summary-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Click "Lihat Baris Error" details button with force: true
    const errorDetailsBtn = page.locator('button:has-text("Lihat Baris Error")').first();
    await errorDetailsBtn.click({ force: true });

    // Verify error detail table is expanded
    await expect(page.getByText("Rincian Baris Tidak Valid")).toBeVisible();

    // Take screenshot of detailed error rows table
    const screenshotTablePath = path.join(SCREENSHOT_DIR, `10-upload-error-rows-table-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotTablePath, fullPage: true });

    // Click Reset button "Unggah Berkas Baru" with force: true
    const resetBtn = page.locator('button:has-text("Unggah Berkas Baru")').first();
    await resetBtn.click({ force: true });

    // Verify view returns to initial dropzone state
    await expect(page.getByText("Tarik berkas Excel / CSV ke area ini")).toBeVisible();
  });

  test("should show error toast when invalid file extension is selected (.pdf)", async ({ page }, testInfo) => {
    // Trigger invalid pdf file selection using browser DataTransfer API
    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) {
        const file = new File(["%PDF-1.4 mock pdf content"], "invalid-doc.pdf", { type: "application/pdf" });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    // Verify Toast error notification (.first() handles any duplicate toast notifications)
    await expect(page.getByText("File tidak valid. Gunakan template Excel atau CSV.").first()).toBeVisible();

    // Take screenshot of Invalid File Toast Error
    const screenshotPath = path.join(SCREENSHOT_DIR, `11-upload-invalid-file-error-${testInfo.project.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
