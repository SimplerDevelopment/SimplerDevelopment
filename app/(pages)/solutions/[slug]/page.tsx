import { getSolutionBySlug, getAllSolutions } from '@/lib/data/solutions';
import { generateSEO } from '@/lib/utils/seo';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const solutions = getAllSolutions();

  return solutions.map((solution) => ({
    slug: solution.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const solution = getSolutionBySlug(slug);

  if (!solution) {
    return {
      title: 'Solution Not Found',
    };
  }

  return generateSEO({
    title: solution.title,
    description: solution.description,
    path: `/solutions/${slug}`,
  });
}

export default async function SolutionPage({ params }: PageProps) {
  const { slug } = await params;
  const solution = getSolutionBySlug(slug);

  if (!solution) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-32 overflow-hidden">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background: `linear-gradient(to bottom right, ${solution.color}40, ${solution.color}20, transparent)`
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,white_75%,var(--solution-color)_100%)]" style={{ '--solution-color': solution.color } as React.CSSProperties} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-block mb-6">
              <div
                className="px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2"
                style={{ backgroundColor: `${solution.color}20`, color: solution.color }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: solution.color }} />
                {solution.badge}
              </div>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold mb-6">{solution.title}</h1>
            <p className="text-xl md:text-2xl text-muted-foreground">
              {solution.description}
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">What We Offer</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {solution.features.map((feature, index) => (
                <div
                  key={index}
                  className="bg-background/40 backdrop-blur-sm border border-primary/20 rounded-lg p-6 hover:border-primary/40 transition-all duration-300"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                      style={{ backgroundColor: solution.color }}
                    >
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-foreground">{feature}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 relative bg-background/40">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">Key Benefits</h2>
            <div className="space-y-6">
              {solution.benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 bg-background/60 backdrop-blur-sm border border-primary/20 rounded-lg p-6"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${solution.color}20` }}
                  >
                    <span className="material-icons text-xl" style={{ color: solution.color }}>
                      check_circle
                    </span>
                  </div>
                  <p className="text-lg text-foreground">{benefit}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">Our Process</h2>
            <div className="space-y-8">
              {solution.process.map((step, index) => (
                <div key={index} className="flex gap-6">
                  {/* Step Number */}
                  <div className="flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
                      style={{ backgroundColor: solution.color }}
                    >
                      {index + 1}
                    </div>
                  </div>

                  {/* Step Content */}
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold mb-2">{step.title}</h3>
                    <p className="text-muted-foreground text-lg">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background: `linear-gradient(to right, ${solution.color}40, ${solution.color}20, ${solution.color}40)`
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)]" />

        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Let&apos;s discuss how {solution.badge.toLowerCase()} can transform your business
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md px-8 py-4 text-lg font-medium transition-colors"
              style={{ backgroundColor: solution.color, color: '#ffffff' }}
            >
              Start Your Project
              <svg
                className="w-5 h-5 ml-2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/solutions"
              className="inline-flex items-center justify-center rounded-md px-8 py-4 text-lg font-medium border border-primary/20 bg-background/20 backdrop-blur-sm hover:bg-primary/10 transition-colors"
            >
              View All Solutions
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
