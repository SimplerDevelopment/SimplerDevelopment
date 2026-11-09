'use client';

/**
 * PUX-174 / PUX-204: the Email room's leaves as one tab strip — Campaigns,
 * Lists, Segments, Templates, Analytics — shared by every page in the room
 * so the fold is the same everywhere. Studio-only; callers gate on the flag.
 */

import Link from 'next/link';

export const EMAIL_TABS = [
  { href: '/portal/email', label: 'Campaigns' },
  { href: '/portal/email/lists', label: 'Lists' },
  { href: '/portal/email/segments', label: 'Segments' },
  { href: '/portal/email/templates', label: 'Templates' },
  { href: '/portal/email/analytics', label: 'Analytics' },
] as const;

export default function EmailTabs({ active }: { active: (typeof EMAIL_TABS)[number]['href'] }) {
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Email">
      {EMAIL_TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === active ? 'page' : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${t.href === active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
