/**
 * Dev DB seeder — throwaway `dev` environment only.
 *
 * Creates two logins so the dev deploy is immediately usable:
 *   1. an ADMIN user (global admin panel) — default info@simplerdevelopment.com
 *   2. a self-serve DEMO TENANT (users row + clients row + sample CRM/kanban
 *      data via the real signup path) so the portal isn't empty on first login.
 *
 * Idempotent: re-running upserts the admin and skips the demo tenant if its
 * email already exists. Credentials are intentionally known/stated — this only
 * ever runs against the isolated `dev` Railway DB. Override via env:
 *   ADMIN_EMAIL / ADMIN_PASSWORD / DEMO_EMAIL / DEMO_PASSWORD
 */
import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';

dotenv.config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/db');
  const { users } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createSelfServeAccount } = await import('../lib/signup/service');

  const adminEmail = (process.env.ADMIN_EMAIL || 'info@simplerdevelopment.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'SimplerDev!2026';
  const demoEmail = (process.env.DEMO_EMAIL || 'demo@simplerdevelopment.com').toLowerCase();
  const demoPassword = process.env.DEMO_PASSWORD || 'SimplerDev!2026';

  // ── 1. Admin user (upsert by email) ───────────────────────────────────────
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  if (existingAdmin) {
    await db
      .update(users)
      .set({ role: 'admin', active: true, password: await hash(adminPassword, 10) })
      .where(eq(users.id, existingAdmin.id));
    console.log('↻ admin user updated:', adminEmail);
  } else {
    await db.insert(users).values({
      name: 'Admin User',
      email: adminEmail,
      password: await hash(adminPassword, 10),
      role: 'admin',
      active: true,
    });
    console.log('✅ admin user created:', adminEmail);
  }

  // ── 2. Demo self-serve tenant (+ sample CRM/kanban data) ──────────────────
  const [existingDemo] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, demoEmail))
    .limit(1);

  if (existingDemo) {
    console.log('• demo tenant already exists — skipping:', demoEmail);
  } else {
    const res = await createSelfServeAccount({
      name: 'Demo Workspace',
      email: demoEmail,
      password: demoPassword,
      company: 'Northwind Trading (sample)',
    });
    // Dev convenience: mark verified so the login isn't stuck behind the
    // email-verification gate (no mailer wired on dev).
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(), emailVerificationToken: null, emailVerificationExpires: null })
      .where(eq(users.id, res.userId));
    console.log('✅ demo tenant created — userId', res.userId, 'clientId', res.clientId, '(sample CRM/kanban seeded)');
  }

  console.log('\nDev logins:');
  console.log('  admin →', adminEmail, '/', adminPassword);
  console.log('  demo  →', demoEmail, '/', demoPassword);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ seed-dev failed:', err);
  process.exit(1);
});
