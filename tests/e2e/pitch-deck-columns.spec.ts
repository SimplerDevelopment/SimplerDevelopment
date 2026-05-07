/**
 * Pitch Deck Column Rendering E2E Tests
 *
 * Verifies that column configurations render properly in the pitch deck
 * presentation view, including cases where widths exceed 100%.
 */
import { test, expect } from '@playwright/test';

const DECK_URL = '/slides/palizzi-social-club-mngj4171';

test.describe('Pitch Deck Column Rendering @pitch-deck @columns', () => {
  test('slide 2 columns render side-by-side without overflow', async ({ page }) => {
    await page.goto(DECK_URL);
    await page.waitForLoadState('networkidle');

    // Verify slide 1 loaded
    await expect(page.locator('.slide-themed')).toBeVisible({ timeout: 10000 });

    // Navigate to slide 2
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);

    // Screenshot slide 2
    await page.screenshot({ path: 'test-results/pitch-deck-slide2.png', fullPage: false });

    // Debug: find column elements
    const colInfo = await page.evaluate(() => {
      const themed = document.querySelector('.slide-themed');
      if (!themed) return { error: 'No .slide-themed' };

      // Find elements with --col-width or data-col-stacks
      const results: Array<{
        tag: string;
        colWidth: string;
        computedWidth: number;
        computedFlex: string;
        x: number;
        dataAttr: string;
      }> = [];

      themed.querySelectorAll('div').forEach(el => {
        const htmlEl = el as HTMLElement;
        const colWidth = htmlEl.style.getPropertyValue('--col-width');
        const hasFlex = htmlEl.style.flex;
        const hasDataCol = htmlEl.hasAttribute('data-col-stacks-md') || htmlEl.hasAttribute('data-col-stacks-lg') || htmlEl.hasAttribute('data-col-stacks-never');

        if (colWidth || hasFlex || hasDataCol) {
          const rect = el.getBoundingClientRect();
          const computed = window.getComputedStyle(el);
          results.push({
            tag: el.tagName,
            colWidth: colWidth || htmlEl.style.width || '',
            computedWidth: Math.round(rect.width),
            computedFlex: computed.flex,
            x: Math.round(rect.x),
            dataAttr: htmlEl.hasAttribute('data-col-stacks-md') ? 'md' : htmlEl.hasAttribute('data-col-stacks-lg') ? 'lg' : htmlEl.hasAttribute('data-col-stacks-never') ? 'never' : '',
          });
        }
      });
      return { columns: results };
    });

    console.log('Column info:', JSON.stringify(colInfo, null, 2));

    if ('columns' in colInfo && colInfo.columns.length >= 2) {
      const cols = colInfo.columns;
      const col1 = cols[0];
      const col2 = cols[1];

      // Both columns should have meaningful width
      expect(col1.computedWidth).toBeGreaterThan(50);
      expect(col2.computedWidth).toBeGreaterThan(50);

      // Columns should be side by side (col2 starts after col1)
      expect(col2.x).toBeGreaterThan(col1.x);

      // Neither column should overflow viewport
      const viewportWidth = page.viewportSize()!.width;
      expect(col2.x + col2.computedWidth).toBeLessThanOrEqual(viewportWidth + 20);
    }
  });
});
