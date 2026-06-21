/**
 * cov-u14.spec.ts — Pitch Decks Product Designer E2E coverage
 *
 * Cards 0-3 from the "## To Test" backlog:
 *   0. Viewer analytics on shared deck (view count, time-on-slide) — GAP: no implementation
 *   1. Access control on shared deck link (password / expiry) — GAP: no implementation
 *   2. Draft/live approval gate for deck publish — GAP: no approval gate, just direct publish
 *   3. Deck as first-class block sharing brand + media assets — tested below
 *
 * Card 3 findings:
 *   - POST /api/portal/tools/pitch-decks with brandingProfileId persists it correctly (PASS)
 *   - PATCH /api/portal/tools/pitch-decks/[id] with brandingProfileId silently drops it (BUG)
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

// ── Helper ────────────────────────────────────────────────────────────────────

async function createTestDeck(api: import('./setup/api-client').ApiClient) {
  const ts = Date.now();
  const res = await api.post('/api/portal/tools/pitch-decks', {
    title: `cov-u14 Deck ${ts}`,
    description: 'E2E coverage test deck',
  });
  if (!res.data?.success) throw new Error(`Failed to create test deck: ${res.data?.message}`);
  const id = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/tools/pitch-decks/${id}`).catch(() => {});
  };
  return { id, cleanup, deck: res.data.data };
}

// ── Card 3: Deck brandingProfileId association ────────────────────────────────
// "Deck as first-class block sharing brand + media assets"
//
// The pitch_decks schema includes `brandingProfileId` (FK to branding_profiles).
// POST /api/portal/tools/pitch-decks accepts brandingProfileId at creation time.
// PATCH does NOT support updating brandingProfileId — that is a bug.

test.describe('Pitch Decks — brand association @pitch-decks @branding', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'deck created with brandingProfileId retains it on GET (card 3: brand sharing at create time)',
    async ({ clientApi }) => {
      // Create a branding profile first
      const ts = Date.now();
      const profileRes = await clientApi.post('/api/portal/branding/profiles', {
        name: `cov-u14 Brand Profile Create ${ts}`,
        primaryColor: '#aabbcc',
        isDefault: false,
      });
      expect([200, 201]).toContain(profileRes.status);
      const profileId = profileRes.data.data.id;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/branding/profiles/${profileId}`).catch(() => {});
      });

      // Create a deck with the branding profile
      const createRes = await clientApi.post('/api/portal/tools/pitch-decks', {
        title: `cov-u14 Branded Deck ${ts}`,
        description: 'Deck with branding profile at creation',
        brandingProfileId: profileId,
      });
      expect(createRes.status).toBe(200);
      expect(createRes.data.success).toBe(true);
      const deckId = createRes.data.data.id;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/tools/pitch-decks/${deckId}`).catch(() => {});
      });

      // Verify brandingProfileId is persisted
      const getRes = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.data.data.brandingProfileId).toBe(profileId);
    },
  );

  // BUG: PATCH /api/portal/tools/pitch-decks/[id] does not handle brandingProfileId.
  // The field is silently ignored — it is in the schema and accepted by POST but
  // not listed in the PATCH handler's update-field block. GET returns null after PATCH.
  test(
    'BUG: PATCH deck with brandingProfileId silently ignores it (card 3: bug)',
    async ({ clientApi }) => {
      const { id: deckId, cleanup: deckCleanup } = await createTestDeck(clientApi);
      cleanups.push(deckCleanup);

      const ts = Date.now();
      const profileRes = await clientApi.post('/api/portal/branding/profiles', {
        name: `cov-u14 Brand Profile Bug ${ts}`,
        primaryColor: '#1a2b3c',
        isDefault: false,
      });
      expect([200, 201]).toContain(profileRes.status);
      const profileId = profileRes.data.data.id;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/branding/profiles/${profileId}`).catch(() => {});
      });

      // PATCH with brandingProfileId — succeeds (200) but silently ignores the field
      const patchRes = await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
        brandingProfileId: profileId,
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.data.success).toBe(true);

      // GET reveals the bug: brandingProfileId is still null, not the profileId we sent
      const getRes = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
      expect(getRes.status).toBe(200);
      // Assertion documents the bug — PATCH should persist brandingProfileId but does not
      expect(getRes.data.data.brandingProfileId).toBeNull();
    },
  );
});
