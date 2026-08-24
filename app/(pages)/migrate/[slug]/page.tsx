import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
  getMigrationBySlug,
  CATEGORY_LABELS,
  type MigrationSource,
} from '@/lib/data/migrations';
import { getSolutionBySlug } from '@/lib/data/solutions';

/**
 * /migrate/<slug> — one page per source product we migrate people off.
 *
 * Templated from lib/data/migrations.ts on purpose: "migrate from HubSpot" and
 * "migrate from WordPress" are separate head terms, and a single generic
 * /migrate page cannot rank for both. Adding a competitor is a data entry.
 *
 * Structure mirrors app/(pages)/solutions/[slug]/page.tsx — generateStaticParams
 * + generateMetadata + notFound() — so the two templated trees behave the same.
 *
 * Two things here are load-bearing and easy to erode:
 *
 * 1. The "what doesn't come across" band is not boilerplate. It is the most
 *    useful band on the page for a buyer mid-evaluation, and it is what keeps
 *    these pages from claiming importers that do not exist. See the
 *    truthfulness rule at the top of lib/data/migrations.ts before editing any
 *    `how` string.
 *
 * 2. The ownership band ("no forever fees") is the commercial differentiator
 *    and is only true because the platform is Apache-2.0 and self-hostable. It
 *    says you pay your host rather than that hosting is free — infrastructure
 *    still costs money, and overclaiming there would be the one thing on these
 *    pages a prospect could catch us out on.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllMigrations().map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const source = getMigrationBySlug(slug);
  if (!source) return { title: 'Migration Not Found' };

  return generateSEO({
    title: `Migrate From ${source.name} To SimplerDevelopment`,
    description: source.description,
    path: `/migrate/${slug}`,
  });
}

/** Question-shaped, answer-first, and per-product — the AEO payload. */
function buildFaqs(source: MigrationSource): { question: string; answer: string }[] {
  return [
    {
      question: `How do I migrate from ${source.name} to SimplerDevelopment?`,
      answer: `We do it for you. You export from ${source.name} (or give us access), we import and rebuild inside SimplerDevelopment, you review it on a staging URL, and we cut over with redirects in place. ${source.timeline}. You get a fixed scope and a fixed price before any work starts.`,
    },
    {
      question: `What does a ${source.name} migration cost?`,
      answer: `It depends on size — page count, record count, and how much custom behaviour has to be rebuilt rather than moved. We quote each migration against its own scope after looking at your actual ${source.name} account, and that price does not move once agreed. Send the details through the form on this page and you will normally have a number back within one working day.`,
    },
    {
      question: `Will I lose my search rankings moving off ${source.name}?`,
      answer: 'That is the risk we plan around first. Slugs are preserved wherever possible, everything else is mapped to a redirect, and metadata and structured data move with the content. Rankings normally settle within a few weeks; a migration that skips the redirect map is the one that loses traffic.',
    },
    {
      question: `What does not transfer from ${source.name}?`,
      answer: `${source.caveats[0]}. We tell you this before you commit rather than after, and anything that has to be rebuilt is priced in the quote instead of appearing as a surprise mid-project.`,
    },
    {
      question: 'Do I have to keep paying you after the migration?',
      answer: 'No. SimplerDevelopment is Apache-2.0 and self-hostable, so we can stand it up on your own hosting and your own database and hand over the keys. After that you pay your infrastructure provider, not a licence fee to us. If you would rather we ran it, managed hosting is available — but it is a choice, not a condition.',
    },
  ];
}

export default async function MigrationPage({ params }: PageProps) {
  const { slug } = await params;
  const source = getMigrationBySlug(slug);
  if (!source) notFound();

  const others = getAllMigrations().filter((m) => m.slug !== slug);
  const faqs = buildFaqs(source);

  const schema = [
    generateServiceSchema(
      `${source.name} to SimplerDevelopment migration`,
      source.description,
      'Website and CRM migration'
    ),
    generateFAQSchema(faqs),
    generateBreadcrumbListSchema([
      { name: 'Home', item: '/' },
      { name: 'Migrate', item: '/migrate' },
      { name: source.name, item: `/migrate/${source.slug}` },
    ]),
  ];

  return (
    <>
      <StructuredData data={schema} />

      <PageHeader
        eyebrow={`${CATEGORY_LABELS[source.category]} Migration`}
        title={`Migrate From ${source.name}.`}
        subtitle={source.tagline}
      />

      {/* Why people leave. Answer-first paragraph, then the specifics. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Flight Check"
          title={`Why Teams Move Off ${source.name}.`}
          subtitle={`These are the reasons people actually give us — not every one will be yours, and if none of them are, ${source.name} is probably still the right tool.`}
        />
        <ul className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {source.reasons.map((r) => (
            <li key={r} className="flex gap-3">
              <Star className="mt-1 h-3 w-3 shrink-0 text-[var(--retro-gold)]" />
              <span className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_78%,transparent)]">
                {r}
              </span>
            </li>
          ))}
        </ul>
      </CreamBand>

      {/* Ownership. The commercial differentiator, and the reason a migration
          here is not just swapping one subscription for another. */}
      <InkPanel>
        <div className="mx-auto max-w-4xl px-6 py-16 text-center sm:py-20">
          <RetroBadge tone="gold">Your Infrastructure</RetroBadge>
          <h2 className="font-display mt-5 text-3xl font-extrabold leading-tight text-[var(--retro-cream)] sm:text-4xl">
            We Set It Up On Your Hosting. No Forever Fees.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            SimplerDevelopment is Apache-2.0 and self-hostable, so a migration does not have to end
            with you renting your own business back. We stand the platform up on your hosting and
            your database, move your data into it, hand over the keys, and leave. After that you
            pay your infrastructure provider — not a per-seat licence to us, and not a fee that
            climbs every time your list or your team grows.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            If you would rather not run it yourself, we offer managed hosting too. That is a choice
            you can reverse — the code is yours either way, and so is the data.
          </p>
          <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
            {[
              ['You own the deployment', 'Your host, your Postgres, your domain.'],
              ['You own the code', 'Apache-2.0 — fork it, extend it, keep it.'],
              ['You can leave', 'Export the data and go. No exit fee, no hostage.'],
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

      {/* What moves. Table markup matches /compare so the pages read as a system. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Cargo Manifest"
          title="What Moves, And Where It Lands."
          subtitle={`Every row below is something we actually move out of ${source.name}, and how it gets there.`}
        />
        <div className="overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_40%,transparent)]">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr]">
            <div className="hidden bg-[var(--retro-cream)] p-5 font-display text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-ink)] md:block">
              From {source.name}
            </div>
            <div className="hidden border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-orange)_10%,var(--retro-cream))] p-5 font-display text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-orange)] md:block">
              Lands In
            </div>
            <div className="hidden border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[var(--retro-cream)] p-5 font-display text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-ink)] md:block">
              How
            </div>
            {source.moves.map((m) => (
              <div key={m.item} className="contents">
                <div className="border-t border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-mid)_8%,var(--retro-cream))] p-5 font-display text-sm font-bold text-[var(--retro-ink)]">
                  {m.item}
                </div>
                <div className="border-t border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-orange)_6%,var(--retro-cream))] p-5 text-sm text-[var(--retro-ink)]">
                  <span className="mb-1 block font-display text-xs font-bold uppercase tracking-wide text-[var(--retro-orange)] md:hidden">
                    Lands in
                  </span>
                  {m.lands}
                </div>
                <div className="border-t border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] p-5 text-sm text-[color-mix(in_srgb,var(--retro-ink)_72%,transparent)]">
                  <span className="mb-1 block font-display text-xs font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--retro-ink)_55%,transparent)] md:hidden">
                    How
                  </span>
                  {m.how}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-[color-mix(in_srgb,var(--retro-ink)_65%,transparent)]">
          {source.timeline}. Scope and price are fixed before we start.
        </p>
      </CreamBand>

      {/* The honest half. Do not quietly delete this band. */}
      <InkPanel>
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Honest Log Entry"
            title="What Doesn’t Come Across."
            subtitle="Every migration loses something. Here is what, so you hear it from us now rather than discover it in week three."
            onDark
          />
          <ul className="space-y-4">
            {source.caveats.map((c) => (
              <li key={c} className="flex gap-3">
                <Star className="mt-1 h-3 w-3 shrink-0 text-[var(--retro-gold)]" />
                <span className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_80%,transparent)]">
                  {c}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-8 border-t border-[color-mix(in_srgb,var(--retro-cream)_20%,transparent)] pt-6 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_80%,transparent)]">
            <span className="font-display font-bold text-[var(--retro-cream)]">
              Stay on {source.name} if{' '}
            </span>
            {source.stayIf}
          </p>
        </div>
      </InkPanel>

      {/* Where it lands — internal links into the product tree. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Destination"
          title="What You Land In."
          subtitle="A migration is only worth it if the destination is better. These are the modules your data ends up inside — all sharing one database, one login, one bill."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {source.landsIn.map((s) => {
            const solution = getSolutionBySlug(s);
            if (!solution) return null;
            return (
              <RetroCard key={s} title={solution.badge} icon="satellite" href={`/solutions/${s}`}>
                {solution.description.split('. ')[0]}.
              </RetroCard>
            );
          })}
        </div>
      </CreamBand>

      {/* Conversion. Same form as /ai-consulting — one endpoint, one pipeline. */}
      <InkPanel>
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Open A Channel"
            title={`Get A ${source.name} Migration Quote.`}
            subtitle={`Tell us roughly how big the ${source.name} account is and what matters most to keep. You will get a fixed scope and a fixed price back, usually within one working day.`}
            onDark
          />
          <div className="rounded-md border border-[color-mix(in_srgb,var(--retro-cream)_25%,transparent)] bg-[var(--retro-cream)] p-6 text-[var(--retro-ink)] sm:p-8">
            <QuoteForm />
          </div>
        </div>
      </InkPanel>

      {/* FAQ — visible, non-accordion, matching generateFAQSchema verbatim. */}
      <CreamBand>
        <SectionHeading eyebrow="Transmissions In" title={`${source.name} Migration, Answered.`} />
        <dl className="mx-auto max-w-3xl space-y-8">
          {faqs.map((f) => (
            <div
              key={f.question}
              className="border-b border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] pb-8 last:border-0"
            >
              <dt className="font-display text-lg font-bold text-[var(--retro-ink)]">{f.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]">
                {f.answer}
              </dd>
            </div>
          ))}
        </dl>
      </CreamBand>

      {/* Sibling links — crawl paths between the templated pages. */}
      <InkPanel>
        <div className="mx-auto max-w-7xl px-6 py-14">
          <p className="eyebrow eyebrow--on-ink flex items-center gap-3">
            <Star className="h-3 w-3" />
            Coming From Something Else?
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/migrate/${o.slug}`}
                className="rounded border border-[color-mix(in_srgb,var(--retro-cream)_35%,transparent)] px-4 py-2 text-sm text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)] transition-colors hover:border-[var(--retro-gold)] hover:text-[var(--retro-gold)]"
              >
                {o.name}
              </Link>
            ))}
          </div>
        </div>
      </InkPanel>

      <CTABanner
        title="Not Sure It’s Worth The Move?"
        subtitle="Tell us what you have. If staying put is the right call, we’ll say so."
        primary={{ href: '/migrate', label: 'See All Migrations' }}
        secondary={{ href: '/solutions', label: 'Explore The Platform' }}
        art="mission-control-ai"
      />
    </>
  );
}

export const dynamicParams = false;
