import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateWebsiteSchema } from '@/lib/utils/structured-data';
import { HomeClient } from './HomeClient';

export const metadata = generateSEO({
  title: 'Home',
  description: 'All-in-one business platform — website builder, email marketing, CRM, booking, project management, AI chatbot, and managed hosting in one dashboard',
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
