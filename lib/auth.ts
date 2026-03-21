import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const { handlers, signIn, signOut, auth } = NextAuth({
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

      // Admin panel: require auth, block clients
      if (isOnAdmin && !isOnAdminLogin) {
        if (!isLoggedIn) return false;
        if (role === 'client') {
          return Response.redirect(new URL('/portal/dashboard', nextUrl));
        }
        return true;
      }

      // Portal: require auth
      if (isOnPortal && !isOnPortalLogin) {
        if (!isLoggedIn) {
          return Response.redirect(new URL('/portal/login', nextUrl));
        }
        return true;
      }

      // Redirect already-logged-in users away from portal login
      if (isOnPortalLogin && isLoggedIn) {
        return Response.redirect(new URL('/portal/dashboard', nextUrl));
      }

      return true;
    },
  },
});
