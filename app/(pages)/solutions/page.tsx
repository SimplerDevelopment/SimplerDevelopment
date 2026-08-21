import Image from 'next/image';
import { getAllSolutions } from '@/lib/data/solutions';
import { getSolutionArt } from '@/lib/data/solution-art';
import { generateSEO } from '@/lib/utils/seo';
import { MaintenanceNotice, SOLUTIONS_UNDER_MAINTENANCE } from '@/components/marketing/MaintenanceNotice';
import { PageHeader, CTABanner, CreamBand } from '@/components/retro/sections';
import { SectionHeading, RetroCard, InkPanel } from '@/components/retro/primitives';

export const metadata = generateSEO({
  title: 'Platform Features',
  description: 'Website builder, online store, publishing & content calendar, email marketing, CRM, contracts & e-signature, booking, surveys, A/B experiments, project management, help desk, Company Brain AI, AI chatbot, automations, white-label agency, and more — 18 tools in one platform',
  path: '/solutions',
});

const NUMBER_WORDS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen', 'Twenty', 'Twenty-One', 'Twenty-Two', 'Twenty-Three', 'Twenty-Four',
];
const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

// Generic supporting copy — not one of the 18 real modules, so voice is fair
// game here in a way it isn't for solution.title/description below. Art picks
// from the fixed /public/retro set; there's no per-item icon library.
const valueProps = [
  {
    title: 'One Dashboard',
    description: 'Run your website, email, CRM, bookings, and projects from a single console — one login, no tab-switching between six tools.',
    art: 'control-console',
  },
  {
    title: 'Connected Data',
    description: 'New leads route straight into your CRM, trigger emails, and book calls — automatically, no manual patching between systems.',
    art: 'satellite-dish',
  },
  {
    title: 'Agency Support',
    description: 'Not just software. Real designers and developers standing by whenever you need a hand.',
    art: 'crew-woman-headset',
  },
];

export default function SolutionsPage() {
  if (SOLUTIONS_UNDER_MAINTENANCE) return <MaintenanceNotice />;
  const solutions = getAllSolutions();
  const toolCount = solutions.length;

  return (
    <div>
      <PageHeader
        eyebrow="The Full Manifest"
        title="Everything The Mission Requires."
        subtitle={
          <>
            {numberWord(toolCount)} integrated modules that replace your entire SaaS stack — websites, stores, a
            content calendar, email, CRM, booking, surveys, A/B testing, projects, a help desk, an AI Company
            Brain, white-label agency, and more, all flying in formation from one dashboard.
          </>
        }
      />

      {/* The 18 real, shipping modules — titles/descriptions/hrefs come straight
          from lib/data/solutions.ts and are never rewritten here. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Platform Modules"
          title="Eighteen Systems. One Console."
          subtitle="Every module below ships in the box, on the same account, under the same login."
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {solutions.map((solution, i) => (
            <RetroCard
              key={solution.slug}
              title={solution.title}
              index={i + 1}
              href={`/solutions/${solution.slug}`}
              media={getSolutionArt(solution.slug)}
            >
              {solution.description}
            </RetroCard>
          ))}
        </div>
      </CreamBand>

      <InkPanel>
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="All-In-One"
            title={`Why One Console Beats ${numberWord(toolCount - 1)} Logins`}
            subtitle="Everything connected, everything managed, everything flying under one flight plan."
            onDark
          />
          <div className="grid gap-5 sm:grid-cols-3">
            {valueProps.map((v) => (
              <div
                key={v.title}
                className="rounded-md border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[var(--retro-deep)] p-6"
              >
                <Image src={`/retro/${v.art}.webp`} alt="" width={160} height={160} className="h-14 w-14 object-contain" />
                <h3 className="font-display mt-4 text-base font-bold text-[var(--retro-cream)]">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </InkPanel>

      <CTABanner
        title="Ready To Fly The Whole Mission?"
        subtitle="Book a free consultation and we'll walk you through the platform — see exactly how it runs for your business."
        primary={{ href: '/contact', label: 'Book a Consultation' }}
        secondary={{ href: '/docs', label: 'Read the Docs' }}
        art="astronaut-pointing"
      />
    </div>
  );
}
