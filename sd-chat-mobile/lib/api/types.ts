/**
 * SD Chat — shared API types
 *
 * Mirrors the shape returned by the SimplerDevelopment portal at
 * `/api/portal/me` and the deep-link callback from `/portal/mobile-auth`.
 */

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface ClientInfo {
  id: number;
  company: string;
  subdomain: string | null;
}

export interface Session {
  user: User;
  client: ClientInfo | null;
  /** ISO string — null if the token doesn't carry an expiry. */
  expiresAt: string | null;
}

export type AuthErrorCode =
  | 'cancelled'
  | 'network'
  | 'missing_token'
  | 'invalid_token'
  | 'unknown';

export class AuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'AuthError';
  }
}
