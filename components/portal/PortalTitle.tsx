'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAgencyChrome } from './AgencyChromeProvider';
import { buildPortalNavItems, type PortalNavItem } from '@/lib/portal-nav';

const DEFAULT_APP = 'SimplerDevelopment';

// Order matters: more-specific patterns must come before broader ones.
const ROUTES: { match: RegExp; title: string }[] = [
  // ─── Brain ───────────────────────────────────────────────────────────────
  { match: /^\/portal\/brain\/communications\/\d+\/review$/, title: 'Review Communication' },
  { match: /^\/portal\/brain\/communications\/new$/,         title: 'New Communication' },
  { match: /^\/portal\/brain\/communications\/\d+$/,         title: 'Communication' },
  { match: /^\/portal\/brain\/communications$/,              title: 'Communications' },
  { match: /^\/portal\/brain\/relationships\/\d+$/,    title: 'Relationship' },
  { match: /^\/portal\/brain\/relationships$/,         title: 'Relationships' },
  { match: /^\/portal\/brain\/tasks$/,                 title: 'Brain Tasks' },
  { match: /^\/portal\/brain\/prospects$/,             title: 'Prospects' },
  { match: /^\/portal\/brain\/ask$/,                   title: 'Connect AI' },
  { match: /^\/portal\/brain\/settings$/,              title: 'Brain Settings' },
  { match: /^\/portal\/brain$/,                        title: 'Company Brain' },

  // ─── Projects ────────────────────────────────────────────────────────────
  { match: /^\/portal\/projects\/automations$/,        title: 'Project Automations' },
  { match: /^\/portal\/projects\/\d+$/,                title: 'Project' },
  { match: /^\/portal\/projects$/,                     title: 'Projects' },
  { match: /^\/portal\/my-tasks$/,                     title: 'My Tasks' },
  { match: /^\/portal\/suggested-projects\/[^/]+\/request$/, title: 'Request Project' },
  { match: /^\/portal\/suggested-projects\/[^/]+$/,    title: 'Suggested Project' },
  { match: /^\/portal\/suggested-projects$/,           title: 'Suggested Projects' },

  // ─── CRM ─────────────────────────────────────────────────────────────────
  { match: /^\/portal\/crm\/contacts\/\d+$/,           title: 'Contact' },
  { match: /^\/portal\/crm\/contacts$/,                title: 'Contacts' },
  { match: /^\/portal\/crm\/companies\/\d+$/,          title: 'Company' },
  { match: /^\/portal\/crm\/companies$/,               title: 'Companies' },
  { match: /^\/portal\/crm\/deals$/,                   title: 'Deals' },
  { match: /^\/portal\/crm\/proposals\/\d+$/,          title: 'Proposal' },
  { match: /^\/portal\/crm\/proposals$/,               title: 'Proposals' },
  { match: /^\/portal\/crm\/settings$/,                title: 'CRM Settings' },
  { match: /^\/portal\/crm$/,                          title: 'CRM' },

  // ─── Email ───────────────────────────────────────────────────────────────
  { match: /^\/portal\/email\/campaigns\/new$/,        title: 'New Campaign' },
  { match: /^\/portal\/email\/campaigns\/\d+$/,        title: 'Campaign' },
  { match: /^\/portal\/email\/campaigns$/,             title: 'Campaigns' },
  { match: /^\/portal\/email\/templates$/,             title: 'Email Templates' },
  { match: /^\/portal\/email\/lists$/,                 title: 'Email Lists' },
  { match: /^\/portal\/email\/segments$/,              title: 'Email Segments' },
  { match: /^\/portal\/email\/analytics$/,             title: 'Email Analytics' },
  { match: /^\/portal\/email\/automations$/,           title: 'Email Automations' },
  { match: /^\/portal\/email\/settings$/,              title: 'Email Settings' },
  { match: /^\/portal\/email\/editor-preview$/,        title: 'Email Editor Preview' },
  { match: /^\/portal\/email$/,                        title: 'Email' },

  // ─── Surveys ─────────────────────────────────────────────────────────────
  { match: /^\/portal\/surveys\/new$/,                 title: 'New Survey' },
  { match: /^\/portal\/surveys\/\d+$/,                 title: 'Survey' },
  { match: /^\/portal\/surveys$/,                      title: 'Surveys' },

  // ─── Tickets / Invoices / Hosting ────────────────────────────────────────
  { match: /^\/portal\/tickets\/new$/,                 title: 'New Ticket' },
  { match: /^\/portal\/tickets\/\d+$/,                 title: 'Ticket' },
  { match: /^\/portal\/invoices\/\d+$/,                title: 'Invoice' },
  { match: /^\/portal\/hosting\/\d+$/,                 title: 'Hosting Plan' },
  { match: /^\/portal\/hosting$/,                      title: 'Hosting' },

  // ─── Services ────────────────────────────────────────────────────────────
  { match: /^\/portal\/services\/[^/]+\/request$/,     title: 'Service Request' },
  { match: /^\/portal\/services$/,                     title: 'Services' },

  // ─── Settings ────────────────────────────────────────────────────────────
  { match: /^\/portal\/settings\/ai$/,                 title: 'AI Settings' },
  { match: /^\/portal\/settings\/api-keys$/,           title: 'API Keys' },
  { match: /^\/portal\/settings\/billing$/,            title: 'Billing' },
  { match: /^\/portal\/settings\/profile$/,            title: 'Profile' },
  { match: /^\/portal\/settings\/support$/,            title: 'Support' },
  { match: /^\/portal\/settings\/team$/,               title: 'Team' },
  { match: /^\/portal\/settings$/,                     title: 'Settings' },

  // ─── Tools / Booking ─────────────────────────────────────────────────────
  { match: /^\/portal\/tools\/booking\/calendar$/,     title: 'Booking Calendar' },
  { match: /^\/portal\/tools\/booking\/checkin$/,      title: 'Booking Check-In' },
  { match: /^\/portal\/tools\/booking\/analytics$/,    title: 'Booking Analytics' },
  { match: /^\/portal\/tools\/booking\/quotes\/new$/,  title: 'New Quote' },
  { match: /^\/portal\/tools\/booking\/quotes$/,       title: 'Quotes' },
  { match: /^\/portal\/tools\/booking\/new$/,          title: 'New Booking' },
  { match: /^\/portal\/tools\/booking\/\d+$/,          title: 'Booking' },
  { match: /^\/portal\/tools\/booking$/,               title: 'Bookings' },
  { match: /^\/portal\/tools\/gift-certificates$/,     title: 'Gift Certificates' },

  // ─── Tools / Pitch Decks ─────────────────────────────────────────────────
  { match: /^\/portal\/tools\/pitch-decks\/new$/,                 title: 'New Pitch Deck' },
  { match: /^\/portal\/tools\/pitch-decks\/\d+\/presenter$/,      title: 'Presenter Mode' },
  { match: /^\/portal\/tools\/pitch-decks\/\d+\/slide-preview$/,  title: 'Slide Preview' },
  { match: /^\/portal\/tools\/pitch-decks\/\d+$/,                 title: 'Pitch Deck' },
  { match: /^\/portal\/tools\/pitch-decks$/,                      title: 'Pitch Decks' },

  // ─── Websites (CMS) ──────────────────────────────────────────────────────
  { match: /^\/portal\/websites\/new$/,                                 title: 'New Website' },
  { match: /^\/portal\/websites\/\d+\/posts\/\d+\/edit$/,               title: 'Edit Post' },
  { match: /^\/portal\/websites\/\d+\/posts\/new$/,                     title: 'New Post' },
  { match: /^\/portal\/websites\/\d+\/email\/\d+$/,                     title: 'Email Template' },
  { match: /^\/portal\/websites\/\d+\/email$/,                          title: 'Website Emails' },
  { match: /^\/portal\/websites\/\d+\/store\/products\/\d+$/,           title: 'Product' },
  { match: /^\/portal\/websites\/\d+\/store\/products$/,                title: 'Products' },
  { match: /^\/portal\/websites\/\d+\/store\/orders\/\d+$/,             title: 'Order' },
  { match: /^\/portal\/websites\/\d+\/store\/orders$/,                  title: 'Orders' },
  { match: /^\/portal\/websites\/\d+\/store\/categories$/,              title: 'Store Categories' },
  { match: /^\/portal\/websites\/\d+\/store\/discounts$/,               title: 'Discounts' },
  { match: /^\/portal\/websites\/\d+\/store\/shipping$/,                title: 'Shipping' },
  { match: /^\/portal\/websites\/\d+\/store\/settings$/,                title: 'Store Settings' },
  { match: /^\/portal\/websites\/\d+\/store$/,                          title: 'Store' },
  { match: /^\/portal\/websites\/\d+\/entries$/,                        title: 'Content Entries' },
  { match: /^\/portal\/websites\/\d+\/taxonomy$/,                       title: 'Taxonomies' },
  { match: /^\/portal\/websites\/\d+\/tags$/,                           title: 'Tags' },
  { match: /^\/portal\/websites\/\d+\/categories$/,                     title: 'Categories' },
  { match: /^\/portal\/websites\/\d+\/content-types$/,                  title: 'Content Types' },
  { match: /^\/portal\/websites\/\d+\/media$/,                          title: 'Media Library' },
  { match: /^\/portal\/websites\/\d+\/calendar$/,                       title: 'Calendar' },
  { match: /^\/portal\/websites\/\d+\/automations$/,                    title: 'Website Automations' },
  { match: /^\/portal\/websites\/\d+\/branding$/,                       title: 'Website Branding' },
  { match: /^\/portal\/websites\/\d+\/navigation$/,                     title: 'Navigation' },
  { match: /^\/portal\/websites\/\d+\/settings$/,                       title: 'Website Settings' },
  { match: /^\/portal\/websites\/\d+$/,                                 title: 'Website' },
  { match: /^\/portal\/websites$/,                                      title: 'Websites' },

  // ─── Branding ────────────────────────────────────────────────────────────
  { match: /^\/portal\/branding\/profiles\/\d+\/guide$/,           title: 'Brand Guide' },
  { match: /^\/portal\/branding\/profiles\/\d+$/,                  title: 'Brand Profile' },
  { match: /^\/portal\/branding$/,                                 title: 'Branding' },

  // ─── Agency / White-Label ────────────────────────────────────────────────
  { match: /^\/portal\/agency\/custom-domain$/,                    title: 'Custom Portal Domain' },
  { match: /^\/portal\/agency\/branding$/,                         title: 'Agency Branding' },
  { match: /^\/portal\/agency$/,                                   title: 'Agency' },

  // ─── Top-level ───────────────────────────────────────────────────────────
  { match: /^\/portal\/dashboard$/,                title: 'Dashboard' },
  { match: /^\/portal\/approvals$/,                title: 'Approvals' },
  { match: /^\/portal\/automations$/,               title: 'Automations' },
  { match: /^\/portal\/media$/,                    title: 'Media' },
  { match: /^\/portal\/login$/,                    title: 'Sign In' },
  { match: /^\/portal\/forgot-password$/,          title: 'Forgot Password' },
  { match: /^\/portal\/reset-password$/,           title: 'Reset Password' },
  { match: /^\/portal\/invite\/[^/]+$/,            title: 'Accept Invite' },
  { match: /^\/portal$/,                           title: 'Portal' },
];

// The curated table above drifts as routes ship — seo, publishing, standup and
// most of brain/ spent months titled just "Portal" (operator-reported: every
// inactive tab looked identical). So a table miss no longer means generic:
// fall back to the nav tree (lib/portal-nav.ts — the one place section names
// are maintained, so future nav'd routes title themselves), then to humanized
// path segments for static tails the nav doesn't reach.

const ACRONYMS: Record<string, string> = { seo: 'SEO', crm: 'CRM', ai: 'AI', api: 'API', gsc: 'GSC' };

function humanize(segment: string): string {
  return segment
    .split('-')
    .map((w) => ACRONYMS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Deepest nav item whose href prefixes the pathname (site-scoped hrefs align
 *  because the siteId is lifted from the pathname itself). */
function deepestNavMatch(pathname: string): { href: string; label: string } | null {
  const siteId = pathname.match(/^\/portal\/websites\/(\d+)/)?.[1] ?? null;
  let best: { href: string; label: string } | null = null;
  const walk = (items: Array<PortalNavItem | { href: string; label: string; children?: unknown[] }>) => {
    for (const item of items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        if (!best || item.href.length > best.href.length) best = { href: item.href, label: item.label };
      }
      if ('children' in item && Array.isArray(item.children)) {
        walk(item.children as Array<{ href: string; label: string; children?: unknown[] }>);
      }
    }
  };
  walk(buildPortalNavItems(siteId, null));
  return best;
}

export function resolvePortalTitle(pathname: string): string {
  for (const r of ROUTES) {
    if (r.match.test(pathname)) return r.title;
  }
  if (!pathname.startsWith('/portal')) return 'Portal';

  const nav = deepestNavMatch(pathname);
  // Static segments past the nav match (or past /portal) distinguish deeper
  // pages; numeric ids say nothing to a human, so they're dropped.
  const tail = pathname
    .slice((nav?.href ?? '/portal').length)
    .split('/')
    .filter((s) => s && !/^\d+$/.test(s));
  const tailTitle = tail.length ? humanize(tail[tail.length - 1]) : null;

  if (nav && tailTitle) return `${tailTitle} · ${nav.label}`;
  if (nav) return nav.label;
  return tailTitle ?? 'Portal';
}

export default function PortalTitle() {
  const pathname = usePathname();
  const { agencyName, whiteLabelEnabled } = useAgencyChrome();
  useEffect(() => {
    const app = whiteLabelEnabled && agencyName ? agencyName : DEFAULT_APP;
    document.title = `${resolvePortalTitle(pathname)} | ${app}`;
  }, [pathname, agencyName, whiteLabelEnabled]);
  return null;
}
