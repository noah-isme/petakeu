import { PassThrough } from "stream";

import { describe, expect, it } from "vitest";

import { generatePdfStream } from "./report-worker";

const rows = [
  {
    region_name: "Kabupaten Badung",
    region_id: "region-1",
    amount: 1_000_000,
    cut_amount: 150_000,
    net_amount: 850_000
  }
];

const rankings = [
  {
    region_id: "region-1",
    region_name: "Kabupaten Badung",
    amount: 1_000_000,
    net_amount: 850_000,
    net_amount_prev: 800_000,
    yoy_pct: 6.25
  }
];

function renderPdf(branding?: Parameters<typeof generatePdfStream>[4]): Promise<Buffer> {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.once("finish", () => resolve(Buffer.concat(chunks)));
    void generatePdfStream("2026-08", rows, rankings, stream, branding).catch(reject);
  });
}

describe("branded PDF rendering", () => {
  it("keeps the default report renderable and adds branded output when configured", async () => {
    const defaultPdf = await renderPdf();
    const brandedPdf = await renderPdf({
      organizationName: "Badan Pendapatan Daerah",
      header: "Laporan Eksekutif",
      footer: "Dokumen resmi",
      signatureText: "Kepala Badan"
    });

    expect(defaultPdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(brandedPdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(brandedPdf.byteLength).toBeGreaterThan(defaultPdf.byteLength);
  });
});
