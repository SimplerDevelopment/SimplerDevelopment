import { getAllSolutions } from '@/lib/data/solutions';
import { generateSEO } from '@/lib/utils/seo';
import Link from 'next/link';
import { motion } from 'framer-motion';

export const metadata = generateSEO({
  title: 'Solutions',
  description: 'Explore our design, development, automation, growth, and partnership solutions',
  path: '/solutions',
});

export default function SolutionsPage() {
  const solutions = getAllSolutions();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)]" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">Our Solutions</h1>
            <p className="text-xl md:text-2xl text-muted-foreground">
              Comprehensive services to transform your digital presence and accelerate growth
            </p>
          </div>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {solutions.map((solution, index) => (
              <Link
                key={solution.slug}
                href={`/solutions/${solution.slug}`}
                className="group"
              >
                <div className="bg-background/40 backdrop-blur-sm border border-primary/20 rounded-lg p-8 hover:border-primary/40 transition-all duration-300 hover:scale-105 h-full flex flex-col">
                  {/* Icon with colored background */}
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                    style={{ backgroundColor: `${solution.color}20` }}
                  >
                    <span
                      className="material-icons text-4xl"
                      style={{ color: solution.color }}
                    >
                      {solution.icon}
                    </span>
                  </div>

                  {/* Badge */}
                  <div className="inline-block mb-3 w-fit">
                    <div
                      className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2"
                      style={{ backgroundColor: `${solution.color}20`, color: solution.color }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: solution.color }} />
                      {solution.badge}
                    </div>
                  </div>

                  {/* Content */}
                  <h2 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors">
                    {solution.title}
                  </h2>
                  <p className="text-muted-foreground mb-6 flex-1">
                    {solution.description}
                  </p>

                  {/* Learn More Link */}
                  <div className="flex items-center text-primary group-hover:gap-2 transition-all">
                    <span>Learn more</span>
                    <svg
                      className="w-5 h-5 transform group-hover:translate-x-1 transition-transform"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20 opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)]" />

        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Let&apos;s discuss how our solutions can help transform your business
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-md px-8 py-4 text-lg font-medium transition-colors"
            style={{ backgroundColor: '#8b5cf6', color: '#ffffff' }}
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
        </div>
      </section>
    </div>
  );
}
