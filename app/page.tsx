import { generateSEO } from '@/lib/utils/seo';
import { getFeaturedBlogPosts } from '@/lib/actions/blog';
import { HomeClient } from './(pages)/HomeClient';

export const metadata = generateSEO({
  title: 'Open-Source All-in-One Agency Platform',
  description: 'Run your whole agency on one open-source platform — websites, CRM, an AI brain, email, bookings & billing in 18 connected modules. Self-host it free (Apache-2.0), or use managed hosting from $19/seat/mo.',
  path: '/',
});

export default async function HomePage() {
  // Pull the 3 most recent real blog posts from the DB so the "From the Blog"
  // cards link to live slugs. (Previously HomeClient read a stale static file
  // whose slugs 404'd.)
  const recentPosts = await getFeaturedBlogPosts();

  return <HomeClient recentPosts={recentPosts} />;
}
