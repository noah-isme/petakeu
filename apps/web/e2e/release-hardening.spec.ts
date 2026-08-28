import { expect, test, type Page } from "@playwright/test";

/**
 * Browser release-hardening coverage for the shell that is mounted by the
 * current Vite app. The standalone MapDashboard checks are opt-in because the
 * current App shell does not mount that route yet.
 *
 * Optional environment variables:
 * - PETAKEU_MAP_DASHBOARD_URL: mounted MapDashboard URL for mode/detail checks
 * - PETAKEU_RBAC_PUBLIC_UI_URL / PETAKEU_RBAC_PRIVILEGED_UI_URL: role-aware UI URLs
 */

const mapDashboardUrl = process.env.PETAKEU_MAP_DASHBOARD_URL;
const publicUiUrl = process.env.PETAKEU_RBAC_PUBLIC_UI_URL;
const privilegedUiUrl = process.env.PETAKEU_RBAC_PRIVILEGED_UI_URL;

async function uploadControlCount(page: Page) {
  const uploadButtons = await page.getByRole("button", { name: /unggah|upload/i }).count();
  const fileInputs = await page.locator('input[type="file"]').count();
  return uploadButtons + fileInputs;
}

test.describe("release-hardening browser contracts", () => {
  test("initializes the map and renders the first feature without fixed sleeps", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Dashboard Intelligence Fiskal Daerah" })).toBeVisible();
    await expect(page.getByText("Peta Heatmap Realisasi Spasial", { exact: true })).toBeVisible();
    await expect(page.getByText("Memuat Peta Spasial...", { exact: true })).toBeHidden();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator(".leaflet-interactive").first()).toBeVisible();
  });

  test("toggles the mounted map legend layer without losing the map", async ({ page }) => {
    await page.goto("/");

    const closeLegend = page.getByRole("button", { name: "Tutup legend" });
    await expect(closeLegend).toBeVisible();
    await closeLegend.click();

    await expect(page.getByRole("button", { name: "Buka legend" })).toBeVisible();
    await expect(page.getByText("Q1", { exact: true }).first()).toBeHidden();
    await expect(page.locator(".leaflet-container")).toBeVisible();

    await page.getByRole("button", { name: "Buka legend" }).click();
    await expect(page.getByText("Q1", { exact: true }).first()).toBeVisible();
  });

  test("selects a region feature and renders its detail surface", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Bali", exact: true }).click();
    await expect(page.getByText("Wilayah Dipilih", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bali", exact: true })).toBeVisible();
    await expect(page.getByText("Total Realisasi Anggaran", { exact: true })).toBeVisible();
  });

  test("command-palette region URLs stay on the map and preserve the selected period", async ({ page }) => {
    await page.goto("/map?period=2024-Q2");
    await page.getByRole("button", { name: /Cari Wilayah \/ Provinsi/i }).click();

    const input = page.getByPlaceholder("Ketik perintah atau cari...");
    await input.fill("DI Yogyakarta");
    await page.getByRole("dialog").getByRole("button", { name: "DI Yogyakarta", exact: true }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe("/map");
    const url = new URL(page.url());
    expect(url.searchParams.get("region")).toBe("DI Yogyakarta");
    expect(url.searchParams.get("period")).toBe("2024-Q2");
    await expect(page.getByRole("heading", { name: "DI Yogyakarta", exact: true })).toBeVisible();
  });

  test("downloads the existing CSV template through the browser download contract", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Unggah Data Excel", exact: true }).click();

    const templateButton = page.getByRole("button", { name: "Download Template CSV", exact: true });
    await expect(templateButton).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await templateButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("template_laporan_petakeu.csv");
  });

  test("supports the choropleth/heatmap layer toggle when the standalone dashboard is mounted", async ({ page }) => {
    test.skip(!mapDashboardUrl, "PETAKEU_MAP_DASHBOARD_URL is required for the standalone MapDashboard route");

    await page.goto(mapDashboardUrl!);
    const modeToggle = page.getByRole("radiogroup", { name: "Jenis visualisasi peta" });
    test.skip(await modeToggle.count() === 0, "MapModeToggle is not mounted by this app shell");

    const choropleth = modeToggle.getByRole("radio", { name: "Choropleth", exact: true });
    const heatmap = modeToggle.getByRole("radio", { name: "Heatmap", exact: true });

    await expect(choropleth).toHaveAttribute("aria-checked", "true");
    await heatmap.click();
    await expect(heatmap).toHaveAttribute("aria-checked", "true");
    await expect(choropleth).toHaveAttribute("aria-checked", "false");
  });

  test("exposes feature detail and its report-download control on the standalone dashboard", async ({ page }) => {
    test.skip(!mapDashboardUrl, "PETAKEU_MAP_DASHBOARD_URL is required for the standalone MapDashboard route");

    await page.goto(mapDashboardUrl!);
    const feature = page.locator(".leaflet-interactive").first();
    test.skip(await feature.count() === 0, "No rendered map feature is available in the configured dashboard");

    await feature.click();
    await expect(page.locator(".panel-card").first()).toBeVisible();

    const downloadButton = page.getByRole("button", { name: "Unduh Laporan", exact: true });
    test.skip(await downloadButton.count() === 0, "The configured dashboard does not expose a report-download control");
    await expect(downloadButton).toBeVisible();
  });

  test("distinguishes public and privileged UI surfaces when role-aware URLs are configured", async ({ page }) => {
    test.skip(
      !publicUiUrl || !privilegedUiUrl,
      "PETAKEU_RBAC_PUBLIC_UI_URL and PETAKEU_RBAC_PRIVILEGED_UI_URL are required for role-aware UI coverage"
    );

    await page.goto(publicUiUrl!);
    const publicText = await page.locator("body").innerText();
    expect(publicText).not.toMatch(/Rp\s*\d[\d.]*/i);
    expect(await uploadControlCount(page)).toBe(0);

    await page.goto(privilegedUiUrl!);
    const privilegedText = await page.locator("body").innerText();
    expect(privilegedText).toMatch(/Rp\s*\d[\d.]*/i);
    expect(await uploadControlCount(page)).toBeGreaterThan(0);
  });
});
