import { db } from '@/lib/db';
import { storeCustomers, storeCustomerSessions } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { hash, compare } from 'bcryptjs';
import crypto from 'crypto';

export interface CustomerSession {
  customerId: number;
  websiteId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Generate a secure random token for sessions and password resets.
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Register a new customer account.
 */
export async function registerCustomer(
  websiteId: number,
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
) {
  const passwordHash = await hash(password, 12);
  const emailVerifyToken = generateToken();

  const [customer] = await db.insert(storeCustomers).values({
    websiteId,
    email: email.toLowerCase().trim(),
    passwordHash,
    firstName: firstName ?? null,
    lastName: lastName ?? null,
    emailVerifyToken,
  }).returning();

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(storeCustomerSessions).values({
    customerId: customer.id,
    token,
    expiresAt,
  });

  return { customer, token };
}

/**
 * Authenticate a customer with email + password.
 */
export async function loginCustomer(websiteId: number, email: string, password: string) {
  const [customer] = await db.select()
    .from(storeCustomers)
    .where(and(
      eq(storeCustomers.websiteId, websiteId),
      eq(storeCustomers.email, email.toLowerCase().trim()),
    ))
    .limit(1);

  if (!customer) return null;
  if (customer.status !== 'active') return null;

  const valid = await compare(password, customer.passwordHash);
  if (!valid) return null;

  // Update last login
  await db.update(storeCustomers)
    .set({ lastLoginAt: new Date() })
    .where(eq(storeCustomers.id, customer.id));

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(storeCustomerSessions).values({
    customerId: customer.id,
    token,
    expiresAt,
  });

  return { customer, token };
}

/**
 * Validate a session token and return the customer.
 */
export async function validateSession(token: string): Promise<CustomerSession | null> {
  const [session] = await db.select({
    customerId: storeCustomerSessions.customerId,
    expiresAt: storeCustomerSessions.expiresAt,
  })
    .from(storeCustomerSessions)
    .where(and(
      eq(storeCustomerSessions.token, token),
      gt(storeCustomerSessions.expiresAt, new Date()),
    ))
    .limit(1);

  if (!session) return null;

  const [customer] = await db.select({
    id: storeCustomers.id,
    websiteId: storeCustomers.websiteId,
    email: storeCustomers.email,
    firstName: storeCustomers.firstName,
    lastName: storeCustomers.lastName,
    status: storeCustomers.status,
  })
    .from(storeCustomers)
    .where(eq(storeCustomers.id, session.customerId))
    .limit(1);

  if (!customer || customer.status !== 'active') return null;

  return {
    customerId: customer.id,
    websiteId: customer.websiteId,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
  };
}

/**
 * Destroy a session (logout).
 */
export async function destroySession(token: string) {
  await db.delete(storeCustomerSessions)
    .where(eq(storeCustomerSessions.token, token));
}

/**
 * Extract customer session token from request headers.
 * Expects: Authorization: Bearer <token>
 */
export function extractToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/**
 * Middleware: require authenticated customer for a given website.
 * Returns customer session or null.
 */
export async function requireCustomer(req: Request, websiteId: number): Promise<CustomerSession | null> {
  const token = extractToken(req);
  if (!token) return null;
  const session = await validateSession(token);
  if (!session || session.websiteId !== websiteId) return null;
  return session;
}

/**
 * Generate a password reset token for a customer.
 */
export async function createPasswordResetToken(websiteId: number, email: string): Promise<string | null> {
  const [customer] = await db.select({ id: storeCustomers.id })
    .from(storeCustomers)
    .where(and(
      eq(storeCustomers.websiteId, websiteId),
      eq(storeCustomers.email, email.toLowerCase().trim()),
    ))
    .limit(1);

  if (!customer) return null;

  const token = generateToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.update(storeCustomers)
    .set({ passwordResetToken: token, passwordResetExpires: expires })
    .where(eq(storeCustomers.id, customer.id));

  return token;
}

/**
 * Reset password using a reset token.
 */
export async function resetPassword(websiteId: number, token: string, newPassword: string): Promise<boolean> {
  const [customer] = await db.select({ id: storeCustomers.id })
    .from(storeCustomers)
    .where(and(
      eq(storeCustomers.websiteId, websiteId),
      eq(storeCustomers.passwordResetToken, token),
      gt(storeCustomers.passwordResetExpires, new Date()),
    ))
    .limit(1);

  if (!customer) return false;

  const passwordHash = await hash(newPassword, 12);
  await db.update(storeCustomers)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(storeCustomers.id, customer.id));

  return true;
}
