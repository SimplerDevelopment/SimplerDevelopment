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
//
// The page is a sequence of full-bleed bands alternating cream and ink, and
// each band makes exactly ONE claim. They are listed in components/retro/
// home-sections.tsx; the short version is breadth → inventory → proof →
// agent-operable → licence → terms. Adding a band that repeats a neighbour's
// claim is the failure mode to watch for: an earlier draft had three
// consecutive sections all arguing "it shares one database", which read as one
// point made three times and made the page feel longer than it was.

import Link from 'next/link';
import type { BlogPostWithRelations } from '@/lib/actions/blog';
import { siteConfig } from '@/config/site';
import { RetroHero, CTABanner, CreamBand } from '@/components/retro/sections';
import {
  SectionHeading,
  RetroButton,
  RetroBadge,
  StatBlock,
  InkPanel,
  OrbitDivider,
  Star,
} from '@/components/retro/primitives';
import {
  CrewLanes,
  ModuleManifest,
  MissionControl,
  SignalBand,
  LicencePlate,
  type CrewLane,
  type ManifestModule,
  type SupportPoint,
} from '@/components/retro/home-sections';

// Public source of truth for the self-host path — mirrors config/site.ts so
// every GitHub CTA on this page resolves to the same canonical repo.
const GITHUB_URL = siteConfig.links.github;

// The 18 platform modules — these are the real, shipping modules of the
// platform, and every `href` is a slug that exists in lib/data/solutions.ts.
// Descriptions stay factual; the retro voice lives in the headings and
// connective copy around them, not in claims about what the software does.
//
// Split into lead/rest to give the manifest a hierarchy: the three the platform
// is actually sold on take a larger cell. It is a REORDER of the eighteen, not
// a subset — the running index has to stay contiguous 01..18 because the count
// is the section's whole argument.
const leadModules: ManifestModule[] = [
  {
    title: 'AI Connect (MCP)',
    description: 'Connect Claude, Cursor, or any MCP client and operate the whole platform via 200+ scoped tools',
    href: '/solutions/ai-connect',
    tag: 'Operate it by agent',
  },
  {
    title: 'Company Brain',
    description: 'AI knowledge base (RAG over pgvector) that answers questions about your business with citations',
    href: '/solutions/company-brain',
    tag: 'Answers with citations',
  },
  {
    title: 'Website Builder',
    description: 'Drag-and-drop editor with unlimited pages, blog, SEO, and ecommerce',
    href: '/solutions/websites',
    tag: 'Visual editor',
  },
];

const restModules: ManifestModule[] = [
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
  { title: 'AI Chatbot', description: 'Trained on your content for 24/7 support and lead capture', href: '/solutions/ai-chatbot' },
  { title: 'Automations', description: 'Visual no-code workflows that connect every tool automatically', href: '/solutions/automations' },
  { title: 'Pitch Decks', description: 'AI-generated, branded pitch decks with shareable links and PDF export', href: '/solutions/pitch-decks' },
  { title: 'Agency & White-Label', description: 'Run the platform under your own brand with a custom domain and logo', href: '/solutions/agency' },
  { title: 'Managed Hosting', description: 'SSL, CDN, daily backups, and 99.9% uptime — or self-host it yourself', href: '/solutions/hosting' },
];

// The five verbs below are the five lane titles, in lane order. Keep them in
// step with the section lede — an earlier draft said "remembers" where the lane
// said "Know", and the list stopped reading as a key to the row beneath it.
const crewLanes: CrewLane[] = [
  { title: 'Sell', art: 'crew-woman-waving', blurb: 'CRM, deals, proposals and contracts with e-signature built in.' },
  { title: 'Ship', art: 'crew-man-tablet', blurb: 'Sites, storefront and an editorial calendar on one visual editor.' },
  { title: 'Serve', art: 'crew-woman-headset', blurb: 'Live chat, a shared inbox, SLA-tracked tickets and booking pages.' },
  { title: 'Know', art: 'retro-woman', blurb: 'Company Brain answers from your own content, with citations.' },
  { title: 'Automate', art: 'crew-man-device', blurb: 'Visual workflows, plus 200+ MCP tools any agent can drive.' },
];

const heroMetrics = [
  { value: '200+', label: 'MCP tools' },
  { value: '18', label: 'modules in one' },
  { value: 'Apache-2.0', label: 'licensed' },
  { value: 'Self-host', label: 'or cloud' },
];

const licenceSupport: SupportPoint[] = [
  {
    title: 'Self-host anywhere',
    art: 'observatory',
    body: (
      <>
        One Postgres + pgvector and any Next.js host. <code>docker compose up</code>, run the migrations, go.
      </>
    ),
  },
  {
    title: 'AI-operable by design',
    art: 'robot',
    body: '200+ scoped MCP tools span the whole platform — build a site or run a campaign by talking to an agent.',
  },
  {
    title: 'Yours to extend',
    art: 'control-console',
    body: 'Every block, MCP tool and integration is a documented extension point. Read the code, change it, ship it.',
  },
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
        primary={{ href: '/portal/signup', label: 'Start Free' }}
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

      {/* Metrics strip — four facts, every one verifiable from the licence or
          the build. This page claims no customer numbers anywhere. */}
      <CreamBand className="!py-10">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {heroMetrics.map((m) => (
            <StatBlock key={m.label} value={m.value} label={m.label} />
          ))}
        </div>
      </CreamBand>

      {/* Claim: breadth — how much of the job this covers. */}
      <InkPanel>
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="What the work actually is"
            title="The Whole Job. Not A Slice Of It."
            subtitle="Sell, ship, serve, know, automate: an agency does all five. Most tools pick one of them and leave you to go shopping for the other four."
            onDark
          />
          <CrewLanes lanes={crewLanes} />
        </div>
      </InkPanel>

      <OrbitDivider />

      {/* Claim: nothing on the list is gated. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Systems manifest"
          title="Eighteen Modules. Zero Duct Tape."
          subtitle="Every one ships in the box, on every plan. Nothing on this list is an add-on, an upgrade tier, or an integration you have to maintain yourself."
        />
        <ModuleManifest lead={leadModules} rest={restModules} />
      </CreamBand>

      <OrbitDivider />

      {/* Claim: one database, and here is the receipt. Cream band on purpose —
          the console frame supplies its own darkness. */}
      <CreamBand className="!pt-0">
        <SectionHeading
          eyebrow="Mission control"
          title="One Screen For All Eighteen."
          subtitle="One database underneath, so a deal, a contract, a deploy and a support ticket arrive in the same stream. Nothing on this screen is stitched together at render time."
        />
        <MissionControl />
      </CreamBand>

      {/* Claim: a person is not the only thing that can drive it. */}
      <InkPanel>
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <SignalBand
            chips={['Websites', 'CRM', 'Kanban', 'Email', 'Store', 'Brain', 'Bookings', 'Decks', 'Surveys']}
          >
            <SectionHeading
              eyebrow="AI Connect · MCP"
              title="Point An Agent At It And Talk."
              subtitle="Connect Claude, Cursor or any MCP client and operate the platform through 200+ scoped tools. Build a page, move a deal, schedule a campaign. The same permissions apply whether a person clicks it or an agent calls it."
              align="left"
              onDark
            />
          </SignalBand>
        </div>
      </InkPanel>

      {/* Claim: the licence is the promise. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Why open source"
          title="No Rug To Pull."
          subtitle="The licence is the promise. Everything else is just marketing."
        />
        <LicencePlate
          claim={
            <>
              Apache-2.0.
              <br />
              The Whole Thing.
            </>
          }
          body="Use it commercially, fork it, run it for clients. No seat caps, no feature gates, no open-core bait. The modules on this page are the modules in the repository."
          support={licenceSupport}
        />
      </CreamBand>

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
        subtitle="Clone it this afternoon, or let us stand it up for you. Either way you own the result."
        primary={{ href: '/portal/signup', label: 'Start Free' }}
        secondary={{ href: '/contact', label: 'Talk To Us' }}
        art="rocket"
      />
    </div>
  );
}
