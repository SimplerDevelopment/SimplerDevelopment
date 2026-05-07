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
    signIn: '/admin/login',
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
        token.role = user.role;
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
