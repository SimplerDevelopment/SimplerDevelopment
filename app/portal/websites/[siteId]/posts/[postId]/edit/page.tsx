import { db } from '@/lib/db';
import { clientWebsites, posts, postCategories, postTags } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import PortalPostForm from '@/components/portal/PortalPostForm';

export default async function PortalEditPostPage({
  params,
}: {
  params: Promise<{ siteId: string; postId: string }>;
}) {
  const { siteId, postId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) notFound();

  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, parseInt(postId)), eq(posts.websiteId, site.id)))
    .limit(1);

  if (!post) notFound();

  const [cats, tgs] = await Promise.all([
    db.select({ categoryId: postCategories.categoryId }).from(postCategories).where(eq(postCategories.postId, post.id)),
    db.select({ tagId: postTags.tagId }).from(postTags).where(eq(postTags.postId, post.id)),
  ]);

  return (
    <PortalPostForm
      siteId={site.id}
      mode="edit"
      post={{
        id: post.id,
        title: post.title,
        slug: post.slug,
        postType: post.postType,
        excerpt: post.excerpt || '',
        content: post.content,
        coverImage: post.coverImage || '',
        published: post.published,
        publishedAt: post.publishedAt?.toISOString() || null,
        categoryIds: cats.map(c => c.categoryId),
        tagIds: tgs.map(t => t.tagId),
      }}
    />
  );
}
