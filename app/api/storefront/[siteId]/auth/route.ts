import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientWebsites, storeSettings, storeCustomers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  registerCustomer,
  loginCustomer,
  validateSession,
  destroySession,
  extractToken,
  createPasswordResetToken,
  resetPassword,
} from '@/lib/storefront/customer-auth';

async function getSiteId(siteIdParam: string) {
  const id = parseInt(siteIdParam);
  const [site] = await db.select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(eq(clientWebsites.id, id))
    .limit(1);
  return site?.id ?? null;
}

async function isCustomerAccountsEnabled(websiteId: number): Promise<boolean> {
  const [settings] = await db.select({ enabled: storeSettings.enableCustomerAccounts })
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, websiteId))
    .limit(1);
  return settings?.enabled ?? false;
}

/**
 * POST /api/storefront/[siteId]/auth
 * Body: { action: 'register' | 'login' | 'logout' | 'me' | 'forgot-password' | 'reset-password', ...data }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId: siteIdParam } = await params;
  const websiteId = await getSiteId(siteIdParam);
  if (!websiteId) return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });

  const body = await req.json();
  const { action } = body;

  switch (action) {
    case 'register': {
      if (!await isCustomerAccountsEnabled(websiteId)) {
        return NextResponse.json({ success: false, message: 'Customer accounts are not enabled for this store' }, { status: 403 });
      }

      const { email, password, firstName, lastName } = body;
      if (!email || !password) {
        return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 });
      }
      if (password.length < 8) {
        return NextResponse.json({ success: false, message: 'Password must be at least 8 characters' }, { status: 400 });
      }

      // Check existing
      const [existing] = await db.select({ id: storeCustomers.id })
        .from(storeCustomers)
        .where(and(eq(storeCustomers.websiteId, websiteId), eq(storeCustomers.email, email.toLowerCase().trim())))
        .limit(1);
      if (existing) {
        return NextResponse.json({ success: false, message: 'An account with this email already exists' }, { status: 409 });
      }

      const { customer, token } = await registerCustomer(websiteId, email, password, firstName, lastName);

      return NextResponse.json({
        success: true,
        data: {
          token,
          customer: {
            id: customer.id,
            email: customer.email,
            firstName: customer.firstName,
            lastName: customer.lastName,
          },
        },
      }, { status: 201 });
    }

    case 'login': {
      const { email, password } = body;
      if (!email || !password) {
        return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 });
      }

      const result = await loginCustomer(websiteId, email, password);
      if (!result) {
        return NextResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 });
      }

      return NextResponse.json({
        success: true,
        data: {
          token: result.token,
          customer: {
            id: result.customer.id,
            email: result.customer.email,
            firstName: result.customer.firstName,
            lastName: result.customer.lastName,
          },
        },
      });
    }

    case 'logout': {
      const token = extractToken(req);
      if (token) await destroySession(token);
      return NextResponse.json({ success: true });
    }

    case 'me': {
      const token = extractToken(req);
      if (!token) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });

      const session = await validateSession(token);
      if (!session || session.websiteId !== websiteId) {
        return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
      }

      // Get full customer data
      const [customer] = await db.select()
        .from(storeCustomers)
        .where(eq(storeCustomers.id, session.customerId))
        .limit(1);

      if (!customer) return NextResponse.json({ success: false, message: 'Customer not found' }, { status: 404 });

      return NextResponse.json({
        success: true,
        data: {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          defaultShippingAddress: customer.defaultShippingAddress,
          defaultBillingAddress: customer.defaultBillingAddress,
          addressBook: customer.addressBook,
          orderCount: customer.orderCount,
          totalSpent: customer.totalSpent,
          createdAt: customer.createdAt,
        },
      });
    }

    case 'forgot-password': {
      const { email } = body;
      if (!email) return NextResponse.json({ success: false, message: 'Email is required' }, { status: 400 });

      // Always return success (don't reveal if email exists)
      await createPasswordResetToken(websiteId, email);
      return NextResponse.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
    }

    case 'reset-password': {
      const { token, password } = body;
      if (!token || !password) return NextResponse.json({ success: false, message: 'Token and password are required' }, { status: 400 });
      if (password.length < 8) return NextResponse.json({ success: false, message: 'Password must be at least 8 characters' }, { status: 400 });

      const success = await resetPassword(websiteId, token, password);
      if (!success) return NextResponse.json({ success: false, message: 'Invalid or expired reset token' }, { status: 400 });

      return NextResponse.json({ success: true, message: 'Password has been reset.' });
    }

    default:
      return NextResponse.json({ success: false, message: `Unknown action: ${action}` }, { status: 400 });
  }
}
