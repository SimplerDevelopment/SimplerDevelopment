require('dotenv').config();
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

(async () => {
  const [row] = await sql`SELECT content, custom_css, custom_js FROM posts WHERE id = 302`;

  // ===== 1. CONTENT EDITS — subtitle text + title line break =====
  const data = JSON.parse(row.content);
  const hero = data.blocks.find(b => b.type === 'hero');
  if (!hero) { console.error('no hero'); process.exit(1); }

  // Target: "DISCOVER A / NEW WAY FORWARD" — break after "DISCOVER A"
  hero.title = 'DISCOVER A<br>NEW WAY <span class="hero-forward">FORWARD</span>';
  // Target subtitle
  hero.description = 'Built by former Slate Captains. Your guide to all things Slate.';

  // ===== 2. CUSTOM_JS — swap badge div for real PNG =====
  let js = row.custom_js || '';
  // Remove old badge block (between 'Slate Platinum badge' comment and first closing brace of that try/catch)
  js = js.replace(
    /\/\/ Slate Platinum badge[\s\S]*?\} catch \(e\) \{ console\.error\('pc-badge', e\); \}/,
    `// Slate Platinum badge (real PNG, body-appended)
try {
  if (!document.getElementById('pc-slate-badge')) {
    var badge = document.createElement('img');
    badge.id = 'pc-slate-badge';
    badge.src = 'https://postcaptain.com/wp-content/uploads/2024/05/slate-platinum-partner.png';
    badge.alt = 'Slate Platinum Preferred Partner';
    document.body.appendChild(badge);
  }
} catch (e) { console.error('pc-badge', e); }`
  );

  // ===== 3. CUSTOM_CSS — badge sizing, nav styling, wave tune =====
  let css = row.custom_css || '';

  // Replace the old synthesized-badge rule with img-friendly styles
  css = css.replace(
    /\/\* ─── Slate Platinum badge ─── \*\/[\s\S]*?(?=\/\* ─)/,
    `/* ─── Slate Platinum badge (real PNG) ─── */
#pc-slate-badge {
  position: absolute; top: 150px; right: 40px;
  width: 110px; height: auto; z-index: 50;
  pointer-events: none;
  filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
}

`
  );

  // Strip any prior nav-transparent-v1 block
  css = css.replace(/\/\* nav-transparent-v1[\s\S]*?\/\* \/nav-transparent-v1 \*\//g, '');
  // Strip any prior wave-contrast-v1 block (and the previous png-visible-v1)
  css = css.replace(/\/\* wave-contrast-v1[\s\S]*?\/\* \/wave-contrast-v1 \*\//g, '');
  css = css.replace(/\/\* hero-png-visible-v1[\s\S]*?\/\* \/hero-png-visible-v1 \*\//g, '');

  css += `
/* nav-transparent-v1 — make top nav transparent over the hero to match target.
   Target's nav sits visually inside the hero, so we drop the white bg and switch
   link text to white. The announcement bar stays above (fixed top:0) and the nav
   sits beneath it via body.pc-has-announce nav.fixed { top:42px }. */
nav.fixed {
  background-color: transparent !important;
  border-bottom: 0 !important;
  box-shadow: none !important;
}
nav.fixed a,
nav.fixed a[style*="color"] {
  color: #ffffff !important;
}
nav.fixed a[href="/contact"] {
  /* the "Contact" pill gets its own treatment via #pc-nav-cta (body-appended). Hide the in-nav one. */
  display: none !important;
}
nav.fixed img {
  filter: brightness(0) invert(1) !important;
}
/* /nav-transparent-v1 */

/* wave-contrast-v1 — lift wave PNG visibility. Further reduce the ::before gradient
   alpha so the PNG's flowing curves read clearly against the hero bg color. */
.block-content [data-block-type="hero"]::before {
  background: linear-gradient(180deg, rgba(10,58,92,0.05) 0%, rgba(8,53,90,0.20) 70%, rgba(7,44,71,0.35) 100%) !important;
}
/* /wave-contrast-v1 */`;

  // Brace balance sanity
  const opens = (css.match(/\{/g) || []).length;
  const closes = (css.match(/\}/g) || []).length;
  if (opens !== closes) {
    console.error('BRACE MISMATCH', { opens, closes });
    process.exit(1);
  }

  await sql`
    UPDATE posts
    SET content = ${JSON.stringify(data)},
        custom_css = ${css},
        custom_js = ${js},
        updated_at = NOW()
    WHERE id = 302
  `;

  console.log('applied ok', {
    cssLen: css.length, jsLen: js.length,
    braces: `${opens}/${closes}`,
    heroTitle: hero.title.slice(0, 80),
    heroDesc: hero.description
  });
  await sql.end();
})();
