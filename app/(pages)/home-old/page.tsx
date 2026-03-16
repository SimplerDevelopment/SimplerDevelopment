import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateWebsiteSchema } from '@/lib/utils/structured-data';
import { HomeClient } from '../HomeClient';
import { BlobColorProvider } from '@/contexts/BlobColorContext';

export const metadata = generateSEO({
  title: 'Home - Original',
  description: 'Design, Dev, and Automation Agency - Creating impressive, interactive web experiences with Three.js and modern web technologies',
  path: '/home-old',
});

export default function HomeOldPage() {
  return (
    <>
      <StructuredData data={generateWebsiteSchema()} />
      <BlobColorProvider>
        <HomeClient />
      </BlobColorProvider>
    </>
  );
}
