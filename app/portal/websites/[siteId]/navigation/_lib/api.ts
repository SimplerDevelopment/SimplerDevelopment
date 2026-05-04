// ─── API helpers for the navigation editor ───────────────────────────────────

import type { Branding, NavItem } from './types';
import { withSequentialSortOrder } from './tree';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface SiteStatus {
  vercelDomain?: string | null;
  subdomain?: string | null;
}

export const portalBase = (siteId: string) => `/api/portal/websites/${siteId}`;

export async function fetchNavigation(siteId: string): Promise<NavItem[]> {
  const res = await fetch(`${portalBase(siteId)}/navigation`).then((r) =>
    r.json() as Promise<ApiEnvelope<NavItem[]>>,
  );
  return res.success ? res.data : [];
}

export async function fetchBranding(siteId: string): Promise<Partial<Branding> | null> {
  const res = await fetch(`${portalBase(siteId)}/branding`).then((r) =>
    r.json() as Promise<ApiEnvelope<Partial<Branding>>>,
  );
  return res.success ? res.data : null;
}

export async function fetchSiteStatus(siteId: string): Promise<SiteStatus | null> {
  try {
    const res = await fetch(`/api/portal/websites/${siteId}/status`);
    if (!res.ok) return null;
    const json = (await res.json()) as ApiEnvelope<SiteStatus>;
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export async function saveNavigation(siteId: string, items: NavItem[]) {
  return fetch(`${portalBase(siteId)}/navigation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: withSequentialSortOrder(items) }),
  });
}

export async function saveBranding(siteId: string, branding: Branding) {
  return fetch(`${portalBase(siteId)}/branding`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(branding),
  });
}

/**
 * Resolve the iframe preview URL given the site status. Mirrors the original
 * page's heuristic: when the portal is hit on the tenant's own host, use a
 * same-origin path so middleware can rewrite; otherwise hit /sites/{domain}.
 * Returns null if no preview is possible (site not deployed).
 */
export function resolvePreviewBase(
  status: SiteStatus | null,
  windowHost: string | null,
): string | null {
  const domain = status?.vercelDomain || (status?.subdomain ? `${status.subdomain}.simplerdevelopment.com` : null);
  if (!domain) return null;
  const onTenantHost = !!windowHost && windowHost === domain;
  return onTenantHost ? '' : `/sites/${domain}`;
}
