import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from './client';

export async function getFromS3(key: string): Promise<{ buffer: Buffer; contentType: string | undefined }> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`S3 object not found: ${key}`);
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return {
    buffer: Buffer.concat(chunks),
    contentType: response.ContentType,
  };
}
