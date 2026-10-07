import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { unstable_cache } from 'next/cache';
import { getS3Client, getBucketName } from '@/lib/s3/client';
import { authorizeMediaDownload, isValidMediaKey } from '@/lib/security/private-media';
import { proxyAssetResponse, type ProxyAsset } from '@/lib/media/proxy-response';

// Cache the S3 round-trip in Next's data cache so the second hit on a hot
// asset (and every subsequent hit until revalidation) skips the network.
// Stored as base64 so unstable_cache's serializer can round-trip it.
const readProxyAsset = async (key: string): Promise<ProxyAsset | null> => {
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
  };
const fetchProxyAsset = unstable_cache(
  readProxyAsset,
  ['media-proxy-asset'],
  // 1h server-side TTL. Files in this bucket are content-addressed (UUID
  // filenames), so the only invalidation case is a media row pointing at a
  // brand-new key — which is naturally a cache miss.
  { revalidate: 3600, tags: ['media-proxy-asset'] }
);

function fileNotFound(privateAccess = false): NextResponse {
  return NextResponse.json({ success: false, error: 'File not found' }, {
    status: 404,
    ...(privateAccess && { headers: { 'Cache-Control': 'private, no-store' } }),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const key = path.join('/');
    if (!isValidMediaKey(key)) return fileNotFound();
    const access = await authorizeMediaDownload(request, key);
    if (access === 'denied') return fileNotFound(true);
    const asset = access === 'private' ? await readProxyAsset(key) : await fetchProxyAsset(key);
    if (!asset) return fileNotFound();
    return proxyAssetResponse(asset, key, access === 'private');
  } catch (error) {
    console.error('Error proxying media:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load media' },
      { status: 500 }
    );
  }
}
