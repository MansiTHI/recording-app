import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

export const uploadBufferToS3 = async (file) => {
    const fileName = `${Date.now()}-${file.originalname}`;
    const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
    };

    // const command = new PutObjectCommand({
    //     Bucket: process.env.AWS_S3_BUCKET,
    //     Key: key,
    //     Body: file.buffer,
    //     ContentType: file.mimetype, // REQUIRED for audio playback
    // });

    await s3.send(new PutObjectCommand(uploadParams));

    return {
        fileName,
        fileUrl: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`,
        fileSize: file.size,
    };
};
