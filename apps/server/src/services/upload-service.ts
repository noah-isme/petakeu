import { randomUUID, createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { utils, read } from "xlsx";

import { AppError } from "../utils/app-error";
import {
  UploadErrorDetail,
  UploadRecord,
  UploadRequest,
  UploadResult,
  UploadSummary
} from "../types/upload";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const ERROR_DIR = path.resolve(UPLOADS_DIR, "errors");

const ACCEPTED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
]);
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

const uploadsStore = new Map<string, UploadRecord>();
const uploadsByHash = new Map<string, string>();

async function ensureDir(dir: string) {
  try {
    await stat(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

function validateUpload(request: UploadRequest) {
  if (!ACCEPTED_MIME_TYPES.has(request.mimetype)) {
    throw new AppError("Format file tidak didukung. Gunakan file Excel (.xlsx)", 400);
  }

  if (request.size > MAX_UPLOAD_SIZE) {
    throw new AppError("Ukuran file melebihi 10 MB", 400);
  }
}

function parseRows(buffer: Buffer) {
  const workbook = read(buffer, { type: "buffer" });
  const [firstSheetName] = workbook.SheetNames;
  if (!firstSheetName) {
    throw new AppError("File tidak memiliki sheet", 400);
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  return rows as string[][];
}

const EXPECTED_HEADERS = ["kode_bps", "nama_wilayah", "periode", "nominal", "sumber"];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function buildError(row: number, column: string, message: string): UploadErrorDetail {
  return { row, column, message };
}

function parseSummary(rows: string[][]): {
  summary: UploadSummary;
  errors: UploadErrorDetail[];
} {
  if (rows.length <= 1) {
    return {
      summary: {
        totalRows: 0,
        validRows: 0,
        totalAmount: 0,
        periodRange: {}
      },
      errors: []
    };
  }

  const [rawHeaders, ...dataRows] = rows;
  const headers = rawHeaders.map(normalizeHeader);
  const missingHeaders = EXPECTED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new AppError(`Header tidak valid. Kolom wajib: ${missingHeaders.join(", ")}`, 400);
  }

  const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  const summary: UploadSummary = {
    totalRows: dataRows.length,
    validRows: 0,
    totalAmount: 0,
    periodRange: {}
  };
  const errors: UploadErrorDetail[] = [];
  let minPeriod: string | undefined;
  let maxPeriod: string | undefined;

  dataRows.forEach((row, index) => {
    const [kodeBps, namaWilayah, periodeRaw, nominalRaw, sumber] = row;
    const rowNumber = index + 2; // account for header row
    let rowHasError = false;

    const code = kodeBps?.trim();
    if (!code) {
      errors.push(buildError(rowNumber, "kode_bps", "Kode BPS wajib diisi"));
      rowHasError = true;
    }

    const name = namaWilayah?.trim();
    if (!name) {
      errors.push(buildError(rowNumber, "nama_wilayah", "Nama wilayah wajib diisi"));
      rowHasError = true;
    }

    const period = periodeRaw?.trim();
    if (!period || !periodRegex.test(period)) {
      errors.push(buildError(rowNumber, "periode", "Format periode harus YYYY-MM"));
      rowHasError = true;
    }

    const nominal = Number(nominalRaw);
    if (!Number.isFinite(nominal) || nominal < 0) {
      errors.push(buildError(rowNumber, "nominal", "Nominal harus berupa angka positif"));
      rowHasError = true;
    }

    const source = sumber?.trim();
    if (!source) {
      errors.push(buildError(rowNumber, "sumber", "Sumber wajib diisi"));
      rowHasError = true;
    }

    if (rowHasError) {
      return;
    }

    if (periodRegex.test(period)) {
      if (!minPeriod || period < minPeriod) {
        minPeriod = period;
      }
      if (!maxPeriod || period > maxPeriod) {
        maxPeriod = period;
      }
    }

    if (Number.isFinite(nominal) && nominal >= 0) {
      summary.totalAmount += nominal;
    }

    summary.validRows += 1;
  });

  summary.periodRange = {
    from: minPeriod,
    to: maxPeriod
  };

  return { summary, errors };
}

async function persistErrorCsv(record: UploadRecord) {
  if (!record.errors?.length) {
    return;
  }
  await ensureDir(ERROR_DIR);
  const header = "row,column,message";
  const body = record.errors
    .map((error) => `${error.row},${error.column},"${error.message.replace(/"/g, '""')}"`)
    .join("\n");
  const csv = `${header}\n${body}`;
  const filePath = path.join(ERROR_DIR, `${record.uploadId}-errors.csv`);
  await writeFile(filePath, csv, "utf8");
  record.errorFilePath = filePath;
}

function scheduleProcessing(record: UploadRecord, buffer: Buffer) {
  setTimeout(async () => {
    record.status = "processing";
    record.updatedAt = new Date().toISOString();
    try {
      const rows = parseRows(buffer);
      const { summary, errors } = parseSummary(rows);
      record.summary = summary;
      record.errors = errors;
      record.errorCount = errors.length;
      await persistErrorCsv(record);
      record.status = errors.length ? "failed" : "parsed";
    } catch (error) {
      record.status = "failed";
      record.errors = [
        {
          row: 0,
          column: "file",
          message: error instanceof Error ? error.message : "Gagal memproses file"
        }
      ];
      record.errorCount = 1;
      await persistErrorCsv(record);
    } finally {
      record.updatedAt = new Date().toISOString();
    }
  }, 250);
}

export async function enqueueUpload(request: UploadRequest): Promise<UploadResult> {
  validateUpload(request);
  await ensureDir(UPLOADS_DIR);

  const hash = createHash("sha256").update(request.buffer).digest("hex");
  const existingId = uploadsByHash.get(hash);
  if (existingId) {
    const existingRecord = uploadsStore.get(existingId);
    if (existingRecord) {
      return {
        uploadId: existingRecord.uploadId,
        status: existingRecord.status,
        hash: existingRecord.hash
      };
    }
  }

  const uploadId = randomUUID();
  const storageFilename = `${uploadId}-${request.filename}`;
  const storagePath = path.join(UPLOADS_DIR, storageFilename);

  await writeFile(storagePath, request.buffer);

  const now = new Date().toISOString();
  const record: UploadRecord = {
    uploadId,
    filename: request.filename,
    mimetype: request.mimetype,
    size: request.size,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    hash,
    storagePath,
    errorCount: 0,
    fileUrl: `https://storage.petakeu.local/uploads/${storageFilename}`
  };

  uploadsStore.set(uploadId, record);
  uploadsByHash.set(hash, uploadId);

  scheduleProcessing(record, request.buffer);

  return {
    uploadId,
    status: record.status,
    hash
  };
}

export function listUploads(): UploadRecord[] {
  return Array.from(uploadsStore.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getUpload(uploadId: string): UploadRecord | undefined {
  return uploadsStore.get(uploadId);
}

export const uploadService = {
  enqueueUpload,
  listUploads,
  getUpload
};
