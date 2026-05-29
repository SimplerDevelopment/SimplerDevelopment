// Site-wide custom CSS applied to every page on the Mancuso website.
// Design system: warm cream paper, tomato red, gold leaf, hand-built feel.
//
// Color tokens come from a single :root block so a single edit retunes the
// whole site. All page HTML references the tokens via var(--mc-*).

export const SITE_CSS = `
:root {
  --mc-cream: #f6efe2;
  --mc-cream-deep: #ede1c9;
  --mc-paper: #fbf7ee;
  --mc-ink: #1c130b;
  --mc-ink-soft: #3a2a1c;
  --mc-muted: #7a6a55;
  --mc-line: #d6c8ab;
  --mc-tomato: #b8311a;
  --mc-tomato-deep: #8a1f0d;
  --mc-gold: #c79a3a;
  --mc-gold-deep: #9a7322;
  --mc-basil: #4f6b3c;
  --mc-shadow: 0 12px 40px -16px rgba(28, 19, 11, 0.35);
  --mc-shadow-soft: 0 2px 14px -6px rgba(28, 19, 11, 0.25);
  --mc-radius: 14px;
  --mc-serif: "Playfair Display", "Times New Roman", Georgia, serif;
  --mc-display: "Cormorant Garamond", "Playfair Display", Georgia, serif;
  --mc-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mc-mono: "JetBrains Mono", "Menlo", monospace;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--mc-cream);
  color: var(--mc-ink);
  font-family: var(--mc-sans);
  line-height: 1.6;
  font-size: 17px;
  letter-spacing: 0.005em;
  -webkit-font-smoothing: antialiased;
  background-image:
    radial-gradient(circle at 10% 15%, rgba(199, 154, 58, 0.06) 0, transparent 50%),
    radial-gradient(circle at 90% 85%, rgba(184, 49, 26, 0.05) 0, transparent 55%);
  background-attachment: fixed;
}

/* Paper grain — barely-there texture on every section */
.mc-paper {
  position: relative;
  background-color: var(--mc-paper);
}
.mc-paper::before {
  content: "";
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0.1   0 0 0 0 0.08   0 0 0 0 0.05   0 0 0 0.08 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  opacity: 0.5;
  mix-blend-mode: multiply;
  pointer-events: none;
  z-index: 0;
}
.mc-paper > * { position: relative; z-index: 1; }

h1, h2, h3, h4 {
  font-family: var(--mc-serif);
  font-weight: 600;
  color: var(--mc-ink);
  letter-spacing: -0.012em;
  line-height: 1.1;
  margin: 0 0 0.6em;
}
h1 { font-size: clamp(2.6rem, 6vw, 5.2rem); font-weight: 500; }
h2 { font-size: clamp(2rem, 4vw, 3.4rem); font-weight: 500; }
h3 { font-size: clamp(1.4rem, 2vw, 1.85rem); }
p { margin: 0 0 1em; color: var(--mc-ink-soft); }

.mc-display {
  font-family: var(--mc-display);
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.005em;
}

a { color: var(--mc-tomato-deep); text-decoration: none; transition: color 180ms ease; }
a:hover { color: var(--mc-tomato); }

.mc-eyebrow {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--mc-sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--mc-tomato);
  padding: 6px 0;
}
.mc-eyebrow::before {
  content: ""; width: 28px; height: 1px; background: currentColor;
}

.mc-section {
  padding: clamp(64px, 9vw, 128px) 0;
  position: relative;
}
.mc-container {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 28px;
}
.mc-container--narrow { max-width: 820px; }
.mc-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--mc-line) 25%, var(--mc-line) 75%, transparent);
  margin: 0 auto;
  max-width: 240px;
}

/* ── BUTTONS ───────────────────────────────────────────── */
.mc-btn {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 28px;
  font-family: var(--mc-sans);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 999px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 220ms ease;
}
.mc-btn--primary {
  background: var(--mc-tomato);
  color: #fff;
  box-shadow: 0 8px 22px -10px rgba(184, 49, 26, 0.55);
}
.mc-btn--primary:hover {
  background: var(--mc-tomato-deep);
  transform: translateY(-2px);
  box-shadow: 0 14px 28px -10px rgba(184, 49, 26, 0.65);
}
.mc-btn--ghost {
  background: transparent;
  color: var(--mc-ink);
  border-color: var(--mc-ink);
}
.mc-btn--ghost:hover {
  background: var(--mc-ink); color: var(--mc-cream);
  transform: translateY(-2px);
}
.mc-btn .material-icons { font-size: 18px; }

/* ── NAV (injected by site JS so every page has it) ───── */
.mc-nav {
  position: fixed; top: 0; left: 0; right: 0;
  z-index: 100;
  padding: 18px 0;
  transition: padding 200ms ease, background-color 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
  background: transparent;
  border-bottom: 1px solid transparent;
}
.mc-nav.is-scrolled {
  background: rgba(246, 239, 226, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--mc-line);
  padding: 12px 0;
}
.mc-nav__inner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 24px;
}
.mc-nav__brand {
  display: flex; align-items: center; gap: 12px;
  font-family: var(--mc-serif); font-size: 22px; font-weight: 500;
  color: var(--mc-ink);
  letter-spacing: -0.01em;
}
.mc-nav__brand-mark {
  width: 38px; height: 38px;
  border-radius: 50%;
  background: var(--mc-tomato);
  color: var(--mc-cream);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mc-serif); font-size: 18px; font-weight: 600;
  box-shadow: 0 4px 10px -3px rgba(184, 49, 26, 0.5);
}
.mc-nav__brand small {
  display: block;
  font-family: var(--mc-sans); font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.22em;
  color: var(--mc-muted); font-weight: 500;
}
.mc-nav__links {
  display: flex; gap: 30px; align-items: center;
  margin: 0; padding: 0; list-style: none;
}
.mc-nav__links a {
  font-family: var(--mc-sans); font-size: 13px;
  font-weight: 500; letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mc-ink); position: relative;
}
.mc-nav__links a::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -6px;
  height: 1px; background: var(--mc-tomato);
  transform: scaleX(0); transform-origin: left;
  transition: transform 220ms ease;
}
.mc-nav__links a:hover::after,
.mc-nav__links a[aria-current="page"]::after { transform: scaleX(1); }
.mc-nav__cta {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--mc-sans); font-size: 12px;
  font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  background: var(--mc-ink); color: var(--mc-cream);
  padding: 10px 18px; border-radius: 999px;
  transition: all 220ms ease;
}
.mc-nav__cta-icon { font-size: 14px; }
.mc-nav__cta:hover { background: var(--mc-tomato); color: #fff; transform: translateY(-1px); }
.mc-nav__toggle {
  display: none; background: none; border: none;
  font-size: 28px; color: var(--mc-ink); cursor: pointer;
}

@media (max-width: 860px) {
  .mc-nav__toggle { display: block; }
  .mc-nav__links { display: none; }
  .mc-nav.is-open .mc-nav__links {
    display: flex; flex-direction: column;
    position: absolute; top: 100%; left: 0; right: 0;
    background: var(--mc-cream); padding: 24px 28px 32px;
    border-bottom: 1px solid var(--mc-line);
    gap: 18px;
  }
  /* Phone CTA collapses to an icon-only round button in the header bar —
     the number is dropped from the visible text but the link still dials it. */
  .mc-nav__cta {
    width: 42px; height: 42px;
    flex: 0 0 42px;
    padding: 0; gap: 0;
    justify-content: center;
  }
  .mc-nav__cta-label { display: none; }
  .mc-nav__cta-icon { font-size: 18px; }
}

/* spacer so fixed nav doesn't cover content on page top */
.mc-page { padding-top: 86px; }

/* ── HERO ───────────────────────────────────────────────── */
.mc-hero {
  min-height: 88vh;
  display: flex; align-items: center;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 80% 20%, rgba(199, 154, 58, 0.18), transparent 55%),
    radial-gradient(ellipse at 15% 80%, rgba(184, 49, 26, 0.10), transparent 55%),
    var(--mc-cream);
}
.mc-hero__inner {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 60px;
  align-items: center;
}
@media (max-width: 900px) {
  .mc-hero__inner { grid-template-columns: 1fr; }
  /* On mobile the hero content is taller than the viewport, so the fixed nav
     overlapped the top of it. Drop the vertical centering and clear the nav
     with explicit top padding. */
  .mc-hero {
    min-height: auto;
    align-items: flex-start;
    padding-top: 104px;
    padding-bottom: 52px;
  }
}
.mc-hero__since {
  display: inline-block;
  font-family: var(--mc-display); font-style: italic;
  font-size: 22px; color: var(--mc-tomato);
  margin-bottom: 8px;
}
.mc-hero h1 .mc-italic {
  font-family: var(--mc-display);
  font-style: italic;
  font-weight: 400;
  color: var(--mc-tomato);
}
.mc-hero__lede {
  font-size: 19px; line-height: 1.7; max-width: 540px; color: var(--mc-ink-soft);
}
.mc-hero__actions { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 28px; }
.mc-hero__visual {
  position: relative;
  aspect-ratio: 4/5;
  border-radius: 22px;
  background: linear-gradient(160deg, var(--mc-paper), var(--mc-cream-deep));
  box-shadow: var(--mc-shadow);
  overflow: hidden;
  border: 1px solid var(--mc-line);
}
.mc-hero__visual svg { width: 100%; height: 100%; display: block; }
.mc-hero__stamp {
  position: absolute; top: -22px; right: -22px;
  width: 138px; height: 138px;
  background: var(--mc-tomato);
  color: var(--mc-cream);
  border-radius: 50%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: var(--mc-serif);
  text-align: center;
  transform: rotate(8deg);
  box-shadow: 0 18px 38px -12px rgba(184, 49, 26, 0.6);
  border: 3px dashed rgba(255, 255, 255, 0.4);
}
.mc-hero__stamp small {
  display: block;
  font-family: var(--mc-sans);
  font-size: 9px; letter-spacing: 0.3em; text-transform: uppercase;
  margin-top: 2px;
}
.mc-hero__stamp strong { font-size: 38px; line-height: 1; font-weight: 500; }

/* ── MARQUEE ───────────────────────────────────────────── */
.mc-marquee {
  overflow: hidden;
  padding: 26px 0;
  border-top: 1px solid var(--mc-line);
  border-bottom: 1px solid var(--mc-line);
  background: var(--mc-paper);
}
.mc-marquee__track {
  display: flex; gap: 56px;
  animation: mcMarquee 38s linear infinite;
  width: max-content;
}
.mc-marquee__track span {
  font-family: var(--mc-display);
  font-style: italic;
  font-size: clamp(28px, 4vw, 44px);
  color: var(--mc-ink);
  letter-spacing: -0.005em;
  display: inline-flex; align-items: center; gap: 56px;
  white-space: nowrap;
}
.mc-marquee__track span::after {
  content: "·"; color: var(--mc-tomato); font-size: 1em;
  display: inline-block; transform: translateY(-4px);
}
@keyframes mcMarquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

/* ── CARDS / TILES ─────────────────────────────────────── */
.mc-grid {
  display: grid; gap: 28px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}
.mc-card {
  background: var(--mc-paper);
  border: 1px solid var(--mc-line);
  border-radius: var(--mc-radius);
  padding: 34px 28px 30px;
  box-shadow: var(--mc-shadow-soft);
  transition: transform 280ms ease, box-shadow 280ms ease, border-color 280ms ease;
  position: relative;
  overflow: hidden;
}
.mc-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--mc-shadow);
  border-color: var(--mc-gold);
}
.mc-card__icon {
  width: 56px; height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--mc-tomato), var(--mc-tomato-deep));
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 18px;
  box-shadow: 0 8px 18px -8px rgba(184, 49, 26, 0.5);
}
.mc-card__icon .material-icons { font-size: 28px; }
.mc-card__kicker {
  font-family: var(--mc-display);
  font-style: italic;
  font-size: 14px;
  color: var(--mc-tomato);
  margin-bottom: 4px;
}
.mc-card h3 { margin: 0 0 10px; font-size: 1.45rem; }
.mc-card p { margin: 0; font-size: 15px; line-height: 1.65; }

/* ── CHEESE TILES (image-backed) ───────────────────────── */
.mc-cheese-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 26px;
}
.mc-cheese-tile {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  aspect-ratio: 4/5;
  background: var(--mc-cream-deep);
  border: 1px solid var(--mc-line);
  cursor: default;
  isolation: isolate;
}
.mc-cheese-tile__art {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, var(--mc-paper), var(--mc-cream-deep));
  transition: transform 600ms ease;
}
.mc-cheese-tile__art svg { width: 70%; height: 70%; }
.mc-cheese-tile:hover .mc-cheese-tile__art { transform: scale(1.05); }
.mc-cheese-tile__overlay {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 22px 22px 24px;
  background: linear-gradient(180deg, transparent, rgba(28, 19, 11, 0.85) 60%);
  color: var(--mc-cream);
}
.mc-cheese-tile__overlay h3 {
  color: var(--mc-cream);
  margin: 0 0 6px;
  font-size: 1.45rem;
}
.mc-cheese-tile__overlay p {
  margin: 0;
  color: rgba(246, 239, 226, 0.85);
  font-size: 14px; line-height: 1.55;
}
.mc-cheese-tile__tag {
  display: inline-block;
  font-family: var(--mc-sans); font-size: 10px;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--mc-gold);
  margin-bottom: 8px;
}

/* ── SANDWICH ROW ──────────────────────────────────────── */
.mc-sandwich {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 28px;
  align-items: baseline;
  padding: 24px 0;
  border-bottom: 1px dashed var(--mc-line);
  transition: padding-left 220ms ease;
}
.mc-sandwich:hover { padding-left: 14px; }
.mc-sandwich__num {
  font-family: var(--mc-display); font-style: italic;
  color: var(--mc-tomato);
  font-size: 28px;
  min-width: 44px;
}
.mc-sandwich h3 { margin: 0 0 6px; font-size: 1.5rem; }
.mc-sandwich p { margin: 0; font-size: 15px; color: var(--mc-muted); }
.mc-sandwich__price {
  font-family: var(--mc-serif); font-size: 22px;
  color: var(--mc-ink);
}
.mc-sandwich--featured {
  background: linear-gradient(120deg, rgba(184, 49, 26, 0.06), transparent 70%);
  padding: 28px 22px;
  border-radius: 16px;
  border: 1px solid var(--mc-gold);
  border-bottom-style: solid;
  margin-bottom: 18px;
}
.mc-sandwich--featured .mc-sandwich__num { color: var(--mc-gold); }
.mc-sandwich--featured .mc-eyebrow { margin-bottom: 4px; }

/* ── TIMELINE ──────────────────────────────────────────── */
.mc-timeline { position: relative; padding-left: 36px; }
.mc-timeline::before {
  content: ""; position: absolute; top: 6px; bottom: 6px; left: 12px;
  width: 2px; background: var(--mc-line);
}
.mc-timeline__item { position: relative; padding: 0 0 44px; }
.mc-timeline__item::before {
  content: ""; position: absolute; left: -29px; top: 8px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--mc-tomato);
  box-shadow: 0 0 0 4px var(--mc-cream), 0 0 0 5px var(--mc-tomato);
}
.mc-timeline__year {
  font-family: var(--mc-display); font-style: italic;
  font-size: 38px; color: var(--mc-tomato);
  line-height: 1; margin-bottom: 6px;
}
.mc-timeline__title { font-family: var(--mc-serif); font-size: 1.5rem; margin: 0 0 8px; }
.mc-timeline__body { color: var(--mc-ink-soft); max-width: 580px; }

/* ── VISIT BLOCK ───────────────────────────────────────── */
.mc-visit {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 48px;
  align-items: stretch;
}
@media (max-width: 900px) { .mc-visit { grid-template-columns: 1fr; } }
.mc-visit__info {
  background: var(--mc-ink);
  color: var(--mc-cream);
  border-radius: 18px;
  padding: 48px 44px;
  display: flex; flex-direction: column;
  position: relative;
  overflow: hidden;
}
.mc-visit__info::after {
  content: ""; position: absolute; right: -60px; bottom: -60px;
  width: 220px; height: 220px;
  background: var(--mc-tomato);
  border-radius: 50%;
  opacity: 0.18;
}
.mc-visit__info h2 { color: var(--mc-cream); }
.mc-visit__row {
  display: flex; gap: 14px; align-items: flex-start;
  padding: 14px 0;
  border-bottom: 1px solid rgba(246, 239, 226, 0.14);
}
.mc-visit__row:last-of-type { border-bottom: 0; }
.mc-visit__row .material-icons {
  color: var(--mc-gold); font-size: 22px; padding-top: 2px;
}
.mc-visit__row b { color: var(--mc-cream); font-family: var(--mc-serif); font-weight: 500; font-size: 17px; }
.mc-visit__row span { display: block; font-size: 14px; color: rgba(246, 239, 226, 0.72); }
.mc-visit__map {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--mc-line);
  min-height: 380px;
  background: var(--mc-paper);
}
.mc-visit__map iframe { width: 100%; height: 100%; border: 0; display: block; }

/* ── FOOTER ────────────────────────────────────────────── */
.mc-footer {
  background: var(--mc-ink);
  color: rgba(246, 239, 226, 0.7);
  padding: 64px 0 36px;
  margin-top: 80px;
}
.mc-footer__inner {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 40px;
  align-items: flex-start;
}
@media (max-width: 800px) { .mc-footer__inner { grid-template-columns: 1fr; gap: 28px; } }
.mc-footer h4 {
  color: var(--mc-cream); font-family: var(--mc-serif);
  font-size: 14px; text-transform: uppercase; letter-spacing: 0.18em;
  margin: 0 0 14px;
}
.mc-footer__brand {
  font-family: var(--mc-display); font-style: italic;
  font-size: 28px; color: var(--mc-cream); margin: 0 0 6px;
}
.mc-footer ul { list-style: none; padding: 0; margin: 0; }
.mc-footer li { padding: 4px 0; font-size: 14px; }
.mc-footer a { color: rgba(246, 239, 226, 0.7); }
.mc-footer a:hover { color: var(--mc-gold); }
.mc-footer__copy {
  border-top: 1px solid rgba(246, 239, 226, 0.12);
  padding-top: 22px;
  margin-top: 44px;
  font-size: 12px;
  color: rgba(246, 239, 226, 0.45);
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;
}

/* Reveal-on-scroll animations are intentionally not styled — content shows
   in place. The .mc-reveal / data-delay attributes remain in the markup so
   the editor's content-managed structure isn't churned, but they have no
   visual effect. */
@media (prefers-reduced-motion: reduce) {
  .mc-marquee__track { animation: none; }
}

/* ── HERO PHOTO (image replacing the SVG illustration) ── */
.mc-hero__visual img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}

/* ── STOREFRONT BANNER (full-bleed photo with overlay text) ── */
.mc-storefront {
  position: relative;
  min-height: 460px;
  overflow: hidden;
  display: flex; align-items: center;
}
.mc-storefront__photo {
  position: absolute; inset: 0;
}
.mc-storefront__photo img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  filter: brightness(0.6) saturate(1.05);
}
.mc-storefront__overlay {
  position: relative; z-index: 2;
  width: 100%; padding: 72px 0;
  background: linear-gradient(90deg, rgba(28, 19, 11, 0.86) 0%, rgba(28, 19, 11, 0.35) 70%, transparent 100%);
}

/* ── INSIDE THE SHOP (editorial photo essay) ── */
.mc-inside { padding-top: clamp(72px, 10vw, 140px); padding-bottom: clamp(72px, 10vw, 140px); }
.mc-inside__intro {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: end;
  margin-bottom: 56px;
}
.mc-inside__intro p {
  font-size: 18px;
  line-height: 1.75;
  color: var(--mc-ink-soft);
  margin: 0;
  max-width: 480px;
}
@media (max-width: 900px) {
  .mc-inside__intro { grid-template-columns: 1fr; gap: 24px; }
}
.mc-inside__grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: auto auto;
  gap: 20px;
}
.mc-inside__item {
  margin: 0;
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  background: var(--mc-cream-deep);
  box-shadow: var(--mc-shadow);
  border: 1px solid var(--mc-line);
}
.mc-inside__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 900ms cubic-bezier(0.2, 0.6, 0.2, 1);
}
.mc-inside__item:hover img { transform: scale(1.04); }
.mc-inside__item--hero {
  grid-column: span 8;
  aspect-ratio: 4/3;
}
.mc-inside__item--tall {
  grid-column: span 4;
  aspect-ratio: 3/4;
}
.mc-inside__item--wide {
  grid-column: 1 / -1;
  aspect-ratio: 21/9;
}
@media (max-width: 900px) {
  .mc-inside__grid { grid-template-columns: 1fr; }
  .mc-inside__item--hero,
  .mc-inside__item--tall,
  .mc-inside__item--wide {
    grid-column: 1 / -1;
    aspect-ratio: 4/3;
  }
}
.mc-inside__item figcaption {
  position: absolute;
  left: 18px; right: 18px; bottom: 16px;
  display: flex; align-items: center; gap: 10px;
  color: var(--mc-cream);
  font-size: 13.5px;
  letter-spacing: 0.01em;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
}
.mc-inside__item figcaption span {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--mc-tomato);
  color: var(--mc-cream);
  font-family: var(--mc-display);
  font-style: italic;
  font-size: 13px;
  font-weight: 500;
  flex-shrink: 0;
  text-shadow: none;
  box-shadow: 0 4px 10px -2px rgba(184, 49, 26, 0.6);
}
.mc-inside__item::after {
  content: "";
  position: absolute; left: 0; right: 0; bottom: 0;
  height: 45%;
  background: linear-gradient(180deg, transparent, rgba(28, 19, 11, 0.78) 85%);
  pointer-events: none;
}

/* ── CHEESE TILE PHOTO VARIANT ── */
.mc-cheese-tile__photo {
  position: absolute; inset: 0;
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 600ms ease;
}
.mc-cheese-tile:hover .mc-cheese-tile__photo { transform: scale(1.05); }

/* ── SANDWICH PHOTO FRAME ── */
.mc-photo-frame {
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--mc-line);
  box-shadow: var(--mc-shadow);
  aspect-ratio: 5/4;
}
.mc-photo-frame img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 700ms ease;
}
.mc-photo-frame:hover img { transform: scale(1.04); }
.mc-sw-feature { display: grid; grid-template-columns: 1fr 1.1fr; gap: 64px; align-items: center; }
@media (max-width: 900px) {
  .mc-sw-feature { grid-template-columns: 1fr; gap: 32px; }
}

/* ── SOCIALS ──────────────────────────────────────────── */
/* Compact icon row used in the footer */
.mc-socials { display: inline-flex; gap: 10px; align-items: center; }
.mc-socials a {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px;
  border-radius: 999px;
  background: rgba(246, 239, 226, 0.08);
  color: var(--mc-cream);
  transition: background-color 220ms ease, color 220ms ease, transform 220ms ease;
}
.mc-socials a:hover {
  background: var(--mc-gold);
  color: var(--mc-ink);
  transform: translateY(-2px);
}

/* Labeled row used in the home hero — sits under the CTAs */
.mc-hero__socials {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 18px;
  margin-top: 30px;
  padding-top: 26px;
  border-top: 1px solid var(--mc-line);
  max-width: 540px;
}
.mc-hero__socials-label {
  font-family: var(--mc-display);
  font-style: italic;
  font-size: 15px;
  color: var(--mc-muted);
  letter-spacing: 0.01em;
}
.mc-socials__link {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--mc-sans);
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--mc-ink);
  padding: 8px 14px 8px 12px;
  border: 1px solid var(--mc-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  transition: all 220ms ease;
}
.mc-socials__link svg { color: var(--mc-tomato); transition: transform 220ms ease; }
.mc-socials__link:hover {
  background: var(--mc-ink);
  color: var(--mc-cream);
  border-color: var(--mc-ink);
}
.mc-socials__link:hover svg { color: var(--mc-gold); transform: scale(1.08); }

/* utility */
.mc-text-center { text-align: center; }
.mc-mt-lg { margin-top: 40px; }
.mc-mt-sm { margin-top: 18px; }
.mc-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--mc-paper);
  border: 1px solid var(--mc-line);
  font-size: 12px; font-weight: 500;
  color: var(--mc-ink-soft);
  letter-spacing: 0.04em;
}
.mc-pill .material-icons { font-size: 14px; color: var(--mc-tomato); }
`;
