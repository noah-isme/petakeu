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
});
