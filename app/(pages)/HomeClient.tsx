// Server Component. The homepage is almost entirely static presentation, so it
// renders on the server with ZERO hydration — the only interactive pieces are
// three tiny client islands for the decorative WebGL (HeroBackground,
// HeroVisualGate, FeaturesBackgroundGate) plus the AccessCodeForm/Button
// components. This is what keeps mobile TBT low and the hero LCP from waiting
// behind a full-page hydration. (Previously this whole file was 'use client',
// which hydrated ~760 DOM nodes and pushed mobile LCP render-delay to ~5s.)

import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { Button } from '@/components/ui/Button';
import { HeroBackground } from '@/components/sections/HeroBackground';
import { HeroVisualGate } from '@/components/sections/HeroVisualGate';
import { FeaturesBackgroundGate } from '@/components/sections/FeaturesBackgroundGate';
import { AccessCodeForm } from '@/components/marketing/AccessCodeForm';
import type { BlogPostWithRelations } from '@/lib/actions/blog';
import Link from 'next/link';

const portalFeatures = [
  { title: 'AI Connect', description: 'Connect Claude, ChatGPT, and AI tools to your portal via MCP', icon: 'cable', href: '/solutions/ai-connect', color: '#0891b2' },
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
  { title: 'Company Brain', description: 'AI knowledge base that answers questions about your business with citations', icon: 'psychology', href: '/solutions/company-brain', color: '#7c3aed' },
  { title: 'AI Chatbot', description: 'Trained on your content for 24/7 support and lead capture', icon: 'smart_toy', href: '/solutions/ai-chatbot', color: '#a855f7' },
  { title: 'Automations', description: 'Visual no-code workflows that connect every tool automatically', icon: 'account_tree', href: '/solutions/automations', color: '#db2777' },
  { title: 'Pitch Decks', description: 'AI-generated, branded pitch decks with shareable links and PDF export', icon: 'slideshow', href: '/solutions/pitch-decks', color: '#f59e0b' },
  { title: 'Agency & White-Label', description: 'Run the platform under your own brand with a custom domain and logo', icon: 'storefront', href: '/solutions/agency', color: '#c026d3' },
  { title: 'Managed Hosting', description: 'SSL, CDN, daily backups, and 99.9% uptime included', icon: 'cloud', href: '/solutions/hosting', color: '#64748b' },
];

const valuePillars = [
  { title: 'One Dashboard', description: 'Website, email, CRM, booking, projects — everything in one login. No more juggling a dozen SaaS subscriptions.', icon: 'dashboard' },
  { title: 'Built to Work Together', description: 'Every tool shares data. A new website lead flows into your CRM, triggers an email sequence, and books a call — automatically.', icon: 'sync_alt' },
  { title: 'Agency-Backed Platform', description: 'Not just software. We design, build, and optimize alongside you. Get expert help whenever you need it.', icon: 'support_agent' },
];

export function HomeClient({ recentPosts = [] }: { recentPosts?: BlogPostWithRelations[] }) {
  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative min-h-[75vh] md:min-h-[85vh] w-full overflow-hidden flex items-center py-6 md:py-20">
        <div className="absolute inset-0 z-0">
          <HeroBackground />
        </div>
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-background/90 via-background/60 to-transparent pointer-events-none" />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-background/40 via-transparent to-background/60 pointer-events-none" />

        <div className="relative z-20 w-full">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                {/* Left — text */}
                <div>
                  <FadeIn delay={0.1} immediate>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                      <span className="material-icons text-primary text-sm">hub</span>
                      <span className="text-primary font-semibold text-sm">All-in-One Business Platform</span>
                    </div>
                  </FadeIn>
                  <FadeIn delay={0.2} immediate>
                    <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-bold mb-6 leading-[1.1]">
                      Everything Your Business Needs.{' '}
                      <span className="text-primary">One Platform.</span>
                    </h1>
                  </FadeIn>
                  <FadeIn delay={0.3} immediate>
                    <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed">
                      Websites, online stores, email, CRM, booking, surveys, projects, an AI Company Brain, and more — eighteen connected tools in one place. Built and backed by a full-service agency.
                    </p>
                  </FadeIn>
                  <FadeIn delay={0.4} immediate>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <Button href="/contact" size="lg" className="w-full sm:w-auto justify-center">
                        Start Free Consultation
                        <span className="material-icons text-lg ml-1">arrow_forward</span>
                      </Button>
                      <Button href="/solutions" variant="outline" size="lg" className="w-full sm:w-auto justify-center bg-background/80">
                        See All Features
                      </Button>
                    </div>
                  </FadeIn>
                </div>

                {/* Right — access-code centerpiece, layered over HeroVisual + particle network */}
                <div className="relative mt-10 lg:mt-0">
                  <div className="hidden lg:block absolute inset-0 opacity-60 pointer-events-none">
                    <HeroVisualGate />
                  </div>
                  <div className="hidden lg:block absolute inset-0 bg-gradient-to-br from-background/40 via-transparent to-background/30 pointer-events-none" />
                  <div className="relative z-10 flex items-center justify-center lg:min-h-[520px]">
                    <FadeIn delay={0.5} immediate>
                      <AccessCodeForm variant="hero" />
                    </FadeIn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PORTAL FEATURES GRID ─── */}
      <section className="relative py-20 bg-dot-grid overflow-hidden">
        <FeaturesBackgroundGate />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider text-center">{'// THE PLATFORM'}</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 text-center">
                Eighteen tools. One platform.
              </h2>
              <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-12">
                Stop paying for a dozen subscriptions that don&apos;t talk to each other. Everything you need is here.
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

      {/* ─── VALUE PROPOSITION ─── */}
      <section className="relative py-28 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-16 items-start">
              <FadeIn>
                <div className="lg:sticky lg:top-32">
                  <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">{'// WHY ONE PLATFORM'}</p>
                  <h2 className="font-display text-4xl md:text-5xl font-bold leading-tight">
                    Stop duct-taping{' '}
                    <span className="text-primary">your tech stack.</span>
                  </h2>
                  <div className="mt-6 w-16 h-1 bg-gradient-to-r from-primary to-accent-warm rounded-full" />
                </div>
              </FadeIn>

              <div className="space-y-8">
                {valuePillars.map((pillar, i) => (
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
                      <span className="font-semibold" style={{ color: '#60a5fa' }}>Simpler Development</span> is
                      the platform and the team behind it. We don&apos;t just hand you software — we
                      design your site, set up your workflows, and grow with you as a strategic partner.
                    </p>
                    <div className="mt-6">
                      <Button href="/about" size="md" variant="outline" className="border-background/30 text-background hover:bg-background/10 hover:text-background">
                        Learn About Our Approach
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

      {/* ─── HOW IT WORKS ─── */}
      <section className="section-dark py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-5" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <p className="font-mono text-sm font-semibold mb-3 tracking-wider opacity-50">{'// HOW IT WORKS'}</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  From sign-up to launch in days, not months
                </h2>
                <p className="text-lg opacity-70 max-w-2xl mx-auto">
                  We handle the heavy lifting so you can focus on your business
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-white/10 rounded-2xl overflow-hidden">
              {[
                { step: '01', title: 'Consult', description: 'Tell us about your business and what you need. We listen, ask questions, and map out the right tools.', icon: 'forum' },
                { step: '02', title: 'Configure', description: 'We set up your portal — website, email, CRM, booking — customized to your brand and workflow.', icon: 'tune' },
                { step: '03', title: 'Launch', description: 'Go live with a fully integrated platform. Your tools are connected, your data flows, and everything works.', icon: 'rocket_launch' },
                { step: '04', title: 'Grow', description: 'Add features, run campaigns, track results. We are here as your ongoing partner to help you scale.', icon: 'trending_up' },
              ].map((item, i) => (
                <SlideIn key={item.step} direction="up" delay={i * 0.1}>
                  <div className="p-8 bg-foreground text-background h-full">
                    <span className="material-icons text-3xl mb-4 block" style={{ color: '#60a5fa' }}>{item.icon}</span>
                    <div className="font-mono text-xs font-bold mb-2" style={{ color: '#60a5fa' }}>{item.step}</div>
                    <h3 className="font-heading text-xl font-bold mb-2">{item.title}</h3>
                    <p className="text-sm opacity-60">{item.description}</p>
                  </div>
                </SlideIn>
              ))}
            </div>
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

      {/* ─── CTA ─── */}
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
                    Ready to simplify<br />
                    <span style={{ color: '#60a5fa' }}>your business?</span>
                  </h2>
                  <p className="text-lg md:text-xl mb-10 max-w-xl opacity-60 dark:opacity-85 leading-relaxed">
                    Book a free consultation and we&apos;ll show you how the platform
                    works for your specific business. No commitment, no pressure.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link
                      href="/contact"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-lg font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                    >
                      Book a Free Consultation
                      <span className="material-icons text-lg">arrow_forward</span>
                    </Link>
                    <Link
                      href="/solutions"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-lg font-medium bg-transparent text-white border-2 border-white hover:bg-white/10 dark:text-black dark:border-black dark:hover:bg-black/10 transition-colors"
                    >
                      Explore Features
                    </Link>
                  </div>
                </FadeIn>
              </div>

              <FadeIn delay={0.2}>
                <div className="hidden lg:flex flex-col gap-4 w-[280px]">
                  <div className="rounded-xl border border-white/10 bg-white/5 dark:border-black/15 dark:bg-black/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-icons text-2xl" style={{ color: '#60a5fa' }}>flash_on</span>
                      <span className="font-heading font-bold">Launch in Days</span>
                    </div>
                    <p className="text-sm opacity-50 dark:opacity-75">Most clients go live within a week of their first call.</p>
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
                      <span className="material-icons text-2xl" style={{ color: '#fbbf24' }}>support_agent</span>
                      <span className="font-heading font-bold">Agency Support</span>
                    </div>
                    <p className="text-sm opacity-50 dark:opacity-75">Not just software — a team of designers and developers in your corner.</p>
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
