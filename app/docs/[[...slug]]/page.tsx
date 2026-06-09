import fs from 'fs/promises';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ALL_SLUGS, slugToParam, resolveDoc, extractToc } from '../_lib/nav';
import { Markdown } from '../_components/Markdown';
import { TableOfContents } from '../_components/TableOfContents';

type PageProps = { params: Promise<{ slug?: string[] }> };

// Only the curated nav slugs are public — other docs/*.md (internal guides,
// installer notes) must not be reachable under /docs.
export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_SLUGS.map((slug) => ({ slug: slugToParam(slug) }));
}

function firstH1(md: string): string | null {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/[`*]/g, '').trim() : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = await resolveDoc(slug ?? []);
  if (!doc) return { title: 'Documentation – SimplerDevelopment' };
  const md = await fs.readFile(doc.filePath, 'utf-8');
  const h1 = firstH1(md);
  return {
    title: h1 ? `${h1} – SimplerDevelopment Docs` : 'Documentation – SimplerDevelopment',
    description: `SimplerDevelopment developer documentation${h1 ? `: ${h1}` : ''}.`,
  };
}

export default async function DocsPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = await resolveDoc(slug ?? []);
  if (!doc) notFound();

  const content = await fs.readFile(doc.filePath, 'utf-8');
  const toc = extractToc(content);

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-12 px-5 py-12 sm:px-8 sm:py-16">
      <article className="docs-article markdown-preview prose prose-stone min-w-0 max-w-none flex-1 dark:prose-invert">
        <Markdown content={content} docDir={doc.docDir} />
      </article>

      <aside className="hidden w-56 shrink-0 xl:block">
        <div className="docs-scroll sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
          <TableOfContents toc={toc} />
        </div>
      </aside>
    </div>
  );
}
