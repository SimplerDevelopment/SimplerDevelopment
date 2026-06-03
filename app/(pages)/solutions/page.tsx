import { getAllSolutions } from '@/lib/data/solutions';
import { generateSEO } from '@/lib/utils/seo';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { CodeLogo3D } from '@/components/three/CodeLogo3D';

export const metadata = generateSEO({
  title: 'Platform Features',
  description: 'Website builder, online store, publishing & content calendar, email marketing, CRM, contracts & e-signature, invoicing, booking, surveys, A/B experiments, project management, help desk, Company Brain AI, AI chatbot, automations, white-label agency, and more — 19 tools in one platform',
  path: '/solutions',
});

const NUMBER_WORDS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen', 'Twenty', 'Twenty-One', 'Twenty-Two', 'Twenty-Three', 'Twenty-Four',
];
const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

export default function SolutionsPage() {
  const solutions = getAllSolutions();
  const toolCount = solutions.length;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-24 md:py-32 overflow-hidden bg-dot-grid">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left column — copy */}
            <div className="max-w-xl">
              <FadeIn immediate>
                <p className="text-primary font-mono text-sm font-semibold mb-4 tracking-wider">{`// PLATFORM`}</p>
              </FadeIn>
              <FadeIn immediate delay={0.1}>
                <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 leading-[1.05]">
                  Every Tool Your Business{' '}
                  <span className="text-primary">Actually Needs</span>
                </h1>
              </FadeIn>
              <FadeIn immediate delay={0.2}>
                <p className="text-xl text-muted-foreground">
                  {numberWord(toolCount)} integrated tools that replace your entire SaaS stack. Websites, stores, a content calendar, email, CRM, invoicing, booking, surveys, A/B testing, projects, a help desk, an AI Company Brain, white-label agency, and more — all working together from one dashboard.
                </p>
                <div className="mt-6 w-20 h-1 bg-gradient-to-r from-primary to-accent-warm rounded-full" />
              </FadeIn>
            </div>

            {/* Right column — 3D code logo */}
            <FadeIn immediate delay={0.3}>
              <CodeLogo3D className="h-[320px] w-full md:h-[440px] lg:h-[480px]" />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Solutions — Alternating Feature Rows */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto space-y-32">
            {solutions.map((solution, index) => {
              const isEven = index % 2 === 0;
              return (
                <div key={solution.slug}>
                  <SlideIn direction={isEven ? 'left' : 'right'} delay={0.1}>
                    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center`}>
                      {/* Visual Card */}
                      <div className={`${!isEven ? 'lg:order-2' : ''}`}>
                        <div
                          className="rounded-2xl p-10 md:p-12 relative overflow-hidden border"
                          style={{
                            backgroundColor: `${solution.color}08`,
                            borderColor: `${solution.color}20`,
                          }}
                        >
                          {/* Large watermark number */}
                          <span
                            className="absolute -right-4 -top-6 text-[10rem] font-black leading-none select-none pointer-events-none"
                            style={{ color: `${solution.color}10` }}
                          >
                            {String(index + 1).padStart(2, '0')}
                          </span>

                          <span
                            className="material-icons relative z-10 mb-8 block"
                            style={{ color: solution.color, fontSize: '64px' }}
                          >
                            {solution.icon}
                          </span>

                          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {solution.features.slice(0, 4).map((feature, fi) => (
                              <div key={fi} className="flex items-start gap-2 text-sm">
                                <span
                                  className="material-icons text-base mt-0.5 flex-shrink-0"
                                  style={{ color: solution.color }}
                                >check</span>
                                <span className="text-muted-foreground">{feature}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Text Content */}
                      <div className={`${!isEven ? 'lg:order-1' : ''}`}>
                        <p
                          className="font-mono text-sm font-semibold mb-3 tracking-wider"
                          style={{ color: solution.color }}
                        >
                          {`// ${String(index + 1).padStart(2, '0')}`}
                        </p>
                        <div
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
                          style={{ backgroundColor: `${solution.color}15`, color: solution.color }}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: solution.color }} />
                          {solution.badge}
                        </div>
                        <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 leading-tight">
                          {solution.title}
                        </h2>
                        <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                          {solution.description}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <Button href={`/solutions/${solution.slug}`} size="md">
                            Learn More
                            <span className="material-icons text-lg ml-1">arrow_forward</span>
                          </Button>
                          <Button href="/contact" variant="ghost" size="md">
                            Get Started
                          </Button>
                        </div>
                      </div>
                    </div>
                  </SlideIn>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* All-in-One Value Prop */}
      <section className="py-24 section-dark relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-5" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <p className="font-mono text-sm font-semibold mb-3 tracking-wider opacity-50">{`// ALL-IN-ONE`}</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  Why One Platform Beats {numberWord(toolCount - 1)}
                </h2>
                <p className="text-lg opacity-70 max-w-2xl mx-auto">
                  Everything connected, everything managed, everything working together
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/10 rounded-2xl overflow-hidden">
              {[
                { title: 'One Dashboard', description: 'Manage your website, email, CRM, booking, and projects from a single login', icon: 'dashboard' },
                { title: 'Connected Data', description: 'New leads flow into your CRM, trigger emails, and book calls — automatically', icon: 'sync_alt' },
                { title: 'Agency Support', description: 'Not just software. Designers and developers ready to help whenever you need', icon: 'support_agent' },
              ].map((item, i) => (
                <SlideIn key={item.title} direction="up" delay={i * 0.1}>
                  <div className="p-8 bg-foreground text-background h-full">
                    <span className="material-icons text-3xl mb-4 block" style={{ color: '#60a5fa' }}>{item.icon}</span>
                    <h3 className="font-heading text-xl font-bold mb-2">{item.title}</h3>
                    <p className="text-sm opacity-60">{item.description}</p>
                  </div>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-accent-warm/5" />

        <div className="container mx-auto px-4 text-center relative z-10">
          <FadeIn>
            <p className="text-primary font-mono text-sm font-semibold mb-4 tracking-wider">{`// NEXT STEP`}</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Ready to Simplify Everything?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Book a free consultation and we&apos;ll walk you through the platform. See exactly how it works for your business.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/contact" size="lg">
                Book a Free Consultation
                <span className="material-icons text-lg ml-1">arrow_forward</span>
              </Button>
              <Button href="/about" variant="outline" size="lg">
                Learn About Us
              </Button>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
