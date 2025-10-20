import { Router } from "express";

import { uploadController } from "../../controllers/upload-controller";
import { memoryUpload } from "../../middleware/upload";

export const uploadRouter = Router();

uploadRouter.post("/", memoryUpload.single("file"), uploadController.handleUpload);
