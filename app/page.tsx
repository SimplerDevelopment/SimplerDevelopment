import { generateSEO } from '@/lib/utils/seo';
import { getFeaturedBlogPosts } from '@/lib/actions/blog';
import { HomeClient } from './(pages)/HomeClient';

export const metadata = generateSEO({
  title: 'Web & Mobile Development Agency',
  description: 'Full-stack web and mobile development agency. We build beautiful, scalable applications with modern technology, stunning design, and seamless user experiences.',
  path: '/',
});

export default async function HomePage() {
  // Pull the 3 most recent real blog posts from the DB so the "From the Blog"
  // cards link to live slugs. (Previously HomeClient read a stale static file
  // whose slugs 404'd.)
  const recentPosts = await getFeaturedBlogPosts();

  return <HomeClient recentPosts={recentPosts} />;
}
