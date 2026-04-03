import { test, expect } from '@playwright/test';

const SURVEY_URL = '/s/net-promoter-score-nps-mnh1ggfd';
const SCREENSHOTS = '/tmp/qa-screenshots';

test.describe('Survey Page QA - Branding & Functionality', () => {

  test('01 - Page loads with branding applied', async ({ page }) => {
    await page.goto(SURVEY_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Title renders
    const title = page.locator('h1');
    await expect(title).toContainText('Net Promoter Score');

    // Check heading font is applied (Montserrat)
    const titleFont = await title.evaluate(el => window.getComputedStyle(el).fontFamily);
    console.log('Title font-family:', titleFont);
    expect(titleFont.toLowerCase()).toContain('montserrat');

    // Check body font is applied (Source Code Pro) on wrapper
    const wrapperFont = await page.evaluate(() => {
      const wrapper = document.querySelector('[style*="font-family"]');
      return wrapper ? window.getComputedStyle(wrapper).fontFamily : 'none found';
    });
    console.log('Wrapper font-family:', wrapperFont);
    expect(wrapperFont.toLowerCase()).toContain('source code pro');

    // Check accent bar exists and uses primary color
    const accentBar = page.locator('.rounded-full.mb-6').first();
    await expect(accentBar).toBeVisible();
    const barBg = await accentBar.evaluate(el => el.style.backgroundColor);
    console.log('Accent bar backgroundColor:', barBg);
    expect(barBg).toBeTruthy();

    // Check button has branded styling (buttonStyle.primaryBg = #21438c)
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.count() > 0) {
      const btnBg = await submitBtn.evaluate(el => el.style.backgroundColor);
      const btnBorderRadius = await submitBtn.evaluate(el => el.style.borderRadius);
      console.log('Button bg:', btnBg, 'borderRadius:', btnBorderRadius);
      // #21438c should be applied
      expect(btnBg).toBeTruthy();
    }

    // CSS vars injected
    const cssVarCount = await page.evaluate(() => {
      const wrapper = document.querySelector('[style*="--brand"]');
      if (!wrapper) return 0;
      const style = wrapper.getAttribute('style') || '';
      return (style.match(/--brand/g) || []).length;
    });
    console.log('CSS variables injected:', cssVarCount);

    await page.screenshot({ path: `${SCREENSHOTS}/01-survey-loaded.png`, fullPage: true });
  });

  test('02 - Survey fields render with proper types', async ({ page }) => {
    await page.goto(SURVEY_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // NPS template has: email (if required), slider (0-10), 2 textareas
    // Check email field (NPS requires email)
    const emailInput = page.locator('input[type="email"]');
    const hasEmail = await emailInput.count();
    console.log('Email field present:', hasEmail > 0);

    // Check for slider
    const slider = page.locator('input[type="range"]');
    const sliderCount = await slider.count();
    console.log('Slider fields:', sliderCount);
    expect(sliderCount).toBeGreaterThan(0);

    // Check for textareas
    const textareas = page.locator('textarea');
    const taCount = await textareas.count();
    console.log('Textarea fields:', taCount);
    expect(taCount).toBeGreaterThanOrEqual(2);

    // Check question numbering
    const labels = page.locator('label');
    const labelTexts: string[] = [];
    for (let i = 0; i < await labels.count(); i++) {
      labelTexts.push(await labels.nth(i).textContent() || '');
    }
    console.log('Labels:', labelTexts);

    await page.screenshot({ path: `${SCREENSHOTS}/02-survey-fields.png`, fullPage: true });
  });

  test('03 - Fill and submit survey successfully', async ({ page }) => {
    await page.goto(SURVEY_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Fill email
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.count() > 0) {
      await emailInput.fill('qa-test-' + Date.now() + '@example.com');
    }

    // Fill name
    const nameInput = page.locator('input[placeholder="John Doe"]');
    if (await nameInput.count() > 0) {
      await nameInput.fill('QA Tester');
    }

    // Set slider to 8
    const slider = page.locator('input[type="range"]');
    if (await slider.count() > 0) {
      await slider.fill('8');
    }

    // Fill textareas
    const textareas = page.locator('textarea');
    const taCount = await textareas.count();
    for (let i = 0; i < taCount; i++) {
      await textareas.nth(i).fill('QA test response ' + (i + 1));
    }

    await page.screenshot({ path: `${SCREENSHOTS}/03-survey-filled.png`, fullPage: true });

    // Submit
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Verify thank you screen
    const thankYouTitle = page.locator('h2');
    await expect(thankYouTitle).toContainText('Thank you');

    // Check branding on thank you screen
    const thankYouFont = await thankYouTitle.evaluate(el => window.getComputedStyle(el).fontFamily);
    console.log('Thank you font:', thankYouFont);

    await page.screenshot({ path: `${SCREENSHOTS}/04-survey-submitted.png`, fullPage: true });
  });

  test('04 - No site nav or footer on survey page', async ({ page }) => {
    await page.goto(SURVEY_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const nav = page.locator('nav');
    expect(await nav.count()).toBe(0);

    const footer = page.locator('footer');
    expect(await footer.count()).toBe(0);

    // Should have "Powered by" text (standalone mode only)
    const powered = page.locator('text=Powered by SimplerDevelopment');
    expect(await powered.count()).toBeGreaterThan(0);
  });

  test('05 - Embed mode hides powered-by and logo', async ({ page }) => {
    await page.goto(SURVEY_URL + '?embed=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const powered = page.locator('text=Powered by SimplerDevelopment');
    expect(await powered.count()).toBe(0);

    await page.screenshot({ path: `${SCREENSHOTS}/05-survey-embed.png`, fullPage: true });
  });

  test('06 - Required field validation works', async ({ page }) => {
    await page.goto(SURVEY_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Try to submit without filling required fields
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Should show error or stay on page (not show thank you)
    const thankYou = page.locator('h2:has-text("Thank you")');
    expect(await thankYou.count()).toBe(0);

    await page.screenshot({ path: `${SCREENSHOTS}/06-survey-validation.png`, fullPage: true });
  });
});
