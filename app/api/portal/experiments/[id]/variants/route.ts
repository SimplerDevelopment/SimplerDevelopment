// POST  /api/portal/experiments/:id/variants — add a new variant
// PATCH /api/portal/experiments/:id/variants — update an existing variant
//                                               (label or blockTreeOverride)

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abVariants, abExperiments } from '@/lib/db/schema';
import type { AbVariantSplit } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { authorizeExperimentForUser } from '@/lib/ab/access';
import { normalizeSplit } from '@/lib/ab/assign';

// Existing key validation: short stable handles `a-z` / digits / `_-`.
// Used by PATCH (lookup of an existing key) — kept permissive for back-compat.
const KEY_RE = /^[a-z0-9_-]{1,8}$/;
// New POST validation: a SINGLE lowercase letter `a-z`. Auto-generation only
// ever picks from this set, and accepting more would let callers reserve keys
// the auto-generator would never emit.
const SINGLE_LETTER_RE = /^[a-z]$/;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function nextFreeLetter(usedKeys: ReadonlySet<string>): string | null {
  for (const letter of ALPHABET) {
    if (!usedKeys.has(letter)) return letter;
  }
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const experimentId = parseInt(id, 10);
  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  // Body is optional — POST with no body auto-generates the key + label.
  let body: { key?: string; label?: string; blockTreeOverride?: unknown } = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  // Pull the existing variants once — used both to auto-generate the next free
  // letter and to compute the new split.
  const existingVariants = await db
    .select({ key: abVariants.key })
    .from(abVariants)
    .where(eq(abVariants.experimentId, experimentId))
    .orderBy(asc(abVariants.key));
  const usedKeys = new Set<string>(existingVariants.map((v: { key: string }) => v.key));

  // Resolve the key.
  let key: string;
  if (typeof body.key === 'string' && body.key.length > 0) {
    key = body.key.toLowerCase();
    if (!SINGLE_LETTER_RE.test(key)) {
      return NextResponse.json({ success: false, error: 'invalid_key' }, { status: 400 });
    }
  } else {
    const auto = nextFreeLetter(usedKeys);
    if (!auto) {
      return NextResponse.json({ success: false, error: 'no_keys_available' }, { status: 409 });
    }
    key = auto;
  }

  if (usedKeys.has(key)) {
    return NextResponse.json({ success: false, error: 'duplicate_key' }, { status: 409 });
  }

  // Auto-generate a label when caller doesn't supply one. Match the convention
  // used by the experiment-create path: "Variant <KEY>" / "Control" for `a`.
  const rawLabel = (body.label || '').trim();
  const label = rawLabel || (key === 'a' ? 'Control' : `Variant ${key.toUpperCase()}`);

  const [variant] = await db.insert(abVariants).values({
    experimentId,
    key,
    label,
    blockTreeOverride: body.blockTreeOverride ?? null,
  }).returning();

  // Update the experiment's variantSplit: assign the new key floor(100/(N+1))
  // and renormalize so the total stays at 100.
  const [experimentRow] = await db
    .select({ variantSplit: abExperiments.variantSplit })
    .from(abExperiments)
    .where(eq(abExperiments.id, experimentId))
    .limit(1);

  if (experimentRow) {
    const currentSplit: AbVariantSplit = { ...(experimentRow.variantSplit ?? {}) };
    const newCount = existingVariants.length + 1;
    const newWeight = Math.floor(100 / newCount);
    const draft: AbVariantSplit = { ...currentSplit, [key]: newWeight };
    const nextSplit = normalizeSplit(draft);
    await db
      .update(abExperiments)
      .set({ variantSplit: nextSplit, updatedAt: new Date() })
      .where(eq(abExperiments.id, experimentId));
  }

  return NextResponse.json({ success: true, data: variant });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const experimentId = parseInt(id, 10);
  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  let body: { key?: string; label?: string; blockTreeOverride?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const key = (body.key || '').toLowerCase();
  if (!KEY_RE.test(key)) return NextResponse.json({ success: false, error: 'invalid_key' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (typeof body.label === 'string') {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ success: false, error: 'label_required' }, { status: 400 });
    if (label.length > 255) return NextResponse.json({ success: false, error: 'label_too_long' }, { status: 400 });
    patch.label = label;
  }
  if ('blockTreeOverride' in body) {
    patch.blockTreeOverride = body.blockTreeOverride ?? null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: 'nothing_to_update' }, { status: 400 });
  }

  const [updated] = await db
    .update(abVariants)
    .set(patch)
    .where(and(eq(abVariants.experimentId, experimentId), eq(abVariants.key, key)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}
