import { getPageBySlug, getAllPages } from '@/lib/actions/pages';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';
import { BlockEditorData, PageSettings } from '@/types/blocks';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const pages = await getAllPages();
    return pages.map((page) => ({ slug: page.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) {
    return { title: 'Page Not Found' };
  }

  return {
    title: `${page.title} | W.H. Peters Outdoor Adventures`,
    description: page.excerpt || undefined,
  };
}

export default async function PetersOutdoorPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) {
    notFound();
  }

  let pageSettings: PageSettings = {};
  try {
    const data = JSON.parse(page.content) as BlockEditorData;
    pageSettings = data.pageSettings || {};
  } catch {
    // ignore
  }

  const ps = pageSettings;

  return (
    <article
      className={`block-content ${ps.fontFamily || ''} ${ps.cssClass || ''}`}
      style={{
        ...(ps.backgroundColor ? { backgroundColor: ps.backgroundColor } : {}),
        ...(ps.backgroundImage ? {
          backgroundImage: `url(${ps.backgroundImage})`,
          backgroundSize: ps.backgroundSize || 'cover',
          backgroundPosition: ps.backgroundPosition || 'center',
        } : {}),
        ...(ps.maxWidth ? { maxWidth: ps.maxWidth, marginLeft: 'auto', marginRight: 'auto' } : {}),
        ...(ps.color ? { color: ps.color } : {}),
        padding: `${ps.paddingTop || '0'} ${ps.paddingRight || '0'} ${ps.paddingBottom || '0'} ${ps.paddingLeft || '0'}`,
      }}
    >
      <BlockRenderer content={page.content} />
    </article>
  );
}
