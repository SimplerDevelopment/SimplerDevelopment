/**
 * URL alias: GET /api/skills/bundle.tgz.sha256 → checksum of the bundle.
 *
 * The macOS / Windows installer scripts hit this exact path to verify the
 * tarball after download. The canonical bundle handler detects checksum
 * requests via `url.pathname.endsWith('.sha256')`, so we just forward to it.
 */
export { GET } from '../bundle/route';
export const runtime = 'nodejs';
export const revalidate = 300;
