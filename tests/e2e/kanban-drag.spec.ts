/**
 * Kanban Board Drag-and-Drop E2E Test
 * Tests that cards can be dragged to empty columns using pointer events.
 */
import { test, expect } from '@playwright/test';

const PROJECT_URL = '/portal/projects/2';

test.describe('Kanban Drag to Empty Column', () => {
  test.use({ storageState: undefined });

  test.beforeEach(async ({ page }) => {
    // Login as the project owner
    const csrfRes = await page.request.get('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();
    await page.request.post('/api/auth/callback/credentials', {
      form: {
        email: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'admin123',
        csrfToken,
        json: 'true',
      },
    });
  });

  test('can drag card to empty column via pointer events', async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.waitForLoadState('networkidle');

    // Find all column containers
    const columns = page.locator('.flex-shrink-0.w-72');
    const colCount = await columns.count();
    expect(colCount).toBeGreaterThanOrEqual(3);

    // Check column 3 (In Progress, index 2) is empty
    const emptyCol = columns.nth(2);
    const emptyColCards = emptyCol.locator('[role="button"]');
    const emptyBefore = await emptyColCards.count();
    console.log(`In Progress cards before: ${emptyBefore}`);

    // Get first card in Backlog (column 0)
    const firstCard = columns.nth(0).locator('[role="button"]').first();
    await expect(firstCard).toBeVisible();
    const cardTitle = await firstCard.locator('p').first().textContent();
    console.log(`Dragging card: ${cardTitle}`);

    // Get bounding boxes
    const cardBox = await firstCard.boundingBox();
    const emptyColBox = await emptyCol.boundingBox();
    expect(cardBox).toBeTruthy();
    expect(emptyColBox).toBeTruthy();

    const startX = cardBox!.x + cardBox!.width / 2;
    const startY = cardBox!.y + cardBox!.height / 2;
    const endX = emptyColBox!.x + emptyColBox!.width / 2;
    const endY = emptyColBox!.y + emptyColBox!.height / 2;

    console.log(`Drag from (${startX}, ${startY}) to (${endX}, ${endY})`);

    // Simulate @dnd-kit PointerSensor drag
    // 1. pointerdown on card
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(50);

    // 2. Move past activation distance (5px)
    await page.mouse.move(startX + 10, startY, { steps: 3 });
    await page.waitForTimeout(100);

    // 3. Move to target in smooth steps
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const x = startX + (endX - startX) * (i / steps);
      const y = startY + (endY - startY) * (i / steps);
      await page.mouse.move(x, y, { steps: 2 });
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(200);

    // 4. Drop
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Verify the card moved
    const emptyAfter = await emptyColCards.count();
    console.log(`In Progress cards after: ${emptyAfter}`);

    // Take screenshot
    await page.screenshot({ path: 'test-results/kanban-drag-result.png' });

    expect(emptyAfter).toBeGreaterThan(emptyBefore);
  });
});
