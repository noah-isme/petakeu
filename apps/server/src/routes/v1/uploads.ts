import { Router } from "express";

import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { uploadController } from "../../controllers/upload-controller";
import { memoryUpload } from "../../middleware/upload";
import { assertFiscalPeriodUnlocked } from "../../services/approval-service";
import { asyncHandler } from "../../utils/async-handler";

/**
 * @swagger
 * /uploads:
 *   post:
 *     summary: Upload Excel file for processing
 *     description: Upload an Excel file (.xlsx) containing payment data. File is validated, hashed for deduplication, and queued for processing.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: "Excel file with columns: kode_daerah, nama_daerah, periode, nominal, sumber"
 *     responses:
 *       '202':
 *         description: Upload accepted for processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '409':
 *         description: Duplicate file (same SHA-256 hash)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Duplicate upload"
 *       '413':
 *         description: File too large (>10MB)
 *       '415':
 *         description: Unsupported media type (not .xlsx)
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 *
 *   get:
 *     summary: List upload history
 *     description: Retrieve paginated list of uploaded files with processing status
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: pageSize
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
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
 *                     $ref: '#/components/schemas/UploadRecord'
 *               meta:
 *                 $ref: '#/components/schemas/PaginatedResponse'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */

/**
 * @swagger
 * /uploads/{id}:
 *   get:
 *     summary: Get upload details
 *     description: Retrieve detailed information about a specific upload including validation errors
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload ID
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/UploadRecord'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */

export const uploadRouter = Router();

const canManageUploads = requireAnyRole("operator", "admin");

// Multipart clients may provide the period as a form field. The payment-level
// trigger in migration 006 remains the authoritative guard for files whose
// period is only known after parsing by the worker.
const rejectLockedUploadPeriod = asyncHandler(async (req, _res, next) => {
  const period = req.body?.period;
  if (typeof period === "string") {
    await assertFiscalPeriodUnlocked(period);
  }
  next();
});

uploadRouter.get("/", requireAuth, canManageUploads, uploadController.listUploads);
uploadRouter.get("/:id", requireAuth, canManageUploads, uploadController.getUpload);
uploadRouter.post(
  "/",
  requireAuth,
  canManageUploads,
  memoryUpload.single("file"),
  rejectLockedUploadPeriod,
  uploadController.handleUpload
);
