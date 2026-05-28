/**
 * Iter 21 — Fix loan-slider interaction bugs reported in screenshot:
 *   - Track green fill doesn't follow the thumb on drag.
 *   - $10K / $25K / $50K / $100K / $250K preset chips do nothing on click.
 *
 * Root cause: iter19 defined `window.clsSet` *inside* the slider's `oninput`
 * handler. That means it doesn't exist until the user has dragged at least
 * once. Preset clicks fire `window.clsSet && ...` → undefined → no-op.
 * The track recolor IS in the oninput, but only runs *during* drag — never
 * on initial load and never from a preset click.
 *
 * Fix: extract all the interactive logic into a `<script>` tag that
 * HtmlRenderBlockRender already revives + executes (it walks all <script>
 * nodes after innerHTML and re-creates them so they actually run). Then
 * the script:
 *   1. Defines `window.cardiffLoanSlider.set(amount)` on load.
 *   2. Wires every `.cls-preset` button via addEventListener.
 *   3. Wires the range input via addEventListener (single source of truth).
 *   4. Calls `set(currentValue)` once on load so the track is properly
 *      coloured before the user touches it.
 *
 * Also: remove the inline `oninput=` / `onclick=` attributes so we don't have
 * two handlers fighting each other.
 *
 * Idempotent — overwrites the same widget.html on every run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const SECTION_ID = 'slider-section';
const WIDGET_ID = 'loan-slider';

const SLIDER_HTML = `<div class="cardiff-loan-slider" style="background:#ffffff;border:1px solid #e8edf6;border-radius:18px;padding:30px 32px 26px 32px;box-shadow:0 20px 50px rgba(28,51,112,0.14);margin-top:-88px;position:relative;z-index:5;max-width:600px;margin-left:auto;margin-right:auto;overflow:hidden">
  <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#25418b 0%,#5ac96f 55%,#ef6632 100%)"></div>
  <div style="text-align:center">
    <div data-field="headline" style="font-family:Raleway,-apple-system,BlinkMacSystemFont,sans-serif;font-size:1.3125rem;font-weight:800;color:#25418b;letter-spacing:-0.01em;margin:6px 0 4px 0">{{headline}}</div>
    <div data-field="subtitle" style="font-family:'Open Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.875rem;color:#525f7f;margin:0 0 18px 0">{{subtitle}}</div>
  </div>
  <div style="text-align:center;margin:0 0 6px 0">
    <div id="cls-display" style="font-family:Raleway,-apple-system,BlinkMacSystemFont,sans-serif;font-size:2.5rem;font-weight:800;color:#25418b;letter-spacing:-0.025em;line-height:1;margin:0">$50,000</div>
    <div id="cls-payment" style="font-family:'Open Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.9375rem;color:#525f7f;margin:8px 0 18px 0;font-weight:600">Est. <span id="cls-payment-amt" style="color:#3aa856;font-family:Raleway,sans-serif;font-weight:800">$1,506</span><span style="color:#7c8aa6;font-weight:500"> / month</span></div>
  </div>
  <div class="cls-presets" style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:0 0 18px 0">
    <button type="button" class="cls-preset" data-amt="10000">$10K</button>
    <button type="button" class="cls-preset" data-amt="25000">$25K</button>
    <button type="button" class="cls-preset is-active" data-amt="50000">$50K</button>
    <button type="button" class="cls-preset" data-amt="100000">$100K</button>
    <button type="button" class="cls-preset" data-amt="250000">$250K</button>
  </div>
  <input id="cls-range" type="range" min="{{minAmount}}" max="{{maxAmount}}" step="{{stepAmount}}" value="{{defaultAmount}}"
         style="width:100%;height:6px;background:linear-gradient(to right,#5ac96f 0%,#5ac96f 20%,#e8edf6 20%,#e8edf6 100%);border-radius:6px;outline:none;-webkit-appearance:none;appearance:none;cursor:pointer;margin:0 0 8px 0" />
  <div style="display:flex;justify-content:space-between;font-family:'Open Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.72rem;color:#7c8aa6;font-weight:600;letter-spacing:0.04em;margin:0 0 22px 0">
    <span data-field="minLabel">{{minLabel}}</span>
    <span data-field="maxLabel">{{maxLabel}}</span>
  </div>
  <div style="text-align:center;margin:0 0 14px 0">
    <a id="cls-cta" href="{{ctaUrl}}" data-field="ctaText" style="display:inline-block;background:#5ac96f;color:#ffffff;font-family:Raleway,-apple-system,BlinkMacSystemFont,sans-serif;font-weight:700;font-size:0.8125rem;letter-spacing:0.14em;text-transform:uppercase;padding:15px 42px;border-radius:6px;text-decoration:none;box-shadow:0 12px 26px rgba(90,201,111,0.32);transition:all 0.2s ease">{{ctaText}}</a>
  </div>
  <div data-field="note" style="text-align:center;font-family:'Open Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.75rem;color:#7c8aa6;margin:0 0 4px 0">{{note}}</div>
  <div style="text-align:center;font-family:'Open Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.6875rem;color:#a3afc4;margin:0;font-style:italic">Estimate assumes 39-mo term at 12% APR. Actual rate based on application.</div>
  <style>
    .cardiff-loan-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:#ffffff;border:3px solid #5ac96f;box-shadow:0 4px 12px rgba(90,201,111,0.45);cursor:pointer;transition:transform 0.15s ease; }
    .cardiff-loan-slider input[type="range"]::-webkit-slider-thumb:hover { transform:scale(1.12); }
    .cardiff-loan-slider input[type="range"]::-moz-range-thumb { width:24px;height:24px;border-radius:50%;background:#ffffff;border:3px solid #5ac96f;box-shadow:0 4px 12px rgba(90,201,111,0.45);cursor:pointer; }
    .cardiff-loan-slider a[id="cls-cta"]:hover { transform:translateY(-1px);box-shadow:0 16px 32px rgba(90,201,111,0.44); }
    .cardiff-loan-slider .cls-preset { background:#f6f9fc;border:1px solid #e6ecf5;color:#525f7f;font-family:Raleway,-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.75rem;font-weight:700;letter-spacing:0.06em;padding:7px 14px;border-radius:999px;cursor:pointer;transition:all 0.18s ease; }
    .cardiff-loan-slider .cls-preset:hover { background:#eef3fb;border-color:#cdd9ec;color:#25418b; }
    .cardiff-loan-slider .cls-preset.is-active { background:linear-gradient(135deg,#5ac96f 0%,#3aa856 100%);border-color:#3aa856;color:#ffffff;box-shadow:0 4px 12px rgba(58,168,86,0.32); }
    @media (max-width: 560px) {
      .cardiff-loan-slider { padding:24px 22px 22px 22px;margin-top:-56px; }
      .cardiff-loan-slider #cls-display { font-size:2.125rem; }
      .cardiff-loan-slider .cls-preset { padding:6px 11px;font-size:0.7rem; }
    }
  </style>
  <script>
    (function(){
      var range = document.getElementById('cls-range');
      var display = document.getElementById('cls-display');
      var payAmt = document.getElementById('cls-payment-amt');
      var cta = document.getElementById('cls-cta');
      if (!range) return;
      var min = Number(range.min) || 0;
      var max = Number(range.max) || 250000;
      function paint(v) {
        v = Math.max(min, Math.min(max, Number(v) || 0));
        range.value = v;
        if (display) display.textContent = '$' + v.toLocaleString();
        // 39-month amortization at 12% APR
        var r = 0.12 / 12, n = 39;
        var pay = Math.round(v * r / (1 - Math.pow(1 + r, -n)));
        if (payAmt) payAmt.textContent = '$' + pay.toLocaleString();
        if (cta) {
          try {
            var u = new URL(cta.getAttribute('href') || '/', location.origin);
            u.searchParams.set('amount', String(v));
            cta.setAttribute('href', u.pathname + u.search);
          } catch (e) { /* href may be relative; fall back silently */ }
        }
        var pct = ((v - min) / (max - min)) * 100;
        range.style.background = 'linear-gradient(to right,#5ac96f 0%,#5ac96f ' + pct + '%,#e8edf6 ' + pct + '%,#e8edf6 100%)';
        document.querySelectorAll('.cardiff-loan-slider .cls-preset').forEach(function (b) {
          var amt = Number(b.getAttribute('data-amt'));
          b.classList.toggle('is-active', amt === v);
        });
      }
      range.addEventListener('input', function () { paint(range.value); });
      document.querySelectorAll('.cardiff-loan-slider .cls-preset').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          var amt = Number(b.getAttribute('data-amt'));
          if (!isNaN(amt)) paint(amt);
        });
      });
      // Paint once on load so the track matches the default value.
      paint(range.value);
    })();
  </script>
</div>`;

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${POST_ID} not found`);
  const parsed = JSON.parse(row.content);
  const sliderSection = parsed.blocks?.find((b: { id?: string }) => b.id === SECTION_ID);
  if (!sliderSection) throw new Error(`Section '${SECTION_ID}' not found`);
  const widget = sliderSection.blocks?.find((b: { id?: string }) => b.id === WIDGET_ID);
  if (!widget) throw new Error(`Widget '${WIDGET_ID}' not found`);
  widget.html = SLIDER_HTML;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`iter21: loan-slider html rewired — track recolor + preset chips now work from page load`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
