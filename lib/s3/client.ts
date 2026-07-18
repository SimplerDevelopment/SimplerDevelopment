import { S3Client } from '@aws-sdk/client-s3';

let s3ClientInstance: S3Client | null = null;
let publicS3ClientInstance: S3Client | null = null;

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

/**
 * Public-facing S3 client for presigned/browser-facing URLs.
 *
 * SigV4 signs the request host, so a URL signed for the in-container
 * endpoint (e.g. http://minio:9000) fails when a browser hits it from
 * http://localhost:9000 — the host in the signature won't match. Dockerized
 * MinIO (app talks to `minio:9000` over the compose network, browser talks
 * to `localhost:9000`) needs two endpoints: one for server-side operations,
 * one for anything the browser will fetch.
 *
 * Set S3_PUBLIC_ENDPOINT to the browser-reachable endpoint when it differs
 * from S3_ENDPOINT. When unset, this falls back to S3_ENDPOINT — zero
 * behavior change for existing single-endpoint deployments.
 */
export function getPublicS3Client(): S3Client {
  if (!publicS3ClientInstance) {
    if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 configuration is incomplete. Please set S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY in your environment variables.');
    }
    const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT;
    if (!publicEndpoint) {
      throw new Error('S3 configuration is incomplete. Please set S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY in your environment variables.');
    }

    publicS3ClientInstance = new S3Client({
      endpoint: publicEndpoint,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true, // Required for Railway S3 and other S3-compatible services
    });
  }

  return publicS3ClientInstance;
}

export function getBucketName(): string {
  const bucketName = process.env.S3_BUCKET_NAME || '';
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME is not set in environment variables.');
  }
  return bucketName;
}

export const BUCKET_NAME = getBucketName;
