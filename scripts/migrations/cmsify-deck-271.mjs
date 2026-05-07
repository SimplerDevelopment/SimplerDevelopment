/**
 * Convert deck 271 (TF2 Qualifier) from a single html-embed iframe into 10
 * slides of html-render blocks with a working state machine, conditional
 * branching, dynamic results, and survey capture.
 *
 * Slides:
 *   1. Welcome (route picker — decision-style with 2 buttons)
 *   2. Q1 — Where you are (4 options)
 *   3. Q2 — What you want (4 options, conditional next)
 *   4. Q3 — Driver (5 options, conditional next)
 *   5. Scope Roadmap (4 options, route-aware next)
 *   6. Scope Blueprint (4 options, route-aware next)
 *   7. Hybrid (terminal — CTA + identity capture)
 *   8. Route 2 picker (4 offerings)
 *   9. Offering Detail (terminal — dynamic per state.route2Selection)
 *  10. Results (terminal — dynamic narrative + identity capture)
 *
 * Bootstrap script lives on every slide (idempotent) so deep links work.
 * State persists in window.__qualifierState. Navigation is via dispatched
 * `data-deck-action="jump-to"` clicks the deck viewer's existing handler picks up.
 *
 * Also creates a survey row (clientId=98, linkedType=pitch_deck, linkedId=271)
 * so identity submissions land in /portal/surveys with formName-grouped rows.
 *
 *   bun scripts/migrations/cmsify-deck-271.mjs           # dry run
 *   bun scripts/migrations/cmsify-deck-271.mjs --apply   # writes
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

const DECK_ID = 271;
const APPLY = process.argv.includes('--apply');
const FORM_NAME = 'tf2_qualifier_v4';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

// ─── Source CSS — embedded once per slide so each render is self-contained ──

const CSS = fs.readFileSync('/tmp/qualifier-css-only.css', 'utf8');

// ─── Bootstrap script — runs on every slide, idempotent. Owns the state
//      machine + click handler + survey submit. ─────────────────────────────

const BOOTSTRAP = `
<script>
(function() {
  if (window.__qualifierWired) return;
  window.__qualifierWired = true;
  window.__qualifierState = window.__qualifierState || {
    route: null, q1: null, q2: null, q3: null,
    scopeRoadmap: null, scopeBlueprint: null,
    scopeContext: 'route1', route2Selection: null,
  };
  var SLUG = '__SURVEY_SLUG__';
  var FORM_NAME = '__FORM_NAME__';

  // ---- routing ----
  function nextSlide(q, value, st) {
    if (q === 'route') return value === '2' ? 8 : 2;
    if (q === 'q1') return 3;
    if (q === 'q2') return (st.q1 === 'C' && st.q2 === 'A') ? 7 : 4;
    if (q === 'q3') {
      if (st.q2 === 'B') { st.scopeContext = 'route1'; return 5; }
      if (st.q2 === 'C') { st.scopeContext = 'route1'; return 6; }
      return 10;
    }
    if (q === 'scopeRoadmap' || q === 'scopeBlueprint') {
      return st.scopeContext === 'route2' ? 9 : 10;
    }
    if (q === 'route2Selection') {
      if (value === 'roadmap')  { st.scopeContext = 'route2'; return 5; }
      if (value === 'blueprint'){ st.scopeContext = 'route2'; return 6; }
      return 9;
    }
    return null;
  }

  function jumpTo(slide) {
    var btn = document.createElement('button');
    btn.dataset.deckAction = 'jump-to';
    btn.dataset.deckTarget = String(slide);
    btn.style.display = 'none';
    document.body.appendChild(btn);
    btn.click();
    setTimeout(function() { btn.remove(); }, 50);
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('[data-question]');
    if (!btn) return;
    var q = btn.dataset.question, v = btn.dataset.value;
    var st = window.__qualifierState;
    st[q] = v;
    btn.classList.add('advancing');
    setTimeout(function() {
      var next = nextSlide(q, v, st);
      if (next) jumpTo(next);
    }, 280);
  }, true);

  // ---- identity form submit ----
  window.__qualifierSubmit = async function(formEl) {
    var data = new FormData(formEl);
    var email = (data.get('email') || '').toString().trim();
    var name  = (data.get('name')  || '').toString().trim();
    var company = (data.get('company') || '').toString().trim();
    if (!email) return false;
    var statusEl = formEl.querySelector('[data-id-status]');
    if (statusEl) { statusEl.textContent = 'Submitting...'; statusEl.style.color = ''; }
    var st = window.__qualifierState;
    var answers = Object.assign({}, st, { company: company || undefined });
    try {
      var res = await fetch('/api/surveys/' + SLUG, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formName: FORM_NAME,
          answers: answers,
          email: email, name: name || undefined,
          source: 'pitch_deck', sourceId: '271',
        }),
      });
      var json = await res.json();
      if (!json.success) throw new Error(json.message || 'Submit failed');
      formEl.querySelectorAll('input,button').forEach(function(el) { el.disabled = true; });
      if (statusEl) { statusEl.textContent = 'Got it — I will be in touch shortly.'; statusEl.style.color = '#005652'; }
      return true;
    } catch (err) {
      if (statusEl) { statusEl.textContent = 'Could not submit: ' + (err.message || err); statusEl.style.color = '#C46A3D'; }
      return false;
    }
  };

  // ---- results renderer ----
  window.__qualifierRenderResults = function() {
    var Q1_MAP = { A:'snapshot', B:'roadmap', C:'snapshot', D:'blueprint' };
    var Q2_MAP = { A:'snapshot', B:'roadmap', C:'blueprint', D:'advisory' };
    var Q3_MAP = { A:'snapshot', B:'blueprint', C:'roadmap', D:'advisory', E:'snapshot' };
    var Q1_CTX = { A:'in early stages', B:'ready to make a real investment in marketing', C:"already running things but not sure what's actually working", D:'ready to build a specific campaign' };
    var Q2_CTX = { A:'what you need most is clarity on where to focus first', B:'what you need most is a plan to actually build from', C:'what you need most is a campaign designed before anyone runs it', D:'what you need most is consistent strategic input over time' };
    var Q3_CTX = { A:'wanting to start right', B:'with a specific initiative on deck', C:"with results that aren't matching the effort", D:'with decisions piling up', E:"after past efforts that didn't land" };
    var OFFERINGS = {
      snapshot:  { name:'Strategy Snapshot', tagline:"When things feel off but it's not clear why. Identifies what's driving results, what's wasting effort, and the few moves that actually matter next.", price:'$7,500', duration:'3-4 weeks' },
      roadmap:   { name:'Marketing Roadmap', tagline:'Before you invest in execution, make the decisions most teams avoid. What actually matters, what doesn\\'t, what gets built first.', price:'$12K-$18K', duration:'4-6 weeks' },
      blueprint: { name:'Campaign Blueprint', tagline:'For when you need one specific thing to work. Designs the campaign around the right audience, message, and channels.', price:'$7,500-$12K', duration:'3-4 weeks' },
      advisory:  { name:'Fractional Marketing Advisory', tagline:'Ongoing strategic input as priorities shift. Keeps decisions tight and execution pointed in the right direction.', price:'Starting at $3K/month', duration:'6-month minimum' },
    };
    var st = window.__qualifierState;
    var votes = { snapshot:0, roadmap:0, blueprint:0, advisory:0 };
    [Q1_MAP[st.q1], Q2_MAP[st.q2], Q3_MAP[st.q3]].forEach(function(k) { if (k) votes[k]++; });
    var primary = null, max = 0;
    Object.keys(votes).forEach(function(k) { if (votes[k] > max) { max = votes[k]; primary = k; } });
    if (st.q2 === 'D' || st.q3 === 'D') primary = 'advisory';
    var nb = document.querySelector('[data-results-narrative]');
    var pc = document.querySelector('[data-results-primary]');
    if (nb) {
      var ctx1 = Q1_CTX[st.q1] || 'in a specific situation';
      var ctx2 = Q2_CTX[st.q2] || '';
      var ctx3 = Q3_CTX[st.q3] || '';
      var sentence = "You're " + ctx1 + (ctx3 ? ', ' + ctx3 : '') + '. ' +
        (ctx2 ? ctx2.charAt(0).toUpperCase() + ctx2.slice(1) + '. ' : '') +
        'Based on that, <strong>' + (OFFERINGS[primary] ? OFFERINGS[primary].name : 'a starting offering') + '</strong> is the right starting point.';
      nb.innerHTML = sentence;
    }
    if (pc && primary && OFFERINGS[primary]) {
      var d = OFFERINGS[primary];
      pc.innerHTML =
        '<div class="rp-name">' + d.name + '</div>' +
        '<div class="rp-tagline">' + d.tagline + '</div>' +
        '<div class="rp-meta"><span>' + d.price + '</span> &middot; <span>' + d.duration + '</span></div>';
    }
  };

  window.__qualifierRenderOffering = function() {
    var OFFERINGS = {
      snapshot:  { num:'01', name:'Strategy Snapshot', tagline:"When things feel off but it's not clear why. Identifies what's driving results, what's wasting effort, and the few moves that actually matter next.", youGet:'A prioritized picture of what to focus on for the next 90 days and why. Clarity on where to aim before anything gets built.', price:'$7,500', duration:'3-4 weeks' },
      roadmap:   { num:'02', name:'Marketing Roadmap', tagline:'Before you invest in execution, make the decisions most teams avoid.', youGet:'A sequenced marketing plan your team can take and execute from.', price:'$12K-$18K', duration:'4-6 weeks' },
      blueprint: { num:'03', name:'Campaign Blueprint', tagline:'For when you need one specific thing to work.', youGet:'A fully designed campaign your team can build and launch.', price:'$7,500-$12K', duration:'3-4 weeks' },
      advisory:  { num:'04', name:'Fractional Marketing Advisory', tagline:'Ongoing strategic input as priorities shift.', youGet:'A strategic partner who shows up consistently as decisions come up.', price:'Starting at $3K/month', duration:'6-month minimum' },
    };
    var key = (window.__qualifierState || {}).route2Selection;
    var d = OFFERINGS[key];
    var host = document.querySelector('[data-offering-detail]');
    if (!host) return;
    if (!d) { host.innerHTML = '<p style="color:#5a6b69">Pick an offering on the previous slide to see details.</p>'; return; }
    host.innerHTML =
      '<div class="od-num">' + d.num + '</div>' +
      '<div class="od-name">' + d.name + '</div>' +
      '<div class="od-tagline">' + d.tagline + '</div>' +
      '<div class="od-you-get"><div class="yg-label">You get</div><div class="yg-text">' + d.youGet + '</div></div>' +
      '<div class="od-meta"><span>' + d.price + '</span> &middot; <span>' + d.duration + '</span></div>';
  };
})();
</script>
`;

// ─── Helpers ────────────────────────────────────────────────────────────────

let counter = 0;
const uid = (s) => `block-${Date.now()}-${++counter}-${s}`;
const slideId = (i) => `slide-${Date.now()}-${i + 1}`;

function field(name, label, type, opts = {}) {
  return { name, label, type, ...opts };
}

// Wraps a slide body in the standard `<div class="slide bg-...">` shell + CSS.
function slideShell(bg, inner, opts = {}) {
  return `<style>${CSS}</style>${BOOTSTRAP}\n<div class="slide ${bg} ${opts.noPattern ? 'no-pattern' : ''} active">\n${inner}\n</div>`;
}

// Identity form HTML — embedded on terminal slides.
const identityForm = (formId) => `
<form data-id-form id="${formId}" onsubmit="event.preventDefault(); window.__qualifierSubmit(this);" class="id-form">
  <div class="id-form-title">{{idHeadline}}</div>
  <div class="id-form-sub">{{idSubtext}}</div>
  <input name="name"    type="text"  placeholder="Your name" />
  <input name="email"   type="email" placeholder="Email *" required />
  <input name="company" type="text"  placeholder="Company" />
  <button type="submit" class="id-submit">{{idSubmitLabel}}</button>
  <div data-id-status class="id-status"></div>
</form>
<style>
.id-form { margin-top: 28px; padding: 24px; border-radius: 12px; background: rgba(0,86,82,0.06); border: 1px solid rgba(0,86,82,0.15); display: flex; flex-direction: column; gap: 10px; max-width: 460px; }
.id-form-title { font-size: 15px; font-weight: 700; color: var(--dark-teal); }
.id-form-sub { font-size: 13px; color: #4a5c5a; line-height: 1.5; margin-bottom: 6px; }
.id-form input { padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(0,86,82,0.2); background: white; font-size: 14px; font-family: inherit; }
.id-form input:focus { outline: none; border-color: var(--dark-teal); }
.id-submit { padding: 10px 18px; border-radius: 8px; background: var(--dark-teal); color: var(--off-white); border: none; cursor: pointer; font-size: 14px; font-weight: 700; font-family: inherit; }
.id-submit:hover { opacity: 0.9; }
.id-status { font-size: 13px; min-height: 18px; }
</style>
`;

// Identity field schema fragment.
const identityFields = [
  field('idHeadline', 'Identity — headline', 'text'),
  field('idSubtext', 'Identity — subtext', 'textarea'),
  field('idSubmitLabel', 'Identity — submit label', 'text'),
];
const identityValues = {
  idHeadline: 'One quick thing before we wrap up',
  idSubtext: 'Drop your details so I know who I am talking to. I will reach out with next steps.',
  idSubmitLabel: 'Send my answers',
};

// ─── Slides ────────────────────────────────────────────────────────────────

function buildSlides() {
  const slides = [];

  // 1. Welcome — route picker
  slides.push({
    id: slideId(0), label: 'Welcome',
    blocks: [{
      id: uid('welcome'), type: 'html-render', order: 0, width: 'full',
      html: slideShell('bg-off-white', `
<div class="screen active">
  <div class="screen-inner welcome-screen">
    <img src="https://cdn.simplerdevelopment.com/CY%20Strategies%20Logo/Full%20Logo/Color/CY-Full-Logo-Color.png" class="welcome-logo" alt="CY Strategies" data-field-image="welcomeLogo" />
    <div class="rule-rust"></div>
    <div class="welcome-headline">{{welcomeHeadline}}</div>
    <div class="welcome-body">{{welcomeBody}}</div>
    <div class="route-stack">
      <button class="route-btn primary"   data-question="route" data-value="1">
        <div><div class="rb-label">{{route1Label}}</div><div class="rb-title">{{route1Title}}</div></div>
        <span class="route-arrow">&rarr;</span>
      </button>
      <button class="route-btn secondary" data-question="route" data-value="2">
        <div><div class="rb-label">{{route2Label}}</div><div class="rb-title">{{route2Title}}</div></div>
        <span class="route-arrow">&rarr;</span>
      </button>
    </div>
  </div>
</div>`),
      fields: [
        field('welcomeLogo', 'Logo', 'image'),
        field('welcomeHeadline', 'Headline', 'text'),
        field('welcomeBody', 'Body', 'textarea'),
        field('route1Label', 'Route 1 — small label', 'text'),
        field('route1Title', 'Route 1 — title', 'text'),
        field('route2Label', 'Route 2 — small label', 'text'),
        field('route2Title', 'Route 2 — title', 'text'),
      ],
      values: {
        welcomeLogo: 'https://cdn.simplerdevelopment.com/CY%20Strategies%20Logo/Full%20Logo/Color/CY-Full-Logo-Color.png',
        welcomeHeadline: "Let's figure out where to start.",
        welcomeBody: 'A few quick questions to point you toward the offering that fits best, or a direct path to the one you already have in mind.',
        route1Label: 'I want help figuring out the fit',
        route1Title: 'Help me figure out what fits',
        route2Label: 'I know what I want',
        route2Title: 'I know the direction I want to explore further',
      },
    }],
  });

  // Question slide builder — used for q1, q2, q3, scope-roadmap, scope-blueprint.
  function questionSlide(opts) {
    const optionsHtml = opts.answers.map(a => `
      <button class="answer-card" data-question="${opts.qKey}" data-value="${a.letter}">
        <div class="a-letter">${a.letter}</div>
        <div class="a-body"><div class="a-text">{{${a.fieldName}}}</div></div>
      </button>`).join('');
    return {
      id: slideId(slides.length), label: opts.label,
      blocks: [{
        id: uid(opts.qKey), type: 'html-render', order: 0, width: 'full',
        html: slideShell('bg-off-white', `
<div class="screen has-progress active">
  <div class="screen-inner">
    <div class="s-eyebrow">{{eyebrow}}</div>
    <div class="s-question">{{question}}</div>
    <div class="s-subtext">{{subtext}}</div>
    <div class="answer-list">${optionsHtml}</div>
  </div>
</div>`),
        fields: [
          field('eyebrow', 'Eyebrow', 'text'),
          field('question', 'Question', 'text'),
          field('subtext', 'Subtext', 'text'),
          ...opts.answers.map(a => field(a.fieldName, `Answer ${a.letter}`, 'textarea')),
        ],
        values: {
          eyebrow: opts.eyebrow,
          question: opts.question,
          subtext: opts.subtext,
          ...Object.fromEntries(opts.answers.map(a => [a.fieldName, a.text])),
        },
      }],
    };
  }

  // 2. Q1
  slides.push(questionSlide({
    label: 'Q1 — Where you are', qKey: 'q1',
    eyebrow: 'Question 1 of 3',
    question: 'Which of these feels closest to where you are with marketing right now?',
    subtext: 'Pick the one that fits best.',
    answers: [
      { letter:'A', fieldName:'q1a', text:"We're in early stages. Not much is happening yet, but we're ready to start doing this right." },
      { letter:'B', fieldName:'q1b', text:"We're about to put real investment into marketing and want to make sure we're building the right things." },
      { letter:'C', fieldName:'q1c', text:"We're doing some things but I'm not sure we're focused on what's actually going to move the needle." },
      { letter:'D', fieldName:'q1d', text:"We have a specific campaign or initiative we're ready to build and want to get it right before we launch." },
    ],
  }));

  // 3. Q2
  slides.push(questionSlide({
    label: 'Q2 — What you want', qKey: 'q2',
    eyebrow: 'Question 2 of 3',
    question: 'What would be most useful to walk away with?',
    subtext: 'This helps narrow down which offering fits best.',
    answers: [
      { letter:'A', fieldName:'q2a', text:'A clear picture of what to prioritize over the next 90 days and why.' },
      { letter:'B', fieldName:'q2b', text:"A focused plan that shows what to do, in what order, and why. Something to actually build from, whether that's you, your team, or someone you bring in." },
      { letter:'C', fieldName:'q2c', text:'A campaign built around a specific audience, structured and ready to execute.' },
      { letter:'D', fieldName:'q2d', text:'An ongoing strategic partner who keeps my priorities clear, decisions grounded, and marketing pointed at what actually matters for the business.' },
    ],
  }));

  // 4. Q3
  slides.push(questionSlide({
    label: 'Q3 — Driver', qKey: 'q3',
    eyebrow: 'Question 3 of 3',
    question: "What's driving the need for outside help right now?",
    subtext: 'Pick the one that resonates most.',
    answers: [
      { letter:'A', fieldName:'q3a', text:"I think we're ready to start, and I want to do it right from the beginning." },
      { letter:'B', fieldName:'q3b', text:'We have a specific initiative coming up and need it built correctly before we run it.' },
      { letter:'C', fieldName:'q3c', text:"Things are moving but results aren't matching the effort. We need to recalibrate." },
      { letter:'D', fieldName:'q3d', text:'Decisions keep stacking up and we need consistent strategic input.' },
      { letter:'E', fieldName:'q3e', text:"I've been burned by agencies or past efforts that didn't deliver. I want a different approach." },
    ],
  }));

  // 5. Scope Roadmap
  slides.push(questionSlide({
    label: 'Scope — Roadmap', qKey: 'scopeRoadmap',
    eyebrow: 'One more thing',
    question: 'How much ground do we need to cover?',
    subtext: 'This helps narrow down which end of the price range applies to your situation.',
    answers: [
      { letter:'A', fieldName:'srA', text:'One specific area: a channel, a segment, or a particular part of the business.' },
      { letter:'B', fieldName:'srB', text:'The whole marketing picture, channel by channel and audience by audience.' },
      { letter:'C', fieldName:'srC', text:"A specific phase we're in right now: launch, growth, or reset." },
      { letter:'D', fieldName:'srD', text:"Not sure yet. That's part of what I need clarity on." },
    ],
  }));

  // 6. Scope Blueprint
  slides.push(questionSlide({
    label: 'Scope — Blueprint', qKey: 'scopeBlueprint',
    eyebrow: 'One more thing',
    question: 'Who is this campaign for?',
    subtext: 'This helps narrow down which end of the price range applies to your situation.',
    answers: [
      { letter:'A', fieldName:'sbA', text:"A specific type of prospect or industry we're trying to reach." },
      { letter:'B', fieldName:'sbB', text:'Existing customers or past leads we want to re-engage.' },
      { letter:'C', fieldName:'sbC', text:"A new market or audience we haven't targeted before." },
      { letter:'D', fieldName:'sbD', text:'I have an audience in mind but need help defining it better.' },
    ],
  }));

  // 7. Hybrid (terminal)
  slides.push({
    id: slideId(slides.length), label: 'Hybrid',
    blocks: [{
      id: uid('hybrid'), type: 'html-render', order: 0, width: 'full',
      html: slideShell('bg-off-white', `
<div class="screen active">
  <div class="screen-inner">
    <div class="hybrid-badge">{{hybridBadge}}</div>
    <div class="hybrid-headline">{{hybridHeadline}}</div>
    <div class="rule-rust"></div>
    <div class="hybrid-body">{{hybridBody}}</div>
    <div class="hybrid-close">{{hybridClose}}</div>
    ${identityForm('hybrid-id-form')}
  </div>
</div>`),
      fields: [
        field('hybridBadge', 'Hybrid — badge', 'text'),
        field('hybridHeadline', 'Hybrid — headline', 'text'),
        field('hybridBody', 'Hybrid — body', 'richtext'),
        field('hybridClose', 'Hybrid — closing', 'textarea'),
        ...identityFields,
      ],
      values: {
        hybridBadge: 'Two offerings, one sequence',
        hybridHeadline: 'A Snapshot into a Roadmap.',
        hybridBody: '<p>Your answers point to two things that work well together. First: clarity on where to focus right now. Then: a plan for what comes next that builds on that foundation.</p><p>The Snapshot gets you focused and moving in 90 days. The Roadmap takes that clarity and maps out what to build from there.</p>',
        hybridClose: "Worth a conversation to see if this sequence makes sense. Drop your details and I'll be in touch.",
        ...identityValues,
      },
    }],
  });

  // 8. Route 2 picker
  slides.push({
    id: slideId(slides.length), label: 'Route 2 — Pick offering',
    blocks: [{
      id: uid('route2'), type: 'html-render', order: 0, width: 'full',
      html: slideShell('bg-off-white', `
<div class="screen active">
  <div class="screen-inner">
    <div class="s-eyebrow">{{r2Eyebrow}}</div>
    <div class="s-question">{{r2Question}}</div>
    <div class="offering-select-intro">{{r2Intro}}</div>
    <div class="offering-select-grid">
      <button class="offering-select-card" data-question="route2Selection" data-value="snapshot">
        <div class="osc-num">01</div><div class="osc-name">{{r2OneName}}</div><div class="osc-desc">{{r2OneDesc}}</div></button>
      <button class="offering-select-card" data-question="route2Selection" data-value="roadmap">
        <div class="osc-num">02</div><div class="osc-name">{{r2TwoName}}</div><div class="osc-desc">{{r2TwoDesc}}</div></button>
      <button class="offering-select-card" data-question="route2Selection" data-value="blueprint">
        <div class="osc-num">03</div><div class="osc-name">{{r2ThreeName}}</div><div class="osc-desc">{{r2ThreeDesc}}</div></button>
      <button class="offering-select-card" data-question="route2Selection" data-value="advisory">
        <div class="osc-num">04</div><div class="osc-name">{{r2FourName}}</div><div class="osc-desc">{{r2FourDesc}}</div></button>
    </div>
  </div>
</div>`),
      fields: [
        field('r2Eyebrow', 'Eyebrow', 'text'),
        field('r2Question', 'Question', 'text'),
        field('r2Intro', 'Intro line', 'text'),
        field('r2OneName', 'Card 1 — name', 'text'),
        field('r2OneDesc', 'Card 1 — description', 'textarea'),
        field('r2TwoName', 'Card 2 — name', 'text'),
        field('r2TwoDesc', 'Card 2 — description', 'textarea'),
        field('r2ThreeName', 'Card 3 — name', 'text'),
        field('r2ThreeDesc', 'Card 3 — description', 'textarea'),
        field('r2FourName', 'Card 4 — name', 'text'),
        field('r2FourDesc', 'Card 4 — description', 'textarea'),
      ],
      values: {
        r2Eyebrow: 'CY Strategies',
        r2Question: 'Which offering are you most interested in?',
        r2Intro: 'Pick one to see what it includes.',
        r2OneName: 'Strategy Snapshot',
        r2OneDesc: 'A prioritized picture of what to focus on for the next 90 days.',
        r2TwoName: 'Marketing Roadmap',
        r2TwoDesc: 'A sequenced marketing plan your team can take and execute from.',
        r2ThreeName: 'Campaign Blueprint',
        r2ThreeDesc: 'A fully designed campaign your team can build and launch.',
        r2FourName: 'Fractional Advisory',
        r2FourDesc: 'A strategic partner who shows up consistently as decisions come up.',
      },
    }],
  });

  // 9. Offering Detail (terminal — dynamic via __qualifierRenderOffering)
  slides.push({
    id: slideId(slides.length), label: 'Offering Detail',
    blocks: [{
      id: uid('offerdet'), type: 'html-render', order: 0, width: 'full',
      html: slideShell('bg-off-white', `
<div class="screen active">
  <div class="screen-inner">
    <div data-offering-detail></div>
    ${identityForm('offering-id-form')}
    <script>setTimeout(function(){ if (window.__qualifierRenderOffering) window.__qualifierRenderOffering(); }, 0);</script>
  </div>
</div>`),
      fields: identityFields,
      values: { ...identityValues },
    }],
  });

  // 10. Results (terminal — dynamic narrative + identity)
  slides.push({
    id: slideId(slides.length), label: 'Results',
    blocks: [{
      id: uid('results'), type: 'html-render', order: 0, width: 'full',
      html: slideShell('bg-light-teal', `
<div class="screen active">
  <div class="screen-inner">
    <div class="results-eyebrow">{{resultsEyebrow}}</div>
    <div class="results-narrative" data-results-narrative></div>
    <div class="results-primary" data-results-primary></div>
    ${identityForm('results-id-form')}
    <script>setTimeout(function(){ if (window.__qualifierRenderResults) window.__qualifierRenderResults(); }, 0);</script>
  </div>
</div>
<style>
.results-primary { margin-top: 18px; padding: 22px 24px; border-radius: 12px; background: white; border: 1px solid rgba(0,86,82,0.12); border-left: 4px solid var(--dark-teal); }
.rp-name { font-size: 19px; font-weight: 800; color: var(--dark-teal); margin-bottom: 6px; }
.rp-tagline { font-size: 14px; color: #3a4a49; line-height: 1.6; margin-bottom: 10px; }
.rp-meta { font-size: 12px; color: var(--soft-teal); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
.rp-meta span + span { margin-left: 4px; }
</style>`),
      fields: [
        field('resultsEyebrow', 'Results — eyebrow', 'text'),
        ...identityFields,
      ],
      values: {
        resultsEyebrow: "Here's where this lands",
        ...identityValues,
      },
    }],
  });

  // assign block.order
  slides.forEach(s => s.blocks.forEach((b, i) => { b.order = i; }));
  return slides;
}

// ─── Survey row creation ────────────────────────────────────────────────────

async function ensureSurvey(clientId) {
  const [existing] = await sql`SELECT id, slug FROM surveys WHERE client_id = ${clientId} AND linked_id = ${DECK_ID} AND linked_type = 'pitch_deck' LIMIT 1`;
  if (existing) {
    console.log(`survey already exists: id=${existing.id} slug=${existing.slug}`);
    return existing;
  }
  const slug = `tf2-qualifier-${Date.now().toString(36)}`;
  const [created] = await sql`
    INSERT INTO surveys (client_id, title, slug, fields, status, linked_type, linked_id, allow_multiple, require_email, notify_on_response)
    VALUES (${clientId}, ${'CY Strategies — TF2 Qualifier (custom form)'}, ${slug}, ${sql.json([])}, 'active', 'pitch_deck', ${DECK_ID}, true, true, true)
    RETURNING id, slug
  `;
  console.log(`created survey: id=${created.id} slug=${created.slug}`);
  return created;
}

// ─── Run ───────────────────────────────────────────────────────────────────

const [deck] = await sql`SELECT id, client_id, slides FROM pitch_decks WHERE id = ${DECK_ID}`;
if (!deck) { console.error(`Deck ${DECK_ID} not found`); process.exit(1); }

// Backup
const backupDir = path.join(process.cwd(), '.backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `deck-${DECK_ID}-slides-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify(deck.slides, null, 2));
console.log(`Backed up slides to ${backupPath}`);

// Survey
const survey = APPLY ? await ensureSurvey(deck.client_id) : { slug: '<DRY-RUN-SLUG>' };

// Build slides — substitute survey slug into bootstrap.
const newSlides = buildSlides().map(s => ({
  ...s,
  blocks: s.blocks.map(b => ({
    ...b,
    html: (b.html || '').replace(/__SURVEY_SLUG__/g, survey.slug).replace(/__FORM_NAME__/g, FORM_NAME),
  })),
}));

console.log('\nNew slide layout:');
newSlides.forEach((s, i) => console.log(`  ${(i+1).toString().padStart(2)}: ${s.label.padEnd(28)} fields=${s.blocks[0].fields?.length || 0}`));

if (!APPLY) {
  console.log('\n[dry run] re-run with --apply to write to the database.');
  await sql.end();
  process.exit(0);
}

await sql`UPDATE pitch_decks SET slides = ${sql.json(newSlides)}, format_version = 2, updated_at = NOW() WHERE id = ${DECK_ID}`;
console.log(`\nWrote ${newSlides.length} slides to deck ${DECK_ID}.`);
console.log(`Survey slug: ${survey.slug}`);
console.log(`Form name:   ${FORM_NAME}`);
await sql.end();
