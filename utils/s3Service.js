import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";

const s3Client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

export const uploadToS3 = async (file, userId) => {
    const fileName = `recordings/${userId}/${Date.now()}-${file.originalname}`;

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        ContentType: file.mimetype,
    });

    const uploadURL = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    return {
        fileName: file.originalname,
        fileUrl,
        uploadURL,
        key: fileName,
    };
};

/**
 * Generate a presigned URL for direct client-to-S3 upload
 * This bypasses the backend payload limit on Vercel
 */
export const generatePresignedUploadUrl = async (userId, fileName, contentType) => {
    const key = `recordings/${userId}/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

    const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return {
        presignedUrl,
        fileUrl,
        key,
    };
};

export default s3Client;
