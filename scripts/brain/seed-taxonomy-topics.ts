/**
 * BRAIN-1 Phase 0C — Seed reserved taxonomy topic trees.
 *
 *   bun run scripts/brain/seed-taxonomy-topics.ts --clientId=<n>
 *
 * Creates 6 reserved root topics under a `_`-prefixed slug namespace so the
 * human-curated topic tree cannot accidentally collide or merge with them:
 *
 *   _source         "Source"          (slate-kb | competitor | own-marketing | …)
 *   _slate-area     "Slate Area"      (queries | deliver | portals | …)
 *   _audience       "Audience"        (vp-enrollment | slate-admin | …)
 *   _content-type   "Content Type"    (how-to | case-study | reference | …)
 *   _recency        "Recency"         (evergreen | current-12mo | archive)
 *   _competitor     "Competitor"      (carnegie | enrollmentfuel | rhb | …)
 *
 * Uses raw inserts (not lib/brain/topics.ts `createTopic`) because that helper
 * auto-derives slug from name via `deriveSlug` — which would strip the leading
 * `_` and produce `source` instead of `_source`. We need stable prefixed slugs
 * so that the human topic tree (which uses `createTopic`) cannot collide.
 *
 * Idempotent: every root is matched on (clientId, slug, parentId IS NULL) and
 * every leaf on (clientId, slug, parentId=<root.id>). Re-running on a seeded
 * tenant should report every row as "existing" and mutate nothing.
 *
 * Phase 1's classifier (see classify-notes.ts) attaches one or more topic IDs
 * from these trees to each brain_note, replacing the legacy flat-tag heuristics.
 */

import * as dotenv from 'dotenv';

// .env.local first (developer overrides), then .env — both with override:true.
// Matches scripts/verify-db-target.ts and the dotenv-override invariant in
// memory (`feedback_sd2026_dotenv_override`).
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: true });

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainTopics, clients } from '@/lib/db/schema';

interface Args {
  clientId: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let clientId: number | null = null;

  for (const a of argv) {
    if (a.startsWith('--clientId=')) {
      clientId = parseInt(a.slice('--clientId='.length), 10);
    } else if (a.startsWith('--client-id=')) {
      clientId = parseInt(a.slice('--client-id='.length), 10);
    } else if (!a.startsWith('--')) {
      const n = parseInt(a, 10);
      if (Number.isFinite(n)) clientId = n;
    }
  }

  if (clientId === null || !Number.isFinite(clientId)) {
    console.error('Usage: bun run scripts/brain/seed-taxonomy-topics.ts --clientId=<n>');
    process.exit(1);
  }

  return { clientId: clientId as number };
}

interface LeafSpec {
  slug: string;
  name: string;
}

interface TreeSpec {
  rootSlug: string;   // `_`-prefixed
  rootName: string;   // display name (no `_`)
  leaves: LeafSpec[];
}

// ─── The 6 reserved trees ──────────────────────────────────────────────────
//
// Slugs are kebab-case and stable — Phase 1's classifier persists topic
// references by id, but the seed script + future migrations need to match
// idempotently on slug.

const TREES: TreeSpec[] = [
  {
    rootSlug: '_source',
    rootName: 'Source',
    leaves: [
      { slug: 'slate-kb', name: 'Slate KB' },
      { slug: 'competitor', name: 'Competitor' },
      { slug: 'own-marketing', name: 'Own Marketing' },
      { slug: 'industry-news', name: 'Industry News' },
      { slug: 'research-brief', name: 'Research Brief' },
      { slug: 'meeting-transcript', name: 'Meeting Transcript' },
      { slug: 'linkedin-draft', name: 'LinkedIn Draft' },
    ],
  },
  {
    rootSlug: '_slate-area',
    rootName: 'Slate Area',
    leaves: [
      { slug: 'queries', name: 'Queries' },
      { slug: 'deliver', name: 'Deliver' },
      { slug: 'portals', name: 'Portals' },
      { slug: 'forms', name: 'Forms' },
      { slug: 'workflows', name: 'Workflows' },
      { slug: 'reports', name: 'Reports' },
      { slug: 'permissions', name: 'Permissions' },
      { slug: 'integrations', name: 'Integrations' },
      { slug: 'none', name: 'Not Slate-specific' },
    ],
  },
  {
    rootSlug: '_audience',
    rootName: 'Audience',
    leaves: [
      { slug: 'vp-enrollment', name: 'VP / Director of Enrollment' },
      { slug: 'slate-admin', name: 'Slate Admin' },
      { slug: 'advancement', name: 'Advancement' },
      { slug: 'internal-only', name: 'Internal Only' },
      { slug: 'prospect-facing', name: 'Prospect-facing' },
    ],
  },
  {
    rootSlug: '_content-type',
    rootName: 'Content Type',
    leaves: [
      { slug: 'how-to', name: 'How-to' },
      { slug: 'case-study', name: 'Case Study' },
      { slug: 'reference', name: 'Reference' },
      { slug: 'opinion', name: 'Opinion' },
      { slug: 'transcript', name: 'Transcript' },
      { slug: 'news', name: 'News' },
      { slug: 'service-page', name: 'Service Page' },
    ],
  },
  {
    rootSlug: '_recency',
    rootName: 'Recency',
    leaves: [
      { slug: 'evergreen', name: 'Evergreen' },
      { slug: 'current-12mo', name: 'Current (last 12 mo)' },
      { slug: 'archive', name: 'Archive (>12 mo)' },
    ],
  },
  {
    rootSlug: '_competitor',
    rootName: 'Competitor',
    leaves: [
      { slug: 'carnegie', name: 'Carnegie Higher Ed' },
      { slug: 'enrollmentfuel', name: 'EnrollmentFuel' },
      { slug: 'rhb', name: 'RHB' },
      { slug: 'waybetter', name: 'Waybetter Marketing' },
      { slug: 'human-capital', name: 'Human Capital Research' },
      { slug: 'huron', name: 'Huron Consulting Group' },
      { slug: 'bwf', name: 'BWF' },
    ],
  },
];

interface Summary {
  rootsInserted: number;
  rootsExisted: number;
  leavesInserted: number;
  leavesExisted: number;
}

async function run() {
  const { clientId } = parseArgs();

  // Sanity: confirm the client exists.
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) {
    console.error(`Client ${clientId} not found.`);
    process.exit(1);
  }

  console.log(`Seeding BRAIN-1 reserved taxonomy topics for client ${clientId}…`);

  const summary: Summary = {
    rootsInserted: 0,
    rootsExisted: 0,
    leavesInserted: 0,
    leavesExisted: 0,
  };

  for (const tree of TREES) {
    // ── Root ────────────────────────────────────────────────────────────────
    const [existingRoot] = await db
      .select({ id: brainTopics.id })
      .from(brainTopics)
      .where(
        and(
          eq(brainTopics.clientId, clientId),
          eq(brainTopics.slug, tree.rootSlug),
          isNull(brainTopics.parentId),
        ),
      )
      .limit(1);

    let rootId: number;
    if (existingRoot) {
      rootId = existingRoot.id;
      summary.rootsExisted += 1;
    } else {
      const [inserted] = await db
        .insert(brainTopics)
        .values({
          clientId,
          parentId: null,
          slug: tree.rootSlug,
          name: tree.rootName,
          path: tree.rootSlug,
        })
        .returning({ id: brainTopics.id });
      rootId = inserted.id;
      summary.rootsInserted += 1;
    }

    // ── Leaves ──────────────────────────────────────────────────────────────
    for (const leaf of tree.leaves) {
      const [existingLeaf] = await db
        .select({ id: brainTopics.id })
        .from(brainTopics)
        .where(
          and(
            eq(brainTopics.clientId, clientId),
            eq(brainTopics.slug, leaf.slug),
            eq(brainTopics.parentId, rootId),
          ),
        )
        .limit(1);

      if (existingLeaf) {
        summary.leavesExisted += 1;
        continue;
      }

      await db.insert(brainTopics).values({
        clientId,
        parentId: rootId,
        slug: leaf.slug,
        name: leaf.name,
        path: `${tree.rootSlug}/${leaf.slug}`,
      });
      summary.leavesInserted += 1;
    }
  }

  console.log(JSON.stringify(summary));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed-taxonomy-topics failed:', err);
    process.exit(1);
  });
