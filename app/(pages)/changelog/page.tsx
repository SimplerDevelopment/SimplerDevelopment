import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateBreadcrumbListSchema } from '@/lib/utils/structured-data';
import { PageHeader, CTABanner } from '@/components/retro/sections';
import { RetroBadge, Star } from '@/components/retro/primitives';

export const metadata = generateSEO({
  title: 'Changelog',
  description:
    'What’s new in SimplerDevelopment — the open-source, MCP-native all-in-one agency platform. Release notes and product updates.',
  path: '/changelog',
});

// Product-facing release notes (distinct from the repo CHANGELOG.md dev log).
// Grounded in the actual shipped feature set; no invented metrics.
type Entry = {
  version: string;
  date: string;
  tagline?: string;
  sections: { label: 'Added' | 'Improved' | 'Fixed'; items: string[] }[];
};

const entries: Entry[] = [
  {
    version: 'v1.0',
    date: 'June 2026',
    tagline: 'Public launch — the full platform, open source and MCP-native.',
    sections: [
      {
        label: 'Added',
        items: [
          'Build & publish: per-tenant websites, a block-based CMS with 47 block types, and an iframe visual editor with live preview and real-time collaboration.',
          'Grow: a CRM (contacts, companies, deals pipeline, proposals), email campaigns, multi-page surveys with branching, online booking with payments, and A/B experiments.',
          'Operate with AI: the Company Brain — a per-tenant RAG knowledge base over pgvector — and a 200+ tool MCP server so Claude, Cursor, or any MCP client can drive the whole platform.',
          'Run the business: storefront & commerce, invoicing & Stripe billing, e-signature contracts, projects & kanban, and a help desk with SLA tracking.',
          'Agency: white-label custom domains, branding profiles, and managed hosting.',
          'Apache-2.0 licensed and self-hostable — bring your own Postgres and API keys, or use the managed cloud.',
        ],
      },
    ],
  },
  {
    version: 'Security & accounts',
    date: 'June 2026',
    sections: [
      {
        label: 'Added',
        items: [
          'Two-factor authentication (TOTP) with enroll/disable from account security settings.',
          'OAuth 2.1 authorization server with PKCE and resource-indicator audience binding for API/MCP clients.',
          'AES-256-GCM encryption for stored third-party credentials (BYOK keys).',
        ],
      },
    ],
  },
  {
    version: 'Automations',
    date: 'June 2026',
    sections: [
      {
        label: 'Added',
        items: [
          'Visual workflow builder on a durable Postgres-backed queue — exponential-backoff retries, dead-letter handling, and run history with one-click retry.',
          'Natural-language automation rules: describe a trigger → conditions → actions in plain English.',
        ],
      },
    ],
  },
  {
    version: 'AI agent platform',
    date: 'June 2026',
    sections: [
      {
        label: 'Improved',
        items: [
          'Expanded the MCP tool surface to 200+ scoped tools across every domain, locked by a registry baseline test.',
          'Approval-link workflow: agent-authored changes to live content are staged for a human click-through before they go live.',
        ],
      },
    ],
  },
];

const labelTone: Record<Entry['sections'][number]['label'], 'orange' | 'teal' | 'gold'> = {
  Added: 'orange',
  Improved: 'teal',
  Fixed: 'gold',
};

export default function ChangelogPage() {
  const breadcrumb = generateBreadcrumbListSchema([
    { name: 'Home', item: '/' },
    { name: 'Changelog', item: '/changelog' },
  ]);
  return (
    <>
      <StructuredData data={breadcrumb} />

      <PageHeader
        eyebrow="// Changelog"
        title="What's New."
        subtitle="Every module we've shipped, when it shipped, and why it matters. No filler, no vanity metrics."
      />

      <section className="bg-[var(--retro-cream)]">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <div className="space-y-12">
            {entries.map((e) => (
              <article
                key={e.version + e.date}
                className="relative border-l-2 border-[color-mix(in_srgb,var(--retro-mid)_40%,transparent)] pl-7"
              >
                <Star className="absolute -left-[9px] top-1 h-4 w-4 text-[var(--retro-gold)]" />
                <div className="mb-1 flex flex-wrap items-baseline gap-3">
                  <h2 className="font-display text-2xl font-bold text-[var(--retro-ink)]">{e.version}</h2>
                  <time className="font-display text-sm tracking-wide text-[color-mix(in_srgb,var(--retro-ink)_60%,transparent)]">
                    {e.date}
                  </time>
                </div>
                {e.tagline && (
                  <p className="mb-4 text-[color-mix(in_srgb,var(--retro-ink)_78%,transparent)]">{e.tagline}</p>
                )}
                {e.sections.map((s) => (
                  <div key={s.label} className="mb-4">
                    <div className="mb-3">
                      <RetroBadge tone={labelTone[s.label]}>{s.label}</RetroBadge>
                    </div>
                    <ul className="space-y-2">
                      {s.items.map((it, i) => (
                        <li
                          key={i}
                          className="flex gap-2 leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_78%,transparent)]"
                        >
                          <Star className="mt-1.5 h-3 w-3 shrink-0 text-[var(--retro-orange)]" />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </div>
      </section>

      <CTABanner
        title="Built In The Open."
        subtitle="Follow development on GitHub, self-host it free, or contact us for managed hosting."
        primary={{ href: '/contact', label: 'Contact us for managed hosting' }}
        secondary={{ href: '/solutions', label: 'Explore the platform' }}
        art="satellite-dish"
      />
    </>
  );
}
