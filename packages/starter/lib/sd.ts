/**
 * The SimplerDevelopment client, configured from the environment.
 *
 * SERVER ONLY. `SD_API_KEY` is a secret and is deliberately NOT prefixed with
 * `NEXT_PUBLIC_`, so it is undefined in the browser. Importing this module from
 * a Client Component would therefore fail at runtime in a confusing way — the
 * guard below turns that into an explicit error instead.
 *
 * Fetch content in Server Components (the default in the App Router) and pass
 * the result down as props. If you genuinely need CMS data on the client, add a
 * route handler that calls this module and fetch that.
 */
import { SimplerDevelopment } from '@simplerdevelopment/sdk';

if (typeof window !== 'undefined') {
  throw new Error(
    '[starter] lib/sd.ts was imported in the browser. It holds a secret API key ' +
      'and must only be used from Server Components or route handlers.',
  );
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[starter] Missing ${name}. Copy .env.example to .env.local and fill it in — ` +
        'the site id and API key both come from the SimplerDevelopment portal.',
    );
  }
  return value;
}

const siteId = Number(required('NEXT_PUBLIC_SITE_ID', process.env.NEXT_PUBLIC_SITE_ID));
if (!Number.isInteger(siteId) || siteId <= 0) {
  throw new Error(`[starter] NEXT_PUBLIC_SITE_ID must be a positive integer, got "${process.env.NEXT_PUBLIC_SITE_ID}".`);
}

export const sd = new SimplerDevelopment({
  siteId,
  apiKey: required('SD_API_KEY', process.env.SD_API_KEY),
  baseUrl: process.env.SD_API_URL || 'https://simplerdevelopment.com',
});

export const SITE_ID = siteId;
