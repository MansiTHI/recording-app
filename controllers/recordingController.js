import fs from "fs";
import path from "path";
import multer from "multer";
import Appointment from "../models/appointmentModel.js";
import Recording from "../models/recordingModel.js";
import User from "../models/userModel.js";
import { sendRecordingNotification } from "../utils/emailService.js";
import { uploadBufferToS3 } from "../utils/s3Uploader.js";
import { generatePresignedUploadUrl } from "../utils/s3Service.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});


const storage = multer.memoryStorage();

// // setup multer (unchanged)
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         const uploadDir = "uploads/recordings";
//         if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
//         cb(null, uploadDir);
//     },
//     filename: function (req, file, cb) {
//         cb(null, `${Date.now()}-${file.originalname}`);
//     },
// });


export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});


// main controller
export const uploadRecording = async (req, res) => {
    try {

        if (!req.file) {
            return res.status(400).json({ success: false, message: "File required" });
        }

        const uploaded = await uploadToS3(req.file, req.userId);

        return res.status(200).json({
            success: true,
            message: "Recording uploaded successfully!",
            data: uploaded
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err.message });
    }
};



const getSignedFileUrl = async (key) => {
    console.log("Getting signed URL for key:", key);
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
    });

    return await getSignedUrl(s3, command, {
        expiresIn: 3600, // 1 hour
    });
};


/**
 * @desc Get all recordings for the authenticated user
 * @route GET /api/recordings
 * @access Private
 */
export const getAllRecordings = async (req, res) => {
    try {
        const userId = req.userId;
        const { analyzed, appointmentId, limit = 50, offset = 0 } = req.query;

        //Build query filter
        const filter = { userId };

        if (appointmentId) filter.appointmentId = appointmentId;

        if (typeof analyzed !== "undefined") {
            filter["analysis.status"] =
                analyzed === "true" ? "completed" : { $ne: "completed" };
        }

        //Query database
        const recordings = await Recording.find(filter)
            .sort({ createdAt: -1 })
            .skip(Number(offset))
            .limit(Number(limit));

        const formatted = await Promise.all(
            recordings.map(async (r) => {
                const signedUrl = r.audio?.fileName
                    ? await getSignedFileUrl(r.audio.fileName)
                    : null;
                console.log("signedUrl", signedUrl);
                return {
                    id: r._id,
                    appointmentId: r.appointmentId,
                    duration: r.audio?.duration
                        ? `${Math.floor(r.audio.duration / 60)
                            .toString()
                            .padStart(2, "0")}:${(r.audio.duration % 60)
                                .toString()
                                .padStart(2, "0")}`
                        : "00:00",
                    date: r.metadata?.recordedAt
                        ? new Date(r.metadata.recordedAt).toISOString().split("T")[0]
                        : new Date(r.createdAt).toISOString().split("T")[0],

                    analyzed: r.analysis?.status === "completed",
                    spinScore: r.analysis?.spin?.overall?.score || null,
                    sentiment: r.analysis?.sentiment?.overall || null,

                    // IMPORTANT CHANGE HERE
                    fileUrl: signedUrl,
                    transcriptionUrl: r.audio?.transcriptionUrl || null,
                };
            })
        );

        res.status(200).json({
            success: true,
            message: "All recordings retrieved successfully.",
            data: formatted,
        });
    } catch (error) {
        console.error("Get recordings error:", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// export const getAllRecordings = async (req, res) => {
//     try {
//         const userId = req.userId;
//         const { analyzed, appointmentId, limit = 50, offset = 0 } = req.query;

//         //Build query filter
//         const filter = { userId };

//         if (appointmentId) filter.appointmentId = appointmentId;

//         if (typeof analyzed !== "undefined") {
//             filter["analysis.status"] =
//                 analyzed === "true" ? "completed" : { $ne: "completed" };
//         }

//         //Query database
//         const recordings = await Recording.find(filter)
//             .sort({ createdAt: -1 })
//             .skip(Number(offset))
//             .limit(Number(limit));

//         //Format response
//         const formatted = recordings.map((r) => ({
//             id: r._id,
//             appointmentId: r.appointmentId,
//             duration: r.audio?.duration
//                 ? `${Math.floor(r.audio.duration / 60)
//                     .toString()
//                     .padStart(2, "0")}:${(r.audio.duration % 60)
//                         .toString()
//                         .padStart(2, "0")}`
//                 : "00:00",
//             date: r.metadata?.recordedAt
//                 ? new Date(r.metadata.recordedAt).toISOString().split("T")[0]
//                 : new Date(r.createdAt).toISOString().split("T")[0],
//             analyzed: r.analysis?.status === "completed",
//             spinScore: r.analysis?.spin?.overall?.score || null,
//             sentiment: r.analysis?.sentiment?.overall || null,
//             fileUrl: r.audio?.fileUrl || null,
//             transcriptionUrl: r.audio?.transcriptionUrl || null,
//         }));

//         res.status(200).json({
//             success: true,
//             message: "All recordings retrieved successfully.",
//             data: formatted,
//         });
//     } catch (error) {
//         console.error("Get recordings error:", error);
//         res.status(500).json({
//             success: false,
//             message: error.message,
//         });
//     }
// };

/**
 * @desc Get detailed analysis for a specific recording
 * @route GET /api/recordings/:id/analysis
 * @access Private
 */
export const getRecordingAnalysis = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        const recording = await Recording.findOne({ _id: id, userId });

        if (!recording) {
            return res.status(404).json({
                success: false,
                message: "Recording not found or you don't have access to it",
            });
        }

        if (recording.analysis?.status !== "completed") {
            return res.status(200).json({
                success: true,
                data: {
                    recordingId: recording._id,
                    analyzed: false,
                    status: recording.analysis?.status || "pending",
                    message: "Analysis is not yet completed",
                },
            });
        }

        const analysisData = {
            recordingId: recording._id,
            analyzed: true,
            spinScore: recording.analysis?.spin?.overall?.score || 0,
            sentiment: recording.analysis?.sentiment?.overall || "neutral",
            sentimentScore: recording.analysis?.sentiment?.score || 0,
            transcription: recording.analysis?.transcription || "",
            spinAnalysis: {
                situation: {
                    score: recording.analysis?.spin?.situation?.score || 0,
                    count: recording.analysis?.spin?.situation?.count || 0,
                    examples: recording.analysis?.spin?.situation?.examples || [],
                },
                problem: {
                    score: recording.analysis?.spin?.problem?.score || 0,
                    count: recording.analysis?.spin?.problem?.count || 0,
                    examples: recording.analysis?.spin?.problem?.examples || [],
                },
                implication: {
                    score: recording.analysis?.spin?.implication?.score || 0,
                    count: recording.analysis?.spin?.implication?.count || 0,
                    examples: recording.analysis?.spin?.implication?.examples || [],
                },
                needPayoff: {
                    score: recording.analysis?.spin?.needPayoff?.score || 0,
                    count: recording.analysis?.spin?.needPayoff?.count || 0,
                    examples: recording.analysis?.spin?.needPayoff?.examples || [],
                },
            },
            recommendations: recording.analysis?.spin?.overall?.recommendations || [],
            keyMoments: recording.analysis?.keyMoments || [],
        };

        res.status(200).json({
            success: true,
            data: analysisData,
        });
    } catch (error) {
        console.error("Get recording analysis error:", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const uploadRecordingToS3 = async (req, res) => {
    try {

        const userId = req.userId;
        const { appointmentId, metadata } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: "File is required" });
        }

        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(400).json({ success: false, message: "Invalid appointmentId" });
        }

        const parsedMetadata = metadata ? JSON.parse(metadata) : {};

        // ⬅️ FIX IS HERE (pass userId)
        const s3File = await uploadBufferToS3(req.file, userId);

        const recording = await Recording.create({
            userId,
            appointmentId,
            title: req.file.originalname,
            audio: {
                fileName: s3File.fileName,
                fileUrl: s3File.fileUrl,
                fileSize: s3File.fileSize,    // ⬅️ FIX HERE
                duration: parsedMetadata.duration || 0,
                format: req.file.mimetype.split("/")[1],
            },
            metadata: {
                recordedAt: parsedMetadata.recordedAt || new Date(),
                deviceType: parsedMetadata.deviceType || "unknown",
                platform: parsedMetadata.platform || "unknown",
            },
            analysis: { status: "pending" },
        });

        return res.status(201).json({
            success: true,
            message: "Uploaded to S3 successfully",
            data: recording,
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @desc Generate a presigned URL for direct client-to-S3 upload
 * @route POST /api/recordings/presigned-url
 * @access Private
 */
export const getPresignedUrl = async (req, res) => {
    try {
        const userId = req.userId;
        let { fileName, contentType, appointmentId, metadata } = req.body;

        if (!fileName || !contentType) {
            return res.status(400).json({ 
                success: false, 
                message: "fileName and contentType are required" 
            });
        }

        if (!appointmentId) {
            return res.status(400).json({ 
                success: false, 
                message: "appointmentId is required" 
            });
        }

        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(400).json({ success: false, message: "Invalid appointmentId" });
        }

        const { presignedUrl, fileUrl, key } = await generatePresignedUploadUrl(
            userId,
            fileName,
            contentType
        );

        // Parse metadata if it's a string (from form-data)
        let parsedMetadata = {};
        if (metadata) {
            if (typeof metadata === 'string') {
                try {
                    parsedMetadata = JSON.parse(metadata);
                } catch (e) {
                    parsedMetadata = {};
                }
            } else {
                parsedMetadata = metadata;
            }
        }

        const recording = await Recording.create({
            userId,
            appointmentId,
            title: fileName,
            audio: {
                fileName: key,
                fileUrl,
                fileSize: 0, // Will be updated after upload
                duration: parsedMetadata.duration || 0,
                format: contentType.split("/")[1] || "unknown",
            },
            metadata: {
                recordedAt: parsedMetadata.recordedAt || new Date(),
                deviceType: parsedMetadata.deviceType || "unknown",
                platform: parsedMetadata.platform || "unknown",
            },
            analysis: { status: "pending" },
        });

        return res.status(200).json({
            success: true,
            message: "Presigned URL generated successfully",
            data: {
                presignedUrl,
                fileUrl,
                recordingId: recording._id,
                key,
            },
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @desc Get a signed download URL for a recording
 * @route GET /api/recordings/:id/download
 * @access Private
 */
export const getDownloadUrl = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        // Verify recording exists and belongs to user
        const recording = await Recording.findOne({ _id: id, userId });
        if (!recording) {
            return res.status(404).json({
                success: false,
                message: "Recording not found or you don't have access to it",
            });
        }

        if (!recording.audio?.fileName) {
            return res.status(400).json({
                success: false,
                message: "Recording file not found",
            });
        }

        // Generate signed URL for download (valid for 1 hour)
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: recording.audio.fileName,
        });

        const downloadUrl = await getSignedUrl(s3, command, {
            expiresIn: 3600, // 1 hour
        });

        return res.status(200).json({
            success: true,
            message: "Download URL generated successfully",
            data: {
                downloadUrl,
                fileName: recording.title,
                fileSize: recording.audio.fileSize,
            },
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

