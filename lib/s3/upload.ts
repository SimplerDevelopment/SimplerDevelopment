import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from './client';
import { randomUUID } from 'crypto';

export interface UploadResult {
  url: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
}

export async function uploadToS3(
  file: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<UploadResult> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  const extension = originalFilename.split('.').pop() || '';
  const storedFilename = `${randomUUID()}.${extension}`;
  const key = `media/${storedFilename}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  // Use Next.js API proxy to avoid CORS issues
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const url = `${siteUrl}/api/media/proxy/${key}`;

  return {
    url,
    storedFilename,
    mimeType,
    fileSize: file.length,
  };
}
