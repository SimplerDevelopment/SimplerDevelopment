/**
 * Microsoft Graph OAuth scopes for the SimplerDevelopment Teams integration.
 * Must stay in sync with the Azure AD app registration's "API permissions" list
 * in the Azure portal.
 *
 * Notes on scope semantics:
 *   - openid + profile + email + offline_access are the OIDC + refresh-token
 *     scopes. offline_access is REQUIRED to get a refresh_token back from the
 *     token endpoint — without it, the access token expires and the user has
 *     to re-consent.
 *   - User.Read is delegated read of the calling user's profile (used to
 *     resolve their Graph oid + email at /callback time).
 *   - OnlineMeetingTranscript.Read.All (delegated) returns transcripts for
 *     meetings where the calling user is organizer or co-organizer ONLY.
 *     Participant-only access requires app-only + Resource-Specific Consent
 *     and is out of MVP scope.
 *   - OnlineMeetings.Read is needed to list/read the parent online meeting
 *     metadata (subject, attendees, start/end) when ingesting a transcript.
 */

export type MicrosoftSurface = 'identity' | 'transcripts' | 'mail';

export const SCOPES: Record<MicrosoftSurface, readonly string[]> = {
  identity: ['openid', 'profile', 'email', 'offline_access', 'User.Read'],
  transcripts: ['OnlineMeetingTranscript.Read.All', 'OnlineMeetings.Read'],
  // Phase 3 of [[Spec - CRM Email Sync + Sequences]]: delegated read of the
  // connected user's mailbox, to sync inbound Outlook messages onto CRM threads.
  // Must be added to the Azure AD app registration's API permissions to take effect.
  mail: ['Mail.Read'],
} as const;

/**
 * Build a flat scope list from one or more surfaces. Identity scopes are
 * always included (without offline_access we can't refresh tokens).
 */
export function scopesForSurfaces(surfaces: readonly MicrosoftSurface[]): string[] {
  const set = new Set<string>(SCOPES.identity);
  for (const s of surfaces) {
    for (const scope of SCOPES[s]) set.add(scope);
  }
  return [...set];
}
