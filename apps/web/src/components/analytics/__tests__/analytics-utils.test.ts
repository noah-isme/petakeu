import { describe, expect, it } from "vitest";

import { formatPercent, formatPeriod, normalizeAnalyticsPeriod, percentWidth } from "../analytics-utils";

describe("analytics formatting", () => {
  it("formats signed growth and valid periods", () => {
    expect(formatPercent(12.5, true)).toContain("+12,5%");
    expect(formatPeriod("2025-08")).toMatch(/Agu|Agustus/i);
  });

  it("clamps progress bars and keeps missing data explicit", () => {
    expect(percentWidth(140)).toBe("100%");
    expect(percentWidth(-10)).toBe("0%");
    expect(formatPercent(null)).toBe("—");
  });

  it("maps the app quarter selector to an analytics month", () => {
    expect(normalizeAnalyticsPeriod("2024-Q3")).toBe("2024-09");
    expect(normalizeAnalyticsPeriod("2024-09")).toBe("2024-09");
  });
});
