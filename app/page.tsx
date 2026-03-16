import { generateSEO } from '@/lib/utils/seo';
import { HomeClientComingSoon } from './(pages)/HomeClientComingSoon';

export const metadata = generateSEO({
  title: 'Coming Soon',
  description: 'Something amazing is on the way. Stay tuned.',
  path: '/',
});

export default function HomePage() {
  return <HomeClientComingSoon />;
}
