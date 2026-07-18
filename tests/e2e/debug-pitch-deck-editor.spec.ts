/**
 * Debug: Pitch Deck Visual Editor
 * Opens the editor in a headed browser for manual inspection.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test('debug pitch deck editor', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login as client@example.com via NextAuth
  const csrfRes = await page.goto(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = await csrfRes!.json();

  await page.goto(`${BASE_URL}/api/auth/callback/credentials`, {
    waitUntil: 'networkidle',
  });

  // Post login form
  await page.evaluate(async ({ csrfToken, baseUrl }) => {
    const form = new URLSearchParams();
    form.set('email', 'client@example.com');
    form.set('password', 'client123');
    form.set('csrfToken', csrfToken);
    form.set('json', 'true');
    await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      credentials: 'include',
    });
  }, { csrfToken, baseUrl: BASE_URL });

  // Navigate to pitch deck editor
  await page.goto(`${BASE_URL}/portal/tools/pitch-decks/8`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Take screenshot of the editor in preview mode
  await page.screenshot({ path: 'test-results/pitch-deck-preview.png', fullPage: true });

  // Click "Edit Blocks" button
  const editBtn = page.locator('button:has-text("Edit Blocks")');
  if (await editBtn.isVisible()) {
    await editBtn.click();
    await page.waitForTimeout(3000);

    // Take screenshot of edit mode
    await page.screenshot({ path: 'test-results/pitch-deck-edit.png', fullPage: true });

    // Check iframe content
    const iframe = page.frameLocator('iframe[title="Visual Editor"]');
    const iframeContent = iframe.locator('body');

    // Log what's in the iframe
    const bodyText = await iframeContent.textContent().catch(() => 'IFRAME NOT ACCESSIBLE');
    console.log('Iframe body text:', bodyText?.substring(0, 200));

    // Check if blocks rendered
    const blockElements = await iframe.locator('[data-block-id]').count().catch(() => 0);
    console.log('Block elements in iframe:', blockElements);

    // Check if "No blocks" message shows
    const noBlocksVisible = await iframe.locator('text=No blocks').isVisible().catch(() => false);
    console.log('No blocks message visible:', noBlocksVisible);

    // Check iframe URL
    const iframeSrc = await page.locator('iframe[title="Visual Editor"]').getAttribute('src');
    console.log('Iframe src:', iframeSrc);

    // Log console messages from iframe
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[${msg.type()}] ${msg.text()}`);
      }
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/pitch-deck-edit-final.png', fullPage: true });
  }

  await context.close();
});
