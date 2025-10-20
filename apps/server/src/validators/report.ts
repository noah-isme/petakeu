import { z } from "zod";

export const reportRequestSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  regionIds: z.array(z.string().min(1)).min(1),
  format: z.enum(["pdf", "excel"]),
});

export type ReportRequestInput = z.infer<typeof reportRequestSchema>;
