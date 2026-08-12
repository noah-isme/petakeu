import { describe, expect, it } from "vitest";

import { APP_ROUTES, canAccessRoute, getRouteByPath } from "../routes";

describe("application route registry", () => {
  it("exposes the stable page URLs", () => {
    expect(APP_ROUTES.map((route) => route.path)).toEqual([
      "/map",
      "/analytics",
      "/reports",
      "/uploads",
      "/about",
      "/admin/audit"
    ]);
  });

  it("enforces the role hierarchy for known identities", () => {
    const analytics = getRouteByPath("/analytics");
    const uploads = getRouteByPath("/uploads");
    const audit = getRouteByPath("/admin/audit");

    expect(analytics && canAccessRoute("public", analytics)).toBe(false);
    expect(analytics && canAccessRoute("viewer", analytics)).toBe(true);
    expect(uploads && canAccessRoute("viewer", uploads)).toBe(false);
    expect(uploads && canAccessRoute("operator", uploads)).toBe(true);
    expect(audit && canAccessRoute("operator", audit)).toBe(false);
    expect(audit && canAccessRoute("admin", audit)).toBe(true);
  });

  it("never treats an anonymous identity as an admin", () => {
    const audit = getRouteByPath("/admin/audit");
    expect(audit && canAccessRoute(null, audit)).toBe(false);
  });
});
