import { z } from "zod";

import type { ReportBranding } from "../types/report";

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
  period: z.string().regex(/^\d{4}-\d{2}$/),
  regionIds: z.array(z.string().min(1)).min(1),
  format: z.enum(["pdf", "excel"]),
  branding: reportBrandingSchema.optional(),
}).superRefine((request, context) => {
  if (request.branding && request.format !== "pdf") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branding"],
      message: "Branding is only supported for PDF reports",
    });
  }
});

export type ReportRequestInput = z.infer<typeof reportRequestSchema>;

export function parseReportBranding(value: unknown): ReportBranding | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const result = reportBrandingSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
