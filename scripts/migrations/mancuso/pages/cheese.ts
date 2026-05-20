export const CHEESE_HTML = `
<div class="mc-page">
  <!-- Header -->
  <section class="mc-section" style="padding-bottom:32px;">
    <div class="mc-container mc-container--narrow mc-text-center">
      <span class="mc-eyebrow mc-reveal">The Cheese Counter</span>
      <h1 class="mc-reveal" data-delay="1">Everything we <span class="mc-italic">make</span> and everything we <span class="mc-italic">import.</span></h1>
      <p class="mc-reveal" data-delay="2" style="font-size:18px;line-height:1.75;color:var(--mc-ink-soft);">
        Fresh mozzarella and ricotta come out of the kettle every morning. Behind them on
        the counter: provolone hung to age, pecorino flown in from Sicily, and the
        occasional wheel of caciocavallo we'll cut to your order.
      </p>
    </div>
  </section>

  <!-- House-made -->
  <section class="mc-section" style="padding-top:32px;">
    <div class="mc-container">
      <div class="mc-reveal" style="margin-bottom:36px;">
        <span class="mc-eyebrow">Made In-House</span>
        <h2>Pulled by hand. Drained by hand. Today.</h2>
      </div>

      <div class="mc-cheese-grid">
        <article class="mc-cheese-tile mc-reveal">
          <div class="mc-cheese-tile__art">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs><radialGradient id="hmoz" cx="42%" cy="35%" r="58%"><stop offset="0%" stop-color="#fffdf6"/><stop offset="100%" stop-color="#d6c79c"/></radialGradient></defs>
              <circle cx="100" cy="105" r="80" fill="url(#hmoz)" stroke="#a8945e" stroke-width="2"/>
              <path d="M82,32 Q100,12 118,32" stroke="#a8945e" stroke-width="2" fill="none"/>
              <path d="M40,110 Q100,140 160,108" stroke="#bfa977" stroke-width="1.2" fill="none" opacity="0.5"/>
              <ellipse cx="100" cy="180" rx="68" ry="5" fill="#1c130b" opacity="0.18"/>
            </svg>
          </div>
          <div class="mc-cheese-tile__overlay">
            <span class="mc-cheese-tile__tag">$12 / lb · ask the counter</span>
            <h3>Fresh Mozzarella</h3>
            <p>Pulled in the back from curd we receive each morning. Available salted or unsalted, in balls, knots, or braids.</p>
          </div>
        </article>

        <article class="mc-cheese-tile mc-reveal" data-delay="1">
          <div class="mc-cheese-tile__art">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs><radialGradient id="hric" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#fffdf6"/><stop offset="100%" stop-color="#e9dcb2"/></radialGradient></defs>
              <path d="M50,160 Q40,110 60,80 Q90,55 100,55 Q110,55 140,80 Q160,110 150,160 Z" fill="url(#hric)" stroke="#a8945e" stroke-width="2"/>
              <path d="M70,80 Q100,70 130,80" stroke="#bfa977" stroke-width="1.5" fill="none"/>
              <path d="M65,100 Q100,90 135,100" stroke="#bfa977" stroke-width="1.5" fill="none"/>
              <path d="M62,120 Q100,108 138,120" stroke="#bfa977" stroke-width="1.5" fill="none"/>
              <ellipse cx="100" cy="170" rx="58" ry="5" fill="#1c130b" opacity="0.16"/>
            </svg>
          </div>
          <div class="mc-cheese-tile__overlay">
            <span class="mc-cheese-tile__tag">Sold by the pound</span>
            <h3>Fresh Ricotta</h3>
            <p>Whole-milk, sweet, dense. The kind that goes into pasta on Sunday and pie on Easter morning.</p>
          </div>
        </article>

        <article class="mc-cheese-tile mc-reveal" data-delay="2">
          <div class="mc-cheese-tile__art">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs><radialGradient id="hscam" cx="50%" cy="38%" r="58%"><stop offset="0%" stop-color="#f7e8b6"/><stop offset="100%" stop-color="#b88a31"/></radialGradient></defs>
              <path d="M100,28 C140,28 158,68 158,102 C158,158 130,182 100,182 C70,182 42,158 42,102 C42,68 60,28 100,28 Z" fill="url(#hscam)" stroke="#6e5018" stroke-width="2"/>
              <path d="M82,30 Q100,12 118,30 L118,46 Q100,42 82,46 Z" fill="#6e5018"/>
              <ellipse cx="100" cy="190" rx="56" ry="4" fill="#1c130b" opacity="0.2"/>
            </svg>
          </div>
          <div class="mc-cheese-tile__overlay">
            <span class="mc-cheese-tile__tag">Smoked</span>
            <h3>Scamorza</h3>
            <p>Mozzarella's older cousin: pulled, tied off, hung to dry, then kissed with smoke. Slice it warm onto crusty bread.</p>
          </div>
        </article>

        <article class="mc-cheese-tile mc-reveal" data-delay="3">
          <div class="mc-cheese-tile__art">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs><pattern id="weaveB" patternUnits="userSpaceOnUse" width="14" height="14"><rect width="14" height="14" fill="#c79a3a"/><path d="M0,7 L14,7 M7,0 L7,14" stroke="#7a5a18" stroke-width="2"/></pattern></defs>
              <ellipse cx="100" cy="120" rx="80" ry="50" fill="url(#weaveB)" stroke="#5a4012" stroke-width="2"/>
              <ellipse cx="100" cy="92" rx="72" ry="14" fill="#fffdf6" stroke="#a8945e" stroke-width="2"/>
              <ellipse cx="100" cy="90" rx="64" ry="10" fill="#f3ead2"/>
              <ellipse cx="100" cy="170" rx="60" ry="4" fill="#1c130b" opacity="0.2"/>
            </svg>
          </div>
          <div class="mc-cheese-tile__overlay">
            <span class="mc-cheese-tile__tag">Lent &amp; Easter</span>
            <h3>Basket Cheese</h3>
            <p>Made in wicker baskets that leave their weave on the rind. Lightly salted. The base for nonna's Easter pie.</p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- HOW IT'S MADE -->
  <section class="mc-section mc-paper">
    <div class="mc-container">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;" class="mc-how">
        <div class="mc-reveal">
          <span class="mc-eyebrow">From Curd to Counter</span>
          <h2>How we pull mozzarella.</h2>
          <p style="font-size:17px;line-height:1.75;">
            Curd arrives most mornings. We slice it into a steel basin, cover it with water
            around 175°F, and stir with a wooden paddle until it stretches like taffy. From
            there it's hands-only: pull, fold, pull again, pinch off a ball, drop it into
            cold brine. The whole process takes a few minutes per pound. The result lasts
            about a day before it's not the same anymore — which is why we make it fresh
            every morning.
          </p>
        </div>
        <div class="mc-reveal" data-delay="1">
          <ol style="list-style:none;padding:0;margin:0;counter-reset:step;">
            <li class="mc-how__step">
              <span class="mc-how__step-num">01</span>
              <div><b>Heat the curd</b><span>Sliced curd in 175°F water — the temperature pasta filata cheeses live and die by.</span></div>
            </li>
            <li class="mc-how__step">
              <span class="mc-how__step-num">02</span>
              <div><b>Stretch &amp; fold</b><span>Wooden paddle. Then bare hands. The curd should ribbon and shine.</span></div>
            </li>
            <li class="mc-how__step">
              <span class="mc-how__step-num">03</span>
              <div><b>Pinch &amp; brine</b><span>Pinch off balls and slide them into cold brine. They firm in minutes.</span></div>
            </li>
            <li class="mc-how__step">
              <span class="mc-how__step-num">04</span>
              <div><b>Pull, repeat, sell out</b><span>The first batch is on the counter by 10. The last batch is gone by 3.</span></div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </section>

  <!-- IMPORTED -->
  <section class="mc-section">
    <div class="mc-container">
      <div class="mc-reveal" style="text-align:center;margin-bottom:48px;">
        <span class="mc-eyebrow">From Italy</span>
        <h2>What we import.</h2>
        <p style="max-width:620px;margin:18px auto 0;font-size:17px;color:var(--mc-ink-soft);">
          Aged cheeses you can't make in a day. Cut to order from the wheel.
        </p>
      </div>

      <div class="mc-grid">
        <div class="mc-card mc-reveal">
          <div class="mc-card__icon"><span class="material-icons">scale</span></div>
          <p class="mc-card__kicker">Aged 12 months</p>
          <h3>Provolone Piccante</h3>
          <p>Hung in netting for nearly a year. Sharp, dry, with a black-pepper bite at the back. Slice paper-thin for hoagies or chunk it for an antipasto board.</p>
        </div>
        <div class="mc-card mc-reveal" data-delay="1">
          <div class="mc-card__icon"><span class="material-icons">grass</span></div>
          <p class="mc-card__kicker">Sheep's milk · Sardinia</p>
          <h3>Pecorino Sardo</h3>
          <p>Grassy, salty, structured. We grate it daily for the back-counter pasta crowd and shave it onto sandwiches when the moment calls for it.</p>
        </div>
        <div class="mc-card mc-reveal" data-delay="2">
          <div class="mc-card__icon"><span class="material-icons">restaurant</span></div>
          <p class="mc-card__kicker">Aged 24 months</p>
          <h3>Parmigiano Reggiano</h3>
          <p>From the wheel, never pre-grated. Crystalline, savory, a little fruity. You'll know when you bite into it.</p>
        </div>
        <div class="mc-card mc-reveal" data-delay="3">
          <div class="mc-card__icon"><span class="material-icons">savings</span></div>
          <p class="mc-card__kicker">Calabrian smoked</p>
          <h3>Caciocavallo</h3>
          <p>Hung in pairs over a wooden beam ("cheese on horseback"). Buttery young, sharp aged. We bring it in by request.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Beyond the cheese -->
  <section class="mc-section mc-paper">
    <div class="mc-container mc-container--narrow mc-text-center">
      <span class="mc-eyebrow mc-reveal">Also On The Shelves</span>
      <h2 class="mc-reveal" data-delay="1">A little Italian grocery, too.</h2>
      <p class="mc-reveal" data-delay="2" style="font-size:17px;line-height:1.75;">
        Cento San Marzano tomatoes. Imported olive oil. Calabrian chili paste. Tinned anchovies
        the way they're supposed to taste. Bronze-cut pasta from small Italian mills.
        Sicilian-style dressed olives with celery. Sopressata and prosciutto sliced to order.
        Stop in, look around, ask questions — that's what the counter is here for.
      </p>
    </div>
  </section>
</div>

<style>
.mc-how__step { display: flex; gap: 16px; align-items: flex-start; padding: 14px 0; border-bottom: 1px dashed var(--mc-line); }
.mc-how__step:last-child { border-bottom: 0; }
.mc-how__step-num {
  font-family: var(--mc-display); font-style: italic;
  font-size: 28px; color: var(--mc-tomato); line-height: 1;
  min-width: 40px;
}
.mc-how__step b { font-family: var(--mc-serif); font-weight: 500; font-size: 1.1rem; color: var(--mc-ink); display:block; margin-bottom:4px; }
.mc-how__step span { color: var(--mc-ink-soft); font-size: 14.5px; line-height: 1.6; }
@media (max-width: 900px) {
  .mc-how { grid-template-columns: 1fr !important; gap: 36px !important; }
}
</style>
`;
