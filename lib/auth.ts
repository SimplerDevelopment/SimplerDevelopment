import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { findOrCreateGoogleUser } from '@/lib/signup/service';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

// Login-capable Google OAuth app. Reuses the platform Google client unless a
// dedicated one is configured. The provider only registers when configured so
// environments without the env vars keep credentials-only login.
const googleClientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return '/portal/dashboard';
  // Reject absolute URLs and protocol-relative URLs.
  if (raw.startsWith('//') || /^[a-z]+:/i.test(raw)) return '/portal/dashboard';
  if (!raw.startsWith('/')) return '/portal/dashboard';
  return raw;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh idle once per day
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Brute-force guard: throttle credential attempts per IP *before* any DB
        // hit or bcrypt compare. `request` is a standard Request in the
        // credentials flow; guard in case a future flow omits it.
        if (request && !checkRateLimit(`${getClientIp(request as Request)}:login`, 10, 15 * 60 * 1000)) {
          throw new Error('Too many sign-in attempts. Please wait a few minutes and try again.');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Fetch user from database
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          return null;
        }

        // Check if user is active
        if (!user.active) {
          return null;
        }

        // Verify password with bcrypt
        const isValid = await compare(password, user.password);

        if (!isValid) {
          return null;
        }

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    ...(googleClientId && googleClientSecret
      ? [Google({ clientId: googleClientId, clientSecret: googleClientSecret })]
      : []),
  ],
  pages: {
    // Portal (client tenants) is the dominant audience and the codebase already
    // routes ~40 explicit redirects there. Admin flows opt in to `/admin/login`
    // via explicit `signOut({ callbackUrl: '/admin/login' })` calls and the
    // `authorized` callback below skips `/admin/login` from the auth check.
    signIn: '/portal/login',
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        // Share session across all *.simplerdevelopment.com subdomains — but ONLY
        // on the real production deployment. Pinning the cookie `domain` to
        // `.simplerdevelopment.com` on any other host (e.g. a `*.vercel.app`
        // preview) makes the browser reject the cookie outright, so the session
        // never sets and the user is bounced back to /portal/login after a
        // "successful" sign-in. VERCEL_ENV is 'production' only for the main →
        // simplerdevelopment.com deploy; previews get 'preview', local is unset.
        domain: process.env.VERCEL_ENV === 'production' ? '.simplerdevelopment.com' : undefined,
      },
    },
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Google sign-in: NextAuth runs without a DB adapter (JWT strategy), so
      // `user.id` here is Google's id, not ours. Resolve (or create) the
      // platform user explicitly and stamp OUR id into token.sub. Returning
      // null rejects the sign-in (inactive user / unverified Google email).
      if (account?.provider === 'google') {
        const p = profile as { email?: string; name?: string; email_verified?: boolean } | null;
        if (!p?.email || p.email_verified === false) return null;
        const resolved = await findOrCreateGoogleUser({
          googleSub: account.providerAccountId,
          email: p.email,
          name: p.name,
        });
        if (!resolved) return null;
        token.sub = String(resolved.id);
        token.role = resolved.role;
        token.checkedAt = Date.now();
        return token;
      }
      if (user) {
        // Fresh sign-in — authorize() already verified the user exists and is
        // active. Stamp the validation time so the re-check below is throttled.
        token.role = user.role;
        token.checkedAt = Date.now();
        return token;
      }
      // Subsequent requests carry only the JWT (no DB hit at sign-in). Because
      // the token is stateless, a user that was DELETED or DEACTIVATED after
      // sign-in keeps a "valid" session until the token expires — which caused
      // production 500s (e.g. /portal/onboarding inserting user_onboarding for a
      // user_id no longer present in `users`, an FK violation). Re-validate the
      // user against the DB, throttled to once per REVALIDATE_MS so the global
      // (middleware) hot path isn't hit on every request — only authenticated
      // requests carry a token, and an active user pays at most one indexed PK
      // lookup per minute. Returning null invalidates the session, forcing a
      // clean re-login. Pre-existing tokens minted before this code have no
      // `checkedAt`, so they are re-validated on their very next request.
      const REVALIDATE_MS = 60 * 1000;
      const last = typeof token.checkedAt === 'number' ? token.checkedAt : 0;
      if (token.sub && Date.now() - last > REVALIDATE_MS) {
        const id = parseInt(token.sub, 10);
        if (!Number.isFinite(id)) return null;
        try {
          const [u] = await db
            .select({ role: users.role, active: users.active })
            .from(users)
            .where(eq(users.id, id))
            .limit(1);
          if (!u || !u.active) return null; // deleted or deactivated → log out
          token.role = u.role; // keep role fresh if it changed
          token.checkedAt = Date.now();
        } catch {
          // Transient DB error: keep the existing token rather than mass-logging
          // every user out during a database blip (fail open for availability).
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as { role?: string })?.role;

      const isOnAdmin = nextUrl.pathname.startsWith('/admin');
      const isOnAdminLogin = nextUrl.pathname === '/admin/login';
      const isOnPortal = nextUrl.pathname.startsWith('/portal');
      const isOnPortalLogin = nextUrl.pathname === '/portal/login';
      const isOnPortalPublic =
        nextUrl.pathname === '/portal/forgot-password' ||
        nextUrl.pathname === '/portal/reset-password' ||
        nextUrl.pathname === '/portal/signup' ||
        nextUrl.pathname === '/portal/verify-email' ||
        nextUrl.pathname.startsWith('/portal/invite/');

      // Admin panel: require auth, block clients
      if (isOnAdmin && !isOnAdminLogin) {
        if (!isLoggedIn) return false;
        if (role === 'client') {
          return Response.redirect(new URL('/portal/dashboard', nextUrl));
        }
        return true;
      }

      // Portal: require auth (except login, forgot-password, reset-password)
      if (isOnPortal && !isOnPortalLogin && !isOnPortalPublic) {
        if (!isLoggedIn) {
          const loginUrl = new URL('/portal/login', nextUrl);
          // nextUrl.pathname is always same-origin, but normalize defensively.
          loginUrl.searchParams.set('callbackUrl', safeCallbackUrl(nextUrl.pathname + nextUrl.search));
          return Response.redirect(loginUrl);
        }
        return true;
      }

      // Redirect already-logged-in users away from portal login
      if (isOnPortalLogin && isLoggedIn) {
        const callbackUrl = safeCallbackUrl(nextUrl.searchParams.get('callbackUrl'));
        return Response.redirect(new URL(callbackUrl, nextUrl));
      }

      return true;
    },
  },
});
