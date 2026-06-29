import { generateSEO } from '@/lib/utils/seo';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/animations/FadeIn';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateFAQSchema } from '@/lib/utils/structured-data';

export const metadata = generateSEO({
  title: 'FAQ',
  description:
    'Answers about SimplerDevelopment — the open-source, MCP-native all-in-one agency platform: what it does, pricing, self-hosting, AI & MCP, security, and data ownership.',
  path: '/faq',
});

// Grouped, fully-visible Q&A (no JS accordion) so every answer is crawlable by
// search engines and LLMs. All claims are grounded in the actual product.
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
          'Per-seat plans: Starter $19, Growth $59, and Scale $119 per month. A seat is one team member with portal access — client-facing websites, booking pages, and forms do not consume seats. Or self-host the open-source edition for free.',
      },
      {
        question: 'Is there a free trial?',
        answer:
          '14 days with full access to your chosen plan, no credit card required, so you can see real value before paying.',
      },
      {
        question: 'Can I change plans later?',
        answer:
          'Yes. Upgrades apply immediately with prorated billing; downgrades take effect at your next billing cycle.',
      },
      {
        question: 'Do you offer agency or white-label plans?',
        answer:
          'The Scale tier includes white-label (custom portal domain, your branding). For multi-seat agency accounts or custom arrangements, contact us for a quote.',
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
          'The codebase is identical. Self-host it free and bring your own Postgres and API keys, or let the team that builds it run the managed cloud for you. There is no feature difference forced by hosting.',
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
          'You do. Self-host on your own database and it never leaves your infrastructure. On the managed cloud, your data is yours and exportable.',
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
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">{'// FAQ'}</p>
              <h1 className="text-4xl md:text-6xl font-bold mb-4">Frequently asked questions</h1>
              <p className="text-xl text-muted-foreground">
                What SimplerDevelopment does, how it&apos;s priced, and how to run it your way.
              </p>
            </div>
          </FadeIn>

          {groups.map((group) => (
            <section key={group.category} className="mb-12">
              <FadeIn>
                <h2 className="text-sm font-mono uppercase tracking-wider text-primary mb-6">{group.category}</h2>
                <dl className="space-y-8">
                  {group.items.map((item) => (
                    <div key={item.question} className="border-b border-border pb-8 last:border-0">
                      <dt className="text-xl font-semibold mb-3">{item.question}</dt>
                      <dd className="text-muted-foreground leading-relaxed">{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </FadeIn>
            </section>
          ))}

          <FadeIn>
            <div className="text-center mt-16 rounded-2xl border border-border bg-card p-10">
              <h2 className="text-2xl font-bold mb-3">Still have questions?</h2>
              <p className="text-muted-foreground mb-6">
                Start free in minutes, read the docs, or talk to the team that builds it.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button href="/pricing">Start free</Button>
                <Button href="/contact" variant="outline">Book a consultation</Button>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </>
  );
}
