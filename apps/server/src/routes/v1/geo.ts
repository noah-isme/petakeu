import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { geoController } from "../../controllers/geo-controller";

/**
 * @swagger
 * /geo/choropleth:
 *   get:
 *     summary: Get choropleth map data
 *     description: Retrieve GeoJSON FeatureCollection with quantile-classified values for map visualization
 *     tags: [Geography]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: period
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *           default: "2025-08"
 *         description: Period for data aggregation (YYYY-MM)
 *       - name: public
 *         in: query
 *         schema:
 *           type: string
 *           enum: ["1", "true"]
 *         description: Enable public mode (hides detailed values, shows only class labels)
 *       - name: scenario
 *         in: query
 *         schema:
 *           type: string
 *           enum: [normal, spike, missing-geometry]
 *           default: "normal"
 *         description: Mock data scenario (development only)
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChoroplethResponse'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */

export const geoRouter = Router();

geoRouter.get("/choropleth", requireAuth, geoController.getChoropleth);