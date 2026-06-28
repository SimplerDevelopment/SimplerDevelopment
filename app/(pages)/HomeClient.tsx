// Server Component. The homepage is almost entirely static presentation, so it
// renders on the server with ZERO hydration — the only interactive pieces are
// small client islands for the decorative WebGL (HeroBackground, HeroVisualGate,
// FeaturesBackgroundGate) plus the Button component. This is what keeps mobile
// TBT low and the hero LCP from waiting behind a full-page hydration. (Previously
// this whole file was 'use client', which hydrated ~760 DOM nodes and pushed
// mobile LCP render-delay to ~5s.)

import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { Button } from '@/components/ui/Button';
import { HeroBackground } from '@/components/sections/HeroBackground';
import { FeaturesBackgroundGate } from '@/components/sections/FeaturesBackgroundGate';
import { AccessCodeForm } from '@/components/marketing/AccessCodeForm';
import type { BlogPostWithRelations } from '@/lib/actions/blog';
import Link from 'next/link';

// Public source of truth for the self-host path. Swap if the public repo moves.
const GITHUB_URL = 'https://github.com/DanielPCoyle/simplerdevelopment2026';

// The 18 platform modules — these are the real, shipping modules of the platform.
const portalFeatures = [
  { title: 'AI Connect (MCP)', description: 'Connect Claude, Cursor, or any MCP client and operate the whole platform via 200+ scoped tools', icon: 'cable', href: '/solutions/ai-connect', color: '#0891b2' },
  { title: 'Website Builder', description: 'Drag-and-drop editor with unlimited pages, blog, SEO, and ecommerce', icon: 'language', href: '/solutions/websites', color: '#3b82f6' },
  { title: 'Online Store', description: 'Sell products with variants, discounts, shipping, and print-on-demand designs', icon: 'storefront', href: '/solutions/ecommerce', color: '#16a34a' },
  { title: 'Content Calendar', description: 'Editorial kanban and calendar to plan, schedule, and ship content across channels', icon: 'rocket_launch', href: '/solutions/publishing', color: '#0d9488' },
  { title: 'Email Marketing', description: 'Campaigns, subscriber lists, automations, and engagement tracking', icon: 'email', href: '/solutions/email-marketing', color: '#8b5cf6' },
  { title: 'CRM', description: 'Contacts, deals, proposals, and your full sales pipeline', icon: 'groups', href: '/solutions/crm', color: '#0ea5e9' },
  { title: 'Contracts & E-Sign', description: 'Branded proposals and legally binding contracts with built-in e-signature', icon: 'draw', href: '/solutions/contracts', color: '#b45309' },
  { title: 'Online Booking', description: 'Scheduling pages with calendar sync and automatic reminders', icon: 'calendar_month', href: '/solutions/booking', color: '#10b981' },
  { title: 'Surveys & Forms', description: 'Smart forms with branching logic, scoring, and auto-routing to your CRM', icon: 'ballot', href: '/solutions/surveys', color: '#e11d48' },
  { title: 'A/B Experiments', description: 'Split-test pages and pitch deck slides with built-in significance testing', icon: 'science', href: '/solutions/experiments', color: '#65a30d' },
  { title: 'Project Management', description: 'Kanban boards, sprint planning, and team collaboration', icon: 'view_kanban', href: '/solutions/project-management', color: '#4f46e5' },
  { title: 'Help Desk', description: 'Embeddable live chat plus a shared inbox and SLA-tracked support tickets', icon: 'support_agent', href: '/solutions/help-desk', color: '#ea580c' },
  { title: 'Company Brain', description: 'AI knowledge base (RAG over pgvector) that answers questions about your business with citations', icon: 'psychology', href: '/solutions/company-brain', color: '#7c3aed' },
  { title: 'AI Chatbot', description: 'Trained on your content for 24/7 support and lead capture', icon: 'smart_toy', href: '/solutions/ai-chatbot', color: '#a855f7' },
  { title: 'Automations', description: 'Visual no-code workflows that connect every tool automatically', icon: 'account_tree', href: '/solutions/automations', color: '#db2777' },
  { title: 'Pitch Decks', description: 'AI-generated, branded pitch decks with shareable links and PDF export', icon: 'slideshow', href: '/solutions/pitch-decks', color: '#f59e0b' },
  { title: 'Agency & White-Label', description: 'Run the platform under your own brand with a custom domain and logo', icon: 'badge', href: '/solutions/agency', color: '#c026d3' },
  { title: 'Managed Hosting', description: 'SSL, CDN, daily backups, and 99.9% uptime — or self-host it yourself', icon: 'cloud', href: '/solutions/hosting', color: '#64748b' },
];

// Honest product-truth metrics for the hero strip (no fabricated social proof).
const heroMetrics = [
  { value: '200+', label: 'MCP tools' },
  { value: '18', label: 'modules in one' },
  { value: 'Apache-2.0', label: 'licensed' },
  { value: 'Self-host', label: 'or cloud' },
];

const ossPillars = [
  { title: 'Apache-2.0 licensed', description: 'Use it commercially, fork it, run it for clients. No seat caps, no feature gates, no rug-pull.', icon: 'gavel' },
  { title: 'Self-host anywhere', description: 'One Postgres + pgvector and any Next.js host. docker compose up, run the migrations, go.', icon: 'dns' },
  { title: 'AI-operable by design', description: '200+ scoped MCP tools span the whole platform — build a site or run a campaign by talking to an agent.', icon: 'smart_toy' },
  { title: 'Yours to extend', description: 'Every block, MCP tool, and integration is a documented extension point. Read the code, change it, ship it.', icon: 'extension' },
];

const deploymentTiers = [
  {
    name: 'Self-host',
    price: 'Free',
    priceNote: 'open source, forever',
    blurb: 'For teams who want full control of their infrastructure and data.',
    points: ['Every one of the 18 modules', 'Apache-2.0 — no limits', 'docker compose + your own host', 'Community support'],
    cta: { label: 'Deploy from GitHub', href: GITHUB_URL, external: true },
    highlight: false,
  },
  {
    name: 'Managed',
    price: 'from $19',
    priceNote: 'per seat / mo · 14-day free trial',
    blurb: 'We host, update, scale, and back it up — so you never touch a server.',
    points: ['Everything in self-host', 'SSL, CDN & daily backups', '99.9% uptime, auto-updates', 'Run by the team that builds it'],
    cta: { label: 'Start free — no card', href: '/portal/signup', external: false },
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    priceNote: 'done-for-you + SLA',
    blurb: 'White-label, SSO, and our agency building alongside your team.',
    points: ['Everything in Managed', 'White-label + custom domain', 'SSO & priority SLA', 'We design & build with you'],
    cta: { label: 'Talk to us', href: '/contact', external: false },
    highlight: false,
  },
];

export function HomeClient({ recentPosts = [] }: { recentPosts?: BlogPostWithRelations[] }) {
  return (
    <>
      {/* ─── HERO — two doors: self-host vs managed ─── */}
      <section className="relative min-h-[80vh] w-full overflow-hidden flex items-center py-16 md:py-24">
        <div className="absolute inset-0 z-0">
          <HeroBackground />
        </div>
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-background/70 via-background/40 to-background/80 pointer-events-none" />

        <div className="relative z-20 w-full">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <FadeIn delay={0.1} immediate>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                  <span className="material-icons text-primary text-sm">lock_open</span>
                  <span className="text-primary font-semibold text-sm">Open source · MCP-native · Apache-2.0</span>
                </div>
              </FadeIn>
              <FadeIn delay={0.2} immediate>
                <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.1]">
                  Run your whole agency on{' '}
                  <span className="text-primary">one open-source platform.</span>
                </h1>
              </FadeIn>
              <FadeIn delay={0.3} immediate>
                <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                  Websites, CRM, an AI brain, email, bookings &amp; billing — eighteen connected
                  modules, multi-tenant and MCP-native. Self-host it free, or let the team that
                  builds it run it for you.
                </p>
              </FadeIn>

              {/* Two doors */}
              <FadeIn delay={0.4} immediate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto text-left">
                  {/* Door 1 — Self-host */}
                  <div className="rounded-2xl border border-border bg-background/80 backdrop-blur p-6 flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-icons text-primary">terminal</span>
                      <h2 className="font-heading font-bold text-lg">Self-host</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5 flex-1">
                      Deploy it on your own infrastructure. Free and open, no limits.
                    </p>
                    <a
                      href={GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
                    >
                      <span className="material-icons text-lg">code</span>
                      Deploy free
                    </a>
                    <Link href="/docs" className="mt-2 text-sm text-center text-muted-foreground hover:text-primary transition-colors">
                      Read the self-host docs →
                    </Link>
                  </div>

                  {/* Door 2 — Managed (emphasized) */}
                  <div className="rounded-2xl border-2 border-primary bg-background/90 backdrop-blur p-6 flex flex-col shadow-lg shadow-primary/10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-icons text-primary">cloud</span>
                      <h2 className="font-heading font-bold text-lg">Managed by us</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5 flex-1">
                      Hosted, updated, and backed up by the team that builds it.
                    </p>
                    <Button href="/portal/signup" size="lg" className="w-full justify-center">
                      Start free — no card
                      <span className="material-icons text-lg ml-1">arrow_forward</span>
                    </Button>
                    <Link href="/pricing" className="mt-2 text-sm text-center text-muted-foreground hover:text-primary transition-colors">
                      from $19/seat/mo · see pricing →
                    </Link>
                  </div>
                </div>
              </FadeIn>

              {/* Product-truth metric strip */}
              <FadeIn delay={0.5} immediate>
                <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                  {heroMetrics.map((m) => (
                    <div key={m.label} className="flex items-baseline gap-1.5">
                      <span className="font-display font-bold text-lg text-foreground">{m.value}</span>
                      <span className="text-sm text-muted-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRODUCT DEMO MOMENT — show, don't tell ─── */}
      <section className="relative py-20 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider text-center">{'// SEE IT'}</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-3 text-center">
                Your whole agency stack, in one tab.
              </h2>
              <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-10">
                One login, one database. Every module shares data — and an AI agent can drive all of it.
              </p>
            </FadeIn>

            <FadeIn delay={0.1}>
              {/* Framed product visual — a real portal dashboard screenshot
                  (public/screenshots/product/dashboard.png). Swap for a short
                  looping GIF once one is recorded against a live instance. */}
              <div className="rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/30">
                  <span className="w-3 h-3 rounded-full bg-red-400/70" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400/70" />
                  <span className="w-3 h-3 rounded-full bg-green-400/70" />
                  <span className="ml-3 text-xs text-muted-foreground font-mono">app.simplerdevelopment.com/portal</span>
                </div>
                <div className="relative max-h-[360px] md:max-h-[540px] overflow-hidden bg-muted/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/screenshots/product/dashboard.png"
                    alt="The SimplerDevelopment client portal dashboard — CRM pipeline, projects, invoices, AI credits, and automation runs in one view"
                    className="block w-full h-auto"
                    loading="lazy"
                  />
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── MODULES GRID ─── */}
      <section className="relative py-20 bg-dot-grid overflow-hidden">
        <FeaturesBackgroundGate />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider text-center">{'// THE PLATFORM'}</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 text-center">
                One platform. Eighteen modules.
              </h2>
              <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-12">
                Stop renting a dozen SaaS tools that don&apos;t talk to each other. Every module
                shares one database, one login — and an MCP toolset any AI agent can drive.
              </p>
            </FadeIn>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {portalFeatures.map((feature, index) => (
                <SlideIn key={feature.title} direction="up" delay={index * 0.04} className="h-full">
                  <Link href={feature.href} className="group block h-full">
                    <div className="relative h-full p-6 rounded-xl bg-background border border-border hover:shadow-lg transition-all duration-300 overflow-hidden">
                      <div
                        className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5"
                        style={{ backgroundColor: feature.color }}
                      />
                      <div className="flex flex-col gap-3 mt-2">
                        <div
                          className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${feature.color}15` }}
                        >
                          <span className="material-icons text-2xl" style={{ color: feature.color }}>{feature.icon}</span>
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-base mb-1 group-hover:text-primary transition-colors">{feature.title}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── OPEN SOURCE TRUST ─── */}
      <section className="relative py-28 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-16 items-start">
              <FadeIn>
                <div className="lg:sticky lg:top-32">
                  <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">{'// OPEN SOURCE'}</p>
                  <h2 className="font-display text-4xl md:text-5xl font-bold leading-tight">
                    Open source.{' '}
                    <span className="text-primary">No lock-in.</span>
                  </h2>
                  <div className="mt-6 w-16 h-1 bg-gradient-to-r from-primary to-accent-warm rounded-full" />
                </div>
              </FadeIn>

              <div className="space-y-8">
                {ossPillars.map((pillar, i) => (
                  <SlideIn key={pillar.title} direction="right" delay={(i + 1) * 0.1}>
                    <div className="accent-stripe pl-8">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                          <span className="material-icons text-primary text-xl">{pillar.icon}</span>
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-xl mb-2">{pillar.title}</h3>
                          <p className="text-lg text-muted-foreground leading-relaxed">{pillar.description}</p>
                        </div>
                      </div>
                    </div>
                  </SlideIn>
                ))}

                <SlideIn direction="right" delay={0.4}>
                  <div className="p-8 rounded-2xl bg-foreground text-background">
                    <p className="text-lg md:text-xl leading-relaxed">
                      This isn&apos;t an open-core teaser. The{' '}
                      <span className="font-semibold" style={{ color: '#60a5fa' }}>entire platform</span> is
                      open source — the managed cloud just saves you the ops. Read every line, fork it, or run it for your own clients.
                    </p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-3">
                      <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium bg-background text-foreground hover:opacity-90 transition-opacity"
                      >
                        <span className="material-icons text-lg">star</span>
                        Star on GitHub
                      </a>
                      <Button href="/docs" size="md" variant="outline" className="border-background/30 text-background hover:bg-background/10 hover:text-background">
                        Read the docs
                        <span className="material-icons text-lg ml-1">arrow_forward</span>
                      </Button>
                    </div>
                  </div>
                </SlideIn>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── DEPLOY YOUR WAY — self-host / managed / enterprise ─── */}
      <section className="section-dark py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-5" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <p className="font-mono text-sm font-semibold mb-3 tracking-wider opacity-50">{'// DEPLOY YOUR WAY'}</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  Same platform. Run it your way.
                </h2>
                <p className="text-lg opacity-70 max-w-2xl mx-auto">
                  Self-host it free, let us run it, or have us build alongside you.
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {deploymentTiers.map((tier, i) => (
                <SlideIn key={tier.name} direction="up" delay={i * 0.1}>
                  <div className={`h-full flex flex-col p-8 rounded-2xl bg-foreground text-background ${tier.highlight ? 'ring-2 ring-blue-400' : 'border border-white/10'}`}>
                    {tier.highlight && (
                      <span className="self-start mb-3 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ backgroundColor: '#60a5fa', color: '#0b1120' }}>
                        Most popular
                      </span>
                    )}
                    <h3 className="font-heading text-xl font-bold mb-1">{tier.name}</h3>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-display text-3xl font-bold" style={{ color: '#60a5fa' }}>{tier.price}</span>
                    </div>
                    <p className="text-xs opacity-50 mb-4">{tier.priceNote}</p>
                    <p className="text-sm opacity-70 mb-6">{tier.blurb}</p>
                    <ul className="space-y-2.5 mb-8 flex-1">
                      {tier.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-sm opacity-80">
                          <span className="material-icons text-base mt-0.5" style={{ color: '#34d399' }}>check</span>
                          {pt}
                        </li>
                      ))}
                    </ul>
                    {tier.cta.external ? (
                      <a
                        href={tier.cta.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium bg-background text-foreground hover:opacity-90 transition-opacity"
                      >
                        {tier.cta.label}
                      </a>
                    ) : (
                      <Link
                        href={tier.cta.href}
                        className={`inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium transition-colors ${tier.highlight ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-background text-foreground hover:opacity-90'}`}
                      >
                        {tier.cta.label}
                      </Link>
                    )}
                  </div>
                </SlideIn>
              ))}
            </div>

            <FadeIn delay={0.3}>
              <div className="text-center mt-10">
                <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium opacity-70 hover:opacity-100 transition-opacity">
                  See full pricing &amp; plans
                  <span className="material-icons text-lg">arrow_forward</span>
                </Link>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── BLOG ─── */}
      <section className="relative py-28 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            <FadeIn>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-14 gap-4">
                <div>
                  <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">{'// INSIGHTS'}</p>
                  <h2 className="font-display text-3xl md:text-4xl font-bold">
                    From the Blog
                  </h2>
                </div>
                <Button href="/blog" variant="outline" size="md">
                  View All
                  <span className="material-icons text-lg ml-1">arrow_forward</span>
                </Button>
              </div>
            </FadeIn>

            {recentPosts && recentPosts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {recentPosts.map((post, index) => {
                  const category = post.category;
                  return (
                    <SlideIn key={post.id} direction="up" delay={index * 0.1}>
                      <Link href={`/blog/${post.slug}`} className="group block h-full">
                        <article className="h-full rounded-xl border border-border bg-background overflow-hidden transition-all hover:shadow-lg hover:border-primary/30">
                          <div className="p-5">
                            {category && (
                              <span
                                className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: category.color || undefined }}
                              >
                                {category.name}
                              </span>
                            )}
                            <h3 className="font-bold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                              {post.title}
                            </h3>
                            {post.excerpt && (
                              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{post.excerpt}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {post.publishedAt && (
                                <time dateTime={new Date(post.publishedAt).toISOString()}>
                                  {/* timeZone:'UTC' keeps server & client output identical — without it
                                      the date formats in the runtime's local zone and the SSR/CSR text
                                      diverges, triggering a React #418 hydration error that aborts the
                                      hero's reveal animations. */}
                                  {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                                </time>
                              )}
                            </div>
                          </div>
                        </article>
                      </Link>
                    </SlideIn>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground">Blog posts coming soon!</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── ACCESS CODE — preview a private site ─── */}
      <section className="relative py-16 border-t border-border/60 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <FadeIn>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-4">
                  <span className="material-icons text-primary text-2xl">vpn_key</span>
                </div>
                <h2 className="font-heading font-bold text-2xl mb-2">Previewing a private site?</h2>
                <p className="text-muted-foreground">
                  Enter the access code your team shared to view an unpublished site.
                </p>
              </div>
              <AccessCodeForm variant="inline" />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA — the two doors again ─── */}
      <section className="section-dark py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-[0.04]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-16 items-center">
              <div>
                <FadeIn>
                  <p className="font-mono text-sm font-semibold mb-4 tracking-wider opacity-40 dark:opacity-70">{'// GET STARTED'}</p>
                  <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                    Run your whole agency,<br />
                    <span style={{ color: '#60a5fa' }}>your way.</span>
                  </h2>
                  <p className="text-lg md:text-xl mb-10 max-w-xl opacity-60 dark:opacity-85 leading-relaxed">
                    Open source and free to self-host. Or let us run it for you —
                    start free, no credit card.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <a
                      href={GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-lg font-medium bg-white text-black hover:bg-white/90 dark:bg-black dark:text-white dark:hover:bg-black/90 transition-colors"
                    >
                      <span className="material-icons text-lg">code</span>
                      Self-host free
                    </a>
                    <Link
                      href="/portal/signup"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-lg font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                    >
                      Start free
                      <span className="material-icons text-lg">arrow_forward</span>
                    </Link>
                  </div>
                </FadeIn>
              </div>

              <FadeIn delay={0.2}>
                <div className="hidden lg:flex flex-col gap-4 w-[280px]">
                  <div className="rounded-xl border border-white/10 bg-white/5 dark:border-black/15 dark:bg-black/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-icons text-2xl" style={{ color: '#60a5fa' }}>lock_open</span>
                      <span className="font-heading font-bold">Apache-2.0</span>
                    </div>
                    <p className="text-sm opacity-50 dark:opacity-75">No lock-in. Fork it, extend it, run it for your own clients.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 dark:border-black/15 dark:bg-black/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-icons text-2xl" style={{ color: '#34d399' }}>savings</span>
                      <span className="font-heading font-bold">Replace 12+ Tools</span>
                    </div>
                    <p className="text-sm opacity-50 dark:opacity-75">One platform, one bill. No more Mailchimp, Calendly, Squarespace, HubSpot, Typeform, DocuSign, Shopify, and Zapier.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 dark:border-black/15 dark:bg-black/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-icons text-2xl" style={{ color: '#fbbf24' }}>smart_toy</span>
                      <span className="font-heading font-bold">AI-operable</span>
                    </div>
                    <p className="text-sm opacity-50 dark:opacity-75">200+ MCP tools — drive the whole platform from Claude, Cursor, or any agent.</p>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
