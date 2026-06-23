import { S3Client } from '@aws-sdk/client-s3';

let s3ClientInstance: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 configuration is incomplete. Please set S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY in your environment variables.');
    }

    s3ClientInstance = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true, // Required for Railway S3 and other S3-compatible services
    });
  }

  return s3ClientInstance;
}

export const s3Client = getS3Client;

export function getBucketName(): string {
  const bucketName = process.env.S3_BUCKET_NAME || '';
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME is not set in environment variables.');
  }
  return bucketName;
}

export const BUCKET_NAME = getBucketName;
