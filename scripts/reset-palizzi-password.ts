import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function main() {
  const bcrypt = await import('bcryptjs');
  const { db } = await import('../lib/db');
  const { users } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Check user status
  const [user] = await db.select({ id: users.id, email: users.email, active: users.active, role: users.role, password: users.password }).from(users).where(eq(users.email, 'palizzi@simplerdevelopment.com')).limit(1);
  console.log('User:', { id: user?.id, email: user?.email, active: user?.active, role: user?.role, hasPassword: !!user?.password });

  if (!user) {
    console.log('User not found!');
    process.exit(1);
  }

  // Reset password
  const hashed = await bcrypt.hash('palizzi-temp-2024', 10);
  await db.update(users).set({ password: hashed, active: true }).where(eq(users.email, 'palizzi@simplerdevelopment.com'));

  // Verify
  const [updated] = await db.select({ password: users.password }).from(users).where(eq(users.email, 'palizzi@simplerdevelopment.com')).limit(1);
  const valid = await bcrypt.compare('palizzi-temp-2024', updated.password);
  console.log('Password reset + active=true. Verify:', valid);
  process.exit(0);
}
main();
