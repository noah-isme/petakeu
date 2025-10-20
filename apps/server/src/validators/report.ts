import { z } from "zod";

export const reportRequestSchema = z.object({
  regionId: z.string().min(1),
  periodFrom: z.string().regex(/^\d{4}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}$/),
  type: z.enum(["pdf", "excel"])
});

export type ReportRequestInput = z.infer<typeof reportRequestSchema>;
