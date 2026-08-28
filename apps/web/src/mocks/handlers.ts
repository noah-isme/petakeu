import { rest } from "msw";
import { addMonths, isAfter, isBefore } from "date-fns";

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

import type { RestRequest, ResponseResolver, RestContext } from "msw";
import type { RegionLevel } from "../types/region";

interface UploadErrorDetail {
  row: number;
  column: string;
  message: string;
}

interface UploadItem {
  id: string;
  filename: string;
  status: "queued" | "processing" | "parsing" | "awaiting_confirmation" | "parsed" | "persisted" | "cancelled" | "failed";
  errorCount: number;
  createdAt: string;
  objectUrl: string | null;
  shaKey: string;
  errors?: UploadErrorDetail[];
}

interface StagedMockRow {
  id: string;
  rowNumber: number;
  revision: number;
  regionCode: string;
  regionName: string;
  province: string;
  period: string;
  grossAmount: number;
  shareAmount: number;
  netAmount: number;
  targetAmount: number | null;
  source: string;
  findings: Array<{ id: string; severity: "error" | "warning"; message: string; column?: string }>;
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
const stagedRowsStore = new Map<string, StagedMockRow[]>();
const reportsStore: ReportJobItem[] = [];
const regionSummaryCache = new Map<string, { lastUpdated: string; reportUrl: string }>();

function nowIso() {
  return new Date().toISOString();
}

function getScenarioKey(req: RestRequest) {
  return req.url.searchParams.get("scenario") ?? req.headers.get("x-scenario") ?? "normal";
}

function isPublicRequest(req: RestRequest) {
  return req.url.searchParams.get("public") === "1" || req.url.searchParams.get("public") === "true";
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
    if (upload.status === "processing" && age > 3000) {
      upload.status = "parsing";
    }
    if (upload.status === "parsing" && age > 4500) {
      upload.status = "awaiting_confirmation";
      if (upload.status === "awaiting_confirmation" && !upload.objectUrl) {
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
    if (job.status === "queued" && age > 500) {
      job.status = "completed";
      job.downloadUrl = `https://storage.petakeu.local/reports/${job.id}.${job.type === "pdf" ? "pdf" : "xlsx"}`;
      job.updatedAt = nowIso();
      job.expiresAt = new Date(Date.now() + 3600_000).toISOString();
    }
    if (job.status === "processing" && age > 1000) {
      job.status = "completed";
      job.downloadUrl = `https://storage.petakeu.local/reports/${job.id}.${job.type === "pdf" ? "pdf" : "xlsx"}`;
      job.updatedAt = nowIso();
      job.expiresAt = new Date(Date.now() + 3600_000).toISOString();
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

// Handlers implementation
const handleGetRegions: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
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
};

const handleGetChoropleth: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
  const scenarioKey = getScenarioKey(req);
  const dataset = getScenarioDataset(scenarioKey);
  const period = req.url.searchParams.get("period") ?? dataset.defaultPeriod;
  const levelParam = req.url.searchParams.get("level");
  const parentParam = req.url.searchParams.get("parent");
  const isPublic = isPublicRequest(req);

  let records = getPaymentsByPeriod(dataset, period);
  if (parentParam) {
    const matchingRegionIds = new Set(
      allRegions
        .filter((r) => r.parentId === parentParam || r.id === parentParam || r.code === parentParam)
        .map((r) => r.id)
    );
    if (matchingRegionIds.size > 0) {
      records = records.filter((rec) => matchingRegionIds.has(rec.regionId));
    }
  }

  const warnings = [...(dataset.warnings ?? [])];
  const legendSource = records.map((item) => item.amount);
  const legendEdges = legendSource.length ? buildQuantileLegend(legendSource) : [];

  const features = records
    .map((record) => {
      const region = allRegions.find((item) => item.id === record.regionId);
      if (!region) {
        return null;
      }
      if (levelParam && region.level !== (levelParam === "1" ? "province" : "regency")) {
        // level filter
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
      const classIndex = classifyQuantile(record.amount, legendEdges);

      const baseProperties = {
        regionId: record.regionId,
        name: region.name,
        centroid,
        classIndex,
        classLabel: toClassLabel(classIndex)
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
          value: record.amount,
          cut15Amount: record.amount * 0.15,
          sparkline: sparkRecords.map((item) => item.amount)
        }
      };
    })
    .filter(Boolean);

  const legendResponse = isPublic ? ["Kelas 1", "Kelas 2", "Kelas 3", "Kelas 4", "Kelas 5"] : legendEdges;

  return res(
    ctx.status(200),
    ctx.set("X-Cache", "HIT"),
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
};

const handleGetRegionSummary: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
  const scenarioKey = getScenarioKey(req);
  const dataset = getScenarioDataset(scenarioKey);
  const { id } = req.params as { id: string };
  const from = req.url.searchParams.get("from");
  const to = req.url.searchParams.get("to");
  const isPublic = isPublicRequest(req);

  let region = allRegions.find((item) => item.id === id || item.code === id);
  if (!region && (id === "3301" || id === "3302")) {
    region = {
      id: id,
      code: id,
      name: id === "3301" ? "Cilacap" : "Banyumas",
      level: "regency",
      parentId: "prov-33"
    };
  }

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

  let regionPayments = getPaymentsByRegion(dataset, id);
  if (!regionPayments.length && (id === "3301" || id === "3302")) {
    // Generate simulated payments for test regions
    const periods = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06", "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08"];
    regionPayments = periods.map((p) => ({
      regionId: id,
      period: p,
      amount: 1500000000
    }));
  }

  if (!regionPayments.length) {
    return res(ctx.status(404), ctx.json({ error: "Data not found" }));
  }

  const summary = buildSummary(regionPayments, id, from, to);

  const cacheKey = `${scenarioKey}:${id}:${from ?? ""}:${to ?? ""}`;
  let cachedEntry = regionSummaryCache.get(cacheKey);
  if (!cachedEntry) {
    cachedEntry = {
      lastUpdated: nowIso(),
      reportUrl: `https://storage.petakeu.local/reports/${id}-${Date.now()}.pdf`
    };
    regionSummaryCache.set(cacheKey, cachedEntry);
  }

  return res(
    ctx.status(200),
    ctx.set("X-Cache", "HIT"),
    ctx.json({
      region,
      ...summary,
      lastUpdated: cachedEntry.lastUpdated,
      reportUrl: cachedEntry.reportUrl
    })
  );
};

const handlePostUploads: ResponseResolver<RestRequest, RestContext> = async (req, res, ctx) => {
  regionSummaryCache.clear();
  let file: File | null = null;
  try {
    const formData = (await req.body) as FormData;
    const f = formData?.get?.("file");
    if (f instanceof File) {
      file = f;
    }
  } catch {
    file = null;
  }

  if (!file) {
    return res(ctx.status(202), ctx.json({ uploadId: crypto.randomUUID(), upload_id: crypto.randomUUID() }));
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
  stagedRowsStore.set(uploadId, [
    {
      id: `${uploadId}-row-1`,
      rowNumber: 2,
      revision: 0,
      regionCode: "3301",
      regionName: "Cilacap",
      province: "Jawa Tengah",
      period: "2024-09",
      grossAmount: 1500000000,
      shareAmount: 225000000,
      netAmount: 1275000000,
      targetAmount: 1600000000,
      source: "PAD",
      findings: hasErrors ? [{ id: `${uploadId}-finding-1`, severity: "error", column: "setoran", message: "Nilai negatif tidak diperbolehkan" }] : []
    }
  ]);
  uploadHashes.set(shaKey, uploadId);

  return res(ctx.status(202), ctx.json({ uploadId, upload_id: uploadId }));
};

const handleGetUploads: ResponseResolver<RestRequest, RestContext> = (_req, res, ctx) => {
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
};

const handleGetUploadById: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
  updateUploadStatuses();
  const { id } = req.params as { id: string };
  if (id === "template") {
    return res(ctx.status(200), ctx.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), ctx.body("kode_bps,nama_wilayah,periode,nominal,sumber\n"));
  }
  const upload = uploadsStore.find((item) => item.id === id);
  if (!upload) return res(ctx.status(404), ctx.json({ error: "Upload not found" }));
  return res(ctx.status(200), ctx.json({ data: { uploadId: upload.id, filename: upload.filename, status: upload.status, createdAt: upload.createdAt, updatedAt: upload.createdAt, errorCount: upload.errorCount } }));
};

const handleGetUploadRows: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
  const { id } = req.params as { id: string };
  const rows = stagedRowsStore.get(id);
  if (!rows) return res(ctx.status(404), ctx.json({ error: "Upload rows not found" }));
  const page = Math.max(Number(req.url.searchParams.get("page") ?? "1"), 1);
  const pageSize = Math.max(Number(req.url.searchParams.get("pageSize") ?? "25"), 1);
  return res(ctx.status(200), ctx.json({ data: rows.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: rows.length, totalPages: Math.ceil(rows.length / pageSize) || 1 } }));
};

const handlePatchUploadRow: ResponseResolver<RestRequest, RestContext> = async (req, res, ctx) => {
  const { id, rowId } = req.params as { id: string; rowId: string };
  const row = stagedRowsStore.get(id)?.find((item) => item.id === rowId);
  if (!row) return res(ctx.status(404), ctx.json({ error: "Upload row not found" }));
  const patch = (await req.json()) as Partial<StagedMockRow>;
  Object.assign(row, patch, { revision: row.revision + 1, findings: [] });
  return res(ctx.status(200), ctx.json({ data: row }));
};

const handleConfirmUpload: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
  regionSummaryCache.clear();
  const { id } = req.params as { id: string };
  const upload = uploadsStore.find((item) => item.id === id);
  if (!upload) return res(ctx.status(404), ctx.json({ error: "Upload not found" }));
  upload.status = "persisted";
  return res(ctx.status(200), ctx.json({ data: { uploadId: id, status: "persisted", persistedRows: stagedRowsStore.get(id)?.length ?? 0 } }));
};

const handleCancelUpload: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
  const { id } = req.params as { id: string };
  const upload = uploadsStore.find((item) => item.id === id);
  if (!upload) return res(ctx.status(404), ctx.json({ error: "Upload not found" }));
  upload.status = "cancelled";
  return res(ctx.status(200), ctx.json({ data: { uploadId: id, status: "cancelled" } }));
};

const handleGetUploadTemplate: ResponseResolver<RestRequest, RestContext> = (_req, res, ctx) => {
  return res(
    ctx.status(200),
    ctx.set("Content-Type", "text/csv"),
    ctx.set("Content-Disposition", 'attachment; filename="template_laporan_petakeu.csv"'),
    ctx.body("kode_bps,nama_wilayah,periode,nominal,sumber\n3301,Cilacap,2024-09,1500000000,PAD\n")
  );
};

const handleGetRegionAliases: ResponseResolver<RestRequest, RestContext> = (_req, res, ctx) => res(ctx.status(200), ctx.json({ data: [] }));
const handlePostRegionAliases: ResponseResolver<RestRequest, RestContext> = async (req, res, ctx) => res(ctx.status(201), ctx.json({ data: { aliasId: crypto.randomUUID(), ...(await req.json()) } }));

const handleGetReportingMatrix: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
  const { regionId, period } = req.params as { regionId: string; period: string };
  return res(
    ctx.status(200),
    ctx.json({
      data: {
        regionId,
        period,
        grossAmount: 1500000000,
        shareAmount: 225000000,
        netAmount: 1275000000,
        targetAmount: 1600000000,
        importFilename: "laporan-demo.xlsx",
        importedBy: "Operator Demo",
        importedAt: nowIso(),
        validationFindings: []
      }
    })
  );
};

const handlePostReportExport: ResponseResolver<RestRequest, RestContext> = async (req, res, ctx) => {
  const body = (await req.json().catch(() => ({}))) as {
    period?: string;
    periodFrom?: string;
    periodTo?: string;
    regionIds?: string[];
    regionId?: string;
    format?: string;
    type?: string;
  };
  const format = (body.format ?? body.type ?? "").toLowerCase();
  const regionIds = body.regionIds ?? (body.regionId ? [body.regionId] : []);
  if (!regionIds.length || (format !== "pdf" && format !== "excel")) {
    return res(ctx.status(400), ctx.json({ error: "Invalid report request payload" }));
  }
  const jobId = crypto.randomUUID();
  const period = body.period ?? body.periodTo ?? body.periodFrom ?? "2025-08";
  const job: ReportJobItem = {
    id: jobId,
    regionId: regionIds[0] ?? "",
    periodFrom: body.periodFrom ?? period,
    periodTo: body.periodTo ?? period,
    type: format as "pdf" | "excel",
    status: "queued",
    downloadUrl: `https://storage.petakeu.local/reports/${jobId}.${format === "pdf" ? "pdf" : "xlsx"}`,
    requestedAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString()
  };
  reportsStore.unshift(job);
  return res(
    ctx.status(201),
    ctx.json({
      data: {
        jobId,
        id: jobId,
        period,
        regionIds,
        format,
        type: format,
        status: "queued",
        downloadUrl: null,
        requestedAt: job.requestedAt,
        updatedAt: job.updatedAt,
        summary: {
          totalRegions: regionIds.length,
          totalsByRegion: regionIds.map((rid) => ({
            regionId: rid,
            regionName: `Wilayah ${rid}`,
            totalGross: 1500000000,
            totalNet: 1275000000
          })),
          totalNeto: regionIds.length * 1275000000,
          changePercentage: 5.2,
          topGainers: [],
          topDecliners: [],
          lastTwelveMonths: []
        }
      }
    })
  );
};

const handlePostReports: ResponseResolver<RestRequest, RestContext> = async (req, res, ctx) => {
  const body = (await req.json().catch(() => ({}))) as {
    regionId?: string;
    regionIds?: string[];
    periodFrom?: string;
    periodTo?: string;
    period?: string;
    type?: string;
    format?: string;
  };
  const format = (body.format ?? body.type ?? "").toLowerCase();
  const regionId = body.regionId ?? body.regionIds?.[0];
  const periodFrom = body.periodFrom ?? body.period;
  const periodTo = body.periodTo ?? body.period;

  if (!regionId || !periodFrom || !periodTo || (format !== "pdf" && format !== "excel")) {
    return res(ctx.status(400), ctx.json({ error: "Invalid payload" }));
  }

  const jobId = crypto.randomUUID();
  const job: ReportJobItem = {
    id: jobId,
    regionId,
    periodFrom,
    periodTo,
    type: format as "pdf" | "excel",
    status: "queued",
    downloadUrl: `https://storage.petakeu.local/reports/${jobId}.${format === "pdf" ? "pdf" : "xlsx"}`,
    requestedAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString()
  };
  reportsStore.unshift(job);

  return res(ctx.status(202), ctx.json({ job_id: jobId, jobId, data: { jobId, status: "queued" } }));
};

const handleGetReports: ResponseResolver<RestRequest, RestContext> = (_req, res, ctx) => {
  updateReportStatuses();
  const data = reportsStore.map((job) => ({
    jobId: job.id,
    id: job.id,
    status: job.status,
    downloadUrl: job.downloadUrl,
    regionId: job.regionId,
    regionIds: [job.regionId],
    periodFrom: job.periodFrom,
    periodTo: job.periodTo,
    period: job.periodTo,
    type: job.type,
    format: job.type,
    requestedAt: job.requestedAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    expired: job.expired ?? false,
    summary: {
      totalRegions: 1,
      totalsByRegion: [{ regionId: job.regionId, regionName: `Wilayah ${job.regionId}`, totalGross: 1500000000, totalNet: 1275000000 }],
      totalNeto: 1275000000,
      changePercentage: 5.2,
      topGainers: [],
      topDecliners: [],
      lastTwelveMonths: []
    }
  }));
  return res(ctx.status(200), ctx.json({ data }));
};

const handleGetReportById: ResponseResolver<RestRequest, RestContext> = (req, res, ctx) => {
  updateReportStatuses();
  const { id } = req.params as { id: string };
  const job = reportsStore.find((item) => item.id === id);
  if (!job) return res(ctx.status(404), ctx.json({ error: "Report not found" }));
  return res(
    ctx.status(200),
    ctx.json({
      data: {
        jobId: job.id,
        id: job.id,
        status: job.status,
        format: job.type,
        type: job.type,
        period: job.periodTo,
        periodFrom: job.periodFrom,
        periodTo: job.periodTo,
        regionId: job.regionId,
        regionIds: [job.regionId],
        downloadUrl: job.downloadUrl,
        requestedAt: job.requestedAt,
        updatedAt: job.updatedAt,
        expiresAt: job.expiresAt,
        summary: {
          totalRegions: 2,
          totalsByRegion: [
            { regionId: "3301", regionName: "Cilacap", totalGross: 1500000000, totalNet: 1275000000 },
            { regionId: "3302", regionName: "Banyumas", totalGross: 1500000000, totalNet: 1275000000 }
          ],
          totalNeto: 2550000000,
          changePercentage: 5.2,
          topGainers: [],
          topDecliners: [],
          lastTwelveMonths: []
        }
      }
    })
  );
};

const handleGetHealthz: ResponseResolver<RestRequest, RestContext> = (_req, res, ctx) => {
  return res(
    ctx.status(200),
    ctx.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: 100,
      checks: {
        database: {
          status: "healthy",
          latencyMs: 4,
          details: {
            query: "SELECT 1 AS alive, PostGIS_Version() AS postgis_version",
            postgisVersion: "3.4.0"
          }
        },
        redis: {
          status: "healthy",
          latencyMs: 2,
          details: {
            command: "PING"
          }
        },
        storage: {
          status: "healthy",
          latencyMs: 3,
          details: {
            provider: "MinIO/S3",
            buckets: ["uploads", "reports"]
          }
        },
        queue: {
          status: "healthy",
          latencyMs: 3,
          details: {
            uploadQueue: { active: 0, waiting: 0, completed: 10, failed: 0 },
            reportQueue: { active: 0, waiting: 0, completed: 5, failed: 0 }
          }
        }
      }
    })
  );
};

export const handlers = [
  // Regions
  rest.get("/api/regions", handleGetRegions),
  rest.get("/api/v1/regions", handleGetRegions),

  // Choropleth
  rest.get("/api/geo/choropleth", handleGetChoropleth),
  rest.get("/api/v1/geo/choropleth", handleGetChoropleth),

  // Region Summary
  rest.get("/api/regions/:id/summary", handleGetRegionSummary),
  rest.get("/api/v1/regions/:id/summary", handleGetRegionSummary),

  // Uploads
  rest.post("/api/uploads", handlePostUploads),
  rest.post("/api/v1/uploads", handlePostUploads),
  rest.get("/api/uploads", handleGetUploads),
  rest.get("/api/v1/uploads", handleGetUploads),
  rest.get("/api/uploads/template", handleGetUploadTemplate),
  rest.get("/api/v1/uploads/template", handleGetUploadTemplate),
  rest.get("/api/uploads/:id", handleGetUploadById),
  rest.get("/api/v1/uploads/:id", handleGetUploadById),
  rest.get("/api/uploads/:id/rows", handleGetUploadRows),
  rest.get("/api/v1/uploads/:id/rows", handleGetUploadRows),
  rest.patch("/api/uploads/:id/rows/:rowId", handlePatchUploadRow),
  rest.patch("/api/v1/uploads/:id/rows/:rowId", handlePatchUploadRow),
  rest.post("/api/uploads/:id/confirm", handleConfirmUpload),
  rest.post("/api/v1/uploads/:id/confirm", handleConfirmUpload),
  rest.post("/api/uploads/:id/cancel", handleCancelUpload),
  rest.post("/api/v1/uploads/:id/cancel", handleCancelUpload),

  // Aliases & Reporting Matrix
  rest.get("/api/region-aliases", handleGetRegionAliases),
  rest.get("/api/v1/region-aliases", handleGetRegionAliases),
  rest.post("/api/region-aliases", handlePostRegionAliases),
  rest.post("/api/v1/region-aliases", handlePostRegionAliases),
  rest.get("/api/analytics/reporting-matrix/:regionId/:period", handleGetReportingMatrix),
  rest.get("/api/v1/analytics/reporting-matrix/:regionId/:period", handleGetReportingMatrix),

  // Reports
  rest.post("/api/reports/export", handlePostReportExport),
  rest.post("/api/v1/reports/export", handlePostReportExport),
  rest.post("/api/reports", handlePostReports),
  rest.post("/api/v1/reports", handlePostReports),
  rest.get("/api/reports", handleGetReports),
  rest.get("/api/v1/reports", handleGetReports),
  rest.get("/api/reports/:id", handleGetReportById),
  rest.get("/api/v1/reports/:id", handleGetReportById),

  // Health
  rest.get("/healthz", handleGetHealthz),
  rest.get("/api/healthz", handleGetHealthz),
  rest.get("/api/v1/healthz", handleGetHealthz),

  // Mock download assets for storage
  rest.get("https://storage.petakeu.local/reports/:filename", (req, res, ctx) => {
    const { filename } = req.params as { filename: string };
    if (filename.endsWith(".pdf")) {
      return res(ctx.status(200), ctx.set("Content-Type", "application/pdf"), ctx.body("%PDF-1.4 mock pdf content"));
    }
    return res(
      ctx.status(200),
      ctx.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      ctx.body("PK mock xlsx content")
    );
  }),
  rest.get("/api/reports/download/:filename", (req, res, ctx) => {
    const { filename } = req.params as { filename: string };
    if (filename.endsWith(".pdf")) {
      return res(ctx.status(200), ctx.set("Content-Type", "application/pdf"), ctx.body("%PDF-1.4 mock pdf content"));
    }
    return res(
      ctx.status(200),
      ctx.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      ctx.body("PK mock xlsx content")
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
  rest.get("/api/v1/rank", (req, res, ctx) => {
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
  rest.get("/api/v1/surplus-defisit", (req, res, ctx) => {
    const periode = req.url.searchParams.get("periode") || "2025-10";
    const data = getSurplusDeficit(periode);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/alert", (req, res, ctx) => {
    const level = req.url.searchParams.get("level");
    const data = getAlerts(level || undefined);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/v1/alert", (req, res, ctx) => {
    const level = req.url.searchParams.get("level");
    const data = getAlerts(level || undefined);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.post("/api/export", async (_req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ downloadUrl: "https://example.com/export.xlsx" }));
  }),
  rest.post("/api/v1/export", async (_req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ downloadUrl: "https://example.com/export.xlsx" }));
  }),

  // RankFin handlers
  rest.get("/api/rankfin/league", (req, res, ctx) => {
    const periode = req.url.searchParams.get("periode") || "2025-10";
    const data = getLeague(periode);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/v1/rankfin/league", (req, res, ctx) => {
    const periode = req.url.searchParams.get("periode") || "2025-10";
    const data = getLeague(periode);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/rankfin/badges/:regionId", (req, res, ctx) => {
    const { regionId } = req.params;
    const data = getBadges(regionId as string);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/v1/rankfin/badges/:regionId", (req, res, ctx) => {
    const { regionId } = req.params;
    const data = getBadges(regionId as string);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.post("/api/rankfin/challenge", async (_req, res, ctx) => {
    return res(ctx.status(201), ctx.json({ id: "challenge-1", status: "created" }));
  }),
  rest.post("/api/v1/rankfin/challenge", async (_req, res, ctx) => {
    return res(ctx.status(201), ctx.json({ id: "challenge-1", status: "created" }));
  }),

  // DefisitWatch handlers
  rest.get("/api/defisitwatch/watchlist", (req, res, ctx) => {
    const periode = req.url.searchParams.get("periode") || "2025-10";
    const data = getWatchlist(periode);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/v1/defisitwatch/watchlist", (req, res, ctx) => {
    const periode = req.url.searchParams.get("periode") || "2025-10";
    const data = getWatchlist(periode);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/defisitwatch/daerah/:regionId/penjelasan", (req, res, ctx) => {
    const { regionId } = req.params;
    const data = getRegionDetail(regionId as string);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.get("/api/v1/defisitwatch/daerah/:regionId/penjelasan", (req, res, ctx) => {
    const { regionId } = req.params;
    const data = getRegionDetail(regionId as string);
    return res(ctx.status(200), ctx.json({ data }));
  }),
  rest.post("/api/defisitwatch/alert/test", async (_req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ status: "sent" }));
  }),
  rest.post("/api/v1/defisitwatch/alert/test", async (_req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ status: "sent" }));
  })
];
