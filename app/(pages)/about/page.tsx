import Image from 'next/image';
import { generateSEO } from '@/lib/utils/seo';
import { solutions } from '@/lib/data/solutions';
import { PageHeader, CreamBand, InkPanel, CTABanner } from '@/components/retro/sections';
import { SectionHeading, StatBlock, OrbitDivider } from '@/components/retro/primitives';

export const metadata = generateSEO({
  title: 'About Us',
  description:
    'Simpler Development replaces the stack of disconnected tools small businesses juggle — website, email, CRM, booking, projects — with one platform, backed by a team that helps you use it.',
  path: '/about',
});

// Skinned in the retro-future design system — see components/retro/. Voice is
// mid-century mission-control: confident, a little wry, never cute at the
// expense of what's actually true. Facts (module count, client count, years,
// uptime) are unchanged from the pre-retro copy; only how they're said moved.

// Derived, not hardcoded: `lib/data/solutions.ts` is the canonical product
// surface (it drives /solutions and the footer). A hardcoded count here would
// silently go stale the moment a solution is added or removed, and this page
// asserts it as a fact to prospects.
const TOOL_COUNT = solutions.length;

const record = [
  { value: String(TOOL_COUNT), label: 'Integrated tools' },
  { value: '40+', label: 'Clients served' },
  { value: '16+', label: 'Years building' },
  { value: '99.9%', label: 'Uptime' },
];

// `art` maps each value to an available /public/retro asset — chosen for
// association (atom = elegant simplicity, shield = ownership/protection,
// headset = a real team on the line, console = deliberate craft), not decor.
const values = [
  {
    id: 'simplicity',
    key: 'Simplicity',
    title: 'Elegant over complex',
    body: 'We replace a stack of disconnected tools with one platform that just works.',
    art: 'atom-emblem',
  },
  {
    id: 'ownership',
    key: 'Ownership',
    title: 'Your data, your brand',
    body: 'Tools you control, not walled gardens that hold your business hostage.',
    art: 'shield-rocket',
  },
  {
    id: 'partnership',
    key: 'Partnership',
    title: 'A real team',
    body: 'Not a faceless SaaS. Every client gets designers and developers who know their business.',
    art: 'crew-woman-headset',
  },
  {
    id: 'craft',
    key: 'Craft',
    title: 'Quality over hype',
    body: 'Every feature built with care. We ship polish, not quantity.',
    art: 'control-console',
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="Mission Briefing · About"
        title="One Platform. One Crew."
        subtitle="We built the all-in-one platform we wished existed, then paired it with a full-service agency so you're never flying solo."
      />

      {/* Why we built this — the narrative, left-aligned like a mission log. */}
      <CreamBand>
        <SectionHeading
          align="left"
          eyebrow="Why We Built This"
          title={
            <>
              Five Tabs. Five Bills.
              <br />
              <span className="text-[var(--retro-orange)]">Nothing Talking To Anything.</span>
            </>
          }
          subtitle={
            <>
              Squarespace for the site, Mailchimp for email, Calendly for booking, HubSpot for the
              CRM, Asana for projects — that&apos;s the stack most businesses end up flying. We
              replaced it with {TOOL_COUNT} integrated tools under one login, backed by a crew
              that actually helps you use it. A lead from your site enters the CRM, gets a welcome
              email, and can book a call. No Zapier in the middle.
            </>
          }
        />
      </CreamBand>

      {/* The record — same four facts as always, just in the launch-metrics format. */}
      <CreamBand className="!py-10 sm:!py-12">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {record.map((r) => (
            <StatBlock key={r.label} value={r.value} label={r.label} />
          ))}
        </div>
      </CreamBand>

      <OrbitDivider />

      {/* What we stand for. */}
      <InkPanel>
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="What We Stand For"
            title="Four Things We Don't Trade Away."
            onDark
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <div
                key={v.id}
                className="rounded-md border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[var(--retro-deep)] p-6"
              >
                <Image
                  src={`/retro/${v.art}.webp`}
                  alt=""
                  width={160}
                  height={160}
                  className="h-14 w-14 object-contain"
                />
                <span className="eyebrow mt-4 block">{v.key}</span>
                <h3 className="font-display mt-2 text-base font-bold text-[var(--retro-cream)]">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                  {v.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </InkPanel>

      <CTABanner
        title="See What It Looks Like For Your Business."
        subtitle="Ready when you are."
        primary={{ href: '/contact', label: 'Book A Consultation' }}
        secondary={{ href: '/solutions', label: 'See The Modules' }}
        art="crew-woman-waving"
      />
    </>
  );
}
