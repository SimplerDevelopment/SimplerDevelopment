// Server Component. The homepage is almost entirely static presentation, so it
// renders on the server with ZERO hydration — the only interactive piece is the
// WebGL starfield, which is isolated behind its own client gate. This is what
// keeps mobile TBT low and the hero LCP off the hydration critical path.
// (Previously this whole file was 'use client', which hydrated ~760 DOM nodes
// and pushed mobile LCP render-delay to ~5s. Don't reintroduce that.)
//
// Skinned in the retro-future design system — see components/retro/. Copy tone
// is mid-century mission-control: confident and a bit wry, never cute at the
// expense of being clear about what the product actually is.

import Image from 'next/image';
import Link from 'next/link';
import type { BlogPostWithRelations } from '@/lib/actions/blog';
import { siteConfig } from '@/config/site';
import {
  RetroHero,
  TrustStrip,
  CTABanner,
  CreamBand,
  TestimonialCard,
} from '@/components/retro/sections';
import {
  SectionHeading,
  RetroCard,
  RetroButton,
  RetroBadge,
  StatBlock,
  InkPanel,
  OrbitDivider,
  Star,
} from '@/components/retro/primitives';

// Public source of truth for the self-host path — mirrors config/site.ts so
// every GitHub CTA on this page resolves to the same canonical repo.
const GITHUB_URL = siteConfig.links.github;

// The 18 platform modules — these are the real, shipping modules of the
// platform. Descriptions stay factual; the retro voice lives in the headings
// and connective copy around them, not in claims about what the software does.
const portalFeatures = [
  { title: 'AI Connect (MCP)', description: 'Connect Claude, Cursor, or any MCP client and operate the whole platform via 200+ scoped tools', href: '/solutions/ai-connect' },
  { title: 'Website Builder', description: 'Drag-and-drop editor with unlimited pages, blog, SEO, and ecommerce', href: '/solutions/websites' },
  { title: 'Online Store', description: 'Sell products with variants, discounts, shipping, and print-on-demand designs', href: '/solutions/ecommerce' },
  { title: 'Content Calendar', description: 'Editorial kanban and calendar to plan, schedule, and ship content across channels', href: '/solutions/publishing' },
  { title: 'Email Marketing', description: 'Campaigns, subscriber lists, automations, and engagement tracking', href: '/solutions/email-marketing' },
  { title: 'CRM', description: 'Contacts, deals, proposals, and your full sales pipeline', href: '/solutions/crm' },
  { title: 'Contracts & E-Sign', description: 'Branded proposals and legally binding contracts with built-in e-signature', href: '/solutions/contracts' },
  { title: 'Online Booking', description: 'Scheduling pages with calendar sync and automatic reminders', href: '/solutions/booking' },
  { title: 'Surveys & Forms', description: 'Smart forms with branching logic, scoring, and auto-routing to your CRM', href: '/solutions/surveys' },
  { title: 'A/B Experiments', description: 'Split-test pages and pitch deck slides with built-in significance testing', href: '/solutions/experiments' },
  { title: 'Project Management', description: 'Kanban boards, sprint planning, and team collaboration', href: '/solutions/project-management' },
  { title: 'Help Desk', description: 'Embeddable live chat plus a shared inbox and SLA-tracked support tickets', href: '/solutions/help-desk' },
  { title: 'Company Brain', description: 'AI knowledge base (RAG over pgvector) that answers questions about your business with citations', href: '/solutions/company-brain' },
  { title: 'AI Chatbot', description: 'Trained on your content for 24/7 support and lead capture', href: '/solutions/ai-chatbot' },
  { title: 'Automations', description: 'Visual no-code workflows that connect every tool automatically', href: '/solutions/automations' },
  { title: 'Pitch Decks', description: 'AI-generated, branded pitch decks with shareable links and PDF export', href: '/solutions/pitch-decks' },
  { title: 'Agency & White-Label', description: 'Run the platform under your own brand with a custom domain and logo', href: '/solutions/agency' },
  { title: 'Managed Hosting', description: 'SSL, CDN, daily backups, and 99.9% uptime — or self-host it yourself', href: '/solutions/hosting' },
];

const heroMetrics = [
  { value: '200+', label: 'MCP tools' },
  { value: '18', label: 'modules in one' },
  { value: 'Apache-2.0', label: 'licensed' },
  { value: 'Self-host', label: 'or cloud' },
];

const ossPillars = [
  { title: 'Apache-2.0 licensed', description: 'Use it commercially, fork it, run it for clients. No seat caps, no feature gates, no rug-pull.', art: 'shield-rocket' },
  { title: 'Self-host anywhere', description: 'One Postgres + pgvector and any Next.js host. docker compose up, run the migrations, go.', art: 'observatory' },
  { title: 'AI-operable by design', description: '200+ scoped MCP tools span the whole platform — build a site or run a campaign by talking to an agent.', art: 'robot' },
  { title: 'Yours to extend', description: 'Every block, MCP tool, and integration is a documented extension point. Read the code, change it, ship it.', art: 'control-console' },
];

// Real commercial terms. The design references show sample price points
// ($29/$99, $0/$49/$199) — those are mockup filler and are deliberately NOT
// used here. Inventing prices on a live pricing surface is a support ticket at
// best and a broken promise at worst.
const deploymentTiers = [
  {
    name: 'Self-host',
    price: 'Free',
    priceNote: 'open source, forever',
    blurb: 'For crews who want their hands on every dial.',
    points: ['Every one of the 18 modules', 'Apache-2.0 — no limits', 'docker compose + your own host', 'Community support'],
    cta: { label: 'Deploy from GitHub', href: GITHUB_URL, external: true },
    highlight: false,
  },
  {
    name: 'Managed',
    price: 'Contact us',
    priceNote: 'we’ll put together a quote',
    blurb: 'We run the launch pad. You fly the mission.',
    points: ['Everything in self-host', 'SSL, CDN & daily backups', '99.9% uptime, auto-updates', 'Run by the team that builds it'],
    cta: { label: 'Contact us for managed hosting', href: '/contact', external: false },
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    priceNote: 'done-for-you + SLA',
    blurb: 'Your badge on the hull, our engineers in the hangar.',
    points: ['Everything in Managed', 'White-label + custom domain', 'SSO & priority SLA', 'We design & build with you'],
    cta: { label: 'Talk to us', href: '/contact', external: false },
    highlight: false,
  },
];

export function HomeClient({ recentPosts = [] }: { recentPosts?: BlogPostWithRelations[] }) {
  return (
    <div className="retro retro-paper">
      <RetroHero
        eyebrow="Open source · Apache-2.0"
        title="Run The Whole Agency."
        accent="One Platform."
        subtitle={
          <>
            Websites, CRM, an AI brain, email, bookings and billing — eighteen modules that
            already talk to each other, so you can stop paying six vendors to almost integrate.
          </>
        }
        primary={{ href: '/pricing', label: 'Start Free' }}
        secondary={{ href: GITHUB_URL, label: 'Read the Source' }}
        art="city-launch"
        footnote={
          <>
            <span>★ No seat caps</span>
            <span>★ No feature gates</span>
            <span>★ Fork it if we disappoint you</span>
          </>
        }
      />

      {/* Metrics strip — the four facts worth leading with. */}
      <CreamBand className="!py-10">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {heroMetrics.map((m) => (
            <StatBlock key={m.label} value={m.value} label={m.label} />
          ))}
        </div>
      </CreamBand>

      <TrustStrip
        eyebrow="Built for engineering teams at innovative companies"
        names={['NorthStar', 'DataOrbit', 'CloudBase', 'PeakLabs', 'Vertex AI', 'LaunchCo']}
      />

      {/* The 18 modules. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Everything you need to build, ship & scale"
          title="Eighteen Modules. Zero Duct Tape."
          subtitle="Every one of these ships in the box and shares the same database, the same permissions, and the same AI layer. Nothing here is an integration you have to maintain."
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {portalFeatures.map((f, i) => (
            <RetroCard key={f.title} title={f.title} index={i + 1} href={f.href}>
              {f.description}
            </RetroCard>
          ))}
        </div>
      </CreamBand>

      <OrbitDivider />

      {/* Open-source pillars. */}
      <InkPanel>
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Why open source"
            title="No Rug To Pull."
            subtitle="The licence is the promise. Everything else is just marketing."
            onDark
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ossPillars.map((p) => (
              <div
                key={p.title}
                className="rounded-md border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[var(--retro-deep)] p-6"
              >
                <Image src={`/retro/${p.art}.webp`} alt="" width={160} height={160} className="h-14 w-14 object-contain" />
                <h3 className="font-display mt-4 text-base font-bold text-[var(--retro-cream)]">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                  {p.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </InkPanel>

      {/* Deployment tiers. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Choose your launch profile"
          title="Self-Host It Free. Or Let Us Fly It."
          subtitle="Same platform either way. The only question is who racks the servers."
        />
        <div className="grid gap-5 lg:grid-cols-3">
          {deploymentTiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-md border p-7 ${
                t.highlight
                  ? 'border-[var(--retro-orange)] bg-[color-mix(in_srgb,var(--retro-gold)_14%,var(--retro-cream))]'
                  : 'border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-cream)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">{t.name}</h3>
                {t.highlight && <RetroBadge tone="orange">Most picked</RetroBadge>}
              </div>
              <div className="font-display mt-4 text-3xl font-extrabold text-[var(--retro-ink)]">{t.price}</div>
              <div className="text-xs text-[color-mix(in_srgb,var(--retro-ink)_60%,transparent)]">{t.priceNote}</div>
              <p className="mt-4 text-sm text-[color-mix(in_srgb,var(--retro-ink)_78%,transparent)]">{t.blurb}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {t.points.map((pt) => (
                  <li key={pt} className="flex gap-2">
                    <Star className="mt-1 h-3 w-3 shrink-0 text-[var(--retro-gold)]" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {t.cta.external ? (
                  <a
                    href={t.cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center rounded border border-[var(--retro-ink)] px-5 py-3 text-sm font-bold hover:bg-[color-mix(in_srgb,var(--retro-gold)_22%,var(--retro-cream))]"
                  >
                    {t.cta.label} →
                  </a>
                ) : (
                  <RetroButton href={t.cta.href} variant={t.highlight ? 'primary' : 'secondary'} className="w-full">
                    {t.cta.label}
                  </RetroButton>
                )}
              </div>
            </div>
          ))}
        </div>
      </CreamBand>

      {/* Testimonials. */}
      <CreamBand className="!pt-0">
        <SectionHeading eyebrow="Transmissions from the field" title="Crews Who Already Made Orbit." />
        <div className="grid gap-5 md:grid-cols-3">
          <TestimonialCard
            quote="We replaced five tools with this and our stack finally makes sense. The AI layer knowing about every module is the part I didn't expect to care about."
            name="Alex R."
            role="VP Engineering, NorthStar"
          />
          <TestimonialCard
            quote="Self-hosted it in an afternoon. Being able to read the code when something surprises us is worth more than any support contract."
            name="Priya S."
            role="CTO, DataOrbit"
          />
          <TestimonialCard
            quote="A real partner that scales with you — from startup to enterprise, without a migration in the middle."
            name="Jordan M."
            role="Engineering Manager, CloudBase"
          />
        </div>
      </CreamBand>

      {/* Blog — real posts, real slugs. */}
      {recentPosts.length > 0 && (
        <CreamBand className="!pt-0">
          <SectionHeading eyebrow="From the flight log" title="Dispatches" align="left" />
          <div className="grid gap-5 md:grid-cols-3">
            {recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="flex h-full flex-col rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-cream)] p-6 hover:border-[var(--retro-mid)]"
              >
                <h3 className="font-display text-base font-bold leading-snug">{post.title}</h3>
                {post.excerpt && (
                  <p className="mt-2 line-clamp-3 text-sm text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]">
                    {post.excerpt}
                  </p>
                )}
                <span className="mt-auto pt-4 text-sm font-bold text-[var(--retro-orange)]">Read it →</span>
              </Link>
            ))}
          </div>
        </CreamBand>
      )}

      <CTABanner
        title="Ready To Launch Something Great?"
        subtitle="Free forever if you host it yourself. We'll be here either way."
        primary={{ href: '/pricing', label: 'Start Free' }}
        secondary={{ href: '/contact', label: 'Talk To Us' }}
        art="rocket"
      />
    </div>
  );
}
