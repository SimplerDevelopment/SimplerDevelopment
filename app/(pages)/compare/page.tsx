import { generateSEO } from '@/lib/utils/seo';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/animations/FadeIn';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateFAQSchema, generateBreadcrumbListSchema } from '@/lib/utils/structured-data';

export const metadata = generateSEO({
  title: 'One Platform vs a Stack of Point Tools',
  description:
    'Why teams consolidate a website builder, CRM, email tool, booking app, and knowledge base into one open-source, MCP-native platform — and the honest cases where separate tools still win.',
  path: '/compare',
});

// Category positioning — compares the integrated platform to the GENERIC pattern
// of stitching separate point tools. No named competitors, no fabricated feature
// matrices; every claim is grounded in the actual product.
const rows: { dimension: string; stack: string; sd: string }[] = [
  {
    dimension: 'Shared data',
    stack: 'Each tool has its own database; you sync with Zapier or CSV exports.',
    sd: 'One database — a CRM contact is the same record that receives a campaign and books a call.',
  },
  {
    dimension: 'Login & seats',
    stack: 'A separate login and per-tool seat for every product.',
    sd: 'One login; per-seat pricing across the whole platform. Client-facing pages and forms use no seats.',
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
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">{'// COMPARE'}</p>
              <h1 className="text-4xl md:text-6xl font-bold mb-4">One platform vs a stack of point tools</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Eighteen connected modules that share one database — instead of a website builder, CRM, email
                tool, booking app, and knowledge base that don’t talk to each other.
              </p>
            </div>
          </FadeIn>

          {/* Comparison table */}
          <FadeIn>
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr_1.3fr]">
                <div className="hidden md:block bg-muted/30 p-5 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                  &nbsp;
                </div>
                <div className="hidden md:block bg-muted/30 p-5 font-semibold text-muted-foreground border-l border-border">
                  A stitched point-tool stack
                </div>
                <div className="hidden md:block bg-primary/10 p-5 font-semibold text-primary border-l border-border">
                  SimplerDevelopment
                </div>
                {rows.map((r) => (
                  <div key={r.dimension} className="contents">
                    <div className="p-5 font-semibold border-t border-border bg-muted/10">{r.dimension}</div>
                    <div className="p-5 text-sm text-muted-foreground border-t border-l border-border">
                      <span className="md:hidden font-semibold text-foreground/70 block mb-1">Point-tool stack</span>
                      {r.stack}
                    </div>
                    <div className="p-5 text-sm border-t border-l border-border bg-primary/5">
                      <span className="md:hidden font-semibold text-primary block mb-1">SimplerDevelopment</span>
                      {r.sd}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Honest: when point tools win */}
          <FadeIn>
            <div className="mt-12 rounded-2xl border border-border bg-card p-8">
              <h2 className="text-xl font-bold mb-3">When separate tools still win</h2>
              <p className="text-muted-foreground">
                We’d rather be honest: if you only need a single capability and want the deepest feature set in
                that one niche, a dedicated tool can be the better choice. Consolidation pays off once you run
                several tools that need to share data — which is most agencies and operators.
              </p>
            </div>
          </FadeIn>

          {/* FAQ */}
          <FadeIn>
            <div className="mt-16">
              <h2 className="text-2xl font-bold mb-8 text-center">Common questions</h2>
              <dl className="space-y-6 max-w-3xl mx-auto">
                {faqs.map((f) => (
                  <div key={f.question} className="border-b border-border pb-6 last:border-0">
                    <dt className="text-lg font-semibold mb-2">{f.question}</dt>
                    <dd className="text-muted-foreground leading-relaxed">{f.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </FadeIn>

          {/* CTA */}
          <FadeIn>
            <div className="text-center mt-16 flex flex-wrap gap-3 justify-center">
              <Button href="/portal/signup" size="lg">Start free</Button>
              <Button href="/pricing" variant="outline" size="lg">See pricing</Button>
              <Button href="/solutions" variant="outline" size="lg">Explore the platform</Button>
            </div>
          </FadeIn>
        </div>
      </div>
    </>
  );
}
