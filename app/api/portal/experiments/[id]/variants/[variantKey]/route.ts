// DELETE /api/portal/experiments/:id/variants/:variantKey
//   Remove a non-control variant from a draft/completed/archived experiment.
//   Refuses when:
//     - variantKey === 'a' (the control is sticky — at least one identifiable
//       arm must always remain so historical events / cookies stay meaningful)
//     - removing would leave fewer than 2 variants
//     - the experiment is currently 'running' (don't reshape live tests)
//
//   On success, drops the variant row, removes the key from the experiment's
//   variantSplit, and renormalizes the remaining weights to sum to 100.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, abVariants } from '@/lib/db/schema';
import type { AbVariantSplit } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizeExperimentForUser } from '@/lib/ab/access';
import { normalizeSplit } from '@/lib/ab/assign';

const KEY_RE = /^[a-z0-9_-]{1,8}$/;

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; variantKey: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id, variantKey: rawKey } = await params;
  const experimentId = parseInt(id, 10);
  const variantKey = (rawKey || '').toLowerCase();

  if (!KEY_RE.test(variantKey)) {
    return NextResponse.json({ success: false, error: 'invalid_key' }, { status: 400 });
  }
  if (variantKey === 'a') {
    return NextResponse.json({ success: false, error: 'control_protected' }, { status: 400 });
  }

  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  // Pull experiment + variants in parallel to make our gating decisions.
  const [experimentRow] = await db
    .select({ status: abExperiments.status, variantSplit: abExperiments.variantSplit })
    .from(abExperiments)
    .where(eq(abExperiments.id, experimentId))
    .limit(1);

  if (!experimentRow) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }
  if (experimentRow.status === 'running') {
    return NextResponse.json({ success: false, error: 'experiment_running' }, { status: 409 });
  }

  const allVariants: Array<{ id: number; key: string }> = await db
    .select({ id: abVariants.id, key: abVariants.key })
    .from(abVariants)
    .where(eq(abVariants.experimentId, experimentId));

  const target = allVariants.find((v: { id: number; key: string }) => v.key === variantKey);
  if (!target) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }
  if (allVariants.length <= 2) {
    return NextResponse.json({ success: false, error: 'min_two_variants' }, { status: 409 });
  }

  // Drop the variant row.
  await db
    .delete(abVariants)
    .where(and(eq(abVariants.experimentId, experimentId), eq(abVariants.key, variantKey)));

  // Reshape variantSplit: drop the deleted key + renormalize the rest.
  const currentSplit: AbVariantSplit = { ...(experimentRow.variantSplit ?? {}) };
  delete currentSplit[variantKey];
  // If the deleted key wasn't in the split (drift case), or all remaining
  // weights are zero, fall back to evenly distributing across the remaining
  // variants so the experiment is still usable.
  let nextSplit = normalizeSplit(currentSplit);
  if (Object.keys(nextSplit).length === 0) {
    const remaining = allVariants
      .filter((v: { id: number; key: string }) => v.key !== variantKey)
      .map((v: { id: number; key: string }) => v.key);
    nextSplit = evenSplit(remaining);
  }

  await db
    .update(abExperiments)
    .set({ variantSplit: nextSplit, updatedAt: new Date() })
    .where(eq(abExperiments.id, experimentId));

  return NextResponse.json({ success: true, data: { deleted: true, key: variantKey } });
}

/**
 * Distribute 100 across `keys` as evenly as possible, giving the remainder to
 * the last key (so the total stays at exactly 100).
 */
function evenSplit(keys: string[]): AbVariantSplit {
  const out: AbVariantSplit = {};
  if (keys.length === 0) return out;
  const base = Math.floor(100 / keys.length);
  let assigned = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    out[keys[i]] = base;
    assigned += base;
  }
  out[keys[keys.length - 1]] = 100 - assigned;
  return out;
}
