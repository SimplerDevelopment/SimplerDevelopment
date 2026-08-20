/**
 * Best-effort intrinsic pixel size for an uploaded image, via sharp loaded
 * lazily.
 *
 * sharp MUST NOT be imported at module level in any code that ships in the
 * Vercel function bundle: its platform binaries fail to load there, which
 * fails the WHOLE importing route module — every request 500s, including ones
 * that never touch an image. That exact failure took down all three media
 * upload routes, and previously the media proxy for ~25 minutes on 2026-08-19
 * (see vault/04 - Decisions/ADR pre-generated-image-variants.md).
 *
 * Dimensions are nice-to-have metadata — media consumers already tolerate
 * null width/height (rows uploaded before extraction existed) — so this fails
 * open to nulls wherever sharp can't load or can't parse the buffer.
 */
export async function getImageDimensions(
  buffer: Buffer,
  mimeType: string,
): Promise<{ width: number | null; height: number | null }> {
  if (!mimeType.startsWith('image/')) return { width: null, height: null };
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(buffer).metadata();
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}
