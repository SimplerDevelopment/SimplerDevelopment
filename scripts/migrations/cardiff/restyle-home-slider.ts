/**
 * Iter 2 — Restyle the home page loan-slider widget (block 2 → child[0])
 * to match cardiff.co's restrained, compact "How Much Cash Do You Need?"
 * presentation. The current widget is too visually loud (giant 3.5rem orange
 * price display, huge orange CTA, heavy box shadow) compared to the original.
 *
 * Changes:
 *  - Smaller price display (3.5rem → 2.25rem)
 *  - Orange CTA → green (matches cardiff.co primary brand color)
 *  - Reduce padding + margin-top so it doesn't dominate
 *  - Soften shadow
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const HOME_POST_ID = 793;

const newSliderHtml = `<div class="cardiff-loan-slider" style="background:#ffffff;border:1px solid #e8edf6;border-radius:14px;padding:28px 28px 24px 28px;box-shadow:0 16px 40px rgba(37,65,139,0.10);margin-top:-72px;position:relative;z-index:5;max-width:560px;margin-left:auto;margin-right:auto">
  <div style="text-align:center">
    <div data-field="headline" style="font-family:Raleway, -apple-system, BlinkMacSystemFont, sans-serif;font-size:1.25rem;font-weight:700;color:#25418b;letter-spacing:-0.01em;margin:0 0 6px 0">How much cash do you need?</div>
    <div data-field="subtitle" style="font-family:'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;font-size:0.875rem;color:#525f7f;margin:0 0 18px 0">Slide to estimate. Decisions in under 2 minutes.</div>
  </div>
  <div style="text-align:center">
    <div id="cls-display" style="font-family:Raleway, -apple-system, BlinkMacSystemFont, sans-serif;font-size:2.25rem;font-weight:800;color:#25418b;letter-spacing:-0.02em;line-height:1;margin:0 0 16px 0">$50,000</div>
  </div>
  <input id="cls-range" type="range" min="{{minAmount}}" max="{{maxAmount}}" step="{{stepAmount}}" value="{{defaultAmount}}"
         oninput="(function(s){var v=Number(s.value);var d=document.getElementById('cls-display');if(d){d.textContent='$'+v.toLocaleString();}var c=document.getElementById('cls-cta');if(c){var u=new URL(c.href,location.href);u.searchParams.set('amount',v);c.href=u.toString();}var p=((v-{{minAmount}})/({{maxAmount}}-{{minAmount}}))*100;s.style.background='linear-gradient(to right, #5ac96f 0%, #5ac96f '+p+'%, #e8edf6 '+p+'%, #e8edf6 100%)';})(this)"
         style="width:100%;height:6px;background:linear-gradient(to right,#5ac96f 0%,#5ac96f 20%,#e8edf6 20%,#e8edf6 100%);border-radius:6px;outline:none;-webkit-appearance:none;appearance:none;cursor:pointer;margin:0 0 8px 0" />
  <div style="display:flex;justify-content:space-between;font-family:'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;font-size:0.72rem;color:#525f7f;font-weight:600;letter-spacing:0.03em;margin:0 0 18px 0">
    <span data-field="minLabel">$5,000</span>
    <span data-field="maxLabel">$250,000</span>
  </div>
  <div style="text-align:center;margin:0 0 12px 0">
    <a id="cls-cta" href="{{ctaUrl}}" data-field="ctaText" style="display:inline-block;background:#5ac96f;color:#ffffff;font-family:Raleway, -apple-system, BlinkMacSystemFont, sans-serif;font-weight:700;font-size:0.8125rem;letter-spacing:0.12em;text-transform:uppercase;padding:14px 36px;border-radius:4px;text-decoration:none;box-shadow:0 10px 24px rgba(90,201,111,0.30);transition:all 0.2s ease">Check Eligibility</a>
  </div>
  <div data-field="note" style="text-align:center;font-family:'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;font-size:0.75rem;color:#7c8aa6;margin:0">No collateral. No prepay penalty. Same-day funding.</div>
  <style>
    .cardiff-loan-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:22px; height:22px; border-radius:50%; background:#ffffff; border:3px solid #5ac96f; box-shadow:0 4px 10px rgba(90,201,111,0.4); cursor:pointer; transition: transform 0.15s ease; }
    .cardiff-loan-slider input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.12); }
    .cardiff-loan-slider input[type="range"]::-moz-range-thumb { width:22px; height:22px; border-radius:50%; background:#ffffff; border:3px solid #5ac96f; box-shadow:0 4px 10px rgba(90,201,111,0.4); cursor:pointer; }
    .cardiff-loan-slider a[id="cls-cta"]:hover { transform: translateY(-1px); box-shadow:0 14px 28px rgba(90,201,111,0.42); }
  </style>
</div>`;

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, HOME_POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${HOME_POST_ID} not found`);
  const parsed = JSON.parse(row.content);
  const sliderSection = parsed.blocks[2];
  if (sliderSection?.id !== 'slider-section') throw new Error(`Expected block[2].id === 'slider-section', got ${sliderSection?.id}`);
  const slider = sliderSection.blocks?.[0];
  if (slider?.id !== 'loan-slider') throw new Error(`Expected sliderSection.blocks[0].id === 'loan-slider', got ${slider?.id}`);
  slider.html = newSliderHtml;
  // Also tighten outer section padding so the widget integrates more with the hero
  sliderSection.style = {
    ...(sliderSection.style || {}),
    paddingTop: '24px',
    paddingBottom: '40px',
  };
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, HOME_POST_ID));
  console.log(`Updated post ${HOME_POST_ID}: restyled loan-slider widget`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
