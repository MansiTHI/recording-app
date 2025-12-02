import { Router } from "express";
import { uploadRecording, upload, getAllRecordings, getRecordingAnalysis, uploadRecordingToS3, getPresignedUrl } from "../controllers/recordingController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

// POST /api/recordings/upload
router.post("/upload", authMiddleware, upload.single("file"), uploadRecording);

// S3 upload
router.post("/upload-to-s3", authMiddleware, upload.single("file"), uploadRecordingToS3);

// Generate presigned URL for direct client-to-S3 upload (bypasses Vercel payload limit)
router.post("/presigned-url", authMiddleware, getPresignedUrl);

// get all recordings
router.get("/", authMiddleware, getAllRecordings);
// GET /api/recordings/:id/analysis
router.get("/:id/analysis", authMiddleware, getRecordingAnalysis);

export default router;
