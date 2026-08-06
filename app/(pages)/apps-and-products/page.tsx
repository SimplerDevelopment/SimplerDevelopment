import Image from 'next/image';
import { generateSEO } from '@/lib/utils/seo';
import { PageHeader, CTABanner, CreamBand } from '@/components/retro/sections';
import { SectionHeading, RetroButton, RetroBadge, InkPanel, Star } from '@/components/retro/primitives';

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
    features: ['Block Editor', 'Custom Post Types', 'Media Library', 'Role Management', 'SEO Tools', 'API Access'],
    status: 'Available',
  },
  {
    id: '2',
    title: 'Simpler Prints',
    description: 'E-commerce platform for print-on-demand businesses. Product catalog, order management, and fulfillment integrations.',
    features: ['Product Catalog', 'Order Management', 'Fulfillment API', 'Customer Portal', 'Analytics', 'Multi-vendor'],
    status: 'Available',
  },
  {
    id: '3',
    title: 'NXT Jobs',
    description: 'Full-featured job board platform with real-time messaging, application tracking, employer dashboards, and mobile app.',
    features: ['Job Listings', 'Applicant Tracking', 'Real-time Chat', 'Employer Dashboard', 'Mobile App', 'Multi-tenant'],
    status: 'Available',
  },
  {
    id: '4',
    title: 'Philly Dog Walk',
    description: 'On-demand dog walking platform with real-time GPS tracking, scheduling, payments, and walker management.',
    features: ['GPS Tracking', 'Scheduling', 'Payments', 'Walker Profiles', 'Photo Updates', 'Rating System'],
    status: 'Available',
  },
];

// Real capability claims about how these products are built/supported —
// descriptions kept verbatim from the prior copy; only the surrounding
// headings and icon treatment are re-skinned.
const capabilities = [
  { title: 'Production Ready', description: 'Tested, documented, and deployed to real users with proven reliability.', art: 'shield-rocket' },
  { title: 'Open Architecture', description: 'Clean APIs and modular design so you can extend or integrate with your stack.', art: 'robot' },
  { title: 'Ongoing Support', description: 'Continuous updates, bug fixes, and feature development as your needs evolve.', art: 'crew-man-device' },
  { title: 'Custom Builds', description: 'Every product can be forked and customized to fit your exact business requirements.', art: 'control-console' },
];

const techStack = [
  'Next.js', 'React Native', 'TypeScript', 'PostgreSQL', 'Drizzle ORM', 'Tailwind CSS', 'Stripe', 'Railway',
];

export default function AppsAndProductsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Apps & Products"
        title="Real Products. Already In Orbit."
        subtitle="Real products solving real problems — each one ships as a white-label solution or a starting point for your custom build."
      />

      {/* Products — real titles, descriptions, features and status, unchanged. */}
      <CreamBand>
        <div className="space-y-8">
          {products.map((product, i) => (
            <div
              key={product.id}
              className="rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-cream)] p-7 sm:p-8"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--retro-mid)] text-sm font-bold text-[var(--retro-mid)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 className="font-display text-2xl font-bold text-[var(--retro-ink)]">{product.title}</h2>
                </div>
                <RetroBadge tone={product.status === 'Available' ? 'gold' : 'orange'}>{product.status}</RetroBadge>
              </div>

              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_78%,transparent)]">
                {product.description}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {product.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm text-[color-mix(in_srgb,var(--retro-ink)_80%,transparent)]">
                    <Star className="h-3 w-3 shrink-0 text-[var(--retro-gold)]" />
                    {feature}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <RetroButton href="/contact" variant="primary">
                  Request a Demo
                </RetroButton>
                <RetroButton href="/contact" variant="secondary">
                  Get Pricing
                </RetroButton>
              </div>
            </div>
          ))}
        </div>
      </CreamBand>

      {/* Capabilities */}
      <InkPanel>
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Why Us"
            title="Not Just Code. Products That Ship."
            subtitle="Everything we build runs in production — not gathering dust in a repo."
            onDark
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className="rounded-md border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[var(--retro-deep)] p-6"
              >
                <Image src={`/retro/${cap.art}.webp`} alt="" width={160} height={160} className="h-14 w-14 object-contain" />
                <h3 className="font-display mt-4 text-base font-bold text-[var(--retro-cream)]">{cap.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </InkPanel>

      {/* Tech Stack — real, unchanged names. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Under The Hood"
          title="Built With Modern Technology"
          subtitle="Every product shares a proven, modern stack for reliability and performance."
        />
        <div className="flex flex-wrap justify-center gap-3">
          {techStack.map((tech) => (
            <RetroBadge key={tech} tone="teal">
              {tech}
            </RetroBadge>
          ))}
        </div>
      </CreamBand>

      <CTABanner
        title="Want Your Own Fleet?"
        subtitle="We'll white-label any of these for your brand — or build something completely custom from scratch."
        primary={{ href: '/contact', label: 'Book a Free Consultation' }}
        secondary={{ href: '/solutions', label: 'View Our Solutions' }}
        art="shield-rocket"
      />
    </div>
  );
}
