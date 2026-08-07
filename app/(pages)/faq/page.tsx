import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateFAQSchema } from '@/lib/utils/structured-data';
import { PageHeader, CreamBand, InkPanel, CTABanner } from '@/components/retro/sections';
import { Star } from '@/components/retro/primitives';

export const metadata = generateSEO({
  title: 'FAQ',
  description:
    'Answers about SimplerDevelopment — the open-source, MCP-native all-in-one agency platform: what it does, pricing, self-hosting, AI & MCP, security, and data ownership.',
  path: '/faq',
});

// Skinned in the retro-future design system — see components/retro/. Grouped,
// fully-visible Q&A (no JS accordion) so every answer stays crawlable by
// search engines and LLMs, and matches generateFAQSchema below verbatim. Every
// answer is unchanged from the pre-retro copy — the retro voice lives in the
// page chrome (header, band rhythm), not in facts like the licence or crypto.
const groups: { category: string; items: { question: string; answer: string }[] }[] = [
  {
    category: 'Product',
    items: [
      {
        question: 'What is SimplerDevelopment?',
        answer:
          'An open-source, multi-tenant platform that replaces a stack of separate SaaS tools with one connected system: per-tenant client websites and a block-based CMS, a CRM, an AI "Company Brain" (retrieval-augmented knowledge base), automations, bookings, a storefront, email campaigns, surveys, e-signatures, and Stripe billing — all driveable by an AI agent through a Model Context Protocol (MCP) server.',
      },
      {
        question: 'Who is it for?',
        answer:
          'Agencies and operators who run multiple clients or brands and are tired of stitching together a website builder, a CRM, an email tool, a booking app, and a knowledge base that don\'t share data. Developers also use it as an MCP-native, self-hostable platform to build on.',
      },
      {
        question: 'What makes it different from other all-in-one tools?',
        answer:
          'It is MCP-native, not MCP-bolted-on: 200+ scoped tools span the whole platform, so Claude, Cursor, or any MCP client can build a page, manage the CRM, or send a campaign by talking to an agent. It is also fully open source (Apache-2.0) and self-hostable, so there is no lock-in.',
      },
    ],
  },
  {
    category: 'Pricing & plans',
    items: [
      {
        question: 'How much does it cost?',
        answer:
          'Self-hosting is free forever — bring your own infrastructure and API keys, no seat caps, no feature gates. Managed hosting, run by the team that builds the platform, is also available — contact us for a quote.',
      },
      {
        question: 'Do you offer agency or white-label plans?',
        answer:
          'Yes — white-label portals (custom portal domain, your branding), multi-seat agency accounts, and reseller arrangements are all available. Contact us and we will put together a custom quote.',
      },
    ],
  },
  {
    category: 'Open source & self-hosting',
    items: [
      {
        question: 'Is it really open source?',
        answer:
          'Yes — Apache-2.0 licensed. Use it commercially, fork it, and run it for clients. No seat caps, no feature gates, no rug-pull.',
      },
      {
        question: 'What do I need to self-host?',
        answer:
          'A PostgreSQL database with the pgvector extension (for the Company Brain), Bun, and a handful of environment secrets. A Docker Compose file provisions Postgres + pgvector locally, and the quick start gets you from clone to running. Deploy on Vercel, Railway, or any Next.js host with your own Postgres.',
      },
      {
        question: 'What is the difference between self-hosted and hosted?',
        answer:
          'The codebase is identical. Self-host it free and bring your own Postgres and API keys, or have the team that builds it run managed hosting for you (contact us for a quote). There is no feature difference forced by hosting.',
      },
    ],
  },
  {
    category: 'AI & MCP',
    items: [
      {
        question: 'What can the AI agent actually do?',
        answer:
          'Through the MCP server it can operate the platform: create and edit pages and posts, manage CRM contacts/deals, draft and send email campaigns, query the Company Brain, manage projects and bookings, and more — each tool gated by a permission scope. Write actions that affect live content go through an approval step a human confirms.',
      },
      {
        question: 'Which AI clients can connect?',
        answer:
          'Any Model Context Protocol client — Claude Desktop, Claude Code, Claude.ai (via OAuth), and Cursor — plus ChatGPT where MCP connectors are available. Connect with a portal API key or the OAuth 2.1 flow.',
      },
      {
        question: 'Can I use my own AI key (BYOK)?',
        answer:
          'Yes. Bring your own OpenAI or Anthropic key and run the AI at cost with no platform markup. Keys are encrypted at rest (AES-256-GCM).',
      },
    ],
  },
  {
    category: 'Security & data',
    items: [
      {
        question: 'Who owns my data?',
        answer:
          'You do. Self-host on your own database and it never leaves your infrastructure. With managed hosting (contact us), your data is yours and exportable.',
      },
      {
        question: 'Is it secure and multi-tenant safe?',
        answer:
          'Every record is keyed by tenant (clientId / siteId) and access is enforced at the data layer and on every MCP tool via scope guards. There is two-factor authentication (TOTP), bcrypt password hashing, OAuth 2.1 with PKCE for API clients, and a tenancy regression test suite that runs on every data-access change.',
      },
      {
        question: 'Can I migrate my existing CRM and content in?',
        answer:
          'Yes — import CRM contacts and companies via the portal or MCP tools, and bring content in through the visual editor, HTML upload, or block JSON. See the migration guide on the blog.',
      },
    ],
  },
];

export default function FaqPage() {
  const faqSchema = generateFAQSchema(groups.flatMap((g) => g.items));
  return (
    <>
      <StructuredData data={faqSchema} />

      <PageHeader
        eyebrow="Flight Manual"
        title="Frequently Asked Questions"
        subtitle="What the platform does, what it costs, and how to fly it your way."
      />

      {groups.map((group, i) => {
        const isDark = i % 2 === 1;
        const body = (
          <>
            <p className={`eyebrow flex items-center gap-3 ${isDark ? 'eyebrow--on-ink' : ''}`}>
              <Star className="h-3 w-3" />
              {group.category}
            </p>
            <dl className="mt-6 space-y-8">
              {group.items.map((item) => (
                <div
                  key={item.question}
                  className={`border-b pb-8 last:border-0 ${
                    isDark
                      ? 'border-[color-mix(in_srgb,var(--retro-cream)_20%,transparent)]'
                      : 'border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)]'
                  }`}
                >
                  <dt
                    className={`font-display text-lg font-bold ${
                      isDark ? 'text-[var(--retro-cream)]' : 'text-[var(--retro-ink)]'
                    }`}
                  >
                    {item.question}
                  </dt>
                  <dd
                    className={`mt-2 text-sm leading-relaxed ${
                      isDark
                        ? 'text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]'
                        : 'text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]'
                    }`}
                  >
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        );

        return isDark ? (
          <InkPanel key={group.category}>
            <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
              <div className="mx-auto max-w-3xl">{body}</div>
            </div>
          </InkPanel>
        ) : (
          <CreamBand key={group.category}>
            <div className="mx-auto max-w-3xl">{body}</div>
          </CreamBand>
        );
      })}

      <CTABanner
        title="Got More Questions?"
        subtitle="Read the docs, or talk to the crew that builds it."
        primary={{ href: '/docs', label: 'Read The Docs' }}
        secondary={{ href: '/contact', label: 'Book A Consultation' }}
        art="radio-tower"
      />
    </>
  );
}
