import { Router } from "express";
import { requireAuth } from "../../middleware/auth";

import { reportController } from "../../controllers/report-controller";

/**
 * @swagger
 * /reports:
 *   post:
 *     summary: Generate a new report
 *     description: Queue a report generation job for specified regions and period
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

reportRouter.post("/export", requireAuth, reportController.enqueueReport);
reportRouter.get("/", requireAuth, reportController.listReports);
reportRouter.get("/:id", requireAuth, reportController.getReportById);