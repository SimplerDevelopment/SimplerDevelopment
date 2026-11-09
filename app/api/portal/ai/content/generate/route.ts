/**
 * AI Content Engine — POST /api/portal/ai/content/generate
 *
 * Body: { siteId: number, brief: { topic, audience?, tone?, language?, keywords?, context? },
 *         createPost?: boolean (default true), createLinkedin?: boolean (default true),
 *         generateImage?: boolean (default false — billable, slower; best-effort) }
 *
 * Draft-only: crea posts.published=false + linkedin_posts.status='draft'.
 * Publicar/programar sigue siendo paso humano (Publishing UI / cron).
 * Envelope: { success, data | message }.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, linkedinPosts } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortalSite, isAuthError } from '@/lib/portal-auth';
import {
  ContentBriefSchema,
  buildPostContent,
  generateContentPack,
} from '@/lib/ai/content-engine';
import { generateContentImage } from '@/lib/ai/images';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  siteId: z.number().int().positive(),
  brief: ContentBriefSchema,
  createPost: z.boolean().optional().default(true),
  createLinkedin: z.boolean().optional().default(true),
  // Opt-in: also render a cover image with the AI image call-site (billable,
  // slower). Best-effort — a failed render never fails the pack.
  generateImage: z.boolean().optional().default(false),
});

async function uniqueSlug(websiteId: number, base: string): Promise<string> {
  let candidate = base || 'contenido-ia';
  for (let n = 1; n < 100; n += 1) {
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.slug, candidate), eq(posts.websiteId, websiteId)))
      .limit(1);
    if (!existing) return candidate;
    candidate = `${base || 'contenido-ia'}-${n + 1}`;
  }
  return `${base || 'contenido-ia'}-${Date.now()}`;
}

export async function POST(request: Request) {
  const session = await auth();
  const sessionUserId = session?.user?.id ? parseInt(session.user.id, 10) : NaN;
  if (!session?.user?.id || !Number.isSafeInteger(sessionUserId)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { siteId, brief, createPost, createLinkedin, generateImage } = parsed.data;

  const site = await resolveClientSite(sessionUserId, siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  const authorization = await authorizePortalSite({ siteId: site.id, action: 'write' });
  if (isAuthError(authorization)) return authorization.response;

  let pack;
  try {
    pack = await generateContentPack({ clientId: site.clientId, brief });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Content generation failed';
    return NextResponse.json({ success: false, message }, { status: 502 });
  }

  let postId: number | null = null;
  let coverImage: string | null = null;
  let mediaId: number | null = null;
  if (generateImage) {
    try {
      const img = await generateContentImage({
        clientId: site.clientId,
        prompt: pack.imagePrompt,
        websiteId: site.id,
        uploadedBy: sessionUserId,
        alt: pack.title,
      });
      coverImage = img.url;
      mediaId = img.mediaId;
    } catch (err) {
      console.warn('[ai-content] cover render failed, continuing without image:', err);
    }
  }
  if (createPost) {
    const slug = await uniqueSlug(site.id, pack.slug);
    const [post] = await db.insert(posts).values({
      title: pack.title,
      slug,
      postType: 'blog',
      excerpt: pack.excerpt || null,
      content: buildPostContent(pack),
      coverImage,
      published: false,
      publishedAt: null,
      seoTitle: pack.seoTitle || null,
      seoDescription: pack.seoDescription || null,
      websiteId: site.id,
    }).returning({ id: posts.id });
    postId = post?.id ?? null;
  }

  let linkedinId: number | null = null;
  if (createLinkedin) {
    const [row] = await db.insert(linkedinPosts).values({
      clientId: site.clientId,
      userId: sessionUserId,
      text: pack.linkedinText,
      mediaType: coverImage ? 'image' : 'none',
      mediaUrl: coverImage,
      linkInComment: pack.linkInComment ?? null,
      status: 'draft',
      createdByUserId: sessionUserId,
    }).returning({ id: linkedinPosts.id });
    linkedinId = row?.id ?? null;
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        postId,
        linkedinId,
        title: pack.title,
        slug: pack.slug,
        adVariants: pack.adVariants,
        imagePrompt: pack.imagePrompt,
        coverImage,
        mediaId,
      },
    },
    { status: 201 },
  );
}
