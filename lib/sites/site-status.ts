/**
 * PUX-182 (design doc screen 41): a site's status as the owner reads it.
 * Same deploymentStatus vocabulary the list already maps (active /
 * provisioning / failed / pending); under the redesign a never-deployed
 * site reads "Draft" — that is what a pending microsite is to its owner.
 * ponytail: staging lives in website_environments, not on the site row; a
 * true staging label needs that join.
 */

export interface SitePill { label: string; icon: string; tone: string }

export function siteStatus(deploymentStatus: string | null | undefined): SitePill {
  switch (deploymentStatus) {
    case 'active': return { label: 'Live', icon: 'check_circle', tone: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]' };
    case 'provisioning': return { label: 'Setting up', icon: 'settings', tone: 'bg-primary/10 text-primary' };
    case 'failed': return { label: 'Failed', icon: 'error', tone: 'bg-destructive/10 text-destructive' };
    default: return { label: 'Draft', icon: 'edit_note', tone: 'bg-muted text-muted-foreground' };
  }
}

/** The address a card shows: subdomain first, then the custom domain, then nothing. */
export function siteAddress(site: { subdomain: string | null; domain: string | null }): string | null {
  if (site.subdomain) return `${site.subdomain}.simplerdevelopment.com`;
  return site.domain || null;
}
