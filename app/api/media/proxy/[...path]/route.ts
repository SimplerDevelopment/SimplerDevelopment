import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { unstable_cache } from 'next/cache';
import { getS3Client, getBucketName } from '@/lib/s3/client';

// Cache the S3 round-trip in Next's data cache so the second hit on a hot
// asset (and every subsequent hit until revalidation) skips the network.
// Stored as base64 so unstable_cache's serializer can round-trip it.
const fetchProxyAsset = unstable_cache(
  async (key: string): Promise<{ body: string; contentType: string; contentLength: number } | null> => {
    const s3Client = getS3Client();
    const bucketName = getBucketName();
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return {
      body: buffer.toString('base64'),
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: buffer.length,
    };
  },
  ['media-proxy-asset'],
  // 1h server-side TTL. Files in this bucket are content-addressed (UUID
  // filenames), so the only invalidation case is a media row pointing at a
  // brand-new key — which is naturally a cache miss.
  { revalidate: 3600, tags: ['media-proxy-asset'] }
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const key = path.join('/');

    const cached = await fetchProxyAsset(key);
    if (!cached) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }
    const buffer = Buffer.from(cached.body, 'base64');
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': cached.contentType,
        'Content-Length': cached.contentLength.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error proxying media:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load media' },
      { status: 500 }
    );
  }
}
