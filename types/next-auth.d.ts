import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: string;
    /** Epoch ms of the last DB re-validation of the user (existence + active).
     *  Used to throttle the per-request user check in the jwt callback. */
    checkedAt?: number;
  }
}
