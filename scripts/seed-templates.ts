import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const templates = [
  {
    name: 'Hero with Gradient CTA',
    slug: 'hero-gradient-cta',
    description: 'Bold hero section with title, subtitle, description, and two CTA buttons',
    category: 'marketing',
    scope: 'block',
    tags: ['hero', 'landing', 'cta'],
    blocks: [{ type: 'hero', title: 'Transform Your Digital Presence', subtitle: 'Web Development Agency', description: 'We build high-performance websites and applications that drive results for ambitious businesses.', ctaText: 'Get Started', ctaLink: '/contact', secondaryCtaText: 'View Our Work', secondaryCtaLink: '/portfolio' }],
  },
  {
    name: 'Two Column: Text + Image',
    slug: 'two-col-text-image',
    description: 'Classic two-column layout with text content on one side and an image on the other',
    category: 'layout',
    scope: 'block',
    tags: ['columns', 'layout', 'content'],
    blocks: [{ type: 'columns', columns: [{ id: 'col-1', width: 50, blocks: [{ type: 'heading', content: 'Why Choose Us', level: 2, alignment: 'left' }, { type: 'text', content: 'We combine technical expertise with creative design to deliver solutions that exceed expectations. Our team has over a decade of experience building for the web.', alignment: 'left', size: 'base' }] }, { id: 'col-2', width: 50, blocks: [{ type: 'image', url: '/placeholder-600x400.jpg', alt: 'Team collaboration', width: 'full', alignment: 'center' }] }], gap: 'lg' }],
  },
  {
    name: 'Call to Action Banner',
    slug: 'cta-banner',
    description: 'Eye-catching CTA section with gradient background and two buttons',
    category: 'marketing',
    scope: 'block',
    tags: ['cta', 'conversion', 'banner'],
    blocks: [{ type: 'cta', title: 'Ready to Start Your Project?', description: 'Let us help you bring your vision to life. Get a free consultation today.', primaryButtonText: 'Schedule a Call', primaryButtonUrl: '/contact', secondaryButtonText: 'View Pricing', secondaryButtonUrl: '/pricing', backgroundStyle: 'gradient' }],
  },
  {
    name: 'FAQ Section',
    slug: 'faq-section',
    description: 'Expandable FAQ accordion with common questions',
    category: 'content',
    scope: 'block',
    tags: ['faq', 'accordion', 'support'],
    blocks: [{ type: 'accordion', title: 'Frequently Asked Questions', items: [{ id: 'faq-1', title: 'What services do you offer?', content: 'We offer web development, mobile app development, UI/UX design, and digital strategy consulting.' }, { id: 'faq-2', title: 'How long does a typical project take?', content: 'Project timelines vary based on scope. A typical website takes 4-8 weeks, while larger applications may take 3-6 months.' }, { id: 'faq-3', title: 'Do you offer ongoing support?', content: 'Yes, we offer maintenance and support packages to keep your application running smoothly after launch.' }, { id: 'faq-4', title: 'What is your pricing model?', content: 'We offer both fixed-price and time-and-materials pricing depending on project requirements. Contact us for a custom quote.' }] }],
  },
  {
    name: 'Stats Row',
    slug: 'stats-row',
    description: 'Key metrics display with large numbers and labels',
    category: 'marketing',
    scope: 'block',
    tags: ['stats', 'numbers', 'social-proof'],
    blocks: [{ type: 'stats', title: 'By the Numbers', stats: [{ id: 'stat-1', value: '150+', label: 'Projects Delivered' }, { id: 'stat-2', value: '98%', label: 'Client Satisfaction' }, { id: 'stat-3', value: '10+', label: 'Years Experience' }, { id: 'stat-4', value: '24/7', label: 'Support Available' }], columns: 4 }],
  },
  {
    name: 'Testimonial Quote',
    slug: 'testimonial-quote',
    description: 'Client testimonial with author info',
    category: 'marketing',
    scope: 'block',
    tags: ['testimonial', 'social-proof', 'review'],
    blocks: [{ type: 'testimonial', quote: 'Working with this team transformed our online presence. They delivered a beautiful, fast website that our customers love. Revenue increased 40% within three months of launch.', author: 'Sarah Chen', role: 'CEO', company: 'TechStart Inc' }],
  },
  {
    name: 'Services Grid',
    slug: 'services-grid-3col',
    description: 'Three-column grid showcasing services with icons and descriptions',
    category: 'marketing',
    scope: 'block',
    tags: ['services', 'features', 'grid'],
    blocks: [{ type: 'services-grid', title: 'What We Do', description: 'Full-service digital solutions for modern businesses', services: [{ id: 'svc-1', title: 'Web Development', description: 'Custom websites and web applications built with modern frameworks', icon: 'code' }, { id: 'svc-2', title: 'Mobile Apps', description: 'Native and cross-platform mobile applications for iOS and Android', icon: 'smartphone' }, { id: 'svc-3', title: 'UI/UX Design', description: 'User-centered design that delights customers and drives engagement', icon: 'palette' }], columns: 3 }],
  },
  {
    name: 'Landing Page Section',
    slug: 'landing-page-section',
    description: 'Complete landing page section: heading, description, two-column features, and CTA',
    category: 'marketing',
    scope: 'section',
    tags: ['landing', 'section', 'complete'],
    blocks: [
      { type: 'heading', content: 'Everything You Need to Succeed', level: 2, alignment: 'center' },
      { type: 'text', content: 'Our platform provides all the tools and support you need to grow your business online.', alignment: 'center', size: 'lg' },
      { type: 'columns', columns: [{ id: 'col-1', width: 50, blocks: [{ type: 'heading', content: 'Fast Performance', level: 3, alignment: 'left' }, { type: 'text', content: 'Optimized for speed with server-side rendering and edge caching. Your visitors get a blazing fast experience.', alignment: 'left', size: 'base' }] }, { id: 'col-2', width: 50, blocks: [{ type: 'heading', content: 'SEO Optimized', level: 3, alignment: 'left' }, { type: 'text', content: 'Built-in SEO best practices ensure your content ranks well. Structured data, meta tags, and sitemaps included.', alignment: 'left', size: 'base' }] }], gap: 'lg' },
      { type: 'cta', title: 'Start Building Today', description: 'Join hundreds of businesses already growing with our platform', primaryButtonText: 'Get Started Free', primaryButtonUrl: '/signup', backgroundStyle: 'gradient' },
    ],
  },
  {
    name: 'Blog Post Intro',
    slug: 'blog-post-intro',
    description: 'Standard blog post opening: featured image, heading, and intro paragraph',
    category: 'content',
    scope: 'section',
    tags: ['blog', 'article', 'intro'],
    blocks: [
      { type: 'image', url: '/placeholder-1200x600.jpg', alt: 'Blog post featured image', width: 'full', alignment: 'center' },
      { type: 'heading', content: 'Your Blog Post Title Here', level: 1, alignment: 'left' },
      { type: 'text', content: 'Write your opening paragraph here. A strong introduction hooks the reader and sets up what they will learn from this article. Keep it concise and compelling.', alignment: 'left', size: 'lg' },
    ],
  },
  {
    name: 'Featured Content: Left Image',
    slug: 'featured-left-image',
    description: 'Featured content block with image on the left and text on the right',
    category: 'content',
    scope: 'block',
    tags: ['featured', 'content', 'image'],
    blocks: [{ type: 'featured-content', title: 'Built for Scale', description: 'Our architecture handles millions of requests without breaking a sweat. Auto-scaling infrastructure means you never worry about traffic spikes.', imageUrl: '/placeholder-600x400.jpg', imagePosition: 'left', buttonText: 'Learn More', buttonUrl: '/features' }],
  },
];

async function seed() {
  const { db } = await import('../lib/db');
  const { blockTemplates } = await import('../lib/db/schema');

  console.log('Seeding block templates...');

  for (const t of templates) {
    try {
      const [result] = await db
        .insert(blockTemplates)
        .values({
          name: t.name,
          slug: t.slug,
          description: t.description,
          category: t.category,
          scope: t.scope,
          blocks: t.blocks,
          tags: t.tags,
          lockedFields: [],
        })
        .returning();

      console.log(`  + ${result.name} (id: ${result.id})`);
    } catch (err: any) {
      if (err.message?.includes('unique')) {
        console.log(`  ~ ${t.name} (already exists, skipping)`);
      } else {
        console.error(`  x ${t.name}: ${err.message}`);
      }
    }
  }

  console.log('Done!');
  process.exit(0);
}

seed();
