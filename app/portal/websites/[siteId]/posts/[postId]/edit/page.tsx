import { db } from '@/lib/db';
import { clientWebsites, posts, postCategories, postTags } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { resolvePortalSite } from '@/lib/portal-client';
import PortalPostForm from '@/components/portal/PortalPostForm';
import { generatePreviewToken } from '@/lib/preview-token';
import { getBrandDefaults } from '@/lib/branding';
import { getPostTypeForPost } from '@/lib/actions/client-sites';

export default async function PortalEditPostPage({
  params,
}: {
  params: Promise<{ siteId: string; postId: string }>;
}) {
  const { siteId, postId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const resolved = await resolvePortalSite(userId, parseInt(siteId));
  if (!resolved) notFound();
  const { site, client } = resolved;

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

  // Build iframe URL for visual editor
  // Managed sites (no Vercel project) use the main app's /sites/ route for the iframe
  // Standalone sites use their actual domain/subdomain
  const isManaged = !site.vercelProjectId;
  const subdomain = site.subdomain;
  const fullDomain = site.vercelDomain || (subdomain ? `${subdomain}.simplerdevelopment.com` : null);
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com';
  const previewToken = generatePreviewToken(site.id);
  const siteUrl = isManaged && fullDomain
    ? `${appUrl}/sites/${fullDomain}`
    : site.domain
      ? `https://${site.domain}`
      : fullDomain
        ? `https://${fullDomain}`
        : null;

  // Public URL always points to the internal /sites/ route for draft preview
  // (subdomain doesn't share auth cookies with the main app)
  const publicUrl = fullDomain
    ? `${appUrl}/sites/${fullDomain}`
    : null;

  const brandDefaults = await getBrandDefaults({
    clientId: client.id,
    brandingProfileId: site.brandingProfileId,
  });

  // Resolve the post type's template so the visual editor can render the
  // type's wrapper chrome around the editable post body — without it, the
  // iframe loses the templated layout the public site shows.
  const postType = await getPostTypeForPost(site.id, post.postType);
  const typeTemplate = postType?.template ?? null;

  // Forward a minimal user identity into PortalPostForm so the realtime
  // CollaborationProvider can publish presence (name + color + avatar) to
  // peers. The `users` table doesn't carry an avatar URL today; we pass
  // null and let PresenceAvatars fall back to a Material Icons glyph.
  const currentUser = {
    id: session.user.id,
    name: session.user.name || session.user.email || 'Editor',
    image: null,
  };

  return (
    <PortalPostForm
      siteId={site.id}
      mode="edit"
      siteUrl={siteUrl}
      publicUrl={publicUrl}
      previewToken={previewToken}
      siteDomain={site.domain || subdomain || undefined}
      brandDefaults={brandDefaults}
      typeTemplate={typeTemplate}
      currentUser={currentUser}
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
        seoTitle: post.seoTitle || '',
        seoDescription: post.seoDescription || '',
        ogImage: post.ogImage || '',
        noIndex: post.noIndex,
        canonicalUrl: post.canonicalUrl || '',
        customCss: post.customCss || '',
        customJs: post.customJs || '',
        categoryIds: cats.map(c => c.categoryId),
        tagIds: tgs.map(t => t.tagId),
      }}
    />
  );
}
