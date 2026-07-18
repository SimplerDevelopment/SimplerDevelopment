import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import PostForm from '@/components/admin/PostForm';
import { auth } from '@/lib/auth';

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const postId = parseInt(id);

  if (isNaN(postId)) {
    notFound();
  }

  const [post] = await db
    .select()
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    notFound();
  }

  return (
    <PostForm
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
      }}
    />
  );
}
