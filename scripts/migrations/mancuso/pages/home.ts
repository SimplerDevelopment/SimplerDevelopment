// Home page composed as 8 independent CMS blocks.
//
// Each block is an html-render block with `fields[]` that mark editable
// content. In the visual editor:
//   - elements with `data-field="name"` are inline-editable text
//   - `<img>` elements with `data-field-image="name"` open the media picker
//   - `{{name}}` in src/href attrs is template-substituted from the block's
//     own `values` map (the editor writes to that map when the user edits)
//
// Author flow: open the home page in the portal, see 8 blocks in the layers
// panel, click into any text to edit it inline, or open the right-hand
// settings panel to swap an image / change a CTA target.
//
// To add or remove a section, push/splice into SECTIONS — the home post's
// content array is rebuilt from this list every time setup.ts runs.

export interface HomeSection {
  /** Stable slug used to build the block id; survives reordering. */
  slug: string;
  /** Shown in the editor's block list. */
  label: string;
  /** Markup with `data-field` and `{{var}}` placeholders. */
  html: string;
  /** Field schema the editor uses to render the right-hand settings panel. */
  fields: HomeField[];
  /** Default values for every field — also written into the block's `values`.
      Scalar values are strings; array values are `Array<Record<string, string>>`. */
  values: Record<string, string | Array<Record<string, string>>>;
}

interface HomeField {
  name: string;
  label: string;
  type: 'text' | 'richtext' | 'textarea' | 'image' | 'url' | 'array';
  /** Default for scalar fields; arrays use itemFields + values seeded separately. */
  default?: string;
  /** Sub-field schema for array/group types — drives the editor's row layout. */
  itemFields?: Array<{ name: string; label: string; type: HomeField['type']; default?: string }>;
}

const PHOTOS = {
  mozzBraid:  '/mancuso/005.jpg',
  storefront: '/mancuso/006.jpg',
  worker:     '/mancuso/001.jpg',
  building:   '/mancuso/003.jpg',
  specials:   '/mancuso/004.jpg',
  hoagieLong: '/mancuso/002.jpg',
  partenza:   '/mancuso/partenza.jpg',
};

const HERO: HomeSection = {
  slug: 'hero',
  label: 'Hero — headline + mozzarella photo',
  fields: [
    { name: 'sinceLabel',    label: 'Since-label',        type: 'text',     default: 'Since 1939' },
    { name: 'headingHtml',   label: 'Headline (allows <span class="mc-italic">)', type: 'richtext', default: 'South Philly\'s <span class="mc-italic">mozzarella</span>,<br/>pulled by hand <span class="mc-italic">daily.</span>' },
    { name: 'lede',          label: 'Lead paragraph',     type: 'textarea', default: 'A neighborhood cheese factory and Italian grocery on East Passyunk Avenue. We make fresh mozzarella and ricotta from the same recipes the Mancuso family has used for four generations — and we slice the meats, dress the olives, and build the hoagies the way South Philly always has.' },
    { name: 'primaryLabel',  label: 'Primary CTA label',  type: 'text',     default: 'See the Sandwiches' },
    { name: 'primaryHref',   label: 'Primary CTA link',   type: 'url',      default: '/sandwiches' },
    { name: 'secondaryLabel',label: 'Secondary CTA label',type: 'text',     default: 'Visit the Shop' },
    { name: 'secondaryHref', label: 'Secondary CTA link', type: 'url',      default: '/visit' },
    { name: 'heroImage',     label: 'Hero photo',         type: 'image',    default: PHOTOS.mozzBraid },
    { name: 'heroAlt',       label: 'Hero photo alt text',type: 'text',     default: 'A fresh mozzarella braid held by hand at L. Mancuso & Son' },
    { name: 'stampYear',     label: 'Stamp year',         type: 'text',     default: '1939' },
  ],
  values: {},
  html: `
<section class="mc-hero">
  <div class="mc-container mc-hero__inner">
    <div>
      <span class="mc-hero__since mc-reveal" data-field="sinceLabel">Since 1939</span>
      <h1 class="mc-reveal" data-delay="1" data-field="headingHtml">South Philly's <span class="mc-italic">mozzarella</span>,<br/>pulled by hand <span class="mc-italic">daily.</span></h1>
      <p class="mc-hero__lede mc-reveal" data-delay="2" data-field="lede">A neighborhood cheese factory and Italian grocery on East Passyunk Avenue. We make fresh mozzarella and ricotta from the same recipes the Mancuso family has used for four generations — and we slice the meats, dress the olives, and build the hoagies the way South Philly always has.</p>
      <div class="mc-hero__actions mc-reveal" data-delay="3">
        <a class="mc-btn mc-btn--primary" href="{{primaryHref}}">
          <span data-field="primaryLabel">See the Sandwiches</span>
          <span class="material-icons">arrow_forward</span>
        </a>
        <a class="mc-btn mc-btn--ghost" href="{{secondaryHref}}" data-field="secondaryLabel">Visit the Shop</a>
      </div>
      <div class="mc-hero__socials mc-reveal" data-delay="4">
        <span class="mc-hero__socials-label">Follow along</span>
        <a class="mc-socials__link" href="https://www.instagram.com/mancuso_cheese/" target="_blank" rel="noopener" aria-label="Follow on Instagram">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
          <span>@mancuso_cheese</span>
        </a>
        <a class="mc-socials__link" href="https://www.facebook.com/mancusocheeseproducts/" target="_blank" rel="noopener" aria-label="Follow on Facebook">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9v-2.89h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.89h-2.34V22c4.78-.75 8.44-4.89 8.44-9.94z"/></svg>
          <span>Mancuso's Cheese</span>
        </a>
      </div>
    </div>
    <div class="mc-hero__visual mc-reveal" data-delay="2">
      <img src="{{heroImage}}" data-field-image="heroImage" alt="{{heroAlt}}" loading="eager"/>
      <div class="mc-hero__stamp">
        <small>Est.</small>
        <strong data-field="stampYear">1939</strong>
        <small>Philadelphia</small>
      </div>
    </div>
  </div>
</section>`,
};

const MARQUEE: HomeSection = {
  slug: 'marquee',
  label: 'Marquee — scrolling cheese names',
  fields: [
    { name: 'words', label: 'Words (one per line)', type: 'textarea', default: 'Mozzarella\nRicotta\nScamorza\nBasket Cheese\nProvolone\nPecorino\nSopressata\nOlive Oil\nCalabrian Pasta\nSchiacciata' },
  ],
  values: {},
  // The marquee track HTML is rebuilt at render time from the `words` field.
  // We emit it twice in source so the CSS animation can loop seamlessly.
  html: `
<div class="mc-marquee" aria-hidden="true">
  <div class="mc-marquee__track">
    <span>Mozzarella</span><span>Ricotta</span><span>Scamorza</span><span>Basket Cheese</span><span>Provolone</span><span>Pecorino</span><span>Sopressata</span><span>Olive Oil</span><span>Calabrian Pasta</span><span>Schiacciata</span>
    <span>Mozzarella</span><span>Ricotta</span><span>Scamorza</span><span>Basket Cheese</span><span>Provolone</span><span>Pecorino</span><span>Sopressata</span><span>Olive Oil</span><span>Calabrian Pasta</span><span>Schiacciata</span>
  </div>
</div>`,
};

const STOREFRONT: HomeSection = {
  slug: 'storefront',
  label: 'Storefront — banner photo with overlay text',
  fields: [
    { name: 'photo',     label: 'Background photo',  type: 'image',    default: PHOTOS.storefront },
    { name: 'photoAlt',  label: 'Photo alt text',    type: 'text',     default: 'The storefront of L. Mancuso & Son at 1902 E. Passyunk Avenue' },
    { name: 'eyebrow',   label: 'Eyebrow',           type: 'text',     default: '1902 E. Passyunk Ave.' },
    { name: 'heading',   label: 'Heading',           type: 'text',     default: 'A counter on the corner since the war.' },
    { name: 'paragraph', label: 'Paragraph',         type: 'textarea', default: 'Same awning. Same buzzer. Same neon in the window. The shop\'s been making cheese on this block longer than most Philadelphians have been alive.' },
  ],
  values: {},
  html: `
<section class="mc-storefront">
  <div class="mc-storefront__photo">
    <img src="{{photo}}" data-field-image="photo" alt="{{photoAlt}}" loading="lazy"/>
  </div>
  <div class="mc-storefront__overlay">
    <div class="mc-container">
      <div class="mc-reveal" style="max-width:560px;color:var(--mc-cream);">
        <span class="mc-eyebrow" style="color:var(--mc-gold);" data-field="eyebrow">1902 E. Passyunk Ave.</span>
        <h2 style="color:var(--mc-cream);margin-bottom:14px;" data-field="heading">A counter on the corner since the war.</h2>
        <p style="color:rgba(246,239,226,0.85);font-size:17px;line-height:1.7;" data-field="paragraph">Same awning. Same buzzer. Same neon in the window. The shop's been making cheese on this block longer than most Philadelphians have been alive.</p>
      </div>
    </div>
  </div>
</section>`,
};

const STORY_TEASER: HomeSection = {
  slug: 'story-teaser',
  label: 'Story teaser — centered intro with link',
  fields: [
    { name: 'eyebrow',   label: 'Eyebrow',    type: 'text',     default: 'A Family Recipe' },
    { name: 'heading',   label: 'Heading (allows <span class="mc-italic">)', type: 'richtext', default: 'Four generations of <span class="mc-italic">South Philly</span> cheese-making.' },
    { name: 'paragraph', label: 'Paragraph',  type: 'textarea', default: 'The Mancusos started making ricotta on Ninth Street in the 1920s. In 1939, Lucio Mancuso opened a counter of his own a few blocks south on East Passyunk. His son Phil ran it from 1971 until his death in 2021. Today the shop is carried forward by Jimmy Cialella and John Denisi — same recipes, same hands, same neighborhood.' },
    { name: 'ctaLabel',  label: 'CTA label',  type: 'text',     default: 'Read the full story' },
    { name: 'ctaHref',   label: 'CTA link',   type: 'url',      default: '/story' },
  ],
  values: {},
  html: `
<section class="mc-section mc-paper">
  <div class="mc-container mc-container--narrow mc-text-center">
    <span class="mc-eyebrow mc-reveal" data-field="eyebrow">A Family Recipe</span>
    <h2 class="mc-reveal" data-delay="1" data-field="heading">Four generations of <span class="mc-italic">South Philly</span> cheese-making.</h2>
    <p class="mc-reveal" data-delay="2" style="font-size:18px;line-height:1.75;color:var(--mc-ink-soft);" data-field="paragraph">The Mancusos started making ricotta on Ninth Street in the 1920s. In 1939, Lucio Mancuso opened a counter of his own a few blocks south on East Passyunk. His son Phil ran it from 1971 until his death in 2021. Today the shop is carried forward by Jimmy Cialella and John Denisi — same recipes, same hands, same neighborhood.</p>
    <div class="mc-mt-lg mc-reveal" data-delay="3">
      <a class="mc-btn mc-btn--ghost" href="{{ctaHref}}" data-field="ctaLabel">Read the full story</a>
    </div>
  </div>
</section>`,
};

const INSIDE_SHOP: HomeSection = {
  slug: 'inside-shop',
  label: 'Inside the shop — editorial photo essay',
  fields: [
    { name: 'eyebrow',   label: 'Eyebrow',   type: 'text',     default: 'Inside the shop' },
    { name: 'heading',   label: 'Heading',   type: 'richtext', default: 'A counter, a slicer,<br/>and a chalkboard.' },
    { name: 'paragraph', label: 'Paragraph', type: 'textarea', default: 'Walk through the door and the smell tells you everything you need to know — warm milk from this morning\'s pull, cured pork hanging behind the case, fresh bread under the heat lamp. We\'ve been doing it this way since before your grandparents got married. We\'re not stopping now.' },
    { name: 'photoHero',    label: 'Photo 1 — hero',  type: 'image',    default: PHOTOS.building },
    { name: 'captionHero',  label: 'Caption 1',       type: 'text',     default: 'Sopressata on the slicer, hands at the counter' },
    { name: 'photoTall',    label: 'Photo 2 — tall',  type: 'image',    default: PHOTOS.worker },
    { name: 'captionTall',  label: 'Caption 2',       type: 'text',     default: 'The cheese guy. Ask him what\'s good today.' },
    { name: 'photoWide',    label: 'Photo 3 — wide',  type: 'image',    default: PHOTOS.specials },
    { name: 'captionWide',  label: 'Caption 3',       type: 'text',     default: 'Today\'s specials. Written in marker. Updated when we feel like it.' },
  ],
  values: {},
  html: `
<section class="mc-section mc-inside">
  <div class="mc-container">
    <div class="mc-inside__intro">
      <div class="mc-reveal">
        <span class="mc-eyebrow" data-field="eyebrow">Inside the shop</span>
        <h2 data-field="heading">A counter, a slicer,<br/>and a chalkboard.</h2>
      </div>
      <p class="mc-reveal" data-delay="1" data-field="paragraph">Walk through the door and the smell tells you everything you need to know — warm milk from this morning's pull, cured pork hanging behind the case, fresh bread under the heat lamp. We've been doing it this way since before your grandparents got married. We're not stopping now.</p>
    </div>
    <div class="mc-inside__grid">
      <figure class="mc-inside__item mc-inside__item--hero mc-reveal" data-delay="1">
        <img src="{{photoHero}}" data-field-image="photoHero" alt="{{captionHero}}"/>
        <figcaption><span>01</span> <em data-field="captionHero">Sopressata on the slicer, hands at the counter</em></figcaption>
      </figure>
      <figure class="mc-inside__item mc-inside__item--tall mc-reveal" data-delay="2">
        <img src="{{photoTall}}" data-field-image="photoTall" alt="{{captionTall}}"/>
        <figcaption><span>02</span> <em data-field="captionTall">The cheese guy. Ask him what's good today.</em></figcaption>
      </figure>
      <figure class="mc-inside__item mc-inside__item--wide mc-reveal" data-delay="3">
        <img src="{{photoWide}}" data-field-image="photoWide" alt="{{captionWide}}"/>
        <figcaption><span>03</span> <em data-field="captionWide">Today's specials. Written in marker. Updated when we feel like it.</em></figcaption>
      </figure>
    </div>
  </div>
</section>`,
};

const SIGNATURE_CHEESES: HomeSection = {
  slug: 'signature-cheeses',
  label: 'Signature cheeses — repeating tiles',
  fields: [
    { name: 'eyebrow', label: 'Eyebrow',   type: 'text',     default: 'Made Daily, In-House' },
    { name: 'heading', label: 'Heading',   type: 'text',     default: 'The cheeses we\'re known for' },
    {
      name: 'cheeses',
      label: 'Cheese tiles',
      type: 'array',
      itemFields: [
        { name: 'image',       label: 'Image',       type: 'image' },
        { name: 'tag',         label: 'Tag',         type: 'text' },
        { name: 'name',        label: 'Name',        type: 'text' },
        { name: 'description', label: 'Description', type: 'textarea' },
      ],
    },
    { name: 'ctaLabel',   label: 'CTA label',      type: 'text', default: 'See every cheese' },
    { name: 'ctaHref',    label: 'CTA link',       type: 'url',  default: '/cheese' },
  ],
  values: {
    cheeses: [
      {
        image:       PHOTOS.mozzBraid,
        tag:         'Fresh · House-pulled',
        name:        'Mozzarella',
        description: 'Pulled by hand every morning in the back. Milky, springy, gone by Saturday afternoon.',
      },
      {
        image:       '/mancuso/cheese-ricotta.svg',
        tag:         'Whole-milk · From the kettle',
        name:        'Ricotta',
        description: 'Drained warm into wicker baskets. Sweet enough for cannoli, structured enough for lasagna.',
      },
      {
        image:       '/mancuso/cheese-scamorza.svg',
        tag:         'Smoked · Aged a week',
        name:        'Scamorza',
        description: 'Pulled like mozzarella, tied off, and lightly smoked until the rind turns amber.',
      },
      {
        image:       '/mancuso/cheese-basket.svg',
        tag:         'Easter classic',
        name:        'Basket Cheese',
        description: 'The dense, lightly salted cheese that turns up in every nonna\'s Easter pie.',
      },
    ],
  },
  html: `
<section class="mc-section">
  <div class="mc-container">
    <div style="text-align:center;margin-bottom:64px;">
      <span class="mc-eyebrow mc-reveal" data-field="eyebrow">Made Daily, In-House</span>
      <h2 class="mc-reveal" data-delay="1" data-field="heading">The cheeses we're known for</h2>
    </div>
    <div class="mc-cheese-grid">
      <article class="mc-cheese-tile mc-reveal" data-repeat="cheeses">
        <img class="mc-cheese-tile__photo" src="{{cheeses.image}}" alt="{{cheeses.name}}"/>
        <div class="mc-cheese-tile__overlay">
          <span class="mc-cheese-tile__tag" data-field="tag">Fresh · House-pulled</span>
          <h3 data-field="name">Mozzarella</h3>
          <p data-field="description">Pulled by hand every morning in the back.</p>
        </div>
      </article>
    </div>
    <div class="mc-text-center mc-mt-lg mc-reveal">
      <a class="mc-btn mc-btn--primary" href="{{ctaHref}}">
        <span data-field="ctaLabel">See every cheese</span>
        <span class="material-icons">arrow_forward</span>
      </a>
    </div>
  </div>
</section>`,
};

const SANDWICH_HIGHLIGHT: HomeSection = {
  slug: 'sandwich-highlight',
  label: 'Sandwich highlight — The Partenza',
  fields: [
    { name: 'eyebrow',   label: 'Eyebrow',          type: 'text',     default: 'House Favorite' },
    { name: 'heading',   label: 'Heading',          type: 'text',     default: 'The Partenza.' },
    { name: 'paragraph', label: 'Paragraph',        type: 'textarea', default: 'Hot coppa, nduja spread, long hots, fresh mozzarella, hot honey — on Cacia\'s seeded roll or Baker Street schiacciata. Loud, sweet, smoky, and the headline of the 2023 sandwich menu.' },
    { name: 'callout',   label: 'Callout chip',     type: 'text',     default: '"Sweet and heat" — The Philadelphia Inquirer' },
    { name: 'ctaLabel',  label: 'CTA label',        type: 'text',     default: 'See the whole menu' },
    { name: 'ctaHref',   label: 'CTA link',         type: 'url',      default: '/sandwiches' },
    { name: 'photo',     label: 'Sandwich photo',   type: 'image',    default: PHOTOS.partenza },
    { name: 'photoAlt',  label: 'Photo alt text',   type: 'text',     default: 'The Partenza sandwich at L. Mancuso & Son' },
    { name: 'photoCredit',label:'Photo credit',     type: 'text',     default: 'Photo: Michael Klein / The Philadelphia Inquirer' },
  ],
  values: {},
  html: `
<section class="mc-section">
  <div class="mc-container">
    <div class="mc-sw-feature">
      <div class="mc-reveal">
        <span class="mc-eyebrow" data-field="eyebrow">House Favorite</span>
        <h2 data-field="heading">The Partenza.</h2>
        <p style="font-size:18px;line-height:1.7;" data-field="paragraph">Hot coppa, nduja spread, long hots, fresh mozzarella, hot honey — on Cacia's seeded roll or Baker Street schiacciata. Loud, sweet, smoky, and the headline of the 2023 sandwich menu.</p>
        <div class="mc-pill mc-mt-sm">
          <span class="material-icons">local_fire_department</span>
          <span data-field="callout">"Sweet and heat" — The Philadelphia Inquirer</span>
        </div>
        <div class="mc-mt-lg">
          <a class="mc-btn mc-btn--primary" href="{{ctaHref}}">
            <span data-field="ctaLabel">See the whole menu</span>
            <span class="material-icons">arrow_forward</span>
          </a>
        </div>
      </div>
      <figure class="mc-reveal" data-delay="1" style="margin:0;">
        <div class="mc-photo-frame">
          <img src="{{photo}}" data-field-image="photo" alt="{{photoAlt}}" loading="lazy"/>
        </div>
        <figcaption style="margin-top:10px;font-size:12px;color:var(--mc-muted);text-align:right;" data-field="photoCredit">Photo: Michael Klein / The Philadelphia Inquirer</figcaption>
      </figure>
    </div>
  </div>
</section>`,
};

const VISIT_CTA: HomeSection = {
  slug: 'visit-cta',
  label: 'Visit CTA — address card + map',
  fields: [
    { name: 'eyebrow',   label: 'Eyebrow',          type: 'text',     default: 'Come See Us' },
    { name: 'heading',   label: 'Heading (allows <span class="mc-italic">)', type: 'richtext', default: 'A counter in <span class="mc-italic">East Passyunk.</span>' },
    { name: 'paragraph', label: 'Paragraph',        type: 'textarea', default: 'No reservations. No website-only specials. Just a buzzer over the door and a counter full of cheese.' },
    { name: 'addressLine1', label: 'Address line 1', type: 'text',    default: '1902 E. Passyunk Ave.' },
    { name: 'addressLine2', label: 'Address line 2', type: 'text',    default: 'Philadelphia, PA 19148' },
    { name: 'hoursLine1',   label: 'Hours line 1',   type: 'text',    default: 'Mon – Sat · 9 to 6' },
    { name: 'hoursLine2',   label: 'Hours line 2',   type: 'text',    default: 'Sunday · 9 to 3' },
    { name: 'phone',        label: 'Phone',          type: 'text',    default: '(215) 389-1817' },
    { name: 'phoneNote',    label: 'Phone note',     type: 'text',    default: 'Phone orders welcome' },
    { name: 'phoneHref',    label: 'Phone href',     type: 'url',     default: 'tel:+12153891817' },
    { name: 'mapSrc',       label: 'Map embed URL',  type: 'url',     default: 'https://www.google.com/maps?q=1902+E+Passyunk+Ave,+Philadelphia,+PA+19148&output=embed' },
  ],
  values: {},
  html: `
<section class="mc-section mc-paper">
  <div class="mc-container">
    <div class="mc-visit">
      <div class="mc-visit__info mc-reveal">
        <span class="mc-eyebrow" style="color:var(--mc-gold);" data-field="eyebrow">Come See Us</span>
        <h2 style="margin-bottom:8px;" data-field="heading">A counter in <span class="mc-italic">East Passyunk.</span></h2>
        <p style="color:rgba(246,239,226,0.78);max-width:380px;" data-field="paragraph">No reservations. No website-only specials. Just a buzzer over the door and a counter full of cheese.</p>
        <div style="margin-top:24px;">
          <div class="mc-visit__row">
            <span class="material-icons">location_on</span>
            <div><b data-field="addressLine1">1902 E. Passyunk Ave.</b><span data-field="addressLine2">Philadelphia, PA 19148</span></div>
          </div>
          <div class="mc-visit__row">
            <span class="material-icons">schedule</span>
            <div><b data-field="hoursLine1">Mon – Sat · 9 to 6</b><span data-field="hoursLine2">Sunday · 9 to 3</span></div>
          </div>
          <div class="mc-visit__row">
            <span class="material-icons">call</span>
            <div><b><a href="{{phoneHref}}" style="color:var(--mc-cream);" data-field="phone">(215) 389-1817</a></b><span data-field="phoneNote">Phone orders welcome</span></div>
          </div>
        </div>
      </div>
      <div class="mc-visit__map mc-reveal" data-delay="1">
        <iframe src="{{mapSrc}}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map to L. Mancuso & Son"></iframe>
      </div>
    </div>
  </div>
</section>`,
};

export const HOME_SECTIONS: HomeSection[] = [
  HERO,
  MARQUEE,
  STOREFRONT,
  STORY_TEASER,
  INSIDE_SHOP,
  SIGNATURE_CHEESES,
  SANDWICH_HIGHLIGHT,
  VISIT_CTA,
];
