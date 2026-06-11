import { getSolutionBySlug, getAllSolutions } from '@/lib/data/solutions';
import { getSolutionScreenshots } from '@/lib/data/solution-screenshots';
import { generateSEO } from '@/lib/utils/seo';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { SolutionGallery } from '@/components/solutions/SolutionGallery';
import { MaintenanceNotice, SOLUTIONS_UNDER_MAINTENANCE } from '@/components/marketing/MaintenanceNotice';

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

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: `linear-gradient(135deg, ${solution.color}15 0%, transparent 50%, ${solution.color}08 100%)`,
          }}
        />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
                <Link href="/solutions" className="hover:text-primary transition-colors">
                  Solutions
                </Link>
                <span className="material-icons text-sm">chevron_right</span>
                <span style={{ color: solution.color }}>{solution.badge}</span>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-start">
              <div>
                <FadeIn delay={0.1}>
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
                    style={{ backgroundColor: `${solution.color}15`, color: solution.color }}
                  >
                    <span className="material-icons text-sm" style={{ color: solution.color }}>
                      {solution.icon}
                    </span>
                    {solution.badge}
                  </div>
                </FadeIn>

                <FadeIn delay={0.15}>
                  <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1]">
                    {solution.title}
                  </h1>
                </FadeIn>

                <FadeIn delay={0.2}>
                  <p className="text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl">
                    {solution.description}
                  </p>
                </FadeIn>

                <FadeIn delay={0.25}>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button href="/contact" size="lg">
                      Get Started
                      <span className="material-icons text-lg ml-1">arrow_forward</span>
                    </Button>
                    <Button href="/contact" variant="outline" size="lg">
                      Get a Quote
                    </Button>
                  </div>
                </FadeIn>
              </div>

              {/* Icon visual — shown only when a solution has no product screenshots */}
              {screenshots.length === 0 && (
                <FadeIn delay={0.3}>
                  <div className="hidden lg:flex items-center justify-center">
                    <div
                      className="w-36 h-36 rounded-3xl flex items-center justify-center relative"
                      style={{ backgroundColor: `${solution.color}10` }}
                    >
                      <div
                        className="absolute inset-0 rounded-3xl blur-2xl opacity-20"
                        style={{ backgroundColor: solution.color }}
                      />
                      <span
                        className="material-icons relative z-10"
                        style={{ color: solution.color, fontSize: '72px' }}
                      >
                        {solution.icon}
                      </span>
                    </div>
                  </div>
                </FadeIn>
              )}
            </div>

            {/* Product screenshots — real, data-filled UI of this feature */}
            {screenshots.length > 0 && (
              <FadeIn delay={0.3}>
                <div className="mt-14">
                  <SolutionGallery images={screenshots} color={solution.color} label={solution.title} />
                </div>
              </FadeIn>
            )}
          </div>
        </div>
      </section>

      {/* What We Offer */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-14">
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">What We Offer</h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Capabilities tailored to deliver exactly what your project needs
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {solution.features.map((feature, index) => (
                <SlideIn key={index} direction="up" delay={index * 0.05}>
                  <div className="flex items-start gap-3 p-5 rounded-xl bg-background border border-border hover:border-primary/20 transition-colors">
                    <span
                      className="material-icons text-xl mt-0.5 flex-shrink-0"
                      style={{ color: solution.color }}
                    >
                      check_circle
                    </span>
                    <span className="text-foreground font-medium">{feature}</span>
                  </div>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-14">
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Why It Matters</h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  The outcomes you can expect from working with us
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {solution.benefits.map((benefit, index) => (
                <SlideIn key={index} direction={index % 2 === 0 ? 'left' : 'right'} delay={index * 0.08}>
                  <div className="flex items-start gap-4 p-6 rounded-xl bg-background border border-border">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${solution.color}15` }}
                    >
                      <span className="material-icons text-xl" style={{ color: solution.color }}>
                        trending_up
                      </span>
                    </div>
                    <p className="text-lg text-foreground leading-relaxed">{benefit}</p>
                  </div>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              <div className="text-center mb-14">
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Our Process</h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  A clear, collaborative approach from start to finish
                </p>
              </div>
            </FadeIn>

            <div className="relative">
              {/* Vertical line */}
              <div
                className="absolute left-6 top-0 bottom-0 w-0.5 hidden md:block"
                style={{ backgroundColor: `${solution.color}20` }}
              />

              <div className="space-y-8">
                {solution.process.map((step, index) => (
                  <SlideIn key={index} direction="up" delay={index * 0.1}>
                    <div className="flex gap-6 md:gap-8">
                      {/* Step indicator */}
                      <div className="flex-shrink-0 relative z-10">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                          style={{ backgroundColor: solution.color }}
                        >
                          {index + 1}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-2">
                        <h3 className="text-xl md:text-2xl font-bold mb-2">{step.title}</h3>
                        <p className="text-muted-foreground text-lg leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </SlideIn>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Other Solutions */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <div className="text-center mb-12">
                <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">
                  Explore Other Solutions
                </h2>
                <p className="text-muted-foreground">
                  See how our services work together to support your business
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {otherSolutions.map((other, i) => (
                <SlideIn key={other.slug} direction="up" delay={i * 0.05}>
                  <Link href={`/solutions/${other.slug}`} className="group">
                    <div className="text-center p-5 rounded-xl bg-background border border-border hover:border-primary/30 hover:shadow-sm transition-all">
                      <span
                        className="material-icons text-3xl mb-2 block"
                        style={{ color: other.color }}
                      >
                        {other.icon}
                      </span>
                      <h3 className="font-heading font-semibold text-sm group-hover:text-primary transition-colors">
                        {other.badge}
                      </h3>
                    </div>
                  </Link>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 md:py-32 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `linear-gradient(135deg, ${solution.color}15 0%, transparent 60%, ${solution.color}08 100%)`,
          }}
        />

        <div className="container mx-auto px-4 text-center relative z-10">
          <FadeIn>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Ready to Get Started?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Let&apos;s discuss how {solution.badge.toLowerCase()} can transform your business
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/contact" size="lg">
                Book a Free Consultation
                <span className="material-icons text-lg ml-1">arrow_forward</span>
              </Button>
              <Button href="/solutions" variant="outline" size="lg">
                View All Solutions
              </Button>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
