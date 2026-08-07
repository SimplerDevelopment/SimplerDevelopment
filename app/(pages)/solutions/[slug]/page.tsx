import { getSolutionBySlug, getAllSolutions } from '@/lib/data/solutions';
import { getSolutionScreenshots } from '@/lib/data/solution-screenshots';
import { generateSEO } from '@/lib/utils/seo';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { SolutionGallery } from '@/components/solutions/SolutionGallery';
import { MaintenanceNotice, SOLUTIONS_UNDER_MAINTENANCE } from '@/components/marketing/MaintenanceNotice';
import { StructuredData } from '@/components/seo/StructuredData';
import {
  generateSoftwareApplicationSchema,
  generateBreadcrumbListSchema,
} from '@/lib/utils/structured-data';
import { siteConfig } from '@/config/site';
import { PageHeader, CTABanner, CreamBand } from '@/components/retro/sections';
import { SectionHeading, RetroButton, InkPanel, Star } from '@/components/retro/primitives';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const solutions = getAllSolutions();
  return solutions.map((solution) => ({ slug: solution.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const solution = getSolutionBySlug(slug);

  if (!solution) {
    return { title: 'Solution Not Found' };
  }

  return generateSEO({
    title: solution.title,
    description: solution.description,
    path: `/solutions/${slug}`,
  });
}

export default async function SolutionPage({ params }: PageProps) {
  if (SOLUTIONS_UNDER_MAINTENANCE) return <MaintenanceNotice />;
  const { slug } = await params;
  const solution = getSolutionBySlug(slug);

  if (!solution) {
    notFound();
  }

  const allSolutions = getAllSolutions();
  const otherSolutions = allSolutions.filter((s) => s.slug !== slug);
  const screenshots = getSolutionScreenshots(slug);

  const solutionUrl = `${siteConfig.url}/solutions/${solution.slug}`;
  const solutionAppSchema = {
    ...generateSoftwareApplicationSchema(),
    name: solution.title,
    description: solution.description,
    url: solutionUrl,
    featureList: solution.features,
    offers: undefined,
  };
  const breadcrumbSchema = generateBreadcrumbListSchema([
    { name: 'Home', item: siteConfig.url },
    { name: 'Solutions', item: `${siteConfig.url}/solutions` },
    { name: solution.title, item: solutionUrl },
  ]);

  return (
    <>
      <StructuredData data={[solutionAppSchema, breadcrumbSchema]} />
      <div className="min-h-screen">
        {/* Breadcrumb strip — sits flush against PageHeader below, both ink. */}
        <InkPanel className="border-b border-[color-mix(in_srgb,var(--retro-cream)_15%,transparent)]">
          <div className="mx-auto flex max-w-4xl items-center gap-2 px-6 py-3 text-xs">
            <Link
              href="/solutions"
              className="text-[color-mix(in_srgb,var(--retro-cream)_70%,transparent)] hover:text-[var(--retro-gold)]"
            >
              Solutions
            </Link>
            <span aria-hidden className="text-[color-mix(in_srgb,var(--retro-cream)_50%,transparent)]">
              →
            </span>
            <span className="font-semibold text-[var(--retro-gold)]">{solution.badge}</span>
          </div>
        </InkPanel>

        <PageHeader eyebrow={solution.badge} title={solution.title} subtitle={solution.description} />

        {/* Hero body — CTAs plus real product screenshots (or a placeholder
            panel on the rare solution with none yet). Screenshot data/color
            prop flow into SolutionGallery unchanged; that component lives
            outside this page and owns its own styling contract. */}
        <CreamBand>
          <div className="flex flex-wrap justify-center gap-3">
            <RetroButton href="/contact" variant="primary" icon="rocket">
              Book a Consultation
            </RetroButton>
            <RetroButton href="/docs" variant="secondary">
              Read the Docs
            </RetroButton>
          </div>

          {screenshots.length > 0 ? (
            <div className="mt-14">
              <SolutionGallery images={screenshots} color={solution.color} label={solution.title} />
            </div>
          ) : (
            <div className="mt-14 flex justify-center">
              <div className="flex h-56 w-56 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-deep)]">
                <Image src="/retro/control-console.webp" alt="" width={200} height={200} className="h-32 w-32 object-contain" />
              </div>
            </div>
          )}
        </CreamBand>

        {/* What We Offer */}
        <InkPanel>
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <SectionHeading
              eyebrow="Standard Equipment"
              title="What We Offer"
              subtitle="Every capability this module ships with — nothing held back for a higher tier."
              onDark
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {solution.features.map((feature, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-[color-mix(in_srgb,var(--retro-gold)_25%,transparent)] bg-[var(--retro-deep)] p-4"
                >
                  <Star className="mt-1 h-3 w-3 shrink-0 text-[var(--retro-gold)]" />
                  <span className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_90%,transparent)]">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </InkPanel>

        {/* Benefits */}
        <CreamBand>
          <SectionHeading
            eyebrow="Why It Matters"
            title="The Outcomes You Can Expect"
            subtitle="What changes for a crew once this module goes live."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            {solution.benefits.map((benefit, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-cream)] p-6"
              >
                <Star className="mt-1 h-4 w-4 shrink-0 text-[var(--retro-orange)]" />
                <p className="text-base leading-relaxed text-[var(--retro-ink)]">{benefit}</p>
              </div>
            ))}
          </div>
        </CreamBand>

        {/* Process */}
        <InkPanel>
          <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
            <SectionHeading
              eyebrow="Flight Plan"
              title="Our Process"
              subtitle="A clear, collaborative approach from start to finish."
              onDark
            />
            <div className="space-y-6">
              {solution.process.map((step, i) => (
                <div
                  key={i}
                  className="flex gap-5 border-b border-[color-mix(in_srgb,var(--retro-cream)_15%,transparent)] pb-6 last:border-b-0 last:pb-0"
                >
                  <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--retro-gold)] text-sm font-bold text-[var(--retro-gold)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </InkPanel>

        {/* Other Solutions — real other slugs/badges, unchanged. */}
        <CreamBand>
          <SectionHeading
            eyebrow="Explore The Fleet"
            title="Other Solutions"
            subtitle="See how our modules work together to support your business."
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {otherSolutions.map((other) => (
              <Link
                key={other.slug}
                href={`/solutions/${other.slug}`}
                className="rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-cream)] p-5 text-center transition-colors hover:border-[var(--retro-mid)]"
              >
                <span className="font-display text-sm font-bold text-[var(--retro-ink)]">{other.badge}</span>
              </Link>
            ))}
          </div>
        </CreamBand>

        <CTABanner
          title="Ready For Liftoff?"
          subtitle={`Let's talk about how ${solution.badge.toLowerCase()} fits your mission.`}
          primary={{ href: '/contact', label: 'Book a Consultation' }}
          secondary={{ href: '/docs', label: 'Read the Docs' }}
          art="rocket"
        />
      </div>
    </>
  );
}
