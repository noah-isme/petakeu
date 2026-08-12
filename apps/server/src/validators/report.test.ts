import { describe, expect, it } from "vitest";

import { reportRequestSchema } from "./report";

const validPngDataUri = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]).toString("base64")}`;

describe("branded report validation", () => {
  it("accepts bounded PDF branding and normalizes the logo shape", () => {
    const result = reportRequestSchema.safeParse({
      period: "2026-08",
      regionIds: ["region-1"],
      format: "pdf",
      branding: {
        organizationName: "Badan Pendapatan Daerah",
        header: "Ringkasan eksekutif",
        footer: "Dokumen resmi",
        signatureText: "Kepala Badan",
        logo: validPngDataUri
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branding?.logo).toEqual({ dataUri: validPngDataUri });
    }
  });

  it("rejects branding on Excel reports and unsafe logo input", () => {
    const excelResult = reportRequestSchema.safeParse({
      period: "2026-08",
      regionIds: ["region-1"],
      format: "excel",
      branding: { organizationName: "Badan Pendapatan Daerah" }
    });
    const unsafeLogoResult = reportRequestSchema.safeParse({
      period: "2026-08",
      regionIds: ["region-1"],
      format: "pdf",
      branding: { logo: "https://example.com/logo.png" }
    });

    expect(excelResult.success).toBe(false);
    expect(unsafeLogoResult.success).toBe(false);
  });

  it("normalizes the range, province, ranking, and amount-basis report contract", () => {
    const result = reportRequestSchema.safeParse({
      periodFrom: "2026-01",
      periodTo: "2026-03",
      regionId: "region-1",
      provinceIds: ["11111111-1111-4111-8111-111111111111"],
      format: "excel",
      rankingCriterion: "surplus",
      amountBasis: "share",
      reportType: "full",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        period: "2026-03",
        periodFrom: "2026-01",
        periodTo: "2026-03",
        regionIds: ["region-1"],
        rankingCriterion: "surplus",
        amountBasis: "share",
      });
    }
  });

  it("accepts legacy frontend aliases for range, ranking, and report type", () => {
    const result = reportRequestSchema.safeParse({
      period: "2026-03",
      from: "2026-01",
      to: "2026-03",
      regionIds: ["region-1"],
      format: "pdf",
      ranking: "monthly_average",
      reportType: "executive_summary",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.periodFrom).toBe("2026-01");
      expect(result.data.periodTo).toBe("2026-03");
      expect(result.data.rankingCriterion).toBe("average_monthly");
      expect(result.data.reportType).toBe("executive-summary");
    }
  });
});
