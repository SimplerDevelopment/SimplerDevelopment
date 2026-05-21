/**
 * URL alias: GET /api/skills/bundle.tgz → same content as /api/skills/bundle.
 *
 * The macOS / Windows installer scripts (scripts/installers/install-sd-skills.{command,bat})
 * hard-code the `.tgz` suffix. Existing copies of those installers already
 * downloaded by clients will keep hitting this path; rather than ask them to
 * re-download, this alias forwards to the canonical handler. New installers
 * can use either path.
 */
export { GET } from '../bundle/route';
export const runtime = 'nodejs';
export const revalidate = 300;
