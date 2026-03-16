import { generateSEO } from '@/lib/utils/seo';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { Card } from '@/components/ui/Card';
import { AppsHeroWith3D } from '@/components/sections/AppsHeroWith3D';
import { CMSCarouselSection } from '@/components/sections/CMSCarouselSection';

export const metadata = generateSEO({
  title: 'Apps and Products',
  description: 'Explore our collection of innovative web applications, tools, and digital products designed to solve real-world problems and enhance your digital experience.',
  path: '/apps-and-products',
});

const products = [
  {
    id: '1',
    title: 'Block Editor',
    description: 'A powerful visual content editor with drag-and-drop functionality, responsive design controls, and extensive customization options.',
    icon: '🎨',
    features: ['Visual Editing', 'Responsive Controls', 'Custom Blocks'],
    status: 'Available',
  },
  {
    id: '2',
    title: 'CMS Platform',
    description: 'A modern content management system built with Next.js, featuring custom post types, custom fields, and a beautiful admin interface.',
    icon: '📝',
    features: ['Custom Post Types', 'Visual Editor', 'Role Management'],
    status: 'Available',
  },
  {
    id: '3',
    title: 'Automation Workflows',
    description: 'Pre-built automation templates and workflows for common business processes, ready to integrate with your systems.',
    icon: '⚙️',
    features: ['Pre-built Templates', 'API Integrations', 'Custom Triggers'],
    status: 'Coming Soon',
  },
  {
    id: '4',
    title: 'Component Library',
    description: 'A comprehensive collection of reusable React components with TypeScript support, animations, and theme customization.',
    icon: '🧩',
    features: ['TypeScript Support', 'Theme System', 'Accessibility'],
    status: 'Available',
  },
];

const features = [
  {
    title: 'Production Ready',
    description: 'All our products are thoroughly tested and ready for production use with comprehensive documentation.',
    icon: '✅',
  },
  {
    title: 'Regular Updates',
    description: 'We continuously improve our products with new features, bug fixes, and performance enhancements.',
    icon: '🔄',
  },
  {
    title: 'Support Included',
    description: 'Get help when you need it with dedicated support channels and detailed documentation.',
    icon: '💬',
  },
  {
    title: 'Customizable',
    description: 'Tailor our products to fit your needs with extensive configuration options and plugin support.',
    icon: '🎯',
  },
];

export default function AppsAndProductsPage() {
  return (
    <>
      {/* Hero with 3D Background */}
      <AppsHeroWith3D />

      {/* CMS Carousel Section */}
      <CMSCarouselSection title={"Simpler CMS"} />
      <CMSCarouselSection title={"Simpler Prints"} />
      <CMSCarouselSection title={"NXT Jobs"} />
      <CMSCarouselSection title={"Philly Dog Walk"} />


      {/* Features Section */}
      <section className="py-20 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <FadeIn>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-4 tracking-tight">Why Choose Our Products</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Built with best practices and modern technologies
              </p>
            </FadeIn>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <SlideIn key={index} direction="up" delay={index * 0.1}>
                <Card
                  title={feature.title}
                  description={feature.description}
                  icon={feature.icon}
                />
              </SlideIn>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <FadeIn>
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-6 tracking-tight">
                Built with Modern Technology
              </h2>
              <p className="text-xl text-muted-foreground mb-12">
                Our products leverage cutting-edge frameworks and tools to deliver exceptional performance,
                scalability, and developer experience.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Framer Motion', 'PostgreSQL', 'Drizzle ORM'].map((tech) => (
                  <span
                    key={tech}
                    className="px-6 py-3 bg-card border border-border rounded-lg font-medium hover:bg-primary/10 hover:border-primary transition-all"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="container mx-auto px-4 text-center">
          <FadeIn>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-6 tracking-tight">
              Ready to Get Started?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Explore our products and see how they can transform your digital projects.
              Contact us for custom solutions tailored to your needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/contact"
                className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-4 text-lg font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Contact Us
              </a>
              <a
                href="/solutions"
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-8 py-4 text-lg font-medium hover:bg-accent transition-colors"
              >
                View Solutions
              </a>
            </div>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
