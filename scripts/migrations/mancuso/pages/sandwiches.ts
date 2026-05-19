export const SANDWICHES_HTML = `
<div class="mc-page">
  <section class="mc-section" style="padding-bottom:24px;">
    <div class="mc-container mc-container--narrow mc-text-center">
      <span class="mc-eyebrow mc-reveal">Sandwich Counter</span>
      <h1 class="mc-reveal" data-delay="1">
        Nine hoagies. <span class="mc-italic">Six</span> built on our mozzarella.
      </h1>
      <p class="mc-reveal" data-delay="2" style="font-size:18px;line-height:1.75;color:var(--mc-ink-soft);">
        On Cacia's seeded or unseeded rolls — the classic South Philly bread — or on
        Baker Street's schiacciata, a crackling Tuscan flatbread. Built to order.
        We can't ship them; come grab one.
      </p>
      <div class="mc-mt-sm mc-reveal" data-delay="3" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <span class="mc-pill"><span class="material-icons">bakery_dining</span> Cacia's rolls</span>
        <span class="mc-pill"><span class="material-icons">flatware</span> Schiacciata</span>
        <span class="mc-pill"><span class="material-icons">restaurant_menu</span> Built to order</span>
      </div>
    </div>
  </section>

  <!-- Featured -->
  <section class="mc-section" style="padding-top:32px;padding-bottom:0;">
    <div class="mc-container">
      <article class="mc-sandwich mc-sandwich--featured mc-reveal">
        <div class="mc-sandwich__num">01</div>
        <div>
          <span class="mc-eyebrow" style="color:var(--mc-gold);">House Favorite</span>
          <h3>The Partenza</h3>
          <p>Hot coppa, nduja spread, long hots, house mozzarella, hot honey. Sweet, smoky, and unapologetically loud. Try it on the schiacciata.</p>
        </div>
        <div class="mc-sandwich__price">$17</div>
      </article>
    </div>
  </section>

  <!-- Mozzarella hoagies -->
  <section class="mc-section" style="padding-top:40px;">
    <div class="mc-container">
      <div class="mc-reveal" style="margin-bottom:18px;">
        <span class="mc-eyebrow">Built on House Mozzarella</span>
        <h2>The mozz hoagies.</h2>
      </div>

      <article class="mc-sandwich mc-reveal">
        <div class="mc-sandwich__num">02</div>
        <div>
          <h3>The Caprese</h3>
          <p>Fresh mozzarella, ripe tomato, basil, sea salt, fruity Sicilian olive oil. The plate, in a roll.</p>
        </div>
        <div class="mc-sandwich__price">$13</div>
      </article>

      <article class="mc-sandwich mc-reveal" data-delay="1">
        <div class="mc-sandwich__num">03</div>
        <div>
          <h3>The Sopressata</h3>
          <p>Spicy sopressata, mozzarella, sharp provolone, sweet roasted red peppers, oregano, olive oil.</p>
        </div>
        <div class="mc-sandwich__price">$14</div>
      </article>

      <article class="mc-sandwich mc-reveal" data-delay="2">
        <div class="mc-sandwich__num">04</div>
        <div>
          <h3>The Prosciutto</h3>
          <p>Prosciutto di Parma, fresh mozz, arugula, lemon, cracked pepper. Simple and exact.</p>
        </div>
        <div class="mc-sandwich__price">$15</div>
      </article>

      <article class="mc-sandwich mc-reveal" data-delay="3">
        <div class="mc-sandwich__num">05</div>
        <div>
          <h3>Eggplant Parm</h3>
          <p>Breaded eggplant, mozzarella, our slow-simmered tomato, parmigiano. Built hot, eaten hotter.</p>
        </div>
        <div class="mc-sandwich__price">$13</div>
      </article>

      <article class="mc-sandwich mc-reveal">
        <div class="mc-sandwich__num">06</div>
        <div>
          <h3>The Mortadella</h3>
          <p>Pistachio mortadella shaved thick, fresh mozz, fig jam, arugula. A South Philly hoagie with a Bologna passport.</p>
        </div>
        <div class="mc-sandwich__price">$14</div>
      </article>
    </div>
  </section>

  <!-- The rest -->
  <section class="mc-section mc-paper">
    <div class="mc-container">
      <div class="mc-reveal" style="margin-bottom:18px;">
        <span class="mc-eyebrow">The Rest of the Menu</span>
        <h2>Three more for the regulars.</h2>
      </div>

      <article class="mc-sandwich mc-reveal">
        <div class="mc-sandwich__num">07</div>
        <div>
          <h3>The Italian</h3>
          <p>Capicola, mortadella, sopressata, sharp provolone, lettuce, tomato, onion, oregano, oil &amp; vinegar. The way it's been done.</p>
        </div>
        <div class="mc-sandwich__price">$14</div>
      </article>

      <article class="mc-sandwich mc-reveal" data-delay="1">
        <div class="mc-sandwich__num">08</div>
        <div>
          <h3>The Tuna</h3>
          <p>Imported oil-packed tuna, capers, olives, parsley, red onion, lemon. On schiacciata, the way they do it on the coast.</p>
        </div>
        <div class="mc-sandwich__price">$13</div>
      </article>

      <article class="mc-sandwich mc-reveal" data-delay="2">
        <div class="mc-sandwich__num">09</div>
        <div>
          <h3>The Roasted Vegetable</h3>
          <p>Marinated roasted peppers, eggplant, zucchini, fennel, fresh ricotta. The one you order when you think you don't want a hoagie.</p>
        </div>
        <div class="mc-sandwich__price">$12</div>
      </article>
    </div>
  </section>

  <!-- Footnote -->
  <section class="mc-section">
    <div class="mc-container mc-container--narrow mc-text-center mc-reveal">
      <p style="font-size:15px;color:var(--mc-muted);max-width:520px;margin:0 auto;">
        Menu changes when the mozz runs out and when we feel like making something else.
        Specials get scrawled on the chalkboard by the register. Cash, card, and a smile all accepted.
      </p>
      <div class="mc-mt-lg">
        <a class="mc-btn mc-btn--primary" href="/visit">
          Plan your visit
          <span class="material-icons">arrow_forward</span>
        </a>
      </div>
    </div>
  </section>
</div>
`;
