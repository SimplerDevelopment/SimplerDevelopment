/**
 * GET /api/portal/onboarding/status — auto-detected per-domain onboarding
 * progress for the active tenant (spec: vault "Per-Domain Onboarding").
 *
 * For every entitled domain, runs each registry step's detection query and
 * returns done/pending per step plus progress totals. Pre-credited steps
 * (always-true first step per domain) are returned done without a query, so
 * consumers can never compute 0% (goal gradient).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getClientEntitlements } from '@/lib/billing/entitlements';
import { getDomainByKey } from '@/lib/billing/domain-catalog';
import { getSegmentForDomain } from '@/lib/onboarding/module-segments';
import { DETECTIONS } from '@/lib/onboarding/detections';

export const dynamic = 'force-dynamic';

export interface StatusStep {
  key: string;
  done: boolean;
  preCredited: boolean;
  /** False for pointer rows (no detection, not pre-credited) — excluded from progress math. */
  counted: boolean;
}

export interface DomainStatus {
  steps: StatusStep[];
  done: number;
  total: number;
  complete: boolean;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, error: 'No active client' }, { status: 403 });
  }

  const entitlements = await getClientEntitlements(client.id);
  const domainKeys = [...entitlements.domains];

  const domains: Record<string, DomainStatus> = {};
  await Promise.all(
    domainKeys.map(async (key) => {
      const catalog = getDomainByKey(key);
      const segment = getSegmentForDomain(
        key,
        catalog ? { name: catalog.name, tagline: catalog.tagline, navHrefs: catalog.navHrefs } : undefined,
      );

      const steps: StatusStep[] = await Promise.all(
        segment.actions.map(async (action) => {
          const detection = action.detect ? DETECTIONS[action.detect] : undefined;
          const done = action.preCredited ? true : detection ? await detection(client.id) : false;
          return {
            key: action.key,
            done,
            preCredited: Boolean(action.preCredited),
            counted: Boolean(action.preCredited || detection),
          };
        }),
      );

      const counted = steps.filter((s) => s.counted);
      const done = counted.filter((s) => s.done).length;
      domains[key] = {
        steps,
        done,
        total: counted.length,
        complete: done >= counted.length,
      };
    }),
  );

  return NextResponse.json({ success: true, data: { domains } });
}
