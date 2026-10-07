import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifiedTOTPStep } from '@/lib/totp';

/** Web and mobile consume the same counter; concurrent reuse wins only once. */
export async function consumeLoginMfa(
  user: { id: number; mfaEnabled: boolean; totpSecret: string | null },
  code: unknown,
): Promise<boolean> {
  if (!user.mfaEnabled) return true;
  if (!user.totpSecret || typeof code !== 'string') return false;
  const step = verifiedTOTPStep(user.totpSecret, code);
  if (step === null) return false;
  const accepted = await db.update(users).set({ mfaLastUsedStep: step })
    .where(and(
      eq(users.id, user.id), eq(users.active, true), eq(users.mfaEnabled, true),
      or(isNull(users.mfaLastUsedStep), lt(users.mfaLastUsedStep, step)),
    )).returning({ id: users.id });
  return accepted.length === 1;
}
