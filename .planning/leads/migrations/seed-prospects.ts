#!/usr/bin/env bun
/**
 * One-off seed for the 5 outbound-demo prospect sites.
 * MVP scaffold (~5 blocks per site) — not a full migration.
 *
 * Runs against the local dryrun DB. Idempotent: skips sites whose subdomain
 * already exists. Wrap in a transaction.
 */

import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set');
if (!DATABASE_URL.includes('localhost')) {
  throw new Error(`Refusing to run against non-localhost DB: ${DATABASE_URL.replace(/:[^@]+@/, ':***@')}`);
}

const PASSWORD_GATE_JS = (pw: string) =>
  `(function(){var EXPECTED=${JSON.stringify(pw)};if(sessionStorage.getItem("demo_unlocked")===EXPECTED)return;document.documentElement.style.visibility="hidden";document.addEventListener("DOMContentLoaded",function(){var o=document.createElement("div");o.style.cssText="position:fixed;inset:0;background:#fff;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:sans-serif;flex-direction:column;";o.innerHTML='<h2 style="margin:0 0 24px;font-weight:400;letter-spacing:.05em;">Preview Access</h2><form id="g"><input id="p" type="password" placeholder="password" autofocus style="font-size:16px;padding:10px 12px;border:1px solid #ccc;margin-right:8px;"><button style="font-size:16px;padding:10px 18px;background:#111;color:#fff;border:0;cursor:pointer;">Enter</button></form>';document.body.appendChild(o);document.documentElement.style.visibility="visible";document.getElementById("g").addEventListener("submit",function(e){e.preventDefault();var v=document.getElementById("p").value;if(v===EXPECTED){sessionStorage.setItem("demo_unlocked",EXPECTED);o.remove();}else{document.getElementById("p").value="";document.getElementById("p").placeholder="incorrect";}});});})();`;

type Block = Record<string, unknown> & { id: string; type: string; order: number };

interface Prospect {
  slug: string;
  name: string;
  password: string;
  blocks: Block[];
}

const heroFooter = (slug: string, hero: Partial<Block>, footerTagline: string): Block[] => [
  {
    id: `${slug}-hero`,
    type: 'hero',
    order: 0,
    eyebrow: '',
    ctaLink: '#contact',
    ...hero,
  },
  // (other blocks inserted between, see per-prospect below)
];

const footerBlock = (slug: string, tagline: string, order: number): Block => ({
  id: `${slug}-footer`,
  type: 'site-footer',
  order,
  tagline,
  backgroundColor: '#111',
  textColor: 'rgba(255,255,255,0.7)',
  accentColor: '#fff',
  linkGroups: [
    {
      label: 'Studio',
      links: [
        { label: 'Projects', href: '#projects' },
        { label: 'About', href: '#about' },
        { label: 'Contact', href: '#contact' },
      ],
    },
  ],
});

const PROSPECTS: Prospect[] = [
  {
    slug: 'prospect-gramercy-design',
    name: 'Gramercy Design (demo)',
    password: '3e41bdf8',
    blocks: [
      {
        id: 'pgd-hero',
        type: 'hero',
        order: 0,
        title: 'Gramercy Design',
        subtitle: 'A boutique design studio based in New York City',
        eyebrow: 'EST. 2015',
        description: 'Founded by Kyle O’Donnell, the firm provides full-scale interior design and design-and-build furniture services.',
        ctaText: 'View Projects',
        ctaLink: '#projects',
      },
      {
        id: 'pgd-h2',
        type: 'heading',
        order: 1,
        level: 2,
        text: 'Selected Projects',
      },
      {
        id: 'pgd-cards',
        type: 'card-grid',
        order: 2,
        columns: 3,
        cards: [
          { id: 'pgd-c1', title: 'UWS Classic Six', description: 'Upper West Side prewar.', icon: 'home_work' },
          { id: 'pgd-c2', title: 'Manhattan Pied-A-Terre', description: 'Compact city retreat.', icon: 'apartment' },
          { id: 'pgd-c3', title: 'NoHo Loft', description: 'Open-plan downtown loft.', icon: 'view_compact' },
        ],
      },
      {
        id: 'pgd-cta',
        type: 'cta',
        order: 3,
        title: 'Start a project',
        description: 'Reach out to discuss new builds, full renovations, and custom furniture commissions.',
        ctaText: 'Inquire',
        ctaLink: 'mailto:info@gramercy.design',
      },
      footerBlock('pgd', 'Gramercy Design — boutique residential interiors, NYC.', 4),
    ],
  },
  {
    slug: 'prospect-beyond-modern',
    name: 'Beyond Modern Interiors (demo)',
    password: 'a4076827',
    blocks: [
      {
        id: 'pbm-hero',
        type: 'hero',
        order: 0,
        title: 'Beyond Modern Interiors',
        subtitle: 'Full-service luxury interior design & turnkey renovations',
        eyebrow: 'NEW YORK',
        description: 'Roni Rivlin’s studio designs clean, layered interiors across Manhattan’s most distinctive addresses.',
        ctaText: 'Request a Private Design Consultation',
        ctaLink: 'mailto:info@bmihomestyling.com',
      },
      {
        id: 'pbm-h2',
        type: 'heading',
        order: 1,
        level: 2,
        text: 'Recent Work',
      },
      {
        id: 'pbm-cards',
        type: 'card-grid',
        order: 2,
        columns: 4,
        cards: [
          { id: 'pbm-c1', title: 'Billionaire’s Row', description: 'Midtown supertall residence.', icon: 'apartment' },
          { id: 'pbm-c2', title: 'Hudson Yards', description: 'West Side tower interiors.', icon: 'location_city' },
          { id: 'pbm-c3', title: 'Fifth Avenue Penthouse', description: 'Park-side full-floor home.', icon: 'park' },
          { id: 'pbm-c4', title: 'Westhampton', description: 'East End coastal residence.', icon: 'beach_access' },
        ],
      },
      {
        id: 'pbm-services',
        type: 'services-grid',
        order: 3,
        services: [
          { id: 'pbm-s1', title: 'Full Interior Design', description: 'Concept through installation.', icon: 'design_services' },
          { id: 'pbm-s2', title: 'Turnkey Renovations', description: 'Single point of accountability.', icon: 'construction' },
          { id: 'pbm-s3', title: 'Custom Furnishings', description: 'Bespoke pieces by hand.', icon: 'chair' },
        ],
      },
      footerBlock('pbm', 'Beyond Modern Interiors — luxury residential design, NYC.', 4),
    ],
  },
  {
    slug: 'prospect-storm-interiors',
    name: 'Storm Interiors (demo)',
    password: 'd23697b3',
    blocks: [
      {
        id: 'psi-hero',
        type: 'hero',
        order: 0,
        title: 'Storm Interiors',
        subtitle: 'Tailored interiors that tell your story',
        eyebrow: 'LOS ANGELES',
        description: 'Your lifestyle and legacy, translated into spaces that feel unmistakably yours. Founded by Lara Sachs-Fishman in 2000.',
        ctaText: 'Inquire',
        ctaLink: 'mailto:info@storminteriors.com',
      },
      {
        id: 'psi-services',
        type: 'services-grid',
        order: 1,
        services: [
          { id: 'psi-s1', title: 'Residential Design', description: 'Primary and secondary residences.', icon: 'home' },
          { id: 'psi-s2', title: 'Hospitality', description: 'Hotels, restaurants, members’ clubs.', icon: 'hotel' },
          { id: 'psi-s3', title: 'Commercial', description: 'Studios, offices, retail.', icon: 'storefront' },
          { id: 'psi-s4', title: 'Art Commissions', description: 'Curated and commissioned art.', icon: 'palette' },
        ],
      },
      {
        id: 'psi-quote',
        type: 'quote',
        order: 2,
        content: 'Lara has a rare ability to translate how a family actually lives into a space that feels both refined and entirely theirs.',
        author: 'Private Residence Client',
      },
      {
        id: 'psi-cta',
        type: 'cta',
        order: 3,
        title: 'Let’s bring your story to life.',
        description: 'New project inquiries: info@storminteriors.com.',
        ctaText: 'Inquire Now',
        ctaLink: 'mailto:info@storminteriors.com',
      },
      footerBlock('psi', 'Storm Interiors — tailored residential, hospitality, and commercial design.', 4),
    ],
  },
  {
    slug: 'prospect-lark-interiors',
    name: 'Lark Interiors (demo)',
    password: 'f9460c7e',
    blocks: [
      {
        id: 'pli-hero',
        type: 'hero',
        order: 0,
        title: 'Lark Interiors',
        subtitle: 'A Dallas-based interior design studio creating livable luxury',
        eyebrow: 'DALLAS, TEXAS',
        description: 'Sticky fingers and muddy paws welcome. We create spaces uniquely suited to the way you live.',
        ctaText: 'View Our Work',
        ctaLink: '#projects',
      },
      {
        id: 'pli-services',
        type: 'services-grid',
        order: 1,
        services: [
          { id: 'pli-s1', title: 'New Home Construction', description: 'From plans to move-in.', icon: 'foundation' },
          { id: 'pli-s2', title: 'Home Renovation', description: 'Full-house remodels.', icon: 'home_repair_service' },
          { id: 'pli-s3', title: 'Interior Design', description: 'Furnishings + finishes.', icon: 'design_services' },
          { id: 'pli-s4', title: 'Kitchen Remodels', description: 'The room people live in.', icon: 'kitchen' },
        ],
      },
      {
        id: 'pli-h2',
        type: 'heading',
        order: 2,
        level: 2,
        text: 'What clients say',
      },
      {
        id: 'pli-quote',
        type: 'quote',
        order: 3,
        content: 'Janelle made the renovation actually fun. The house feels like ours, just better.',
        author: '5-star client review',
      },
      footerBlock('pli', 'Lark Interiors — livable luxury, Dallas, TX.', 4),
    ],
  },
  {
    slug: 'prospect-cortney-bishop',
    name: 'Cortney Bishop Design (demo)',
    password: '70609d7a',
    blocks: [
      {
        id: 'pcb-hero',
        type: 'hero',
        order: 0,
        title: 'Cortney Bishop Design',
        subtitle: 'Welcome home',
        eyebrow: 'CHARLESTON, SC',
        description: 'New build or styling, residential or commercial, collected or modern — let’s talk.',
        ctaText: 'Design Inquiry',
        ctaLink: 'mailto:info@cortneybishop.com',
      },
      {
        id: 'pcb-h2',
        type: 'heading',
        order: 1,
        level: 2,
        text: 'Selected residential work',
      },
      {
        id: 'pcb-cards',
        type: 'card-grid',
        order: 2,
        columns: 4,
        cards: [
          { id: 'pcb-c1', title: 'Modern Fairytale', description: 'Storybook reimagined.', icon: 'castle' },
          { id: 'pcb-c2', title: 'Swordgate House', description: 'Historic Charleston restoration.', icon: 'home' },
          { id: 'pcb-c3', title: 'The Ryder Hotel', description: 'Boutique downtown hospitality.', icon: 'hotel' },
          { id: 'pcb-c4', title: 'Flats at Mixson', description: 'Multifamily lifestyle development.', icon: 'apartment' },
        ],
      },
      {
        id: 'pcb-quote',
        type: 'quote',
        order: 3,
        content: 'Creativity and risk-taking are the engines of every project. Intuition is the navigator.',
        author: 'Cortney Bishop',
      },
      footerBlock('pcb', 'Cortney Bishop Design — residential, commercial, hospitality.', 4),
    ],
  },
];

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows: clientRows } = await client.query(`SELECT id, company FROM clients WHERE id = 1`);
    if (clientRows.length === 0) throw new Error('Client id=1 (Simpler Development) not found in this DB');
    console.log(`Target client: ${clientRows[0].id} (${clientRows[0].company})`);

    await client.query('BEGIN');

    for (const p of PROSPECTS) {
      const existing = await client.query(
        `SELECT id FROM client_websites WHERE client_id = 1 AND subdomain = $1`,
        [p.slug],
      );
      if (existing.rows.length > 0) {
        console.log(`SKIP ${p.slug} (already exists as website_id=${existing.rows[0].id})`);
        continue;
      }

      const ws = await client.query(
        `INSERT INTO client_websites
          (client_id, name, subdomain, domain, public_access, custom_js, active, deployment_status, custom_layout, created_at, updated_at)
         VALUES (1, $1, $2, $3, false, $4, true, 'demo', false, now(), now())
         RETURNING id`,
        [
          p.name,
          p.slug,
          `${p.slug}.simplerdevelopment.com`,
          PASSWORD_GATE_JS(p.password),
        ],
      );
      const websiteId = ws.rows[0].id;

      const content = JSON.stringify({ blocks: p.blocks });
      await client.query(
        `INSERT INTO posts
          (website_id, title, slug, post_type, content, published, published_at, created_at, updated_at, no_index)
         VALUES ($1, $2, 'home', 'page', $3, true, now(), now(), now(), true)`,
        [websiteId, p.name, content],
      );

      console.log(`✓ ${p.slug} → website_id=${websiteId}, blocks=${p.blocks.length}`);
    }

    await client.query('COMMIT');
    console.log('\nAll inserts committed.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK due to error:', e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
