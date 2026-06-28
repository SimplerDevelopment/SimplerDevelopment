import { generateSEO } from '@/lib/utils/seo';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/animations/FadeIn';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateBreadcrumbListSchema } from '@/lib/utils/structured-data';

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

const labelColor: Record<string, string> = {
  Added: 'text-green-500 border-green-500/30 bg-green-500/10',
  Improved: 'text-blue-500 border-blue-500/30 bg-blue-500/10',
  Fixed: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
};

export default function ChangelogPage() {
  const breadcrumb = generateBreadcrumbListSchema([
    { name: 'Home', item: '/' },
    { name: 'Changelog', item: '/changelog' },
  ]);
  return (
    <>
      <StructuredData data={breadcrumb} />
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">{'// CHANGELOG'}</p>
              <h1 className="text-4xl md:text-6xl font-bold mb-4">What’s new</h1>
              <p className="text-xl text-muted-foreground">
                Release notes and product updates for SimplerDevelopment.
              </p>
            </div>
          </FadeIn>

          <div className="space-y-12">
            {entries.map((e) => (
              <FadeIn key={e.version + e.date}>
                <article className="relative pl-6 border-l-2 border-border">
                  <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-primary" />
                  <div className="flex items-baseline gap-3 flex-wrap mb-1">
                    <h2 className="text-2xl font-bold">{e.version}</h2>
                    <time className="text-sm text-muted-foreground font-mono">{e.date}</time>
                  </div>
                  {e.tagline && <p className="text-muted-foreground mb-4">{e.tagline}</p>}
                  {e.sections.map((s) => (
                    <div key={s.label} className="mb-4">
                      <span
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-3 ${labelColor[s.label]}`}
                      >
                        {s.label}
                      </span>
                      <ul className="space-y-2">
                        {s.items.map((it, i) => (
                          <li key={i} className="text-muted-foreground leading-relaxed flex gap-2">
                            <span className="text-primary mt-1.5 shrink-0">•</span>
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </article>
              </FadeIn>
            ))}
          </div>

          <FadeIn>
            <div className="text-center mt-16 rounded-2xl border border-border bg-card p-10">
              <h2 className="text-2xl font-bold mb-3">Built in the open</h2>
              <p className="text-muted-foreground mb-6">
                Follow development on GitHub, or start using the platform today.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button href="/portal/signup">Start free</Button>
                <Button href="/solutions" variant="outline">Explore the platform</Button>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </>
  );
}
