// Site-wide custom JS injected on every Mancuso page.
//
// Responsibilities (kept narrow on purpose):
//   1. Render the persistent fixed nav + footer at the document edges so each
//      page only authors its own content blocks.
//   2. Reveal-on-scroll for any element with .mc-reveal.
//   3. Shrink the nav when the user scrolls past the hero.
//   4. Toggle the mobile menu.
//
// The script is wrapped in an IIFE and guards every DOM op so re-injection
// during navigation never throws.

export const SITE_JS = `
(function () {
  if (window.__mcInit) return;
  window.__mcInit = true;

  var NAV_HTML = [
    '<nav class="mc-nav" id="mc-nav">',
    '  <div class="mc-container mc-nav__inner">',
    '    <a class="mc-nav__brand" href="/">',
    '      <span class="mc-nav__brand-mark">M</span>',
    '      <span>L. Mancuso &amp; Son<small>Since 1939 · East Passyunk</small></span>',
    '    </a>',
    '    <ul class="mc-nav__links">',
    '      <li><a href="/" data-nav="home">Home</a></li>',
    '      <li><a href="/cheese" data-nav="cheese">The Cheese</a></li>',
    '      <li><a href="/sandwiches" data-nav="sandwiches">Sandwiches</a></li>',
    '      <li><a href="/story" data-nav="story">Our Story</a></li>',
    '      <li><a href="/visit" data-nav="visit">Visit</a></li>',
    '    </ul>',
    '    <a class="mc-nav__cta" href="tel:+12153891817">',
    '      <span class="material-icons" style="font-size:14px;margin-right:6px;vertical-align:-2px;">call</span>',
    '      (215) 389-1817',
    '    </a>',
    '    <button class="mc-nav__toggle" aria-label="Toggle menu" id="mc-nav-toggle">',
    '      <span class="material-icons">menu</span>',
    '    </button>',
    '  </div>',
    '</nav>'
  ].join('');

  var FB_SVG  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9v-2.89h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.89h-2.34V22c4.78-.75 8.44-4.89 8.44-9.94z"/></svg>';
  var IG_SVG  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';

  var FOOTER_HTML = [
    '<footer class="mc-footer">',
    '  <div class="mc-container">',
    '    <div class="mc-footer__inner">',
    '      <div>',
    '        <p class="mc-footer__brand">L. Mancuso &amp; Son</p>',
    '        <p style="margin:0 0 14px;color:rgba(246,239,226,0.65);font-size:14px;max-width:340px;line-height:1.6;">Hand-pulled mozzarella, fresh ricotta, and the soul of South Philly Italian cooking. Since 1939.</p>',
    '        <div class="mc-socials mc-socials--footer">',
    '          <a href="https://www.facebook.com/mancusocheeseproducts/" target="_blank" rel="noopener" aria-label="Mancuso on Facebook">' + FB_SVG + '</a>',
    '          <a href="https://www.instagram.com/mancuso_cheese/" target="_blank" rel="noopener" aria-label="Mancuso on Instagram">' + IG_SVG + '</a>',
    '        </div>',
    '      </div>',
    '      <div>',
    '        <h4>Visit</h4>',
    '        <ul>',
    '          <li>1902 E. Passyunk Ave.</li>',
    '          <li>Philadelphia, PA 19148</li>',
    '          <li><a href="tel:+12153891817">(215) 389-1817</a></li>',
    '        </ul>',
    '      </div>',
    '      <div>',
    '        <h4>Hours</h4>',
    '        <ul>',
    '          <li>Mon – Sat &nbsp;·&nbsp; 9 AM – 6 PM</li>',
    '          <li>Sunday &nbsp;·&nbsp; 9 AM – 3 PM</li>',
    '        </ul>',
    '      </div>',
    '    </div>',
    '    <div class="mc-footer__copy">',
    '      <span>&copy; ' + new Date().getFullYear() + ' L. Mancuso &amp; Son · Family-run since 1939</span>',
    '      <span>Cheese made daily · Philadelphia, PA</span>',
    '    </div>',
    '  </div>',
    '</footer>'
  ].join('');

  function injectChrome() {
    if (!document.body) return;
    // Skip nav + footer when we're inside the visual editor's iframe — the
    // fixed nav otherwise covers the hero headline, making click-to-edit
    // impossible. Authors are editing PAGE content, not site chrome.
    var isEditMode = /[?&](_edit|_preview)=true/.test(location.search) || window.self !== window.top;
    if (isEditMode) {
      // Compensate for the missing fixed nav's spacer
      var styleEl = document.createElement('style');
      styleEl.textContent = '.mc-page{padding-top:0!important;}';
      document.head.appendChild(styleEl);
      return;
    }
    if (!document.getElementById('mc-nav')) {
      document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
    }
    if (!document.querySelector('.mc-footer')) {
      document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);
    }
    // mark the current nav link
    var raw = location.pathname;
    var path = (raw.length > 1 && raw.charAt(raw.length - 1) === '/') ? raw.slice(0, -1) : raw;
    if (!path) path = '/';
    var key = path === '/' ? 'home' : path.split('/').filter(Boolean)[0];
    var current = document.querySelector('[data-nav="' + key + '"]');
    if (current) current.setAttribute('aria-current', 'page');

    // mobile menu toggle
    var nav = document.getElementById('mc-nav');
    var toggle = document.getElementById('mc-nav-toggle');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        nav.classList.toggle('is-open');
        var icon = toggle.querySelector('.material-icons');
        if (icon) icon.textContent = nav.classList.contains('is-open') ? 'close' : 'menu';
      });
      // close on link click
      nav.querySelectorAll('.mc-nav__links a').forEach(function (a) {
        a.addEventListener('click', function () {
          nav.classList.remove('is-open');
          var icon = toggle.querySelector('.material-icons');
          if (icon) icon.textContent = 'menu';
        });
      });
    }
  }

  function scrollNav() {
    var nav = document.getElementById('mc-nav');
    if (!nav) return;
    var onScroll = function () {
      if (window.scrollY > 32) nav.classList.add('is-scrolled');
      else nav.classList.remove('is-scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function start() {
    injectChrome();
    scrollNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;
