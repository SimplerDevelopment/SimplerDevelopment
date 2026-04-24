/**
 * PM Kanban UI — browser-driven smoke tests
 *
 * The pm-*.spec.ts suite already covers the HTTP layer exhaustively. This
 * file covers the React/DOM layer: does the board render, does clicking a
 * card open the modal, does the My Tasks page surface assigned work. Kept
 * intentionally small — three happy-path smokes, not an exhaustive widget
 * matrix.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';

async function loginAsClient(page: Page) {
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post('/api/auth/callback/credentials', {
    form: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD, csrfToken, json: 'true' },
  });
}

test.describe('PM Kanban UI @pm @ui', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('board renders all 4 columns and a seeded card', async ({ page, clientApi }) => {
    const { project, columns, cleanup: cleanProject } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanProject);
    const backlog = columns.find((c) => c.name === 'Backlog')!;
    const { card, cleanup: cleanCard } = await createTestKanbanCard(clientApi, backlog.id, {
      title: 'UI Smoke Card',
    });
    cleanups.push(cleanCard);

    await loginAsClient(page);
    await page.goto(`/portal/projects/${project.id}`);

    // Every default column name should render.
    for (const colName of ['Backlog', 'In Progress', 'Review', 'Done']) {
      await expect(page.getByRole('heading', { name: colName }).first()).toBeVisible();
    }

    // Seeded card surfaces by title.
    await expect(page.getByText(card.title)).toBeVisible();
  });

  test('clicking a card opens the detail modal', async ({ page, clientApi }) => {
    const { project, columns, cleanup: cleanProject } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanProject);
    const backlog = columns.find((c) => c.name === 'Backlog')!;
    const { card, cleanup: cleanCard } = await createTestKanbanCard(clientApi, backlog.id, {
      title: 'Modal Target Card',
      description: 'Description visible in modal body',
    });
    cleanups.push(cleanCard);

    await loginAsClient(page);
    // Use the deep-link query param — it's the same codepath the card click
    // fires but skips flakiness from @dnd-kit pointer sensors intercepting the
    // click in CI headless mode.
    await page.goto(`/portal/projects/${project.id}?card=${card.id}`);
    await page.waitForLoadState('networkidle');

    // "Assignees" and "Dependencies" labels are rendered only inside the
    // detail modal — not on the card preview — so they are reliable markers
    // that the modal actually mounted.
    await expect(page.getByText('Assignees', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Dependencies', { exact: true })).toBeVisible();
    // Description is rendered inside the modal body.
    await expect(page.getByText('Description visible in modal body').first()).toBeVisible();
  });

  test('my-tasks surfaces a card assigned to me', async ({ page, clientApi }) => {
    // Resolve the current user's id via the session endpoint.
    const sessionRes = await clientApi.get('/api/auth/session');
    const userId = parseInt((sessionRes.data as { user: { id: string } }).user.id, 10);
    expect(Number.isFinite(userId)).toBe(true);

    const { project, columns, cleanup: cleanProject } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanProject);
    const backlog = columns.find((c) => c.name === 'Backlog')!;
    const { card, cleanup: cleanCard } = await createTestKanbanCard(clientApi, backlog.id, {
      title: 'Assigned-to-me UI card',
    });
    cleanups.push(cleanCard);

    // Assign via the API — UI layer just renders whatever the API returns.
    const assignRes = await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId });
    expect(assignRes.status).toBe(200);

    await loginAsClient(page);
    await page.goto('/portal/my-tasks');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(card.title)).toBeVisible({ timeout: 15_000 });
    // Project key appears next to the card as attribution.
    if (project.projectKey) {
      await expect(page.getByText(new RegExp(`${project.projectKey}-`))).toBeVisible();
    }
  });
});
