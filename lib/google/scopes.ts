/**
 * Canonical Google OAuth scopes for the SimplerDevelopment Workspace integration.
 * Must stay in sync with the GCP project's OAuth consent screen scope list.
 * See: .planning/milestones/google-workspace/phases/01-gcp-foundation-and-schema/GCP-SETUP.md
 */

export type GoogleSurface = 'identity' | 'gmail' | 'calendar' | 'drive' | 'contacts';

export const SCOPES: Record<GoogleSurface, readonly string[]> = {
  identity: [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  gmail: ['https://www.googleapis.com/auth/gmail.readonly'],
  calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly',
  ],
  drive: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ],
  contacts: ['https://www.googleapis.com/auth/contacts.readonly'],
} as const;

/**
 * Build a flat scope list from one or more surfaces.
 * Identity scopes are always included.
 */
export function scopesForSurfaces(surfaces: readonly GoogleSurface[]): string[] {
  const set = new Set<string>(SCOPES.identity);
  for (const s of surfaces) {
    for (const scope of SCOPES[s]) set.add(scope);
  }
  return [...set];
}
