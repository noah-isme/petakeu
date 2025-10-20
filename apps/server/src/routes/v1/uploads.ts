import { Router } from "express";

import { uploadController } from "../../controllers/upload-controller";
import { memoryUpload } from "../../middleware/upload";

export const uploadRouter = Router();

uploadRouter.get("/", uploadController.listUploads);
uploadRouter.get("/:id", uploadController.getUpload);
uploadRouter.post("/", memoryUpload.single("file"), uploadController.handleUpload);
