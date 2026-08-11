import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateFAQSchema, generateBreadcrumbListSchema } from '@/lib/utils/structured-data';
import { PageHeader, CreamBand, CTABanner } from '@/components/retro/sections';
import { SectionHeading, InkPanel, OrbitDivider } from '@/components/retro/primitives';
import { formatMoney } from '@/lib/utils/money';
import { BUNDLE, sumOfModulePricesCents, VOLUME_TIERS } from '@/lib/billing/domain-catalog';
import StackCalculator from './StackCalculator';
import { COMPETITORS, PRICES_CHECKED_ON } from './competitor-stack';

export const metadata = generateSEO({
  title: 'Software Cost Calculator — What Your Point-Tool Stack Actually Costs',
  description:
    'Add up what you pay Webflow, HubSpot, Notion, Mailchimp, Asana, Calendly, DocuSign, Shopify and Zapier every month, and see the same capabilities on one platform. Every price cited and dated.',
  path: '/calculator',
});

// The comparison names competitors and quotes their list prices — a deliberate
// departure from /compare, which argues against the generic pattern and names
// nobody. A cost figure without a vendor behind it is a number we invented, so
// this page cites every row (see ./competitor-stack.ts for the sourcing rules).
// It is also deliberately conservative in our own disfavour; the methodology
// band below states exactly how, because a savings calculator that hides its
// assumptions is an advertisement, not a calculator.

// Counted, never typed. The footnote under the sources table and this FAQ
// answer have to agree, and the only way to guarantee that is to derive both
// from the same array — a page arguing that its numbers are checkable cannot
// afford a hardcoded count that quietly goes stale.
const PRESS_SOURCED = COMPETITORS.filter((c) => c.source === 'press');
const COUNT_WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

const faqs = [
  {
    question: 'Where do these competitor prices come from?',
    answer: `Each row is the vendor's own published list price, read from their pricing page on ${PRICES_CHECKED_ON} and linked in the sources table. ${COUNT_WORDS[PRESS_SOURCED.length] ?? PRESS_SOURCED.length} of them (${PRESS_SOURCED.map((c) => c.vendor).join(', ')}) block automated reads of their pricing pages; those figures come from published 2026 pricing write-ups and are marked with a dagger. Nothing here is estimated by us.`,
  },
  {
    question: 'Is this comparing like for like?',
    answer:
      'Capability for capability, yes — a booking module against a booking product, a CRM against a CRM. Feature-for-feature, no, and in both directions: some point tools go deeper in their one niche than our module does, and several of our modules do things their counterpart does not. The calculator compares what a line item costs, not who wins a feature checklist.',
  },
  {
    question: 'Why does the gap grow so fast when I add people?',
    answer:
      'Because almost every point tool is priced per seat, and several enforce a seat minimum you pay whether you use it or not — HubSpot Sales Hub Professional bills a minimum of five. Our seats are capped at $30 each regardless of how many modules you run, so team size moves one side of the comparison much harder than the other.',
  },
  {
    question: 'What is not in these numbers?',
    answer:
      'Usage overages, payment-processing and transaction fees, AI credit top-ups, and one-time onboarding fees are excluded from both sides. Those exclusions cut against us — HubSpot alone adds a one-time $1,500 onboarding fee we do not count, and Shopify Basic takes 2% of every transaction on top of its monthly price.',
  },
  {
    question: 'Can I run only some of the modules?',
    answer:
      'Yes — that is the point of ticking boxes. Modules are à-la-carte, and the volume discount only applies once you are running four or more. If you genuinely need one capability and nothing else, a single point tool may well be cheaper, and the calculator will show you that.',
  },
];

export default function CalculatorPage() {
  const faqSchema = generateFAQSchema(faqs);
  const breadcrumb = generateBreadcrumbListSchema([
    { name: 'Home', item: '/' },
    { name: 'Compare', item: '/compare' },
    { name: 'Cost Calculator', item: '/calculator' },
  ]);

  return (
    <>
      <StructuredData data={[faqSchema, breadcrumb]} />

      <PageHeader
        eyebrow="Mission Cost Analysis"
        title="What Is Your Stack Actually Costing You?"
        subtitle="Tick the tools you already pay for, set your headcount, and read the difference. Every competitor price below is their published list price, linked and dated — not our estimate of it."
      />

      <CreamBand>
        <StackCalculator />
      </CreamBand>

      {/* Methodology — stated before the number is admired, not after. */}
      <InkPanel>
        <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Flight Rules"
            title="How These Numbers Are Built"
            subtitle="Every judgement call in this calculator was made against our own interest. Here they all are."
            onDark
          />
          <ul className="space-y-4 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            <Rule label="Month-to-month, both sides">
              Our module prices are month-to-month, so competitor prices are too wherever the
              vendor publishes one. Where a vendor publishes <em>only</em> an annual-commitment
              rate — Calendly and DocuSign — we use that lower annual figure rather than
              inferring a higher monthly one.
            </Rule>
            <Rule label="Smallest tier that exists">
              Mailchimp is counted at 500 contacts, Zapier at 750 tasks a month, Buffer at a
              single social channel, Typeform at 100 responses. These are floors, not typical
              bills. A real business on any of them is paying more than this page credits.
            </Rule>
            <Rule label="Seat minimums are honoured">
              A three-person team on HubSpot Sales Hub Professional pays for five seats, because
              that is what HubSpot sells. Pretending you could buy three would understate the
              invoice you actually receive.
            </Rule>
            <Rule label="Excluded from both sides">
              Usage overages, transaction and payment-processing fees, AI credit top-ups, and
              one-time onboarding fees. Each exclusion favours the point-tool stack — HubSpot’s
              onboarding fee alone is $1,500, and Shopify Basic keeps 2% of every sale.
            </Rule>
            <Rule label="Our side comes from the billing code">
              The SimplerDevelopment column is not typed into this page. It calls the same
              function that generates the real Stripe line items, reading the same module prices,
              the same volume tiers ({VOLUME_TIERS.map((t) => `${t.percentOff}% at ${t.minModules}`).join(', ')}{' '}
              modules) and the same $30 seat cap. It cannot quote you a price that checkout then
              contradicts.
            </Rule>
            <Rule label="No labour, no productivity, no soft savings">
              Plenty of consolidation pitches monetise the hours you spend maintaining Zapier
              plumbing and CSV syncs. That number is real but unverifiable, so it is not in here.
              This page only counts money that appears on an invoice.
            </Rule>
          </ul>
        </div>
      </InkPanel>

      <CreamBand>
        <SectionHeading
          eyebrow="Show Your Working"
          title="Every Price, And Where It Came From"
          subtitle={`Read from each vendor's own pricing page on ${PRICES_CHECKED_ON}. List prices change without notice — if one of these is stale, the link is right there to check.`}
        />
        <div className="overflow-x-auto rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)]">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[color-mix(in_srgb,var(--retro-mid)_10%,var(--retro-cream))]">
                {['Vendor & plan', 'List price', 'Billed', 'The caveat'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="font-display p-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--retro-ink)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPETITORS.map((c) => (
                <tr
                  key={c.key}
                  className="border-t border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] align-top"
                >
                  <td className="p-3">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="font-display font-bold text-[var(--retro-ink)] underline decoration-[var(--retro-orange)] decoration-2 underline-offset-4 hover:text-[var(--retro-orange)]"
                    >
                      {c.vendor} {c.plan}
                    </a>
                    {c.source === 'press' && (
                      <sup className="ml-1 text-[var(--retro-label)]" aria-label="see footnote">
                        †
                      </sup>
                    )}
                  </td>
                  <td className="p-3 font-semibold text-[var(--retro-ink)]">
                    {formatMoney(c.monthlyCents)}
                  </td>
                  <td className="p-3 text-[color-mix(in_srgb,var(--retro-ink)_70%,transparent)]">
                    {c.basis === 'seat'
                      ? `per seat${c.minSeats ? ` · ${c.minSeats} minimum` : ''}`
                      : 'flat'}
                  </td>
                  <td className="p-3 text-xs leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_70%,transparent)]">
                    {c.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_65%,transparent)]">
          † {PRESS_SOURCED.map((c) => c.vendor).join(', ')} block automated reads of their pricing
          pages. Those figures come from published 2026 pricing write-ups rather than the vendor
          page itself, so treat them as the one place this table is second-hand — the links still
          go to the source of record.
        </p>

        <OrbitDivider />

        <SectionHeading eyebrow="Transmissions In" title="Common Questions" />
        <dl className="mx-auto max-w-3xl space-y-6">
          {faqs.map((f) => (
            <div
              key={f.question}
              className="border-b border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] pb-6 last:border-0"
            >
              <dt className="font-display text-lg font-bold text-[var(--retro-ink)]">
                {f.question}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]">
                {f.answer}
              </dd>
            </div>
          ))}
        </dl>
      </CreamBand>

      {/* Mirrors the honesty band on /compare — the case against our own page. */}
      <InkPanel>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <SectionHeading eyebrow="Honest Log Entry" title="When This Calculator Is Wrong." onDark />
          <p className="text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            It is wrong when you only need one thing. A solo operator who wants a scheduling link
            and nothing else should buy a scheduling product — tick one box above and the
            calculator will tell you so itself. It is wrong when a point tool’s depth in its own
            niche is the whole reason you bought it; we are not going to out-feature DocuSign on
            e-signature workflows or Shopify on international tax. And it flatters us on team
            size, because the seat cap is genuinely the strongest thing about our pricing and this
            page lets it do a lot of the work.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            The CRM row is the one to argue with hardest. We compare against HubSpot Sales Hub
            Professional because that is the tier with lead scoring and custom pipelines — the
            things our CRM module actually does — and Professional carries a five-seat minimum. A
            two-person shop that only needs contacts and a simple pipeline could sit on a cheaper
            HubSpot tier and pay far less than this page shows. If that is you, the comparison
            above is not the one to make.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            What it is right about is the shape of the bill. Once you are running four or five of
            these products and paying per seat on each, you are buying the same login, the same
            contact record, and the same integration plumbing several times over. That is the
            money this page is counting.
          </p>
          <p className="mt-6 text-sm text-[color-mix(in_srgb,var(--retro-cream)_62%,transparent)]">
            Every module à la carte is {formatMoney(sumOfModulePricesCents(), { fractionDigits: 0 })}/mo
            before the {VOLUME_TIERS[0].percentOff}% twelve-module discount;{' '}
            {BUNDLE.name} is a flat {formatMoney(BUNDLE.monthlyPriceCents, { fractionDigits: 0 })}/mo
            with larger usage allowances built in.
          </p>
        </div>
      </InkPanel>

      <CTABanner
        title="Bring Us Your Actual Invoices."
        subtitle="We will do this against your real stack, line by line, and tell you if it isn't worth moving."
        primary={{ href: '/contact', label: 'Get A Real Number' }}
        secondary={{ href: '/compare', label: 'Read The Full Comparison' }}
        art="satellite-dish"
      />
    </>
  );
}

function Rule({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="border-l-2 border-[var(--retro-gold)] pl-4">
      <span className="font-display block text-sm font-bold text-[var(--retro-cream)]">
        {label}
      </span>
      <span className="mt-1 block">{children}</span>
    </li>
  );
}
