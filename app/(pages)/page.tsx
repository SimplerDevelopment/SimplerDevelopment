import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateWebsiteSchema } from '@/lib/utils/structured-data';
import { HomeClient } from './HomeClient';

export const metadata = generateSEO({
  title: 'Home',
  description: 'Design, Dev, and Automation Agency - Creating impressive, interactive web experiences with Three.js and modern web technologies',
  path: '/',
});

export default function HomePage() {
  return (
    <>
      <StructuredData data={generateWebsiteSchema()} />
      <HomeClient />
    </>
  );
}
