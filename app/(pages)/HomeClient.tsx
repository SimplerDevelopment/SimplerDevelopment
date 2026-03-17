'use client';

import dynamic from 'next/dynamic';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { Button } from '@/components/ui/Button';
import { use3DScene } from '@/hooks/use3DScene';
import { HeroVisual } from '@/components/sections/HeroVisual';
import { getAllBlogPosts, getAllCategories } from '@/lib/data/blog';
import Link from 'next/link';
import {
  SiNextdotjs, SiReact, SiVuedotjs, SiWordpress, SiShopify,
  SiBigcommerce, SiSanity, SiFigma, SiAmazon, SiRailway,
  SiN8N, SiVercel, SiApple, SiAndroid, SiTypescript,
  SiNodedotjs, SiStripe, SiPostgresql, SiGoogle, SiGmail,
  SiLinkedin, SiHubspot, SiApollographql,
} from 'react-icons/si';
import { HiCube } from 'react-icons/hi';

const HeroParticleNetwork = dynamic(() => import('@/components/three/HeroParticleNetwork').then(mod => ({ default: mod.HeroParticleNetwork })), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 animate-pulse" />
});

const FeaturesBackground = dynamic(() => import('@/components/three/FeaturesBackground').then(mod => ({ default: mod.FeaturesBackground })), {
  ssr: false,
  loading: () => null
});

const platforms = [
  { name: 'Next.js', icon: SiNextdotjs }, { name: 'React', icon: SiReact },
  { name: 'Vue.js', icon: SiVuedotjs }, { name: 'Builder.io', icon: HiCube },
  { name: 'WordPress', icon: SiWordpress }, { name: 'Shopify', icon: SiShopify },
  { name: 'BigCommerce', icon: SiBigcommerce }, { name: 'Sanity.io', icon: SiSanity },
  { name: 'Figma', icon: SiFigma }, { name: 'AWS', icon: SiAmazon },
  { name: 'Railway', icon: SiRailway }, { name: 'n8n', icon: SiN8N },
  { name: 'Vercel', icon: SiVercel }, { name: 'iOS', icon: SiApple },
  { name: 'Android', icon: SiAndroid }, { name: 'TypeScript', icon: SiTypescript },
  { name: 'Node.js', icon: SiNodedotjs }, { name: 'Stripe', icon: SiStripe },
  { name: 'PostgreSQL', icon: SiPostgresql }, { name: 'Google', icon: SiGoogle },
  { name: 'Gmail', icon: SiGmail }, { name: 'LinkedIn', icon: SiLinkedin },
  { name: 'HubSpot', icon: SiHubspot }, { name: 'Bullhorn', icon: HiCube },
  { name: 'Apollo.io', icon: SiApollographql },
];

const services = [
  { title: 'Design', description: 'User-centered UI/UX that converts visitors into customers', icon: 'palette', href: '/solutions/design', color: '#10b981' },
  { title: 'Development', description: 'Custom web & mobile apps built to scale with your business', icon: 'code', href: '/solutions/development', color: '#3b82f6' },
  { title: 'Growth', description: 'SEO, content strategy & analytics that drive measurable results', icon: 'trending_up', href: '/solutions/growth-marketing', color: '#f59e0b' },
  { title: 'AI & Automation', description: 'Intelligent workflows that save hundreds of hours', icon: 'smart_toy', href: '/solutions/ai-automation', color: '#8b5cf6' },
  { title: 'Partnership', description: 'Ongoing strategic support as your dedicated tech partner', icon: 'handshake', href: '/solutions/partnership', color: '#f97316' },
];

export function HomeClient() {
  const { supportsWebGL } = use3DScene();
  const recentPosts = getAllBlogPosts().slice(0, 3);
  const categories = getAllCategories();

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative min-h-[75vh] md:min-h-[85vh] w-full overflow-hidden flex items-center py-6 md:py-20">
        <div className="absolute inset-0 z-0">
          {supportsWebGL ? (
            <HeroParticleNetwork className="w-full h-full" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5" />
          )}
        </div>
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-background/90 via-background/60 to-transparent pointer-events-none" />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-background/40 via-transparent to-background/60 pointer-events-none" />

        <div className="relative z-20 w-full">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                {/* Left — text */}
                <div>
                  <FadeIn delay={0.1}>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                      <span className="material-icons text-primary text-sm">terminal</span>
                      <span className="text-primary font-semibold text-sm">Web & Mobile Development Agency</span>
                    </div>
                  </FadeIn>
                  <FadeIn delay={0.2}>
                    <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-bold mb-6 leading-[1.1]">
                      We Build Software That{' '}
                      <span className="text-primary">Grows Your Business</span>
                    </h1>
                  </FadeIn>
                  <FadeIn delay={0.3}>
                    <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed">
                      From custom web apps to native mobile experiences, we partner with businesses
                      to design, build, and scale the technology they need to thrive.
                    </p>
                  </FadeIn>
                  <FadeIn delay={0.4}>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <Button href="/contact" size="lg" className="w-full sm:w-auto justify-center">
                        Book a Free Consultation
                        <span className="material-icons text-lg ml-1">arrow_forward</span>
                      </Button>
                      <Button href="/solutions" variant="outline" size="lg" className="w-full sm:w-auto justify-center bg-background/80">
                        Solutions
                      </Button>
                    </div>
                  </FadeIn>
                </div>

                {/* Right — visual mockup */}
                <div className="hidden lg:block relative">
                  <HeroVisual />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SERVICES ─── */}
      <section className="relative py-20 bg-dot-grid">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">// WHAT WE DO</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-12">
                Five disciplines, one team.
              </h2>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.map((service, index) => (
                <SlideIn key={service.title} direction="up" delay={index * 0.06}>
                  <Link href={service.href} className="group block h-full">
                    <div
                      className="relative h-full p-6 rounded-xl bg-background border border-border hover:shadow-lg transition-all duration-300 overflow-hidden"
                    >
                      {/* Colored top stripe */}
                      <div
                        className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5"
                        style={{ backgroundColor: service.color }}
                      />
                      <div className="flex items-start gap-4 mt-2">
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${service.color}15` }}
                        >
                          <span className="material-icons text-2xl" style={{ color: service.color }}>{service.icon}</span>
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-lg mb-1 group-hover:text-primary transition-colors">{service.title}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">{service.description}</p>
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

      {/* ─── INTRO / MANIFESTO ─── */}
      <section className="relative py-28 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-16 items-start">
              {/* Left — large number + label */}
              <FadeIn>
                <div className="lg:sticky lg:top-32">
                  <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">// OUR PHILOSOPHY</p>
                  <h2 className="font-display text-4xl md:text-5xl font-bold leading-tight">
                    Your business is{' '}
                    <span className="text-primary">one of a kind.</span>
                  </h2>
                  <div className="mt-6 w-16 h-1 bg-gradient-to-r from-primary to-accent-warm rounded-full" />
                </div>
              </FadeIn>

              {/* Right — stacked content cards */}
              <div className="space-y-8">
                <SlideIn direction="right" delay={0.1}>
                  <div className="accent-stripe pl-8">
                    <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
                      Your business is a living, breathing organism — constantly evolving, adapting,
                      and growing in ways that are entirely your own.
                    </p>
                  </div>
                </SlideIn>

                <SlideIn direction="right" delay={0.2}>
                  <div className="accent-stripe pl-8">
                    <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
                      When the right tools, processes, and people come together, your business doesn&apos;t
                      just survive — it <span className="text-foreground font-semibold">thrives</span>.
                    </p>
                  </div>
                </SlideIn>

                <SlideIn direction="right" delay={0.3}>
                  <div className="p-8 rounded-2xl bg-foreground text-background">
                    <p className="text-lg md:text-xl leading-relaxed">
                      <span className="font-semibold" style={{ color: '#60a5fa' }}>Simpler Development</span> exists
                      to help you cultivate that environment. We bring clarity to complexity, build
                      systems that scale with your ambitions, and empower your team with technology
                      that works as hard as you do.
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

      {/* ─── TECHNOLOGIES ─── */}
      <section className="relative pt-16 pb-60 overflow-hidden bg-muted/40">
        <FeaturesBackground />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-7xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">// OUR STACK</p>
                <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
                  Technologies We Work With
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  We pick the right tool for your project — not the trendiest one.
                </p>
              </div>
            </FadeIn>

            <div className="relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-muted/40 to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-muted/40 to-transparent z-10 pointer-events-none" />

              <div className="flex gap-10 py-0 animate-marquee">
                {platforms.map((platform, i) => {
                  const Icon = platform.icon;
                  return (
                    <div key={`p1-${i}`} className="flex flex-col items-center justify-center px-6 py-5 rounded-lg min-w-[140px]">
                      <Icon className="text-5xl mb-2 opacity-60" />
                      <span className="text-sm font-medium whitespace-nowrap text-muted-foreground">{platform.name}</span>
                    </div>
                  );
                })}
                {platforms.map((platform, i) => {
                  const Icon = platform.icon;
                  return (
                    <div key={`p2-${i}`} className="flex flex-col items-center justify-center px-6 py-5 rounded-lg min-w-[140px]">
                      <Icon className="text-5xl mb-2 opacity-60" />
                      <span className="text-sm font-medium whitespace-nowrap text-muted-foreground">{platform.name}</span>
                    </div>
                  );
                })}
              </div>
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
                  <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">// INSIGHTS</p>
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
                  const category = categories.find(c => c.slug === post.category);
                  return (
                    <SlideIn key={post.id} direction="up" delay={index * 0.1}>
                      <Link href={`/blog/${post.slug}`} className="group block h-full">
                        <article className="h-full rounded-xl border border-border bg-background overflow-hidden transition-all hover:shadow-lg hover:border-primary/30">
                          {/* Cover image with category overlay */}
                          <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                            {post.coverImage ? (
                              <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                                <span className="material-icons text-6xl text-primary/20">article</span>
                              </div>
                            )}
                            {category && (
                              <div className="absolute top-3 left-3">
                                <span
                                  className="px-3 py-1 rounded-full text-xs font-bold text-white"
                                  style={{ backgroundColor: category.color }}
                                >
                                  {category.name}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="p-5">
                            <h3 className="font-bold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                              {post.title}
                            </h3>
                            {post.excerpt && (
                              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{post.excerpt}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {post.readTime && <span>{post.readTime} min read</span>}
                              {post.publishedAt && (
                                <time dateTime={post.publishedAt}>
                                  {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
        {/* Accent glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-16 items-center">
              {/* Left — text */}
              <div>
                <FadeIn>
                  <p className="font-mono text-sm font-semibold mb-4 tracking-wider opacity-40 dark:opacity-70">// LET&apos;S TALK</p>
                  <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                    Have a project in mind?<br />
                    <span style={{ color: '#60a5fa' }}>Let&apos;s make it real.</span>
                  </h2>
                  <p className="text-lg md:text-xl mb-10 max-w-xl opacity-60 dark:opacity-85 leading-relaxed">
                    Tell us what you&apos;re building. We&apos;ll respond within 24 hours
                    with a plan and honest estimate — no strings attached.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <a
                      href="/contact"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-lg font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                    >
                      Book a Free Consultation
                      <span className="material-icons text-lg">arrow_forward</span>
                    </a>
                    <a
                      href="/solutions"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-lg font-medium bg-white/10 text-white border border-white/40 hover:bg-white/20 dark:bg-black/10 dark:text-black/80 dark:border-black/30 dark:hover:bg-black/15 transition-colors"
                    >
                      Explore Solutions
                    </a>
                  </div>
                </FadeIn>
              </div>

              {/* Right — quick info cards */}
              <FadeIn delay={0.2}>
                <div className="hidden lg:flex flex-col gap-4 w-[280px]">
                  <div className="rounded-xl border border-white/10 bg-white/5 dark:border-black/15 dark:bg-black/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-icons text-2xl" style={{ color: '#60a5fa' }}>schedule</span>
                      <span className="font-heading font-bold">Quick Turnaround</span>
                    </div>
                    <p className="text-sm opacity-50 dark:opacity-75">Most projects kick off within a week of our first conversation.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 dark:border-black/15 dark:bg-black/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-icons text-2xl" style={{ color: '#34d399' }}>handshake</span>
                      <span className="font-heading font-bold">Transparent Process</span>
                    </div>
                    <p className="text-sm opacity-50 dark:opacity-75">Clear milestones, honest pricing, and no surprises along the way.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 dark:border-black/15 dark:bg-black/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-icons text-2xl" style={{ color: '#fbbf24' }}>verified</span>
                      <span className="font-heading font-bold">16+ Years of Experience</span>
                    </div>
                    <p className="text-sm opacity-50 dark:opacity-75">Deep expertise across web, mobile, and automation — built over a decade and a half.</p>
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
