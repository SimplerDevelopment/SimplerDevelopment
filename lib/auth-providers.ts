// Thin helper that exposes which OAuth providers are configured.
//
// `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` is computed at build time in next.config.ts
// from the same env-var check used to register the provider in lib/auth.ts,
// so the two can never diverge. The NEXT_PUBLIC_ prefix makes it available in
// both server and client components without needing a separate server action.

/** True when the Google OAuth provider is configured in this environment. */
export const isGoogleAuthEnabled =
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';

/**
 * True when self-serve signup is turned off in this environment. Set
 * NEXT_PUBLIC_SIGNUP_DISABLED=true on the hosted production deployment to
 * close public signup (the UI points at /contact for managed hosting and the
 * signup API returns 403). Self-hosted and dev instances keep signup by
 * default — the flag is opt-in per environment.
 */
export const isSignupDisabled =
  process.env.NEXT_PUBLIC_SIGNUP_DISABLED === 'true';
