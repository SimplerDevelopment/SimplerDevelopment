import Link from 'next/link';
import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import {
  generateServiceSchema,
  generateFAQSchema,
  generateBreadcrumbListSchema,
} from '@/lib/utils/structured-data';
import { QuoteForm } from '@/components/forms/QuoteForm';
import { PageHeader, CreamBand, InkPanel, CTABanner } from '@/components/retro/sections';
import { SectionHeading, RetroCard, RetroBadge, Star } from '@/components/retro/primitives';
import {
  getAllMigrations,
  getMigrationsByCategory,
  CATEGORY_LABELS,
  type MigrationCategory,
} from '@/lib/data/migrations';

/**
 * /migrate — the hub above the templated per-product pages.
 *
 * Its job is threefold: rank for the generic "migrate to" intent, carry the
 * parts of the offer that are the same whatever you are coming from (the
 * process, the ownership promise, the guarantee that we will talk you out of
 * it), and hand crawl paths down to every /migrate/<slug> child.
 *
 * Product-specific claims belong in lib/data/migrations.ts, never here — this
 * page must stay true for all eleven sources at once, which is exactly why it
 * cannot carry the detail that makes each child page rank.
 */

export const metadata = generateSEO({
  title: 'Migration Services — Move To SimplerDevelopment',
  description:
    'Done-for-you migration from WordPress, Squarespace, Wix, Webflow, HubSpot, Mailchimp, ActiveCampaign, Monday, Trello, Asana or ClickUp. We set it up on your hosting and hand over the keys — no forever fees.',
  path: '/migrate',
});

const CATEGORY_ORDER: MigrationCategory[] = ['website', 'crm', 'projects'];

const CATEGORY_BLURB: Record<MigrationCategory, string> = {
  website: 'Pages, posts, media and — the part most migrations get wrong — your rankings.',
  crm: 'Contacts, companies, deals and lists, imported with every row previewed before it writes.',
  projects: 'Boards, cards, checklists and custom fields, rebuilt next to the clients they belong to.',
};

const process: { title: string; body: string }[] = [
  {
    title: 'Audit',
    body:
      'We look at the actual account, not a questionnaire about it: how many pages, how many records, what is custom, what is quietly load-bearing. You get a written scope and a fixed price from this.',
  },
  {
    title: 'Rebuild',
    body:
      'Content and data move across and the layouts are rebuilt in the block editor. You watch it happen on a staging URL rather than waiting for a reveal at the end.',
  },
  {
    title: 'Cut Over',
    body:
      'Redirects mapped, DNS switched, forms and payments re-pointed, analytics carried over. We schedule it for your quiet hour, not ours.',
  },
  {
    title: 'Hand Over',
    body:
      'Deployed on your hosting and your database, with the credentials, a runbook and a walkthrough. From there you can carry on without us — that is the point.',
  },
];

const faqs = [
  {
    question: 'What does a migration to SimplerDevelopment cost?',
    answer:
      'It is quoted per project, because the honest answer depends on page count, record count and how much custom behaviour has to be rebuilt rather than moved. We audit the real account first and give you a fixed scope and a fixed price before any work begins. That price does not move once agreed.',
  },
  {
    question: 'Will I be locked into paying you forever?',
    answer:
      'No, and this is the main reason people migrate here. SimplerDevelopment is Apache-2.0 and self-hostable, so we can deploy it onto your hosting and your database and hand over the keys. After that you pay your infrastructure provider, not a licence fee to us. Managed hosting is available if you prefer it, but it is optional.',
  },
  {
    question: 'Will migrating hurt my SEO?',
    answer:
      'Only if the redirects are skipped. We preserve slugs where possible, map everything else to a redirect, and carry metadata and structured data across with the content. Rankings typically settle within a few weeks. We treat the redirect map as part of the migration, not an afterthought.',
  },
  {
    question: 'How long does a migration take?',
    answer:
      'Small sites and single boards are usually days. A typical website or CRM migration runs one to two weeks. Large or heavily customised accounts run three to four. You get a real estimate with the fixed quote, based on your actual account.',
  },
  {
    question: 'What if migrating is the wrong move for us?',
    answer:
      'We will tell you. Every migration page on this site carries a "stay where you are if…" line, and the audit is where we say so plainly. Talking someone out of a migration costs us one project; doing a migration that should not have happened costs us a reference.',
  },
];

export default function MigratePage() {
  const all = getAllMigrations();
  const schema = [
    generateServiceSchema(
      'Platform migration services',
      'Done-for-you migration of websites, CRM data and project boards onto SimplerDevelopment, deployed to the client’s own hosting under an Apache-2.0 licence.',
      'Website and CRM migration'
    ),
    generateFAQSchema(faqs),
    generateBreadcrumbListSchema([
      { name: 'Home', item: '/' },
      { name: 'Migrate', item: '/migrate' },
    ]),
  ];

  return (
    <>
      <StructuredData data={schema} />

      <PageHeader
        eyebrow="Change Of Orbit"
        title="Migrate To SimplerDevelopment."
        subtitle="Bring your site, your CRM and your boards across in one move — then run it on your own hosting, under an open licence, with no fee that follows you around forever."
      />

      {/* Answer-first, then the grid of children. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Departure Board"
          title="What Are You Coming From?"
          subtitle="We move eleven source products today. Pick yours for what specifically comes across, what doesn’t, and how long it takes — or ask us about one that isn’t listed."
        />
        <div className="space-y-12">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat}>
              <p className="eyebrow flex items-center gap-3">
                <Star className="h-3 w-3 text-[var(--retro-gold)]" />
                {CATEGORY_LABELS[cat]}
              </p>
              <p className="mt-2 mb-6 text-sm text-[color-mix(in_srgb,var(--retro-ink)_70%,transparent)]">
                {CATEGORY_BLURB[cat]}
              </p>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {getMigrationsByCategory(cat).map((m) => (
                  <RetroCard key={m.slug} title={m.name} href={`/migrate/${m.slug}`}>
                    {m.tagline}
                  </RetroCard>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CreamBand>

      {/* The ownership promise — the reason to migrate HERE rather than sideways. */}
      <InkPanel>
        <div className="mx-auto max-w-4xl px-6 py-16 text-center sm:py-20">
          <RetroBadge tone="gold">Your Infrastructure</RetroBadge>
          <h2 className="font-display mt-5 text-3xl font-extrabold leading-tight text-[var(--retro-cream)] sm:text-4xl">
            We Set It Up On Your Hosting. No Forever Fees.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            Most migrations just move you from one subscription to another, and the meter starts
            again on the far side. This one doesn’t have to. SimplerDevelopment is Apache-2.0 and
            self-hostable, so we deploy it onto your hosting and your database, move your data in,
            hand over the credentials, and step back. From then on you pay your infrastructure
            provider — not a per-seat licence to us, and not a bill that grows every time your list
            or your team does.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            Prefer not to run it? Managed hosting is available. The difference is that it stays a
            choice — the code is yours under an open licence either way, and so is the data.
          </p>
          <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
            {[
              ['You own the deployment', 'Your host, your Postgres, your domain, your credentials.'],
              ['You own the code', 'Apache-2.0. Fork it, extend it, hire someone else to.'],
              ['You can leave', 'Export the data and walk. No exit fee, nothing held hostage.'],
            ].map(([label, note]) => (
              <div
                key={label}
                className="border-t border-[color-mix(in_srgb,var(--retro-cream)_25%,transparent)] pt-4"
              >
                <p className="font-display text-sm font-bold text-[var(--retro-cream)]">{label}</p>
                <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--retro-cream)_75%,transparent)]">
                  {note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </InkPanel>

      {/* Process — identical whatever you're coming from, so it lives here. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Flight Sequence"
          title="How A Migration Runs."
          subtitle="Four stages, and you see working software from the second one — not a status deck."
        />
        <ol className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {process.map((step, i) => (
            <li key={step.title}>
              <div className="font-display flex h-9 w-9 items-center justify-center rounded-full border border-[var(--retro-mid)] text-xs font-bold text-[var(--retro-mid)]">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="font-display mt-4 text-lg font-bold text-[var(--retro-ink)]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </CreamBand>

      {/* Honesty band, matching /compare and every child page. */}
      <InkPanel>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <SectionHeading eyebrow="Honest Log Entry" title="We’ll Talk You Out Of It." onDark />
          <p className="text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            Every product page here carries a line saying when you should stay where you are, and
            we mean them. If your one tool does its one job well and nothing else in your business
            needs to talk to it, consolidating is a cost with no return. Migration pays off when
            you are running several tools that should share data and don’t — and the audit is where
            we tell you which of those two you are.
          </p>
        </div>
      </InkPanel>

      {/* Conversion. Same QuoteForm and endpoint as every other page. */}
      <CreamBand id="quote">
        <SectionHeading
          eyebrow="Open A Channel"
          title="Get A Migration Quote."
          subtitle="Tell us what you’re on now and roughly how big it is. You’ll get a fixed scope and a fixed price back, usually within one working day."
        />
        <div className="mx-auto max-w-2xl">
          <RetroCard title="Tell Us What You’re Coming From" icon="crew-man-tablet">
            <QuoteForm />
          </RetroCard>
        </div>
      </CreamBand>

      {/* FAQ — visible, non-accordion, verbatim match to generateFAQSchema. */}
      <InkPanel>
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <SectionHeading eyebrow="Transmissions In" title="Migration, Answered." onDark />
          <dl className="space-y-8">
            {faqs.map((f) => (
              <div
                key={f.question}
                className="border-b border-[color-mix(in_srgb,var(--retro-cream)_20%,transparent)] pb-8 last:border-0"
              >
                <dt className="font-display text-lg font-bold text-[var(--retro-cream)]">
                  {f.question}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                  {f.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </InkPanel>

      <CreamBand>
        <p className="text-center text-sm text-[color-mix(in_srgb,var(--retro-ink)_65%,transparent)]">
          Coming from something not listed?{' '}
          <Link href="/contact" className="font-bold text-[var(--retro-orange)] hover:underline">
            Tell us what it is
          </Link>{' '}
          — we have moved people off {all.length} platforms and counting.
        </p>
      </CreamBand>

      <CTABanner
        title="Ready To Change Orbit?"
        subtitle="Get a fixed scope and a fixed price, or read how the platform is put together first."
        primary={{ href: '#quote', label: 'Get A Migration Quote' }}
        secondary={{ href: '/solutions', label: 'Explore The Platform' }}
        art="rocket"
      />
    </>
  );
}
