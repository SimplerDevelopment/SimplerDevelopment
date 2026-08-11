import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateFAQSchema, generateBreadcrumbListSchema } from '@/lib/utils/structured-data';
import { PageHeader, CreamBand, InkPanel, CTABanner } from '@/components/retro/sections';
import { SectionHeading } from '@/components/retro/primitives';

export const metadata = generateSEO({
  title: 'One Platform vs a Stack of Point Tools',
  description:
    'Why teams consolidate a website builder, CRM, email tool, booking app, and knowledge base into one open-source, MCP-native platform — and the honest cases where separate tools still win.',
  path: '/compare',
});

// Skinned in the retro-future design system — see components/retro/. Voice is
// mid-century mission-control; every row/answer below is unchanged from the
// pre-retro copy (still category positioning against the GENERIC pattern of
// stitched point tools — no named competitors, no fabricated feature matrix).
const rows: { dimension: string; stack: string; sd: string }[] = [
  {
    dimension: 'Shared data',
    stack: 'Each tool has its own database; you sync with Zapier or CSV exports.',
    sd: 'One database — a CRM contact is the same record that receives a campaign and books a call.',
  },
  {
    dimension: 'Login & seats',
    stack: 'A separate login and per-tool seat for every product.',
    sd: 'One login across the whole platform. Client-facing pages, booking pages, and forms use no seats.',
  },
  {
    dimension: 'AI & automation',
    stack: 'Bolt-on integrations and brittle webhooks between tools.',
    sd: 'MCP-native — 200+ scoped tools any AI agent (Claude, Cursor) can drive across every module.',
  },
  {
    dimension: 'Multi-tenant / agency',
    stack: 'Most tools are single-organization; running many clients means many accounts.',
    sd: 'Multi-tenant and white-label by design — run every client from one portal under your own brand.',
  },
  {
    dimension: 'Billing',
    stack: 'N invoices from N vendors, each with its own renewal and price hike.',
    sd: 'One bill, à-la-carte modules — turn on only what you use.',
  },
  {
    dimension: 'Ownership',
    stack: 'Proprietary and hosted-only; your data and workflow live in someone else’s product.',
    sd: 'Apache-2.0 and self-hostable — own your data, fork the code, export anytime. No lock-in.',
  },
  {
    dimension: 'Setup & upkeep',
    stack: 'Evaluate, integrate, and maintain a dozen separate products.',
    sd: 'One codebase — clone to running locally, or one-click deploy. One thing to keep current.',
  },
];

const faqs = [
  {
    question: 'Isn’t an all-in-one platform worse than best-of-breed tools?',
    answer:
      'Sometimes a single niche tool has a deeper feature in its category. But integrated data and one vendor usually beat marginally-deeper features that don’t talk to each other — and because SimplerDevelopment is open source, you can extend any module instead of waiting on a vendor roadmap.',
  },
  {
    question: 'When should I keep separate point tools?',
    answer:
      'If you only need one capability (just a CRM, just a newsletter) and want the absolute deepest feature set in that single niche, a dedicated tool can be the better fit. Consolidation pays off once you’re running several tools that need to share data.',
  },
  {
    question: 'Do I have to use every module?',
    answer:
      'No. Modules are à-la-carte — enable the ones you need and ignore the rest. You can add more as you grow.',
  },
  {
    question: 'Can I migrate off later?',
    answer:
      'Yes — it’s Apache-2.0 and self-hostable, and your data is exportable. There is no lock-in by design.',
  },
];

export default function ComparePage() {
  const faqSchema = generateFAQSchema(faqs);
  const breadcrumb = generateBreadcrumbListSchema([
    { name: 'Home', item: '/' },
    { name: 'Compare', item: '/compare' },
  ]);
  return (
    <>
      <StructuredData data={[faqSchema, breadcrumb]} />

      <PageHeader
        eyebrow="Mission Comparison"
        title="One Platform vs. A Stack Of Point Tools"
        subtitle="Eighteen connected modules that share one database — instead of a website builder, CRM, email tool, booking app, and knowledge base that don't talk to each other."
      />

      {/* Comparison table */}
      <CreamBand>
        <SectionHeading
          eyebrow="Side By Side"
          title="Same Mission. Different Flight Plans."
          subtitle="Read it row by row — every line is a real difference, not a marketing wash."
        />
        <div className="overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_40%,transparent)]">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr_1.3fr]">
            <div className="hidden bg-[var(--retro-cream)] p-5 md:block" />
            <div className="hidden border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[var(--retro-cream)] p-5 font-display text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-ink)] md:block">
              A Stitched Point-Tool Stack
            </div>
            <div className="hidden border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-orange)_10%,var(--retro-cream))] p-5 font-display text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-orange)] md:block">
              SimplerDevelopment
            </div>
            {rows.map((r) => (
              <div key={r.dimension} className="contents">
                <div className="border-t border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-mid)_8%,var(--retro-cream))] p-5 font-display text-sm font-bold text-[var(--retro-ink)]">
                  {r.dimension}
                </div>
                <div className="border-t border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] p-5 text-sm text-[color-mix(in_srgb,var(--retro-ink)_72%,transparent)]">
                  <span className="mb-1 block font-display text-xs font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--retro-ink)_55%,transparent)] md:hidden">
                    Point-tool stack
                  </span>
                  {r.stack}
                </div>
                <div className="border-t border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-orange)_6%,var(--retro-cream))] p-5 text-sm text-[var(--retro-ink)]">
                  <span className="mb-1 block font-display text-xs font-bold uppercase tracking-wide text-[var(--retro-orange)] md:hidden">
                    SimplerDevelopment
                  </span>
                  {r.sd}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CreamBand>

      {/* Honest: when point tools win */}
      <InkPanel>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <SectionHeading eyebrow="Honest Log Entry" title="When Separate Tools Still Win." onDark />
          <p className="text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            We’d rather be honest: if you only need a single capability and want the deepest
            feature set in that one niche, a dedicated tool can be the better choice.
            Consolidation pays off once you run several tools that need to share data — which is
            most agencies and operators.
          </p>
        </div>
      </InkPanel>

      {/* FAQ */}
      <CreamBand>
        <SectionHeading eyebrow="Transmissions In" title="Common Questions" />
        <dl className="mx-auto max-w-3xl space-y-6">
          {faqs.map((f) => (
            <div
              key={f.question}
              className="border-b border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] pb-6 last:border-0"
            >
              <dt className="font-display text-lg font-bold text-[var(--retro-ink)]">{f.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]">
                {f.answer}
              </dd>
            </div>
          ))}
        </dl>
      </CreamBand>

      <CTABanner
        title="Ready To Compare Against Your Own Stack?"
        subtitle="Talk to the crew, or go explore the modules yourself."
        primary={{ href: '/contact', label: 'Contact Us For Managed Hosting' }}
        secondary={{ href: '/calculator', label: 'Price It Against Your Stack' }}
        art="satellite-dish"
      />
    </>
  );
}
