// Shared loader for the admin feature-flags matrix — used by both the
// /api/admin/feature-flags GET route and the /admin/feature-flags RSC page,
// so the two can never drift on shape.
//
// FLAG DEFINITIONS are code (lib/feature-flags.ts) — this loader only reads
// which clients currently have each flag (clients.featureFlags jsonb).

import { db } from '@/lib/db';
import { clients, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { FLAGS, FLAG_KEYS, type FlagKey } from '@/lib/feature-flags';

export interface FeatureFlagMatrixFlag {
  key: FlagKey;
  since: string;
  defaultOn: boolean;
  clientIds: number[];
}

export interface FeatureFlagMatrixClient {
  id: number;
  company: string | null;
  email: string;
}

export interface FeatureFlagMatrix {
  flags: FeatureFlagMatrixFlag[];
  clients: FeatureFlagMatrixClient[];
}

/** Loads every client's featureFlags column once and derives the matrix in JS — the table is small. */
export async function loadFeatureFlagMatrix(): Promise<FeatureFlagMatrix> {
  const rows = await db
    .select({ id: clients.id, company: clients.company, email: users.email, featureFlags: clients.featureFlags })
    .from(clients)
    .innerJoin(users, eq(users.id, clients.userId))
    .orderBy(clients.company);

  const flags: FeatureFlagMatrixFlag[] = FLAG_KEYS.map((key) => ({
    key,
    since: FLAGS[key].since,
    defaultOn: FLAGS[key].defaultOn,
    clientIds: rows.filter((r) => (r.featureFlags ?? []).includes(key)).map((r) => r.id),
  }));

  return {
    flags,
    clients: rows.map((r) => ({ id: r.id, company: r.company, email: r.email })),
  };
}
