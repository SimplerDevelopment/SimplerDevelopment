import { generateSEO } from '@/lib/utils/seo';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export const metadata = generateSEO({
  title: 'Apps and Products',
  description: 'Explore our collection of innovative web applications, tools, and digital products designed to solve real-world problems.',
  path: '/apps-and-products',
});

const products = [
  {
    id: '1',
    title: 'Simpler CMS',
    description: 'A modern content management system built with Next.js. Custom post types, visual block editor, media library, and a clean admin interface.',
    icon: 'edit_note',
    color: '#3b82f6',
    features: ['Block Editor', 'Custom Post Types', 'Media Library', 'Role Management', 'SEO Tools', 'API Access'],
    status: 'Available',
  },
  {
    id: '2',
    title: 'Simpler Prints',
    description: 'E-commerce platform for print-on-demand businesses. Product catalog, order management, and fulfillment integrations.',
    icon: 'local_printshop',
    color: '#10b981',
    features: ['Product Catalog', 'Order Management', 'Fulfillment API', 'Customer Portal', 'Analytics', 'Multi-vendor'],
    status: 'Available',
  },
  {
    id: '3',
    title: 'NXT Jobs',
    description: 'Full-featured job board platform with real-time messaging, application tracking, employer dashboards, and mobile app.',
    icon: 'work',
    color: '#f59e0b',
    features: ['Job Listings', 'Applicant Tracking', 'Real-time Chat', 'Employer Dashboard', 'Mobile App', 'Multi-tenant'],
    status: 'Available',
  },
  {
    id: '4',
    title: 'Philly Dog Walk',
    description: 'On-demand dog walking platform with real-time GPS tracking, scheduling, payments, and walker management.',
    icon: 'pets',
    color: '#f97316',
    features: ['GPS Tracking', 'Scheduling', 'Payments', 'Walker Profiles', 'Photo Updates', 'Rating System'],
    status: 'Available',
  },
];

const capabilities = [
  { title: 'Production Ready', description: 'Tested, documented, and deployed to real users with proven reliability.', icon: 'verified' },
  { title: 'Open Architecture', description: 'Clean APIs and modular design so you can extend or integrate with your stack.', icon: 'hub' },
  { title: 'Ongoing Support', description: 'Continuous updates, bug fixes, and feature development as your needs evolve.', icon: 'support_agent' },
  { title: 'Custom Builds', description: 'Every product can be forked and customized to fit your exact business requirements.', icon: 'tune' },
];

const techStack = [
  { name: 'Next.js', icon: 'web' },
  { name: 'React Native', icon: 'phone_iphone' },
  { name: 'TypeScript', icon: 'code' },
  { name: 'PostgreSQL', icon: 'storage' },
  { name: 'Prisma', icon: 'database' },
  { name: 'Tailwind CSS', icon: 'palette' },
  { name: 'Stripe', icon: 'payments' },
  { name: 'Railway', icon: 'cloud' },
];

export default function AppsAndProductsPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-24 md:py-32 overflow-hidden bg-dot-grid">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <FadeIn>
              <p className="text-primary font-mono text-sm font-semibold mb-4 tracking-wider">// APPS & PRODUCTS</p>
            </FadeIn>
            <FadeIn delay={0.1}>
              <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 leading-[1.05]">
                Software We&apos;ve{' '}
                <span className="text-primary">Built & Ship</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.2}>
              <p className="text-xl text-muted-foreground max-w-xl">
                Real products solving real problems. Each one is available as a white-label
                solution or starting point for your custom project.
              </p>
              <div className="mt-6 w-20 h-1 bg-gradient-to-r from-primary to-accent-warm rounded-full" />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto space-y-28">
            {products.map((product, index) => {
              const isEven = index % 2 === 0;
              return (
                <div key={product.id}>
                  <SlideIn direction={isEven ? 'left' : 'right'} delay={0.1}>
                    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center`}>
                      {/* Visual */}
                      <div className={`${!isEven ? 'lg:order-2' : ''}`}>
                        <div
                          className="rounded-2xl p-10 md:p-14 relative overflow-hidden border"
                          style={{
                            backgroundColor: `${product.color}06`,
                            borderColor: `${product.color}20`,
                          }}
                        >
                          {/* Watermark number */}
                          <span
                            className="absolute -right-4 -top-6 text-[10rem] font-black leading-none select-none pointer-events-none"
                            style={{ color: `${product.color}08` }}
                          >
                            {String(index + 1).padStart(2, '0')}
                          </span>

                          <span
                            className="material-icons relative z-10 mb-8 block"
                            style={{ color: product.color, fontSize: '64px' }}
                          >
                            {product.icon}
                          </span>

                          {/* Feature grid */}
                          <div className="relative z-10 grid grid-cols-2 gap-3">
                            {product.features.map((feature, fi) => (
                              <div key={fi} className="flex items-center gap-2 text-sm">
                                <span
                                  className="material-icons text-base flex-shrink-0"
                                  style={{ color: product.color }}
                                >check</span>
                                <span className="text-muted-foreground">{feature}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Text */}
                      <div className={`${!isEven ? 'lg:order-1' : ''}`}>
                        <p
                          className="font-mono text-sm font-semibold mb-3 tracking-wider"
                          style={{ color: product.color }}
                        >
                          // {String(index + 1).padStart(2, '0')}
                        </p>

                        <div className="flex items-center gap-3 mb-5">
                          <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight">
                            {product.title}
                          </h2>
                          <span
                            className="px-3 py-1 rounded-full text-xs font-bold"
                            style={{
                              backgroundColor: product.status === 'Available' ? '#10b98120' : '#f59e0b20',
                              color: product.status === 'Available' ? '#10b981' : '#f59e0b',
                            }}
                          >
                            {product.status}
                          </span>
                        </div>

                        <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                          {product.description}
                        </p>

                        <div className="flex flex-wrap gap-3">
                          <Button href="/contact" size="md">
                            Request a Demo
                            <span className="material-icons text-lg ml-1">arrow_forward</span>
                          </Button>
                          <Button href="/contact" variant="ghost" size="md">
                            Get Pricing
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

      {/* Capabilities */}
      <section className="py-24 bg-muted/40">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <div className="max-w-2xl mb-14">
                <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">// WHY US</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  Not just code. Products.
                </h2>
                <p className="text-lg text-muted-foreground">
                  Everything we build is designed to run in production, not collect dust in a repo.
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {capabilities.map((cap, index) => (
                <SlideIn key={cap.title} direction="up" delay={index * 0.06}>
                  <div className="relative p-6 rounded-xl bg-background border border-border hover:shadow-lg transition-all duration-300 overflow-hidden h-full">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
                    <span className="material-icons text-3xl text-primary mb-4 block mt-2">{cap.icon}</span>
                    <h3 className="font-heading font-bold text-lg mb-2">{cap.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{cap.description}</p>
                  </div>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              <div className="text-center mb-14">
                <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">// TECH STACK</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  Built With Modern Technology
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Every product shares a proven, modern stack for reliability and performance.
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {techStack.map((tech, i) => (
                <SlideIn key={tech.name} direction="up" delay={i * 0.05}>
                  <div className="text-center p-5 rounded-xl border border-border bg-background hover:border-primary/30 hover:shadow-sm transition-all">
                    <span className="material-icons text-2xl text-primary mb-2 block">{tech.icon}</span>
                    <span className="font-heading font-semibold text-sm">{tech.name}</span>
                  </div>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-dark py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-10" />
        <div className="container mx-auto px-4 text-center relative z-10">
          <FadeIn>
            <p className="font-mono text-sm font-semibold mb-4 tracking-wider opacity-50">// NEXT STEP</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Want something similar?
            </h2>
            <p className="text-xl mb-10 max-w-2xl mx-auto opacity-70">
              We can white-label any of these products for your brand, or build something
              completely custom from scratch.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/contact" size="lg" className="bg-white text-foreground hover:bg-white/90">
                Book a Free Consultation
                <span className="material-icons text-lg ml-1">arrow_forward</span>
              </Button>
              <Button href="/solutions" variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10 hover:text-white">
                View Our Solutions
              </Button>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
