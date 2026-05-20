export const VISIT_HTML = `
<div class="mc-page">
  <section class="mc-section" style="padding-bottom:32px;">
    <div class="mc-container mc-container--narrow mc-text-center">
      <span class="mc-eyebrow mc-reveal">Visit</span>
      <h1 class="mc-reveal" data-delay="1">
        Come stand at the <span class="mc-italic">counter.</span>
      </h1>
      <p class="mc-reveal" data-delay="2" style="font-size:19px;line-height:1.75;color:var(--mc-ink-soft);">
        We're on East Passyunk Avenue, two blocks south of Mifflin. The door has a buzzer.
        The mozzarella is fresh. The cheese guy will tell you what's good today.
      </p>
    </div>
  </section>

  <section class="mc-section" style="padding-top:24px;">
    <div class="mc-container">
      <div class="mc-visit">
        <div class="mc-visit__info mc-reveal">
          <span class="mc-eyebrow" style="color:var(--mc-gold);">Find Us</span>
          <h2 style="margin-bottom:8px;">1902 E. Passyunk Ave.</h2>
          <p style="color:rgba(246,239,226,0.78);max-width:380px;">South Philadelphia, two blocks south of Mifflin. Look for the neon and the fake cheese wheels in the window — they've been there forever.</p>

          <div style="margin-top:24px;">
            <div class="mc-visit__row">
              <span class="material-icons">location_on</span>
              <div><b>1902 E. Passyunk Ave.</b><span>Philadelphia, PA 19148</span></div>
            </div>
            <div class="mc-visit__row">
              <span class="material-icons">schedule</span>
              <div><b>Mon &mdash; Sat · 9 AM to 6 PM</b><span>Sunday · 9 AM to 3 PM</span></div>
            </div>
            <div class="mc-visit__row">
              <span class="material-icons">call</span>
              <div><b><a href="tel:+12153891817" style="color:var(--mc-cream);">(215) 389-1817</a></b><span>Phone orders welcome</span></div>
            </div>
            <div class="mc-visit__row">
              <span class="material-icons">credit_card</span>
              <div><b>Cash &amp; card</b><span>No phone apps, no QR codes — just the register</span></div>
            </div>
            <div class="mc-visit__row">
              <span class="material-icons">local_parking</span>
              <div><b>Street parking</b><span>Park along Passyunk or the side streets. It moves fast on weekends.</span></div>
            </div>
          </div>
        </div>

        <div class="mc-visit__map mc-reveal" data-delay="1">
          <iframe
            src="https://www.google.com/maps?q=1902+E+Passyunk+Ave,+Philadelphia,+PA+19148&output=embed"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            title="Map to L. Mancuso & Son"></iframe>
        </div>
      </div>
    </div>
  </section>

  <!-- What to expect -->
  <section class="mc-section mc-paper">
    <div class="mc-container">
      <div class="mc-reveal" style="text-align:center;margin-bottom:48px;">
        <span class="mc-eyebrow">What to expect</span>
        <h2>A real shop. Not an experience.</h2>
      </div>

      <div class="mc-grid">
        <div class="mc-card mc-reveal">
          <div class="mc-card__icon"><span class="material-icons">door_front</span></div>
          <h3>The buzzer rings.</h3>
          <p>Push the door. The buzzer rings, the guy behind the counter looks up. Say hello. That's how it's worked for 85 years.</p>
        </div>
        <div class="mc-card mc-reveal" data-delay="1">
          <div class="mc-card__icon"><span class="material-icons">question_answer</span></div>
          <h3>Ask what's good.</h3>
          <p>The cheese guy knows. He pulled the mozzarella this morning. He'll tell you if it's a good ricotta day. Take his recommendation.</p>
        </div>
        <div class="mc-card mc-reveal" data-delay="2">
          <div class="mc-card__icon"><span class="material-icons">soup_kitchen</span></div>
          <h3>Order by the pound.</h3>
          <p>Cheese, cured meats, dressed olives — all by weight, cut to order. Tell him what you're cooking; he'll size it right.</p>
        </div>
        <div class="mc-card mc-reveal" data-delay="3">
          <div class="mc-card__icon"><span class="material-icons">takeout_dining</span></div>
          <h3>Hoagies are made to order.</h3>
          <p>If you came for a sandwich, give it a minute. They're built one at a time. Worth the wait — eat it standing on the sidewalk.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Holiday note -->
  <section class="mc-section">
    <div class="mc-container mc-container--narrow mc-text-center">
      <span class="mc-eyebrow mc-reveal">Holidays &amp; Special Orders</span>
      <h2 class="mc-reveal" data-delay="1">Plan ahead for the big days.</h2>
      <p class="mc-reveal" data-delay="2" style="font-size:17px;line-height:1.75;">
        Easter ricotta pies, Christmas Eve baccalà, summer water ice — these run out, every year.
        Call ahead a few days before the holiday so we can set yours aside.
      </p>
      <div class="mc-mt-lg mc-reveal" data-delay="3">
        <a class="mc-btn mc-btn--primary" href="tel:+12153891817">
          <span class="material-icons">call</span>
          Call the shop
        </a>
      </div>
    </div>
  </section>
</div>
`;
