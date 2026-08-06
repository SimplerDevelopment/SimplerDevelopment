// @vitest-environment node
/**
 * Unit tests for validatePrintFile — the trust boundary between a
 * client-supplied render and a garment that actually gets printed.
 *
 * Real PNGs are generated with sharp rather than hand-rolled fixtures, so the
 * alpha-channel and dimension checks are exercised against genuine image data.
 */
import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';

// The route module imports '@/lib/db', which throws without DATABASE_URL.
// validatePrintFile never touches the db.
vi.mock('@/lib/db', () => ({ db: {} }));

const { validatePrintFile, MIN_PRINT_EDGE_PX } = await import(
  '@/app/api/storefront/[siteId]/designs/[designId]/print-file/route'
);

/** Build a PNG data URL of the given size, with or without an alpha channel. */
async function pngDataUrl(
  width: number,
  height: number,
  opts: { alpha: boolean },
): Promise<string> {
  const channels = opts.alpha ? 4 : 3;
  const background = opts.alpha
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 255, g: 255, b: 255 };

  const buf = await sharp({
    create: { width, height, channels: channels as 3 | 4, background },
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${buf.toString('base64')}`;
}

describe('validatePrintFile', () => {
  it('accepts a large transparent PNG', async () => {
    const url = await pngDataUrl(MIN_PRINT_EDGE_PX, MIN_PRINT_EDGE_PX, { alpha: true });
    const res = await validatePrintFile(url);

    expect(res.ok).toBe(true);
    expect(res.buffer).toBeInstanceOf(Buffer);
  });

  it('rejects an opaque PNG as a probable mockup', async () => {
    // A composite of artwork over a product photo has no transparency. This is
    // the check that stops a shirt being printed with a picture of a shirt.
    const url = await pngDataUrl(MIN_PRINT_EDGE_PX, MIN_PRINT_EDGE_PX, { alpha: false });
    const res = await validatePrintFile(url);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
    expect(res.message).toMatch(/mockup/i);
  });

  it('rejects an under-resolution export', async () => {
    const url = await pngDataUrl(400, 400, { alpha: true });
    const res = await validatePrintFile(url);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
    expect(res.message).toMatch(/low-resolution/i);
  });

  it('rejects a non-PNG data URL', async () => {
    const res = await validatePrintFile('data:image/jpeg;base64,/9j/4AAQSkZJRg==');

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.message).toMatch(/PNG is required/i);
  });

  it('rejects a missing or non-string payload', async () => {
    expect((await validatePrintFile(undefined)).status).toBe(400);
    expect((await validatePrintFile(null)).status).toBe(400);
    expect((await validatePrintFile(12345)).status).toBe(400);
  });

  it('rejects data that is not a readable image', async () => {
    const junk = Buffer.from('this is definitely not a png').toString('base64');
    const res = await validatePrintFile(`data:image/png;base64,${junk}`);

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/unreadable/i);
  });
});
