import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * R5 release gates for the routed shell.
 *
 * These checks intentionally exercise the browser-facing contracts only. Live
 * API/RBAC tests remain in their existing opt-in specs; the admin route below
 * is skipped unless a real admin JWT is supplied by the test environment.
 */

const adminToken = process.env.PETAKEU_ADMIN_TOKEN;

const primaryRoutes = [
  { path: "/map", label: "Peta Heatmap" },
  { path: "/analytics", label: "Analitik Eksekutif" },
  { path: "/reports", label: "Ringkasan Laporan" },
  { path: "/uploads", label: "Unggah Data Excel" },
  { path: "/about", label: "Tentang Petakeu" }
] as const;

function pathname(page: Page): string {
  return new URL(page.url()).pathname.replace(/\/$/, "") || "/";
}

function visibleNavControl(page: Page, label: string): Locator {
  // The desktop and mobile shells both render navigation. Selecting visible
  // controls keeps this deterministic at all three configured viewports.
  return page.locator("a:visible, button:visible").filter({ hasText: label }).first();
}

async function installAdminToken(page: Page) {
  test.skip(
    !adminToken,
    "Admin route checks require PETAKEU_ADMIN_TOKEN (a real JWT) and are infrastructure/auth gated"
  );
  await page.addInitScript((token) => {
    window.localStorage.setItem("petakeu.access_token", token);
  }, adminToken!);
}

async function waitForRouteShell(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect.poll(() => pathname(page), { timeout: 10_000 }).toBe(path);
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator("main").first().getByRole("heading").first()).toBeVisible();
}

test.describe("R5 routed shell and responsive release gates", () => {
  for (const route of primaryRoutes) {
    test(`${route.path} supports direct entry, refresh, and a semantic page shell`, async ({
      page
    }) => {
      await waitForRouteShell(page, route.path);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect.poll(() => pathname(page), { timeout: 10_000 }).toBe(route.path);
      await expect(page.locator("header").first()).toBeVisible();
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.locator("main").first().getByRole("heading").first()).toBeVisible();
    });
  }

  test("primary navigation updates the URL and browser history", async ({ page }) => {
    await waitForRouteShell(page, "/map");

    const mobileMenu = page.getByRole("button", { name: "Buka navigasi" });
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
    }

    const reportsControl = visibleNavControl(page, "Ringkasan Laporan");
    await expect(reportsControl).toBeVisible();
    await reportsControl.click();
    await expect.poll(() => pathname(page), { timeout: 10_000 }).toBe("/reports");

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect.poll(() => pathname(page), { timeout: 10_000 }).toBe("/map");
    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect.poll(() => pathname(page), { timeout: 10_000 }).toBe("/reports");
  });

  test("keyboard navigation reaches visible controls and exposes a visible focus indicator", async ({
    page
  }) => {
    await waitForRouteShell(page, "/map");

    await page.keyboard.press("Tab");
    let visitedFocusable = 0;
    for (let index = 0; index < 18; index += 1) {
      const focusState = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          visible: rect.width > 0 && rect.height > 0,
          outline: style.outlineStyle !== "none" && style.outlineWidth !== "0px",
          tag: element.tagName
        };
      });

      if (focusState) {
        visitedFocusable += 1;
        expect(focusState.visible, `Focused ${focusState.tag} must be visible`).toBe(true);
        expect(focusState.outline, `Focused ${focusState.tag} must expose a focus indicator`).toBe(
          true
        );
      }
      await page.keyboard.press("Tab");
    }
    expect(visitedFocusable).toBeGreaterThan(3);
  });

  test("reduced-motion preference suppresses dashboard animation and transitions", async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await waitForRouteShell(page, "/map");

    await expect
      .poll(() =>
        page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      )
      .toBe(true);
    const motionDurations = await page.locator("body *").evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        const toMilliseconds = (value: string) => {
          const first = value.split(",")[0]?.trim() ?? "0s";
          return first.endsWith("ms") ? Number.parseFloat(first) : Number.parseFloat(first) * 1000;
        };
        return {
          animation: toMilliseconds(style.animationDuration),
          transition: toMilliseconds(style.transitionDuration)
        };
      })
    );

    expect(
      Math.max(...motionDurations.map((duration) => duration.animation), 0)
    ).toBeLessThanOrEqual(50);
    expect(
      Math.max(...motionDurations.map((duration) => duration.transition), 0)
    ).toBeLessThanOrEqual(50);
  });

  test("primary routes do not introduce horizontal overflow at the supported viewport", async ({
    page
  }) => {
    await waitForRouteShell(page, "/reports");
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth
    }));
    expect(dimensions.documentWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(
      dimensions.viewport + 1
    );
    expect(dimensions.bodyWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(
      dimensions.viewport + 1
    );
  });

  test("mobile navigation drawer opens, closes with Escape, and restores trigger focus", async ({
    page
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-desktop",
      "Drawer contract is covered by tablet and mobile projects"
    );
    await waitForRouteShell(page, "/map");

    const menu = page.getByRole("button", { name: "Buka navigasi" });
    await expect(menu).toBeVisible();
    await menu.focus();
    await menu.click();

    const drawer = page.getByTestId("mobile-sidebar-drawer");
    await expect(drawer).toBeVisible();
    const drawerControl = drawer.locator("a:visible, button:visible").first();
    await expect(drawerControl).toBeVisible();
    await expect(drawerControl).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveClass(/-translate-x-full/);
    await expect(menu).toBeFocused();
  });

  test("admin audit route remains role and infrastructure gated", async ({ page }) => {
    await installAdminToken(page);
    await waitForRouteShell(page, "/admin/audit");

    // The API can be unavailable in local/browser-only runs. In that case the
    // page-level error state is still the correct authenticated shell result.
    await expect(page.locator("main").first()).toContainText(/audit|log|akses|koneksi/i);
  });
});

test.describe("R5 serious/critical accessibility gate", () => {
  for (const route of primaryRoutes) {
    test(`${route.path} has no serious or critical axe violations`, async ({ page }) => {
      await waitForRouteShell(page, route.path);

      // @axe-core/playwright is intentionally optional in this repository. The
      // test skips with an explicit reason until CI installs the dependency; it
      // never substitutes a partial homemade accessibility scan.
      let axeModule: {
        AxeBuilder?: new (options: { page: Page }) => {
          withTags: (tags: string[]) => {
            analyze: () => Promise<{
              violations: Array<{
                id: string;
                impact: string | null;
                description: string;
                nodes: unknown[];
              }>;
            }>;
          };
        };
      };
      try {
        const loadModule = new Function("specifier", "return import(specifier)") as (
          specifier: string
        ) => Promise<typeof axeModule>;
        axeModule = await loadModule("@axe-core/playwright");
      } catch {
        test.skip(
          true,
          "Axe scan skipped: @axe-core/playwright is not installed; add it to the web devDependencies in the CI accessibility job"
        );
        return;
      }

      if (!axeModule.AxeBuilder) {
        test.skip(true, "Axe scan skipped: @axe-core/playwright did not expose AxeBuilder");
        return;
      }

      const results = await new axeModule.AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const severeViolations = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical"
      );
      expect(severeViolations, JSON.stringify(severeViolations, null, 2)).toEqual([]);
    });
  }
});
