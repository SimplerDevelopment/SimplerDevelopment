// /portal/experiments/:id — experiment detail.
//
// Server component fetches the experiment + variants + the underlying post
// content (used as the seed for the variant editor), then defers to the
// `<ExperimentDetailClient>` for all the interactive bits.

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, abVariants, posts, clientWebsites } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { authorizeExperimentForUser } from '@/lib/ab/access';
import ExperimentDetailClient from '@/components/portal/ExperimentDetailClient';

export const dynamic = 'force-dynamic';

export default async function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const experimentId = parseInt(id, 10);
  if (!Number.isFinite(experimentId)) notFound();

  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) notFound();

  const [experiment] = await db
    .select()
    .from(abExperiments)
    .where(eq(abExperiments.id, experimentId))
    .limit(1);
  if (!experiment) notFound();

  const variants = await db
    .select()
    .from(abVariants)
    .where(eq(abVariants.experimentId, experimentId))
    .orderBy(asc(abVariants.key));

  const [post] = await db
    .select({ id: posts.id, title: posts.title, content: posts.content, websiteId: posts.websiteId })
    .from(posts)
    .where(eq(posts.id, experiment.postId))
    .limit(1);
  if (!post) notFound();

  let siteName: string | null = null;
  if (post.websiteId) {
    const [site] = await db
      .select({ name: clientWebsites.name })
      .from(clientWebsites)
      .where(eq(clientWebsites.id, post.websiteId))
      .limit(1);
    siteName = site?.name ?? null;
  }

  return (
    <ExperimentDetailClient
      experiment={{
        ...experiment,
        startedAt: experiment.startedAt ? experiment.startedAt.toISOString() : null,
        endedAt: experiment.endedAt ? experiment.endedAt.toISOString() : null,
        createdAt: experiment.createdAt.toISOString(),
        updatedAt: experiment.updatedAt.toISOString(),
      }}
      variants={variants.map(v => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      }))}
      post={{ id: post.id, title: post.title, content: post.content, siteId: post.websiteId ?? 0 }}
      siteName={siteName}
    />
  );
}
