import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
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
        // Share session across all *.simplerdevelopment.com subdomains
        domain: process.env.NODE_ENV === 'production' ? '.simplerdevelopment.com' : undefined,
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
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
