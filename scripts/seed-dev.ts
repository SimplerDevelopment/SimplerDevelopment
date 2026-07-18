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

  // ── 3. Entitle the demo tenant (bundle = all modules) ─────────────────────
  // Without an active subscription every paid-module write 403s, which makes
  // the demo portal read-only. Grant the bundle when the services catalog is
  // seeded (scripts/seed-domain-modules.ts); skip loudly when it isn't.
  const { clients, services, clientServices } = await import('../lib/db/schema');
  const [demoClient] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.company, 'Northwind Trading (sample)'))
    .limit(1);
  let [bundle] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.category, 'bundle'))
    .limit(1);
  if (!bundle) {
    // Empty catalog on a fresh instance — seed it here instead of asking the
    // operator to run a second script (individual modules stay unpickable in
    // onboarding until catalog rows exist).
    console.log('• services catalog empty — seeding domain modules…');
    const { seedDomainModules } = await import('./seed-domain-modules');
    await seedDomainModules();
    [bundle] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.category, 'bundle'))
      .limit(1);
  }
  if (demoClient && bundle) {
    const [existing] = await db
      .select({ id: clientServices.id })
      .from(clientServices)
      .where(eq(clientServices.clientId, demoClient.id))
      .limit(1);
    if (!existing) {
      await db.insert(clientServices).values({
        clientId: demoClient.id,
        serviceId: bundle.id,
        status: 'active',
        notes: 'dev seed — bundle grant so the demo portal is fully usable',
      });
      console.log('✅ demo tenant granted the complete bundle (all modules active)');
    } else {
      console.log('• demo tenant already has a subscription — skipping bundle grant');
    }
  } else if (!bundle) {
    console.log('⚠ services catalog still empty after seeding — check the seed-domain-modules output above');
  }

  // never echo custom passwords back — only show the known dev defaults
  console.log('\nDev logins:');
  console.log('  admin →', adminEmail, '/', adminPassword === 'SimplerDev!2026' ? adminPassword : '(as provided)');
  console.log('  demo  →', demoEmail, '/', demoPassword === 'SimplerDev!2026' ? demoPassword : '(as provided)');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ seed-dev failed:', err);
  process.exit(1);
});
