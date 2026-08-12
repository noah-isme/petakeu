import { Router } from "express";

import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { reportController } from "../../controllers/report-controller";
import { assertFiscalPeriodUnlocked } from "../../services/approval-service";
import { asyncHandler } from "../../utils/async-handler";

/**
 * @swagger
 * /reports:
 *   post:
 *     summary: Generate a new report
 *     description: Queue a report generation job for specified regions and period. PDF requests may include bounded text branding and a PNG/JPEG data URI logo.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReportRequest'
 *     responses:
 *       '201':
 *         description: Report job created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/ReportJob'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 *
 *   get:
 *     summary: List report jobs
 *     description: Retrieve list of report generation jobs with status and download URLs
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ReportJob'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */

/**
 * @swagger
 * /reports/{id}:
 *   get:
 *     summary: Get report job details
 *     description: Retrieve detailed information about a specific report job
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Report job ID
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/ReportJob'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */

export const reportRouter = Router();

const canReadReports = requireAnyRole("viewer", "operator", "admin");

const rejectLockedReportPeriod = asyncHandler(async (req, _res, next) => {
  const period = req.body?.periodTo ?? req.body?.to ?? req.body?.period;
  if (typeof period === "string") {
    await assertFiscalPeriodUnlocked(period);
  }
  next();
});

reportRouter.post(
  "/export",
  requireAuth,
  canReadReports,
  rejectLockedReportPeriod,
  reportController.enqueueReport
);
reportRouter.get("/", requireAuth, canReadReports, reportController.listReports);
reportRouter.get("/:id", requireAuth, canReadReports, reportController.getReportById);
