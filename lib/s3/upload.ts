import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from './client';
import { randomUUID } from 'crypto';

export interface UploadResult {
  url: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
}

export interface UploadToS3Options {
  /**
   * Explicit S3 key (without the bucket). When provided, this exact key is
   * used instead of the default `media/<uuid>.<ext>`. Used by zip uploads so
   * sibling assets share a common prefix and the html-embed url can resolve
   * relative refs (e.g. logos/x.png) via the path-based proxy.
   */
  key?: string;
}

export async function uploadToS3(
  file: Buffer,
  originalFilename: string,
  mimeType: string,
  options: UploadToS3Options = {}
): Promise<UploadResult> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  let key: string;
  let storedFilename: string;
  if (options.key) {
    key = options.key.replace(/^\/+/, '');
    // For multi-file uploads (zip), `storedFilename` doubles as the
    // proxy-relative path so callers can reconstruct sibling URLs.
    storedFilename = key.replace(/^media\//, '');
  } else {
    const extension = originalFilename.split('.').pop() || '';
    storedFilename = `${randomUUID()}.${extension}`;
    key = `media/${storedFilename}`;
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  const url = `/api/media/proxy/${key}`;

  return {
    url,
    storedFilename,
    mimeType,
    fileSize: file.length,
  };
}
