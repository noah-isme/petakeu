import { z } from "zod";

import type { ReportBranding, ReportRankingCriterion } from "../types/report";

export const MAX_REPORT_BRANDING_TEXT_LENGTH = 240;
export const MAX_REPORT_LOGO_BYTES = 128 * 1024;
export const MAX_REPORT_LOGO_DATA_URI_LENGTH = 180_000;

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 31) || code === 127;
  });
}

const boundedBrandingTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_REPORT_BRANDING_TEXT_LENGTH)
  .refine((value) => !containsControlCharacters(value), {
    message: "Branding text must not contain control characters",
  });

function isSafeLogoDataUri(value: string): boolean {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) {
    return false;
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_REPORT_LOGO_BYTES) {
    return false;
  }

  const isPng = match[1] === "image/png";
  const magic = isPng
    ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : Buffer.from([0xff, 0xd8, 0xff]);

  return bytes.subarray(0, magic.length).equals(magic);
}

const logoDataUriSchema = z
  .string()
  .max(MAX_REPORT_LOGO_DATA_URI_LENGTH)
  .refine(isSafeLogoDataUri, {
    message: "Logo must be a bounded PNG or JPEG base64 data URI",
  });

const reportLogoInputSchema = z.union([
  logoDataUriSchema,
  z.object({ dataUri: logoDataUriSchema }).strict(),
]);

const reportPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must use YYYY-MM format with a valid month");
const amountBasisSchema = z.enum(["gross", "share", "net"]);
const rankingCriterionSchema = z.enum([
  "total",
  "average_monthly",
  "monthly_average",
  "target_achievement",
  "growth",
  "surplus",
  "deficit",
]);
const reportTypeSchema = z.enum(["executive-summary", "full", "missing-data"]);
const reportTypeInputSchema = z.enum([
  "executive-summary",
  "executive_summary",
  "full",
  "missing-data",
  "missing_data_audit",
  "rankings",
  "monthly_breakdown",
  "target_achievement",
]);
const provinceIdsSchema = z.array(z.string().uuid()).max(100).optional();

function normalizeReportType(value: z.infer<typeof reportTypeInputSchema>): z.infer<typeof reportTypeSchema> {
  if (value === "executive_summary") return "executive-summary";
  if (value === "missing_data_audit") return "missing-data";
  // The full export already contains dedicated ranking, monthly, and target
  // sheets. Keep those UI aliases compatible while preserving one worker
  // contract for the generated artifact.
  if (value === "rankings" || value === "monthly_breakdown" || value === "target_achievement") return "full";
  return value;
}

function normalizeRankingCriterion(value: string): ReportRankingCriterion {
  return (value === "monthly_average" ? "average_monthly" : value) as ReportRankingCriterion;
}

/**
 * Branding is deliberately data-only. It never accepts a URL or filesystem
 * path, and the logo is checked for both a size limit and a supported image
 * signature before it reaches PDFKit.
 */
export const reportBrandingSchema = z
  .object({
    organizationName: boundedBrandingTextSchema.optional(),
    header: boundedBrandingTextSchema.optional(),
    footer: boundedBrandingTextSchema.optional(),
    signatureText: boundedBrandingTextSchema.optional(),
    // Accepting the string form keeps the request concise; both forms are
    // normalized to ReportLogo for the worker.
    logo: reportLogoInputSchema.optional(),
  })
  .strict()
  .transform((branding): ReportBranding => ({
    organizationName: branding.organizationName,
    header: branding.header,
    footer: branding.footer,
    signatureText: branding.signatureText,
    logo: branding.logo
      ? { dataUri: typeof branding.logo === "string" ? branding.logo : branding.logo.dataUri }
      : undefined,
  }));

export const reportRequestSchema = z.object({
  // `period` and `regionIds` are the original API contract. The range and
  // single-region aliases keep the PRD contract compatible with existing UI
  // clients and are normalized below.
  period: reportPeriodSchema.optional(),
  periodFrom: reportPeriodSchema.optional(),
  periodTo: reportPeriodSchema.optional(),
  // Frontend/reporting clients historically used `from` and `to`.
  from: reportPeriodSchema.optional(),
  to: reportPeriodSchema.optional(),
  regionIds: z.array(z.string().min(1)).min(1).optional(),
  regionId: z.string().min(1).optional(),
  provinceIds: provinceIdsSchema,
  format: z.enum(["pdf", "excel"]),
  branding: reportBrandingSchema.optional(),
  rankingCriterion: rankingCriterionSchema.optional(),
  ranking: rankingCriterionSchema.optional(),
  criterion: rankingCriterionSchema.optional(),
  // `metric` is accepted as a wire alias for amountBasis.
  amountBasis: amountBasisSchema.optional(),
  metric: amountBasisSchema.optional(),
  reportType: reportTypeInputSchema.optional(),
}).superRefine((request, context) => {
  const periodFrom = request.periodFrom ?? request.from;
  const periodTo = request.periodTo ?? request.to;
  if (request.branding && request.format !== "pdf") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branding"],
      message: "Branding is only supported for PDF reports",
    });
  }
  if (!request.period && !periodFrom && !periodTo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["period"],
      message: "A period or periodFrom/periodTo range is required",
    });
  }
  if (periodFrom && periodTo && periodFrom > periodTo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["periodFrom"],
      message: "periodFrom must be less than or equal to periodTo",
    });
  }
  if (periodFrom && periodTo) {
    const [fromYear, fromMonth] = periodFrom.split('-').map(Number);
    const [toYear, toMonth] = periodTo.split('-').map(Number);
    const monthCount = (toYear - fromYear) * 12 + toMonth - fromMonth + 1;
    if (monthCount > 24) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodTo"],
        message: "Report range cannot exceed 24 months",
      });
    }
  }
  if (!request.regionIds?.length && !request.regionId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["regionIds"],
      message: "At least one regionId is required",
    });
  }
}).transform((request) => {
  const period = request.period ?? request.periodTo ?? request.to ?? request.periodFrom ?? request.from!;
  const periodFrom = request.periodFrom ?? request.from ?? period;
  const periodTo = request.periodTo ?? request.to ?? period;
  const regionIds = request.regionIds?.length ? request.regionIds : [request.regionId!];
  return {
    ...request,
    period,
    periodFrom,
    periodTo,
    regionIds,
    provinceIds: request.provinceIds ?? [],
    rankingCriterion: normalizeRankingCriterion(request.rankingCriterion ?? request.ranking ?? request.criterion ?? "total"),
    amountBasis: request.amountBasis ?? request.metric ?? "gross" as const,
    reportType: request.reportType ? normalizeReportType(request.reportType) : "full" as const,
  };
});

export type ReportRequestInput = z.infer<typeof reportRequestSchema>;

export function parseReportBranding(value: unknown): ReportBranding | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const result = reportBrandingSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
