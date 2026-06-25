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
import { sendTransactionalEmail } from '@/lib/email/send-transactional';
import { emitEvent } from '@/lib/automation/event-bus';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

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

      // Send welcome email
      sendTransactionalEmail({
        websiteId,
        event: 'account.welcome',
        to: customer.email,
        fromName: 'Welcome',
        variables: {
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          fullName: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email,
          email: customer.email,
        },
      }).catch(err => console.error('[auth] account.welcome email failed:', err));

      // Emit automation event
      emitEvent('crm.contact.created', websiteId, 0, {
        customerId: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        source: 'storefront_registration',
      });

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
      // Throttle credential checks per IP+site to blunt password brute-force.
      if (!checkRateLimit(`${getClientIp(req)}:storefront-login:${websiteId}`, 5, 15 * 60 * 1000)) {
        return NextResponse.json({ success: false, message: 'Too many requests. Please try again later.' }, { status: 429 });
      }

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
      // Throttle per IP+site to prevent password-reset email flooding.
      if (!checkRateLimit(`${getClientIp(req)}:storefront-forgot-password:${websiteId}`, 5, 15 * 60 * 1000)) {
        return NextResponse.json({ success: false, message: 'Too many requests. Please try again later.' }, { status: 429 });
      }

      const { email } = body;
      if (!email) return NextResponse.json({ success: false, message: 'Email is required' }, { status: 400 });

      // Always return success (don't reveal if email exists)
      const resetToken = await createPasswordResetToken(websiteId, email);

      if (resetToken) {
        // Look up customer for name
        const [cust] = await db.select({
          firstName: storeCustomers.firstName,
          lastName: storeCustomers.lastName,
        }).from(storeCustomers)
          .where(and(
            eq(storeCustomers.websiteId, websiteId),
            eq(storeCustomers.email, email.toLowerCase().trim()),
          ))
          .limit(1);

        // Get website domain for reset URL
        const [site] = await db.select({ domain: clientWebsites.domain, subdomain: clientWebsites.subdomain })
          .from(clientWebsites).where(eq(clientWebsites.id, websiteId)).limit(1);
        const baseUrl = site?.domain
          ? `https://${site.domain}`
          : site?.subdomain
            ? `https://${site.subdomain}.simplerdevelopment.com`
            : process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

        sendTransactionalEmail({
          websiteId,
          event: 'account.password_reset',
          to: email,
          fromName: 'Password Reset',
          variables: {
            firstName: cust?.firstName || '',
            lastName: cust?.lastName || '',
            fullName: [cust?.firstName, cust?.lastName].filter(Boolean).join(' ') || email,
            email,
            resetUrl: `${baseUrl}/store/reset-password?token=${resetToken}`,
          },
        }).catch(err => console.error('[auth] account.password_reset email failed:', err));
      }

      return NextResponse.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
    }

    case 'reset-password': {
      // Throttle per IP+site to blunt reset-token brute-force.
      if (!checkRateLimit(`${getClientIp(req)}:storefront-reset-password:${websiteId}`, 5, 15 * 60 * 1000)) {
        return NextResponse.json({ success: false, message: 'Too many requests. Please try again later.' }, { status: 429 });
      }

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
