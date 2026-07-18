import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from './client';

export async function deleteFromS3(storedFilename: string): Promise<void> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  const key = `media/${storedFilename}`;

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
}
