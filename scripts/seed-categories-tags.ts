import * as dotenv from 'dotenv';

// Load env vars before importing db
dotenv.config({ path: '.env.local' });

async function seedCategoriesAndTags() {
  try {
    const { db } = await import('../lib/db');
    const { categories, tags } = await import('../lib/db/schema');

    // Categories based on Home Page hero slides and content
    const categoriesToSeed = [
      {
        name: 'Design',
        slug: 'design',
        description: 'UI/UX design trends, tips, and best practices',
        color: '#22c55e', // green
      },
      {
        name: 'Development',
        slug: 'development',
        description: 'Web and mobile development tutorials and insights',
        color: '#3b82f6', // blue
      },
      {
        name: 'AI & Automation',
        slug: 'ai-automation',
        description: 'Artificial intelligence and workflow automation',
        color: '#a855f7', // purple
      },
      {
        name: 'Growth & Marketing',
        slug: 'growth-marketing',
        description: 'Digital marketing strategies and growth hacking',
        color: '#ec4899', // pink
      },
      {
        name: 'Case Studies',
        slug: 'case-studies',
        description: 'Real-world project success stories',
        color: '#f97316', // orange
      },
    ];

    // Tags based on Home Page content and technologies mentioned
    const tagsToSeed = [
      // Design tags
      { name: 'Web Design', slug: 'web-design' },
      { name: 'UI/UX', slug: 'ui-ux' },
      { name: 'Trends', slug: 'trends' },
      { name: 'Three.js', slug: 'threejs' },
      { name: 'Figma', slug: 'figma' },

      // Development tags
      { name: 'Next.js', slug: 'nextjs' },
      { name: 'React', slug: 'react' },
      { name: 'TypeScript', slug: 'typescript' },
      { name: 'Node.js', slug: 'nodejs' },
      { name: 'JavaScript', slug: 'javascript' },
      { name: 'Web Development', slug: 'web-development' },
      { name: 'Performance', slug: 'performance' },
      { name: 'Vue.js', slug: 'vuejs' },

      // E-commerce & CMS tags
      { name: 'WordPress', slug: 'wordpress' },
      { name: 'Shopify', slug: 'shopify' },
      { name: 'BigCommerce', slug: 'bigcommerce' },
      { name: 'Sanity.io', slug: 'sanity' },
      { name: 'Builder.io', slug: 'builderio' },

      // Cloud & Infrastructure tags
      { name: 'AWS', slug: 'aws' },
      { name: 'Vercel', slug: 'vercel' },
      { name: 'Railway', slug: 'railway' },
      { name: 'PostgreSQL', slug: 'postgresql' },

      // AI & Automation tags
      { name: 'AI', slug: 'ai' },
      { name: 'Automation', slug: 'automation' },
      { name: 'GPT-4', slug: 'gpt-4' },
      { name: 'Claude', slug: 'claude' },
      { name: 'n8n', slug: 'n8n' },

      // Marketing & Growth tags
      { name: 'SEO', slug: 'seo' },
      { name: 'Marketing', slug: 'marketing' },
      { name: 'Content Strategy', slug: 'content-strategy' },

      // Mobile Development tags
      { name: 'iOS', slug: 'ios' },
      { name: 'Android', slug: 'android' },
      { name: 'Mobile Development', slug: 'mobile-development' },

      // Business tags
      { name: 'SaaS', slug: 'saas' },
      { name: 'MVP', slug: 'mvp' },
      { name: 'Case Study', slug: 'case-study' },

      // Payment & Integration tags
      { name: 'Stripe', slug: 'stripe' },
      { name: 'Google', slug: 'google' },
      { name: 'Gmail', slug: 'gmail' },
      { name: 'LinkedIn', slug: 'linkedin' },
      { name: 'HubSpot', slug: 'hubspot' },
      { name: 'Apollo.io', slug: 'apolloio' },
      { name: 'Bullhorn', slug: 'bullhorn' },
    ];

    console.log('🌱 Seeding categories...');
    for (const category of categoriesToSeed) {
      try {
        await db.insert(categories).values(category).onConflictDoNothing();
        console.log(`  ✓ Added category: ${category.name}`);
      } catch (error) {
        console.log(`  ⚠ Category "${category.name}" might already exist, skipping...`);
      }
    }

    console.log('\n🏷️  Seeding tags...');
    for (const tag of tagsToSeed) {
      try {
        await db.insert(tags).values(tag).onConflictDoNothing();
        console.log(`  ✓ Added tag: ${tag.name}`);
      } catch (error) {
        console.log(`  ⚠ Tag "${tag.name}" might already exist, skipping...`);
      }
    }

    console.log('\n✅ Categories and tags seeded successfully!');
    console.log(`\nSummary:`);
    console.log(`  - ${categoriesToSeed.length} categories`);
    console.log(`  - ${tagsToSeed.length} tags`);
  } catch (error) {
    console.error('❌ Error seeding categories and tags:', error);
  }
  process.exit(0);
}

seedCategoriesAndTags();
