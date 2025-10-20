import { rest } from "msw";
import type { RestRequest } from "msw";
import { addMonths, isAfter, isBefore } from "date-fns";

import { getRegionGeometry } from "./data/regions";
import {
  allRegions,
  getScenarioDataset,
  getPaymentsByPeriod,
  getPaymentsByRegion,
  getPeriods,
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
  status: "queued" | "processing" | "parsed" | "failed";
  errorCount: number;
  createdAt: string;
  objectUrl: string | null;
  shaKey: string;
  errors?: UploadErrorDetail[];
}

interface ReportJobItem {
  id: string;
  regionId: string;
  periodFrom: string;
  periodTo: string;
  type: "pdf" | "excel";
  status: "queued" | "processing" | "completed" | "failed";
  downloadUrl: string | null;
  requestedAt: string;
  updatedAt: string;
  expiresAt?: string;
  expired?: boolean;
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

function updateUploadStatuses() {
  const now = Date.now();
  uploadsStore.forEach((upload) => {
    const created = new Date(upload.createdAt).getTime();
    const age = now - created;
    if (upload.status === "queued" && age > 1500) {
      upload.status = "processing";
    }
    if (upload.status === "processing" && age > 3500) {
      upload.status = upload.errorCount > 0 ? "failed" : "parsed";
      if (upload.status === "parsed" && !upload.objectUrl) {
        upload.objectUrl = `https://storage.petakeu.local/uploads/${upload.id}.xlsx`;
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
      job.downloadUrl = `https://storage.petakeu.local/reports/${job.id}.${job.type === "pdf" ? "pdf" : "xlsx"}`;
      job.updatedAt = nowIso();
      job.expiresAt = new Date(Date.now() + 30_000).toISOString();
    }
    if (job.status === "completed" && job.expiresAt && new Date(job.expiresAt).getTime() < now) {
      job.downloadUrl = null;
      job.expired = true;
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
          quantileIndex,
          classLabel: toClassLabel(quantileIndex)
        };

        if (isPublic) {
          return {
            type: "Feature" as const,
            geometry: geometry.geometry,
            properties: baseProperties
          };
        }

        const sparkRecords = getPaymentsByRegion(dataset, record.regionId)
          .sort((a, b) => a.period.localeCompare(b.period))
          .slice(-6);

        return {
          type: "Feature" as const,
          geometry: geometry.geometry,
          properties: {
            ...baseProperties,
            totalAmount: record.amount,
            cut15Amount: record.amount * 0.15,
            trendSparkline: sparkRecords.map((item) => item.amount)
          }
        };
      })
      .filter(Boolean);

    const legendResponse = isPublic ? ["Kelas 1", "Kelas 2", "Kelas 3", "Kelas 4", "Kelas 5"] : legendEdges;

    return res(
      ctx.status(200),
      ctx.json({
        type: "FeatureCollection",
        features,
        metadata: {
          period,
          legend: legendResponse,
          classification: "quantile" as const,
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
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return res(ctx.status(400), ctx.json({ error: "No file uploaded" }));
    }

    const shaKey = await computeFileHash(file);
    if (uploadHashes.has(shaKey)) {
      return res(ctx.status(409), ctx.json({ error: "Duplicate upload" }));
    }

    const uploadId = crypto.randomUUID();
    const hasErrors = file.name.toLowerCase().includes("error");
    const errors: UploadErrorDetail[] | undefined = hasErrors
      ? [
          { row: 12, column: "setoran", message: "Nilai negatif tidak diperbolehkan" },
          { row: 25, column: "periode", message: "Format periode tidak valid" }
        ]
      : undefined;

    uploadsStore.unshift({
      id: uploadId,
      filename: file.name,
      status: "queued",
      errorCount: errors?.length ?? 0,
      createdAt: nowIso(),
      objectUrl: null,
      shaKey,
      errors
    });
    uploadHashes.set(shaKey, uploadId);

    return res(ctx.status(202), ctx.json({ upload_id: uploadId }));
  }),
  rest.get("/api/uploads", (_req, res, ctx) => {
    updateUploadStatuses();
    const enriched = uploadsStore.map((upload) => ({
      uploadId: upload.id,
      filename: upload.filename,
      status: upload.status,
      errorCount: upload.errorCount,
      createdAt: upload.createdAt,
      fileUrl: upload.objectUrl,
      errors: upload.errors
    }));
    return res(ctx.status(200), ctx.json({ data: enriched }));
  }),
  rest.post("/api/reports", async (req, res, ctx) => {
    const body = await req.json();
    const { regionId, periodFrom, periodTo, type } = body as {
      regionId?: string;
      periodFrom?: string;
      periodTo?: string;
      type?: "pdf" | "excel";
    };

    if (!regionId || !periodFrom || !periodTo || !type) {
      return res(ctx.status(400), ctx.json({ error: "Invalid payload" }));
    }

    const jobId = crypto.randomUUID();
    const job: ReportJobItem = {
      id: jobId,
      regionId,
      periodFrom,
      periodTo,
      type,
      status: "queued",
      downloadUrl: null,
      requestedAt: nowIso(),
      updatedAt: nowIso()
    };
    reportsStore.unshift(job);

    return res(ctx.status(202), ctx.json({ job_id: jobId }));
  }),
  rest.get("/api/reports", (_req, res, ctx) => {
    updateReportStatuses();
    const data = reportsStore.map((job) => ({
      jobId: job.id,
      status: job.status,
      downloadUrl: job.downloadUrl,
      regionId: job.regionId,
      periodFrom: job.periodFrom,
      periodTo: job.periodTo,
      type: job.type,
      requestedAt: job.requestedAt,
      updatedAt: job.updatedAt,
      expiresAt: job.expiresAt,
      expired: job.expired ?? false
    }));
    return res(ctx.status(200), ctx.json({ data }));
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
