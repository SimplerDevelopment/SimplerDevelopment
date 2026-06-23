import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function seedPostTypes() {
  const { db } = await import('../lib/db');
  const { postTypes } = await import('../lib/db/schema');

  const defaultPostTypes = [
    {
      name: 'Blog',
      slug: 'blog',
      description: 'Blog posts and articles',
      icon: 'article',
      active: true,
    },
    {
      name: 'Page',
      slug: 'page',
      description: 'Static pages',
      icon: 'description',
      active: true,
    },
    {
      name: 'Portfolio',
      slug: 'portfolio',
      description: 'Portfolio items',
      icon: 'folder',
      active: true,
    },
    {
      name: 'Event',
      slug: 'event',
      description: 'Events and activities',
      icon: 'event',
      active: true,
    },
  ];

  console.log('Seeding post types...');

  for (const postType of defaultPostTypes) {
    try {
      const [created] = await db
        .insert(postTypes)
        .values(postType)
        .onConflictDoNothing()
        .returning();

      if (created) {
        console.log(`✓ Created post type: ${postType.name}`);
      } else {
        console.log(`- Post type already exists: ${postType.name}`);
      }
    } catch (error) {
      console.error(`✗ Error creating post type ${postType.name}:`, error);
    }
  }

  console.log('Seeding completed!');
  process.exit(0);
}

seedPostTypes();
