import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * sharp's platform binaries fail to load in the Vercel function bundle, and a
 * module-level `import sharp` fails the whole importing route module — every
 * request 500s (all three upload routes were down this way; the media proxy
 * broke identically on 2026-08-19). See
 * vault/04 - Decisions/ADR pre-generated-image-variants.md and
 * lib/media/image-dimensions.ts, which wraps the required lazy import.
 */
const ROUTES = [
  'app/api/media/upload/route.ts',
  'app/api/portal/media/upload/route.ts',
  'app/api/portal/cms/websites/[siteId]/media/upload/route.ts',
];

describe('media upload routes never import sharp statically', () => {
  for (const route of ROUTES) {
    it(route, () => {
      const src = readFileSync(join(process.cwd(), route), 'utf8');
      expect(src).not.toMatch(/from ['"]sharp['"]/);
      expect(src).toContain('getImageDimensions');
    });
  }

  it('lib/media/image-dimensions.ts loads sharp lazily', () => {
    const src = readFileSync(join(process.cwd(), 'lib/media/image-dimensions.ts'), 'utf8');
    expect(src).not.toMatch(/^import .*from ['"]sharp['"]/m);
    expect(src).toContain("import('sharp')");
  });
});
