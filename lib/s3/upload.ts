import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

/**
 * Mirrors the storedFilename + key layout used by uploadToS3 so that the
 * presigned-PUT path produces objects indistinguishable from server-side
 * uploads. Exported for callers that need to mint a key BEFORE they have
 * bytes in hand (e.g. presigning a client-driven upload).
 */
export function generateMediaKey(originalFilename: string): {
  storedFilename: string;
  key: string;
} {
  const extension = originalFilename.split('.').pop() || '';
  const storedFilename = extension
    ? `${randomUUID()}.${extension}`
    : randomUUID();
  return { storedFilename, key: `media/${storedFilename}` };
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
    const generated = generateMediaKey(originalFilename);
    storedFilename = generated.storedFilename;
    key = generated.key;
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

export interface PresignPutOptions {
  /** S3 key — full path under the bucket (e.g. `media/<uuid>.<ext>`). */
  key: string;
  /** Content-Type the client MUST send on PUT. Signed into the URL. */
  contentType: string;
  /**
   * Exact byte count the client MUST send. Signed (unhoistable) so the
   * client cannot upload a different size than what was declared at
   * presign-time. Acts as the content-length-range guard.
   */
  contentLength: number;
  /** TTL in seconds. Default 300 (5 minutes). */
  expiresInSeconds?: number;
}

export interface PresignPutResult {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

/**
 * Mint a presigned S3 PUT URL for a client-driven media upload.
 *
 * The Content-Type and Content-Length are pinned by signing them into the
 * request — the upstream PUT will be rejected by S3 if the client sends a
 * different content-type or byte count. This is how we enforce the 25 MB
 * cap and mimeType allow-list without having to stream the bytes through
 * our server.
 */
export async function presignPut(options: PresignPutOptions): Promise<PresignPutResult> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();
  const expiresIn = options.expiresInSeconds ?? 300;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: options.key,
    ContentType: options.contentType,
    ContentLength: options.contentLength,
  });

  // ContentLength is hoistable-by-default in the SDK, which would drop it
  // from the signature and let a misbehaving client send a different size.
  // Force it into the signed header set so S3 rejects size mismatches.
  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn,
    unhoistableHeaders: new Set(['content-length']),
  });

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return {
    uploadUrl,
    requiredHeaders: {
      'Content-Type': options.contentType,
      'Content-Length': String(options.contentLength),
    },
    expiresAt,
  };
}
