/**
 * Diagnostic: run the playwright+Haiku extractor on ONE explicit URL.
 * Usage: npx tsx --env-file=.env scripts/debug-playwright-single.ts https://www.iit.edu/
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';

import { findDirectoryCandidates, GUESSED_DIRECTORY_PATHS } from '../lib/directory-scraper';

const URL_TO_SCRAPE = process.argv[2];
if (!URL_TO_SCRAPE) { console.error('Pass a URL'); process.exit(1); }

const SYSTEM_PROMPT = `You extract staff/faculty contacts from a university or company website HTML fragment.

Return ONLY a JSON array (no prose) of objects with these fields:
  firstName (required, non-empty string)
  lastName (string or null)
  title (string or null)
  email (string or null — must contain '@'; otherwise null)
  phone (string or null)
  linkedinUrl (string or null — only linkedin.com/in/; else null)

Rules:
 - Only include people. Reject generic links.
 - Each person MUST have firstName plus at least one of: lastName, title, email, or linkedinUrl.
 - If the page isn't a staff listing, return [].
 - Return [] if not confident. Max 200 per page.
 - Output must be valid JSON.parse-able. No markdown fences.`;

function stripHtml(html: string): string {
  let s = html;
  for (const tag of ['script','style','svg','noscript','form','nav','header','footer','aside','iframe']) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ')
         .replace(new RegExp(`<${tag}\\b[^>]*\\/>`, 'gi'), ' ');
  }
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
       .replace(/<([a-zA-Z][a-zA-Z0-9]*)\s+([^>]*?)>/g, (_m, tag: string, attrs: string) => {
         const h = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
         return h ? `<${tag} href="${h[1]}">` : `<${tag}>`;
       })
       .replace(/\s+/g, ' ').trim();
  if (s.length > 60_000) s = s.slice(0, 60_000);
  return s;
}

async function main() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (compatible; PostCaptainDebug/1.0)' });
  const page = await ctx.newPage();

  console.log(`\n── Loading homepage: ${URL_TO_SCRAPE}`);
  await page.goto(URL_TO_SCRAPE, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* noop */ }
  const homeHtml = await page.content();
  const finalUrl = page.url();
  console.log(`  final URL: ${finalUrl}`);
  console.log(`  raw HTML size: ${homeHtml.length} bytes`);

  const scored = findDirectoryCandidates(homeHtml, finalUrl, 6);
  console.log(`\n── Directory candidates (${scored.length}):`);
  scored.forEach((s) => console.log(`  ${s.score}  ${s.url}  (${s.reason})`));

  const baseHost = new URL(finalUrl).origin;
  const guessUrls = GUESSED_DIRECTORY_PATHS.map((p) => baseHost + p);
  console.log(`\n── Guess URLs to fall back on (${guessUrls.length}):`);
  guessUrls.forEach((u) => console.log(`  ${u}`));

  const urlsToTry = [...scored.slice(0, 3).map((s) => s.url), ...guessUrls];
  for (const url of urlsToTry) {
    console.log(`\n── Trying: ${url}`);
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* noop */ }
      const status = r?.status() ?? 0;
      if (status >= 400 || status === 0) { console.log(`  SKIP status=${status}`); continue; }
      const html = await page.content();
      const stripped = stripHtml(html);
      console.log(`  HTML ${html.length}B → stripped ${stripped.length}B`);
      if (stripped.length < 200) { console.log('  too short, skipping LLM'); continue; }

      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Company: debug\nPage URL: ${page.url()}\n\nHTML fragment:\n${stripped}` }],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
      console.log(`  LLM tokens: in=${res.usage.input_tokens}  cache_create=${res.usage.cache_creation_input_tokens ?? 0}  cache_read=${res.usage.cache_read_input_tokens ?? 0}  out=${res.usage.output_tokens}`);
      console.log(`  LLM raw output: ${text.slice(0, 400)}${text.length > 400 ? '…' : ''}`);
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`  ✓ extracted ${parsed.length} — HIT`);
          break;
        } else {
          console.log(`  ✗ empty array`);
        }
      } catch (err) {
        console.log(`  ✗ parse error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      console.log(`  ERR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
