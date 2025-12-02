import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

export const uploadBufferToS3 = async (file, userId) => {
    const fileName = `recordings/${userId}/${Date.now()}-${file.originalname}`;

    const upload = new Upload({
        client: s3,
        params: {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            Body: file.buffer,
            ContentType: file.mimetype,
        },
        partSize: 10 * 1024 * 1024, // 10MB chunks
        leavePartsOnError: false,
    });

    await upload.done();

    return {
        success: true,
        fileName,
        fileUrl: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`,
        fileSize: file.size, // <-- fixed
    };
};
