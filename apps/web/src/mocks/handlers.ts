import { addMonths, isAfter, isBefore } from "date-fns";
import { rest, type RestRequest } from "msw";

import { getRegionGeometry } from "./data/regions";
import {
  allRegions,
  getScenarioDataset,
  getPaymentsByPeriod,
  getPaymentsByRegion,
  type PaymentRecord
} from "./data/scenarios";
import { buildQuantileLegend, classifyQuantile } from "./utils/math";
import {
  getRanking,
  getSurplusDeficit,
  getAlerts,
  getLeague,
  getBadges,
  getWatchlist,
  getRegionDetail
} from "./data/fiscal";

import type { RegionLevel } from "../types/region";

interface UploadErrorDetail {
  row: number;
  column: string;
  message: string;
}

interface UploadItem {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  status: "queued" | "processing" | "parsed" | "failed";
  errorCount: number;
  createdAt: string;
  updatedAt: string;
  objectUrl: string | null;
  shaKey: string;
  summary?: {
    totalRows: number;
    validRows: number;
    totalAmount: number;
    periodRange: { from?: string; to?: string };
  };
  errors?: UploadErrorDetail[];
  errorFileUrl?: string | null;
}

interface ReportSummaryRegionItem {
  regionId: string;
  regionName: string;
  total: number;
  changePercentage: number;
}

interface ReportTrendItem {
  regionId: string;
  regionName: string;
  changePercentage: number;
}

interface ReportMonthlySummaryItem {
  period: string;
  total: number;
}

interface ReportJobItem {
  id: string;
  period: string;
  regionIds: string[];
  format: "pdf" | "excel";
  status: "queued" | "processing" | "completed" | "failed";
  downloadUrl: string | null;
  requestedAt: string;
  updatedAt: string;
  expiresAt?: string;
  errorMessage?: string;
  summary: {
    totalsByRegion: ReportSummaryRegionItem[];
    topGainers: ReportTrendItem[];
    topDecliners: ReportTrendItem[];
    lastTwelveMonths: ReportMonthlySummaryItem[];
  };
}

const uploadsStore: UploadItem[] = [];
const uploadHashes = new Map<string, string>();
const reportsStore: ReportJobItem[] = [];

function nowIso() {
  return new Date().toISOString();
}

function getScenarioKey(req: RestRequest) {
  return req.url.searchParams.get("scenario") ?? req.headers.get("x-scenario") ?? "normal";
}

function isPublicRequest(req: RestRequest) {
  return req.url.searchParams.get("public") === "1";
}

function periodToDate(period: string) {
  if (!period) return null;
  const [year, month] = period.split("-");
  if (!year || !month) return null;
  return new Date(`${year}-${month}-01T00:00:00Z`);
}

function computeCentroid(coordinates: number[][][]) {
  const allPoints = coordinates[0];
  const total = allPoints.reduce(
    (acc, [lng, lat]) => {
      acc.lng += lng;
      acc.lat += lat;
      return acc;
    },
    { lat: 0, lng: 0 }
  );
  const count = allPoints.length || 1;
  return [total.lng / count, total.lat / count] as [number, number];
}

function buildUploadSummary(errorCount: number): UploadItem["summary"] {
  const totalRows = 120;
  const validRows = Math.max(totalRows - errorCount, totalRows - 2);
  const totalAmount = 45_000_000 + errorCount * -1_500_000 + Math.round((totalRows - errorCount) * 250_000);
  return {
    totalRows,
    validRows,
    totalAmount,
    periodRange: {
      from: "2025-01",
      to: "2025-08"
    }
  };
}

function pickRegionName(regionId: string, fallbackIndex: number): string {
  return allRegions.find((region) => region.id === regionId)?.name ?? `Wilayah ${fallbackIndex + 1}`;
}

function buildReportSummary(regionIds: string[], period: string): ReportJobItem["summary"] {
  const totalsByRegion = regionIds.map((regionId, index) => ({
    regionId,
    regionName: pickRegionName(regionId, index),
    total: 48_000_000 + index * 7_500_000,
    changePercentage: Number((Math.sin(index + 1) * 9).toFixed(2))
  }));

  const toTrendItems = (order: "asc" | "desc") =>
    [...totalsByRegion]
      .sort((a, b) => (order === "asc" ? a.changePercentage - b.changePercentage : b.changePercentage - a.changePercentage))
      .slice(0, Math.min(10, totalsByRegion.length))
      .map((item) => ({
        regionId: item.regionId,
        regionName: item.regionName,
        changePercentage: item.changePercentage
      }));

  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastTwelveMonths = Array.from({ length: 12 }, (_, index) => {
    const cursor = new Date(Date.UTC(year, month - 1));
    cursor.setUTCMonth(cursor.getUTCMonth() - (11 - index));
    const isoYear = cursor.getUTCFullYear();
    const isoMonth = `${cursor.getUTCMonth() + 1}`.padStart(2, "0");
    return {
      period: `${isoYear}-${isoMonth}`,
      total: 36_000_000 + index * 2_250_000
    };
  });

  return {
    totalsByRegion,
    topGainers: toTrendItems("desc"),
    topDecliners: toTrendItems("asc"),
    lastTwelveMonths
  };
}

function updateUploadStatuses() {
  const now = Date.now();
  uploadsStore.forEach((upload) => {
    const created = new Date(upload.createdAt).getTime();
    const age = now - created;
    if (upload.status === "queued" && age > 1500) {
      upload.status = "processing";
      upload.updatedAt = nowIso();
    }
    if (upload.status === "processing" && age > 3500) {
      upload.status = upload.errorCount > 0 ? "failed" : "parsed";
      upload.updatedAt = nowIso();
      if (!upload.objectUrl) {
        upload.objectUrl = `https://storage.petakeu.local/uploads/${upload.id}.xlsx`;
      }
      if (!upload.summary) {
        upload.summary = buildUploadSummary(upload.errorCount);
      }
      if (upload.errorCount > 0 && !upload.errorFileUrl) {
        upload.errorFileUrl = `https://storage.petakeu.local/uploads/${upload.id}-errors.csv`;
      }
    }
  });
}

function updateReportStatuses() {
  const now = Date.now();
  reportsStore.forEach((job) => {
    const requested = new Date(job.requestedAt).getTime();
    const age = now - requested;
    if (job.status === "queued" && age > 2000) {
      job.status = "processing";
      job.updatedAt = nowIso();
    }
    if (job.status === "processing" && age > 5000) {
      job.status = "completed";
      job.downloadUrl = `https://storage.petakeu.local/reports/${job.id}.${job.format === "pdf" ? "pdf" : "xlsx"}`;
      job.updatedAt = nowIso();
      job.expiresAt = new Date(Date.now() + 30_000).toISOString();
    }
    if (job.status === "completed" && job.expiresAt && new Date(job.expiresAt).getTime() < now) {
      job.downloadUrl = null;
    }
  });
}

function paginate<T>(items: T[], pageParam?: string | null, sizeParam?: string | null) {
  const page = Math.max(Number(pageParam ?? "1"), 1);
  const pageSize = Math.max(Number(sizeParam ?? "25"), 1);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    data: items.slice(start, end),
    meta: {
      page,
      pageSize,
      total: items.length,
      totalPages: Math.ceil(items.length / pageSize) || 1
    }
  };
}

async function computeFileHash(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function toClassLabel(quantileIndex: number) {
  return `Kelas ${quantileIndex + 1}`;
}

function buildSummary(records: PaymentRecord[], regionId: string, from?: string | null, to?: string | null) {
  const fromDate = from ? periodToDate(from) : null;
  const toDate = to ? periodToDate(to) : null;

  const filtered = records.filter((record) => {
    const recordDate = periodToDate(record.period);
    if (!recordDate) return false;
    if (fromDate && isBefore(recordDate, fromDate)) return false;
    if (toDate) {
      const endExclusive = addMonths(toDate, 1);
      if (!isBefore(recordDate, endExclusive)) {
        return false;
      }
    }
    return true;
  });

  const monthlyBreakdown = filtered
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((record) => {
      const cut = record.amount * 0.15;
      return {
        period: record.period,
        amount: record.amount,
        cut15Amount: cut,
        netAmount: record.amount - cut
      };
    });

  const trend = monthlyBreakdown.slice(-12).map((row) => ({ period: row.period, amount: row.amount }));
  const totalAmount = monthlyBreakdown.reduce((acc, row) => acc + row.amount, 0);
  const cut15Amount = totalAmount * 0.15;
  const netAmount = totalAmount - cut15Amount;

  return {
    totalAmount,
    cut15Amount,
    netAmount,
    trend,
    monthlyBreakdown
  };
}

export const handlers = [
  rest.get("/api/regions", (req, res, ctx) => {
    const level = req.url.searchParams.get("level") as RegionLevel | null;
    const parent = req.url.searchParams.get("parent");

    const filtered = allRegions.filter((region) => {
      if (level && region.level !== level) {
        return false;
      }
      if (parent && region.parentId !== parent) {
        return false;
      }
      return true;
    });

    const { data, meta } = paginate(filtered, req.url.searchParams.get("page"), req.url.searchParams.get("pageSize"));

    return res(
      ctx.status(200),
      ctx.json({
        data,
        meta
      })
    );
  }),
  rest.get("/api/geo/choropleth", (req, res, ctx) => {
    const scenarioKey = getScenarioKey(req);
    const dataset = getScenarioDataset(scenarioKey);
    const period = req.url.searchParams.get("period") ?? dataset.defaultPeriod;
    const isPublic = isPublicRequest(req);

    const records = getPaymentsByPeriod(dataset, period);
    const warnings = [...(dataset.warnings ?? [])];

    const legendSource = records.map((item) => item.amount);
    const legendEdges = legendSource.length ? buildQuantileLegend(legendSource) : [];
    const sortedLegendValues = [...legendSource].sort((a, b) => a - b);
    const minLegendValue = sortedLegendValues[0] ?? 0;
    const legendBins = legendEdges.length
      ? legendEdges.map((edge, index) => ({
          index,
          min: index === 0 ? minLegendValue : legendEdges[index - 1] ?? minLegendValue,
          max: edge,
          label: toClassLabel(index)
        }))
      : Array.from({ length: 5 }, (_value, index) => ({
          index,
          min: 0,
          max: 0,
          label: toClassLabel(index)
        }));

    const features = records
      .map((record) => {
        const region = allRegions.find((item) => item.id === record.regionId);
        if (!region) {
          return null;
        }
        const geometry = getRegionGeometry(record.regionId);
        if (!geometry) {
          const warningMessage = `${region.name} tidak memiliki boundary, data tidak tampil di peta.`;
          if (!warnings.includes(warningMessage)) {
            warnings.push(warningMessage);
          }
          return null;
        }
        const centroid = computeCentroid(geometry.geometry.coordinates as number[][][]);
        const quantileIndex = classifyQuantile(record.amount, legendEdges);

        const baseProperties = {
          regionId: record.regionId,
          name: region.name,
          centroid,
          classIndex: quantileIndex,
          classLabel: legendBins[quantileIndex]?.label ?? toClassLabel(quantileIndex)
        };

        if (isPublic) {
          return {
            type: "Feature" as const,
            id: record.regionId,
            geometry: geometry.geometry,
            properties: baseProperties
          };
        }

        const sparkRecords = getPaymentsByRegion(dataset, record.regionId)
          .sort((a, b) => a.period.localeCompare(b.period))
          .slice(-6);

        return {
          type: "Feature" as const,
          id: record.regionId,
          geometry: geometry.geometry,
          properties: {
            ...baseProperties,
            value: record.amount,
            normalizedValue: record.amount * 0.15,
            sparkline: sparkRecords.map((item) => item.amount)
          }
        };
      })
      .filter(Boolean);

    const legendResponse = {
      method: "quantile" as const,
      bins: legendEdges,
      labels: legendBins.map((bin) => bin.label),
      ranges: legendBins.map((bin) => ({
        label: bin.label,
        min: bin.min,
        max: bin.max
      }))
    };

    return res(
      ctx.status(200),
      ctx.json({
        type: "FeatureCollection",
        features,
        metadata: {
          period,
          legend: legendResponse,
          warnings,
          scenario: scenarioKey,
          public: isPublic
        }
      })
    );
  }),
  rest.get("/api/regions/:id/summary", (req, res, ctx) => {
    const scenarioKey = getScenarioKey(req);
    const dataset = getScenarioDataset(scenarioKey);
    const { id } = req.params as { id: string };
    const from = req.url.searchParams.get("from");
    const to = req.url.searchParams.get("to");
    const isPublic = isPublicRequest(req);

    const region = allRegions.find((item) => item.id === id);
    if (!region) {
      return res(ctx.status(404), ctx.json({ error: "Region not found" }));
    }

    if (isPublic) {
      return res(
        ctx.status(200),
        ctx.json({
          region,
          lastUpdated: nowIso(),
          public: true,
          message: "Data detail tidak tersedia untuk mode publik."
        })
      );
    }

    const fromDate = from ? periodToDate(from) : null;
    const toDate = to ? periodToDate(to) : null;
    if ((from && !fromDate) || (to && !toDate)) {
      return res(ctx.status(400), ctx.json({ error: "Invalid period format" }));
    }
    if (fromDate && toDate && isAfter(fromDate, toDate)) {
      return res(ctx.status(400), ctx.json({ error: "Invalid period range" }));
    }

    const regionPayments = getPaymentsByRegion(dataset, id);
    if (!regionPayments.length) {
      return res(ctx.status(404), ctx.json({ error: "Data not found" }));
    }

    const summary = buildSummary(regionPayments, id, from, to);

    return res(
      ctx.status(200),
      ctx.json({
        region,
        ...summary,
        lastUpdated: nowIso(),
        reportUrl: `https://storage.petakeu.local/reports/${id}-${Date.now()}.pdf`
      })
    );
  }),
    rest.post("/api/uploads", async (req, res, ctx) => {
      const requestWithFormData = req as typeof req & { formData?: () => Promise<FormData> };
      const formData = requestWithFormData.formData ? await requestWithFormData.formData() : undefined;
      const file = formData?.get("file");
      if (!(file instanceof File)) {
        return res(ctx.status(400), ctx.json({ error: "No file uploaded" }));
      }

    const shaKey = await computeFileHash(file);
    if (uploadHashes.has(shaKey)) {
      const existingId = uploadHashes.get(shaKey)!;
      const existingUpload = uploadsStore.find((item) => item.id === existingId);
      if (existingUpload) {
        return res(
          ctx.status(202),
          ctx.json({ uploadId: existingUpload.id, status: existingUpload.status, hash: existingUpload.shaKey })
        );
      }
    }

    const uploadId = crypto.randomUUID();
    const hasErrors = file.name.toLowerCase().includes("error");
    const errors: UploadErrorDetail[] | undefined = hasErrors
      ? [
          { row: 12, column: "nominal", message: "Nilai negatif tidak diperbolehkan" },
          { row: 25, column: "periode", message: "Format periode tidak valid" }
        ]
      : undefined;

    const createdAt = nowIso();
    uploadsStore.unshift({
      id: uploadId,
      filename: file.name,
      mimetype: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: file.size,
      status: "queued",
      errorCount: errors?.length ?? 0,
      createdAt,
      updatedAt: createdAt,
      objectUrl: null,
      shaKey,
      summary: undefined,
      errors,
      errorFileUrl: undefined
    });
    uploadHashes.set(shaKey, uploadId);

    return res(ctx.status(202), ctx.json({ uploadId, status: "queued", hash: shaKey }));
  }),
  rest.get("/api/uploads", (_req, res, ctx) => {
    updateUploadStatuses();
    const enriched = uploadsStore.map((upload) => ({
      uploadId: upload.id,
      filename: upload.filename,
      mimetype: upload.mimetype,
      size: upload.size,
      status: upload.status,
      errorCount: upload.errorCount,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
      fileUrl: upload.objectUrl,
      hash: upload.shaKey,
      summary: upload.summary,
      errors: upload.errors,
      errorFilePath: upload.errorFileUrl ?? undefined
    }));
    return res(ctx.status(200), ctx.json({ data: enriched }));
  }),
  rest.get("/api/uploads/:id", (req, res, ctx) => {
    updateUploadStatuses();
    const { id } = req.params as { id: string };
    const upload = uploadsStore.find((item) => item.id === id);
    if (!upload) {
      return res(ctx.status(404), ctx.json({ error: "Upload not found" }));
    }

    return res(
      ctx.status(200),
      ctx.json({
        data: {
          uploadId: upload.id,
          filename: upload.filename,
          mimetype: upload.mimetype,
          size: upload.size,
          status: upload.status,
          errorCount: upload.errorCount,
          createdAt: upload.createdAt,
          updatedAt: upload.updatedAt,
          fileUrl: upload.objectUrl,
          hash: upload.shaKey,
          summary: upload.summary,
          errors: upload.errors,
          errorFilePath: upload.errorFileUrl ?? undefined
        }
      })
    );
  }),
  rest.post("/api/reports/export", async (req, res, ctx) => {
    const body = await req.json();
    const { regionIds, period, format } = body as {
      regionIds?: string[];
      period?: string;
      format?: "pdf" | "excel";
    };

    if (!period || !regionIds?.length || !format) {
      return res(ctx.status(400), ctx.json({ error: "Invalid payload" }));
    }

    const jobId = crypto.randomUUID();
    const now = nowIso();
    const downloadUrl = `https://storage.petakeu.local/reports/${jobId}.${format === "excel" ? "xlsx" : "pdf"}`;
    const summary = buildReportSummary(regionIds, period);
    const job: ReportJobItem = {
      id: jobId,
      period,
      regionIds,
      format,
      status: "completed",
      downloadUrl,
      requestedAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      summary
    };
    reportsStore.unshift(job);

    return res(
      ctx.status(201),
      ctx.json({
        data: {
          jobId,
          period,
          regionIds,
          format,
          status: job.status,
          downloadUrl: job.downloadUrl,
          requestedAt: job.requestedAt,
          updatedAt: job.updatedAt,
          expiresAt: job.expiresAt,
          summary: job.summary
        }
      })
    );
  }),
  rest.get("/api/reports", (_req, res, ctx) => {
    updateReportStatuses();
    const data = reportsStore.map((job) => ({
      jobId: job.id,
      period: job.period,
      regionIds: job.regionIds,
      format: job.format,
      status: job.status,
      downloadUrl: job.downloadUrl,
      requestedAt: job.requestedAt,
      updatedAt: job.updatedAt,
      expiresAt: job.expiresAt,
      errorMessage: job.errorMessage,
      summary: job.summary
    }));
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/reports/:id", (req, res, ctx) => {
    updateReportStatuses();
    const { id } = req.params as { id: string };
    const job = reportsStore.find((item) => item.id === id);
    if (!job) {
      return res(ctx.status(404), ctx.json({ error: "Report job not found" }));
    }

    return res(
      ctx.status(200),
      ctx.json({
        data: {
          jobId: job.id,
          period: job.period,
          regionIds: job.regionIds,
          format: job.format,
          status: job.status,
          downloadUrl: job.downloadUrl,
          requestedAt: job.requestedAt,
          updatedAt: job.updatedAt,
          expiresAt: job.expiresAt,
          errorMessage: job.errorMessage,
          summary: job.summary
        }
      })
    );
  }),
  // FiscalView handlers
  rest.get("/api/rank", (req, res, ctx) => {
    const jenis = req.url.searchParams.get("jenis") || "pendapatan";
    const period = req.url.searchParams.get("period") || "2025-10";
    const top = parseInt(req.url.searchParams.get("top") || "20");
    const data = getRanking(jenis, period, top);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/surplus-defisit", (req, res, ctx) => {
    const periode = req.url.searchParams.get("periode") || "2025-10";
    const data = getSurplusDeficit(periode);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/alert", (req, res, ctx) => {
    const level = req.url.searchParams.get("level");
    const data = getAlerts(level || undefined);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.post("/api/export", async (req, res, ctx) => {
    // Mock export response
    return res(ctx.status(200), ctx.json({ downloadUrl: "https://example.com/export.xlsx" }));
  }),
  // RankFin handlers
  rest.get("/api/rankfin/league", (req, res, ctx) => {
    const periode = req.url.searchParams.get("periode") || "2025-10";
    const data = getLeague(periode);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/rankfin/badges/:regionId", (req, res, ctx) => {
    const { regionId } = req.params;
    const data = getBadges(regionId as string);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.post("/api/rankfin/challenge", async (req, res, ctx) => {
    // Mock challenge creation
    return res(ctx.status(201), ctx.json({ id: "challenge-1", status: "created" }));
  }),
  // DefisitWatch handlers
  rest.get("/api/defisitwatch/watchlist", (req, res, ctx) => {
    const periode = req.url.searchParams.get("periode") || "2025-10";
    const data = getWatchlist(periode);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/defisitwatch/daerah/:regionId/penjelasan", (req, res, ctx) => {
    const { regionId } = req.params;
    const data = getRegionDetail(regionId as string);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.post("/api/defisitwatch/alert/test", async (req, res, ctx) => {
    // Mock alert test
    return res(ctx.status(200), ctx.json({ status: "sent" }));
  })
];
