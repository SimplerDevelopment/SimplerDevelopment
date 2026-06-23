// /portal/experiments/:id — experiment detail.
//
// Server component fetches the experiment + variants + the underlying target
// payload (post content or deck slides) used as the seed for the variant
// editor, then defers to the `<ExperimentDetailClient>` for the interactive
// bits.

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, abVariants, posts, clientWebsites, pitchDecks } from '@/lib/db/schema';
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

  // Resolve the target into the same `{ id, title, content, siteId, editHref }`
  // shape the client component expects. `content` is the seed JSON for the
  // variant editor — post block tree for posts, slide array for decks.
  let target: {
    id: number;
    title: string;
    content: string;
    siteId: number;
    editHref: string;
    kindLabel: string;
  } | null = null;
  let siteName: string | null = null;

  if (experiment.targetType === 'deck') {
    const [deck] = await db
      .select({ id: pitchDecks.id, title: pitchDecks.title, slides: pitchDecks.slides })
      .from(pitchDecks)
      .where(eq(pitchDecks.id, experiment.targetId))
      .limit(1);
    if (!deck) notFound();
    target = {
      id: deck.id,
      title: deck.title,
      content: JSON.stringify(deck.slides ?? []),
      siteId: 0,
      editHref: `/portal/tools/pitch-decks/${deck.id}`,
      kindLabel: 'Pitch deck',
    };
  } else {
    const [post] = await db
      .select({ id: posts.id, title: posts.title, content: posts.content, websiteId: posts.websiteId })
      .from(posts)
      .where(eq(posts.id, experiment.targetId))
      .limit(1);
    if (!post) notFound();
    if (post.websiteId) {
      const [site] = await db
        .select({ name: clientWebsites.name })
        .from(clientWebsites)
        .where(eq(clientWebsites.id, post.websiteId))
        .limit(1);
      siteName = site?.name ?? null;
    }
    target = {
      id: post.id,
      title: post.title,
      content: post.content,
      siteId: post.websiteId ?? 0,
      editHref: `/portal/websites/${post.websiteId ?? 0}/posts/${post.id}/edit`,
      kindLabel: 'Page',
    };
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
      target={target}
      siteName={siteName}
    />
  );
}
