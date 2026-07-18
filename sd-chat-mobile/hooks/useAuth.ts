/**
 * SD Chat — useAuth hook
 *
 * Convenience wrapper around the AuthContext provided by
 * `lib/auth/AuthContext.tsx`. Throws if used outside the provider so
 * misuse fails loudly during development.
 */

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '@/lib/auth/AuthContext';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return ctx;
}

export default useAuth;
