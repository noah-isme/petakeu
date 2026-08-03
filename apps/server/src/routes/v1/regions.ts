import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { regionController } from "../../controllers/region-controller";

/**
 * @swagger
 * /regions:
 *   get:
 *     summary: List administrative regions
 *     description: Retrieve a list of regions with optional filtering by level and parent
 *     tags: [Regions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: level
 *         in: query
 *         schema:
 *           type: string
 *           enum: [province, regency, district, village]
 *         description: Filter by administrative level
 *       - name: parent
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by parent region ID
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - name: pageSize
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
 *         description: Number of items per page
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
 *                     $ref: '#/components/schemas/Region'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginatedResponse'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */

/**
 * @swagger
 * /regions/{id}/summary:
 *   get:
 *     summary: Get region summary
 *     description: Retrieve detailed summary for a specific region including totals, trends, and monthly breakdown
 *     tags: [Regions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Region ID
 *       - name: from
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *         description: Start period (YYYY-MM)
 *       - name: to
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *         description: End period (YYYY-MM)
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegionSummary'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */

export const regionRouter = Router();

regionRouter.get("/", requireAuth, regionController.listRegions);
regionRouter.get("/:id/summary", requireAuth, regionController.getRegionSummary);