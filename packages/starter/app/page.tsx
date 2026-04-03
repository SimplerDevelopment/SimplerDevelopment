import { sd } from '@/lib/sd';
import BlockRenderer from '@/components/BlockRenderer';

export default async function HomePage() {
  const pages = await sd.pages.list({ limit: 100 });
  const homePage = pages.data.find(p => p.slug === 'home' || p.slug === 'index') || pages.data[0];

  if (!homePage) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">Welcome</h1>
        <p className="text-gray-600">Create your first page in the SimplerDevelopment portal to get started.</p>
      </div>
    );
  }

  // Fetch full page content
  const post = await sd.posts.get(homePage.slug);
  return <BlockRenderer content={post.content} />;
}
