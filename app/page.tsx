import { generateSEO } from '@/lib/utils/seo';
import { HomeClient } from './(pages)/HomeClient';

export const metadata = generateSEO({
  title: 'Web & Mobile Development Agency',
  description: 'Full-stack web and mobile development agency. We build beautiful, scalable applications with modern technology, stunning design, and seamless user experiences.',
  path: '/',
});

export default function HomePage() {
  return <HomeClient />;
}
