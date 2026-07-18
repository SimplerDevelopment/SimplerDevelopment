/**
 * Portal Websites Navigation Page — Refactor Baseline
 *
 * Locks in the current end-user behavior of
 * /portal/websites/[siteId]/navigation so the upcoming refactor (extracting
 * MenuTree / MenuItemEditor / MenuSettings / MegaMenuConfig / NavigationPreview
 * / useNavigation / api / tree helpers out of the 1,301-LOC page.tsx) can be
 * verified to be a no-op.
 *
 * The page is iframe-heavy (live preview + zoom + viewport presets), so this
 * baseline does the minimum UI assertion (page renders + tabs switch) and
 * exercises the persistence path the page uses — the same PUT endpoints fired
 * on Save — to lock in the data shape end-to-end.
 *
 * Coverage:
 *   - Page renders Navigation Editor + Menu Items / Branding tabs
 *   - Add a top-level menu item via API; reload; assert it persists
 *   - Edit the label via API; assert
 *   - Add a sub-item nested under the first; assert nesting
 *   - Cleanup with NAV- prefix + runCleanups
 */
import type { Page } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';
const PREFIX = 'NAV-';

async function loginAsClient(page: Page) {
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post('/api/auth/callback/credentials', {
    form: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD, csrfToken, json: 'true' },
  });
}

test.describe('Portal Websites Navigation Page — refactor baseline @navigation @ui @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('renders editor + tabs, adds/edits/nests menu items via API persistence', async ({
    page,
    clientApi,
  }) => {
    // ── Arrange: a fresh website (so we don't collide with anything else)
    const { website } = await createTestWebsite(clientApi);
    const siteId = website.id as number;

    // Wipe nav so we start from a clean slate (idempotent re-runs)
    cleanups.push(async () => {
      await clientApi
        .put(`/api/portal/websites/${siteId}/navigation`, { items: [] })
        .catch(() => {});
    });

    // ── Render the navigation page
    await loginAsClient(page);
    await page.goto(`/portal/websites/${siteId}/navigation`);
    await page.waitForLoadState('networkidle');

    // Header copy is stable
    await expect(page.getByRole('heading', { name: 'Navigation Editor' })).toBeVisible({
      timeout: 30_000,
    });

    // Tabs: Menu Items / Branding
    const itemsTab = page.getByRole('button', { name: /Menu Items/ });
    const brandingTab = page.getByRole('button', { name: /Branding/ });
    await expect(itemsTab).toBeVisible();
    await expect(brandingTab).toBeVisible();

    // Tab switching works (Branding tab shows the brand colors heading)
    await brandingTab.click();
    await expect(page.getByRole('heading', { name: /Brand Colors/ })).toBeVisible();
    await itemsTab.click();
    await expect(page.getByRole('button', { name: /Add Menu Item/ })).toBeVisible();

    // Save button is rendered
    await expect(page.getByRole('button', { name: /Save Changes/ })).toBeVisible();

    // ── Act: add a top-level menu item via API (the page's Save button hits
    //    the same PUT). Reload, assert it persists.
    const ts = Date.now();
    const homeLabel = `${PREFIX}Home-${ts}`;
    const aboutLabel = `${PREFIX}About-${ts}`;

    const putAdd = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [
        { id: 1, label: homeLabel, href: '/', sortOrder: 0 },
        { id: 2, label: aboutLabel, href: '/about', sortOrder: 1 },
      ],
    });
    expect(putAdd.status).toBe(200);
    expect(putAdd.data.success).toBe(true);

    // Reload + GET asserts persistence
    const afterAdd = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    expect(afterAdd.status).toBe(200);
    const addedHome = (afterAdd.data.data as Array<{ id: number; label: string; href: string }>).find(
      (i) => i.label === homeLabel,
    );
    expect(addedHome).toBeTruthy();
    expect(addedHome!.href).toBe('/');

    // The page should rerender on goto and pull these via the editor's GET
    await page.goto(`/portal/websites/${siteId}/navigation`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(homeLabel).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(aboutLabel).first()).toBeVisible();

    // ── Edit label: change "Home" -> "Home-Edited"
    const editedHomeLabel = `${PREFIX}Home-${ts}-Edited`;
    const realHomeId = addedHome!.id;
    const realAboutId = (afterAdd.data.data as Array<{ id: number; label: string }>).find(
      (i) => i.label === aboutLabel,
    )!.id;

    const putEdit = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [
        { id: realHomeId, label: editedHomeLabel, href: '/', sortOrder: 0 },
        { id: realAboutId, label: aboutLabel, href: '/about', sortOrder: 1 },
      ],
    });
    expect(putEdit.status).toBe(200);

    const afterEdit = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    // The PUT stages edits as drafts — the effective label is draft.label when a
    // draft is present, falling back to the live label column otherwise.
    type NavRow = { id: number; label: string; parentId: number | null; draft?: { label?: string } | null };
    const effectiveLabel = (row: NavRow) => row.draft?.label ?? row.label;
    const editedHome = (afterEdit.data.data as NavRow[]).find(
      (i) => effectiveLabel(i) === editedHomeLabel,
    );
    expect(editedHome).toBeTruthy();
    // Old label is gone (neither live nor draft reflects the original label)
    expect(
      (afterEdit.data.data as NavRow[]).find(
        (i) => effectiveLabel(i) === homeLabel,
      ),
    ).toBeUndefined();

    // ── Add a sub-item nested under the first (parentId)
    const subLabel = `${PREFIX}Sub-${ts}`;
    const newHomeId = editedHome!.id;
    const newAboutId = (afterEdit.data.data as NavRow[]).find(
      (i) => effectiveLabel(i) === aboutLabel,
    )!.id;

    const putNest = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [
        { id: newHomeId, label: editedHomeLabel, href: '/', sortOrder: 0, parentId: null },
        { id: newAboutId, label: aboutLabel, href: '/about', sortOrder: 1, parentId: null },
        // Child of edited-home — provide explicit id so server can resolve parentId
        {
          id: 9999,
          label: subLabel,
          href: '/sub',
          sortOrder: 2,
          parentId: newHomeId,
        },
      ],
    });
    expect(putNest.status).toBe(200);

    const afterNest = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    const items = afterNest.data.data as NavRow[];
    // New sub-item is an INSERT so its live label is set immediately.
    const sub = items.find((i) => i.label === subLabel);
    expect(sub).toBeTruthy();
    // parent of the sub-item is the edited Home item (may still be in draft.label)
    const editedHomeAfterNest = items.find((i) => effectiveLabel(i) === editedHomeLabel);
    expect(editedHomeAfterNest).toBeTruthy();
    expect(sub!.parentId).toBe(editedHomeAfterNest!.id);
  });
});
