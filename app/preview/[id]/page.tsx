import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Block, BlockEditorData } from '@/types/blocks';
import { verifyPreviewToken } from '@/lib/preview-token';
import { PreviewRenderer } from './PreviewRenderer';

interface PreviewPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PreviewPage({ params, searchParams }: PreviewPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const postId = parseInt(id);

  if (isNaN(postId)) {
    notFound();
  }

  const [post] = await db
    .select()
    .from(posts)
    .where(eq(posts.id, postId));

  if (!post) {
    notFound();
  }

  // Auth gate: require a valid site-scoped preview token. Without this, anyone
  // could read any tenant's (incl. unpublished) post by enumerating /preview/<id>.
  // The token is keyed to the post's websiteId — the editor mints site-wide
  // tokens; global/admin posts (websiteId=null) aren't previewable via this route.
  // notFound() (not 401) so failures don't confirm the post exists.
  const token = typeof query.token === 'string' ? query.token : '';
  if (post.websiteId == null || !token || !verifyPreviewToken(post.websiteId, token)) {
    notFound();
  }

  let blocks: Block[] = [];
  try {
    const data = JSON.parse(post.content) as BlockEditorData;
    blocks = data.blocks || [];
  } catch {
    // If content is not block JSON, render as HTML
    return (
      <PreviewRenderer
        title={post.title}
        htmlContent={post.content}
        blocks={[]}
        isDraft={!post.published}
      />
    );
  }

  return (
    <PreviewRenderer
      title={post.title}
      blocks={blocks}
      isDraft={!post.published}
    />
  );
}
