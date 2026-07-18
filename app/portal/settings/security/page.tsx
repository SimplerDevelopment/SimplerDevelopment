import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { MfaSettings } from './MfaSettings';

export default async function SecuritySettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const userId = parseInt(session.user.id, 10);
  const [user] = await db
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a second step at sign-in using an authenticator app (Google Authenticator, 1Password, Authy).
          When enabled, your password alone won&apos;t be enough to log in.
        </p>
      </div>
      <MfaSettings initialEnabled={!!user?.mfaEnabled} />
    </div>
  );
}
