import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Generate a URL-safe subdomain slug from company name + site name.
 * e.g. ("Acme Corp", "Main Site") → "acme-corp-main-site"
 */
export function generateSubdomain(companyName: string, siteName: string): string {
  const raw = `${companyName}-${siteName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
  return raw || 'site';
}

/**
 * Validate subdomain format: lowercase, alphanumeric + hyphens, 3-63 chars.
 */
export function validateSubdomain(slug: string): string | null {
  if (slug.length < 3) return 'Subdomain must be at least 3 characters.';
  if (slug.length > 63) return 'Subdomain must be 63 characters or fewer.';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return 'Subdomain must start and end with a letter or number, and contain only lowercase letters, numbers, and hyphens.';
  }
  return null;
}

/**
 * Check if a subdomain slug is available (not taken by another site).
 */
export async function isSubdomainAvailable(slug: string, excludeSiteId?: number): Promise<boolean> {
  const existing = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(eq(clientWebsites.subdomain, slug))
    .limit(1);
  if (existing.length === 0) return true;
  if (excludeSiteId && existing[0].id === excludeSiteId) return true;
  return false;
}

/**
 * Generate a unique subdomain, appending -2, -3 etc. on collision.
 */
export async function generateUniqueSubdomain(companyName: string, siteName: string): Promise<string> {
  const base = generateSubdomain(companyName, siteName);
  if (await isSubdomainAvailable(base)) return base;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`.slice(0, 63);
    if (await isSubdomainAvailable(candidate)) return candidate;
  }

  // Fallback: append random suffix
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`.slice(0, 63);
}
