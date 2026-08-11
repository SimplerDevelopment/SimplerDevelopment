/**
 * Fills the domains that no other seeder covers, so the /solutions marketing
 * gallery has something real to photograph.
 *
 * The 2026-08-07 gallery audit found 21 of 64 live screenshots were empty
 * states. Chaining seed-dev → seed-demo-showcase → seed-brain-demo →
 * seed-project-demo still leaves these eight tables at zero rows, which is
 * exactly why hosting, publishing, ai-chatbot, automations, ecommerce, websites
 * and the brain org-chart/playbooks screens shipped blank:
 *
 *   client_websites · products · hosted_sites · chat_widgets
 *   workflows · publishing_campaigns · brain_org_units · brain_playbooks
 *
 * Run after the other seeders:
 *   bun scripts/seed-screenshot-gaps.ts [clientId=1]
 *
 * Idempotent: every insert is ON CONFLICT DO NOTHING against a stable natural
 * key, so re-running never duplicates. Content is Northwind Coffee Co. to match
 * the existing demo seeds — no real client data.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  const CLIENT_ID = Number(process.argv[2] || 1);
  const done: string[] = [];

  // db.execute returns an array on postgres.js and { rows } on node-postgres.
  const rowsOf = (r: unknown): Record<string, unknown>[] =>
    Array.isArray(r) ? (r as Record<string, unknown>[]) : ((r as { rows?: Record<string, unknown>[] })?.rows ?? []);

  const hasProducts = async (): Promise<boolean> => {
    const r = await db.execute(sql.raw('SELECT count(*)::int AS n FROM products'));
    return Number(rowsOf(r)[0]?.n ?? 0) > 0;
  };

  const count = async (table: string): Promise<number> => {
    const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE client_id = ${CLIENT_ID}`));
    return Number(rowsOf(r)[0]?.n ?? 0);
  };

  // These tables have no unique constraint on their natural key, so
  // `ON CONFLICT DO NOTHING` does NOT make an insert idempotent — a re-run (or
  // a run that died partway) silently duplicates every row. Duplicated seed
  // rows are exactly what put five identical companies in the CRM screenshot.
  // Each section below is therefore guarded on its own table being empty:
  // re-running is a no-op, and a partial run resumes where it stopped.
  const empty = async (table: string) => (await count(table)) === 0;

  /* ── websites ─────────────────────────────────────────────────────────── */
  if (await empty('client_websites')) await db.execute(sql`
    INSERT INTO client_websites (client_id, name, subdomain, domain, description, active, public_access)
    VALUES
      (${CLIENT_ID}, 'Northwind Coffee Co.', 'northwindcoffee', 'northwindcoffee.com',
       'Artisan coffee roastery serving the Pacific Northwest since 2018.', true, true),
      (${CLIENT_ID}, 'Aurora Studio', 'aurorastudio', NULL,
       'Creative design studio specializing in brand identity and digital experiences.', true, true),
      (${CLIENT_ID}, 'Harbor & Vine Restaurant', 'harborandvine', NULL,
       'Farm-to-table restaurant and wine bar in downtown Portland.', true, true),
      (${CLIENT_ID}, 'Meridian Law Group', 'meridianlaw', NULL,
       'Full-service law firm focused on business law and estate planning.', true, true)
    ON CONFLICT DO NOTHING
  `);
  done.push(`client_websites=${await count('client_websites')}`);

  const siteRow = await db.execute(sql`
    SELECT id FROM client_websites WHERE client_id = ${CLIENT_ID} AND subdomain = 'northwindcoffee' LIMIT 1
  `);
  const siteId = Number(rowsOf(siteRow)[0]?.id);
  if (!siteId) throw new Error('could not resolve the Northwind site id');

  /* ── store ────────────────────────────────────────────────────────────── */
  // price is INTEGER CENTS. Seeding dollars here is what makes a storefront
  // read "$24.00" as "$0.24" — keep these in cents.
  if (!(await hasProducts())) await db.execute(sql`
    INSERT INTO products (website_id, name, slug, short_description, description, price, compare_at_price, cost_price, sku, track_inventory, quantity, status, featured)
    VALUES
      (${siteId}, 'Cold Brew Concentrate', 'cold-brew-concentrate',
       'Smooth, low-acid cold brew ready in minutes. 2x concentrate — just add water or milk.',
       'Rich, smooth cold brew concentrate made from single-origin beans. Makes 8 servings.',
       2400, 3200, 800, 'CBC-12OZ-001', true, 240, 'active', true),
      (${siteId}, 'Ethiopian Yirgacheffe Whole Bean', 'ethiopian-yirgacheffe',
       'Bright and floral with notes of bergamot and stone fruit.',
       'Single-origin Ethiopian Yirgacheffe, light roast, roasted to order.',
       1900, NULL, 700, 'ETH-12OZ-002', true, 180, 'active', true),
      (${siteId}, 'Ceramic Pour-Over Kit', 'ceramic-pour-over-kit',
       'Everything you need for a perfect pour-over, in matte stoneware.',
       'Handmade ceramic dripper, carafe and reusable steel filter.',
       6800, 7900, 3100, 'POK-KIT-003', true, 64, 'active', false),
      (${siteId}, 'Monthly Coffee Subscription', 'monthly-coffee-subscription',
       'A new single-origin bag on your doorstep every month. Cancel anytime.',
       'Rotating single-origin selection, roasted and shipped within 24 hours.',
       2200, NULL, 900, 'SUB-MONTH-004', false, 0, 'active', true)
    ON CONFLICT DO NOTHING
  `);
  const prodCount = await db.execute(sql`SELECT count(*)::int AS n FROM products WHERE website_id = ${siteId}`);
  done.push(`products=${Number(rowsOf(prodCount)[0]?.n ?? 0)}`);

  /* ── hosting ──────────────────────────────────────────────────────────── */
  if (await empty('hosted_sites')) await db.execute(sql`
    INSERT INTO hosted_sites (client_id, name, custom_domain, railway_domain, status, plan, renewal_date, notes)
    VALUES
      (${CLIENT_ID}, 'Northwind Coffee Co. — Production', 'northwindcoffee.com',
       'northwind-prod.up.railway.app', 'active', 'business', now() + interval '9 months',
       'Managed production environment. Nightly backups, TLS auto-renew.'),
      (${CLIENT_ID}, 'Northwind Coffee Co. — Staging', 'staging.northwindcoffee.com',
       'northwind-staging.up.railway.app', 'active', 'starter', now() + interval '9 months',
       'Preview environment mirroring production for release checks.')
    ON CONFLICT DO NOTHING
  `);
  done.push(`hosted_sites=${await count('hosted_sites')}`);

  /* ── chat widget ──────────────────────────────────────────────────────── */
  if (await empty('chat_widgets')) await db.execute(sql`
    INSERT INTO chat_widgets (client_id, site_id, enabled, greeting_message, away_message, position, primary_color, brain_enabled)
    VALUES (${CLIENT_ID}, ${siteId}, true,
      'Hi there! Questions about our roasts or your order? Ask away.',
      'We''re offline right now — leave a note and we''ll reply first thing tomorrow.',
      'bottom-right', '#2563eb', true)
    ON CONFLICT DO NOTHING
  `);
  done.push(`chat_widgets=${await count('chat_widgets')}`);

  /* ── automations / workflows ──────────────────────────────────────────── */
  const graph = (nodes: unknown) => JSON.stringify(nodes);
  if (await empty('workflows')) await db.execute(sql`
    INSERT INTO workflows (client_id, name, description, status, trigger, graph, created_by)
    VALUES
      (${CLIENT_ID}, 'Abandoned cart recovery',
       'Wait an hour after a cart is abandoned, then send a reminder with a 10% code.',
       'active',
       ${sql.raw(`'${JSON.stringify({ kind: 'event', event: 'store.cart.abandoned' })}'::json`)},
       ${sql.raw(`'${graph({
         nodes: [
           { id: 'n1', type: 'trigger', label: 'Cart abandoned', x: 80, y: 120 },
           { id: 'n2', type: 'delay', label: 'Wait 1 hour', x: 320, y: 120 },
           { id: 'n3', type: 'condition', label: 'Still unpurchased?', x: 560, y: 120 },
           { id: 'n4', type: 'action', label: 'Send reminder email', x: 820, y: 60 },
           { id: 'n5', type: 'action', label: 'Tag contact "recovered"', x: 820, y: 200 },
         ],
         edges: [
           { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' },
           { from: 'n3', to: 'n4', label: 'yes' }, { from: 'n3', to: 'n5', label: 'no' },
         ],
       })}'::json`)},
       1),
      (${CLIENT_ID}, 'New wholesale lead routing',
       'Route inbound wholesale enquiries to the right rep and open a deal.',
       'active',
       ${sql.raw(`'${JSON.stringify({ kind: 'event', event: 'crm.contact.created' })}'::json`)},
       ${sql.raw(`'${graph({
         nodes: [
           { id: 'm1', type: 'trigger', label: 'Contact created', x: 80, y: 140 },
           { id: 'm2', type: 'condition', label: 'Source = wholesale form', x: 340, y: 140 },
           { id: 'm3', type: 'action', label: 'Create deal', x: 620, y: 80 },
           { id: 'm4', type: 'action', label: 'Notify #sales', x: 620, y: 220 },
         ],
         edges: [{ from: 'm1', to: 'm2' }, { from: 'm2', to: 'm3' }, { from: 'm3', to: 'm4' }],
       })}'::json`)},
       1)
    ON CONFLICT DO NOTHING
  `);
  done.push(`workflows=${await count('workflows')}`);

  /* ── publishing campaigns ─────────────────────────────────────────────── */
  if (await empty('publishing_campaigns')) await db.execute(sql`
    INSERT INTO publishing_campaigns (client_id, name, slug, description, color, start_date, end_date, status, created_by)
    VALUES
      (${CLIENT_ID}, 'Fall Harvest Launch', 'fall-harvest-launch',
       'Single-origin fall lineup across web, email and social.', '#b45309',
       now() - interval '10 days', now() + interval '20 days', 'active', 1),
      (${CLIENT_ID}, 'Wholesale Partner Push', 'wholesale-partner-push',
       'Outbound sequence and landing page for cafe and hospitality accounts.', '#2563eb',
       now() - interval '3 days', now() + interval '38 days', 'active', 1),
      (${CLIENT_ID}, 'Holiday Gift Guide', 'holiday-gift-guide',
       'Gift bundles, subscription promo and the December newsletter.', '#15803d',
       now() + interval '30 days', now() + interval '80 days', 'planned', 1)
    ON CONFLICT DO NOTHING
  `);
  done.push(`publishing_campaigns=${await count('publishing_campaigns')}`);

  /* ── brain org chart ──────────────────────────────────────────────────── */
  if (await empty('brain_org_units')) await db.execute(sql`
    INSERT INTO brain_org_units (client_id, parent_id, name, slug, path, description, lead_person_id, color, sort_order, created_by)
    VALUES (${CLIENT_ID}, NULL, 'Northwind Coffee Co.', 'northwind', 'northwind',
            'Everything under one roof.', 1, '#1f2937', 0, 1)
    ON CONFLICT DO NOTHING
  `);
  const rootRow = await db.execute(sql`
    SELECT id FROM brain_org_units WHERE client_id = ${CLIENT_ID} AND slug = 'northwind' LIMIT 1
  `);
  const rootId = Number(rowsOf(rootRow)[0]?.id);
  if ((await count('brain_org_units')) < 2) await db.execute(sql`
    INSERT INTO brain_org_units (client_id, parent_id, name, slug, path, description, lead_person_id, color, sort_order, created_by)
    VALUES
      (${CLIENT_ID}, ${rootId}, 'Roasting & Production', 'roasting', ${'northwind/roasting'},
       'Green sourcing, roast profiles, packaging and fulfilment.', 2, '#b45309', 1, 1),
      (${CLIENT_ID}, ${rootId}, 'Retail & Wholesale', 'retail', ${'northwind/retail'},
       'Cafe operations plus wholesale accounts.', 3, '#2563eb', 2, 1),
      (${CLIENT_ID}, ${rootId}, 'Marketing & Brand', 'marketing', ${'northwind/marketing'},
       'Brand, content, lifecycle email and the web storefront.', 4, '#15803d', 3, 1)
    ON CONFLICT DO NOTHING
  `);
  done.push(`brain_org_units=${await count('brain_org_units')}`);

  /* ── brain playbooks ──────────────────────────────────────────────────── */
  if (await empty('brain_playbooks')) await db.execute(sql`
    INSERT INTO brain_playbooks (client_id, name, slug, description, status, trigger_kind, category, owner_id, source, created_by)
    VALUES
      (${CLIENT_ID}, 'New wholesale account onboarding', 'wholesale-onboarding',
       'From signed agreement to first delivery — nine steps across sales, roasting and finance.',
       'active', 'event', 'Sales', 2, 'manual', 1),
      (${CLIENT_ID}, 'Quarterly roast profile review', 'roast-profile-review',
       'Cup the current lineup, log tasting notes, retire or re-profile underperformers.',
       'active', 'scheduled', 'Operations', 1, 'manual', 1),
      (${CLIENT_ID}, 'Storefront incident response', 'storefront-incident',
       'Checkout is down: triage, comms, rollback and the post-incident writeup.',
       'active', 'manual', 'Engineering', 2, 'manual', 1)
    ON CONFLICT DO NOTHING
  `);
  done.push(`brain_playbooks=${await count('brain_playbooks')}`);

  /* ── automation rules (the /portal/automations list) ──────────────────── */
  // actions[].tool is load-bearing: the rules list renders formatToolName(action.tool),
  // which has no null guard — an action shaped {type:...} crashes the whole page.
  await (async () => {
    if (!(await empty('automation_rules'))) { done.push(`automation_rules=${await count('automation_rules')}(kept)`); return; }
    await db.execute(sql`
      INSERT INTO automation_rules (client_id, name, description, trigger, actions, enabled, source, product_scope, execution_count, created_by)
      VALUES
        (${CLIENT_ID}, 'Welcome email on signup',
         'Send the welcome sequence when a new contact is created from a web form.',
         ${sql.raw(`'${JSON.stringify({ event: 'crm.contact.created' })}'::json`)},
         ${sql.raw(`'${JSON.stringify([{ tool: 'send_email', template: 'welcome' }])}'::json`)},
         true, 'manual', 'crm', 128, 1),
        (${CLIENT_ID}, 'Route wholesale enquiries',
         'Assign inbound wholesale leads to the retail team and open a deal.',
         ${sql.raw(`'${JSON.stringify({ event: 'crm.contact.created' })}'::json`)},
         ${sql.raw(`'${JSON.stringify([{ tool: 'assign_owner' }, { tool: 'create_deal' }])}'::json`)},
         true, 'manual', 'crm', 41, 1),
        (${CLIENT_ID}, 'Low stock alert',
         'Notify the roastery when any product drops below 50 units.',
         ${sql.raw(`'${JSON.stringify({ event: 'store.inventory.low' })}'::json`)},
         ${sql.raw(`'${JSON.stringify([{ tool: 'send_notification' }])}'::json`)},
         true, 'manual', 'store', 17, 1),
        (${CLIENT_ID}, 'Post-booking follow-up',
         'Email a recap and a feedback survey 24 hours after a booking completes.',
         ${sql.raw(`'${JSON.stringify({ event: 'booking.completed' })}'::json`)},
         ${sql.raw(`'${JSON.stringify([{ tool: 'send_email', delay: 86400 }])}'::json`)},
         false, 'manual', 'bookings', 9, 1)
    `);
    done.push(`automation_rules=${await count('automation_rules')}`);
  })();

  /* ── proposals ────────────────────────────────────────────────────────── */
  // line_items use the canonical `quantity` field (NOT the legacy `qty` the
  // portal editor used to write) — a proposal seeded with `qty` renders $NaN.
  await (async () => {
    if (!(await empty('crm_proposals'))) { done.push(`crm_proposals=${await count('crm_proposals')}(kept)`); return; }
    const items = (rows: [string, number, number][]) =>
      JSON.stringify(rows.map(([description, quantity, unitPrice], i) => ({
        id: `li-${i + 1}`, description, quantity, unitPrice, optional: false,
      })));
    await db.execute(sql`
      INSERT INTO crm_proposals (client_id, contact_id, title, summary, status, sections, line_items, fees, currency, client_token, accent_color, sent_at, view_count, created_at)
      VALUES
        (${CLIENT_ID}, 1, 'Wholesale Programme — Sunrise Family Office',
         'Quarterly bean supply, branded packaging and staff training for four offices.',
         'sent',
         ${sql.raw(`'${JSON.stringify([{ id: 's1', type: 'heading', content: 'Scope of work' }, { id: 's2', type: 'text', content: 'A standing quarterly supply of two single-origin roasts, co-branded packaging, and a half-day barista training for each office.' }])}'::json`)},
         ${sql.raw(`'${items([['Single-origin beans — quarterly supply', 4, 185000], ['Co-branded packaging setup', 1, 240000], ['Barista training (half day, per office)', 4, 95000]])}'::json`)},
         ${sql.raw(`'${JSON.stringify([])}'::json`)},
         'USD', 'tok-wholesale-sunrise', '#b45309', now() - interval '6 days', 4, now() - interval '8 days'),
        (${CLIENT_ID}, 2, 'Cafe Fit-Out — Acme Wealth Partners',
         'Espresso bar build-out, equipment and a twelve-month service plan.',
         'sent',
         ${sql.raw(`'${JSON.stringify([{ id: 's1', type: 'heading', content: 'Proposal' }, { id: 's2', type: 'text', content: 'Turn-key espresso bar for the ninth-floor client lounge, including equipment, install and ongoing servicing.' }])}'::json`)},
         ${sql.raw(`'${items([['La Marzocco Linea Mini + grinder', 1, 890000], ['Bar joinery and install', 1, 460000], ['12-month service plan', 1, 180000]])}'::json`)},
         ${sql.raw(`'${JSON.stringify([])}'::json`)},
         'USD', 'tok-fitout-acme', '#2563eb', now() - interval '2 days', 2, now() - interval '3 days'),
        (${CLIENT_ID}, 3, 'Subscription Pilot — Meridian Law Group',
         'Three-month office subscription pilot with monthly rotating origins.',
         'draft',
         ${sql.raw(`'${JSON.stringify([{ id: 's1', type: 'heading', content: 'Pilot terms' }, { id: 's2', type: 'text', content: 'Three months of rotating single-origin deliveries, cancel any time after month one.' }])}'::json`)},
         ${sql.raw(`'${items([['Monthly office subscription (3 months)', 3, 220000], ['Onboarding tasting session', 1, 75000]])}'::json`)},
         ${sql.raw(`'${JSON.stringify([])}'::json`)},
         'USD', 'tok-pilot-meridian', '#15803d', NULL, 0, now() - interval '1 day')
    `);
    done.push(`crm_proposals=${await count('crm_proposals')}`);
  })();

  /* ── pitch decks ──────────────────────────────────────────────────────── */
  await (async () => {
    if (!(await empty('pitch_decks'))) { done.push(`pitch_decks=${await count('pitch_decks')}(kept)`); return; }
    const slides = (titles: string[]) =>
      JSON.stringify(titles.map((t, i) => ({
        id: `sl-${i + 1}`, label: t,
        blocks: [{ type: 'heading', text: t }, { type: 'text', text: 'Northwind Coffee Co.' }],
      })));
    await db.execute(sql`
      INSERT INTO pitch_decks (client_id, title, slug, description, status, slides, format_version, created_by)
      VALUES
        (${CLIENT_ID}, 'Wholesale Partner Deck', 'wholesale-partner-deck',
         'What partnering with Northwind looks like for cafes and hospitality accounts.',
         'published',
         ${sql.raw(`'${slides(['Who we are', 'Our roasts', 'Wholesale pricing', 'Delivery & service', 'Getting started'])}'::json`)}, 2, 1),
        (${CLIENT_ID}, 'Investor Update — Q3 2026', 'investor-update-q3-2026',
         'Quarterly trading update, subscription growth and the roastery expansion.',
         'published',
         ${sql.raw(`'${slides(['Highlights', 'Revenue', 'Subscription growth', 'Roastery expansion', 'Outlook'])}'::json`)}, 2, 1),
        (${CLIENT_ID}, 'Brand Story — Origins', 'brand-story-origins',
         'Founding story, sourcing philosophy and sustainability commitments.',
         'draft',
         ${sql.raw(`'${slides(['Origins', 'Sourcing', 'The roast', 'Sustainability'])}'::json`)}, 2, 1)
    `);
    done.push(`pitch_decks=${await count('pitch_decks')}`);
  })();

  /* ── A/B experiments (target a real post) ─────────────────────────────── */
  await (async () => {
    const r0 = await db.execute(sql.raw('SELECT count(*)::int AS n FROM ab_experiments'));
    if (Number(rowsOf(r0)[0]?.n ?? 0) > 0) { done.push('ab_experiments=kept'); return; }
    await db.execute(sql`
      INSERT INTO posts (title, slug, post_type, excerpt, content, published, published_at, website_id)
      VALUES ('Exceptional Coffee, Delivered Fresh', 'home', 'page',
        'Single-origin beans roasted to order and shipped within 24 hours.',
        'At Northwind Coffee Co. we work directly with farmers in Ethiopia, Colombia and Guatemala.',
        true, now() - interval '30 days', ${siteId})
      ON CONFLICT DO NOTHING
    `);
    const postRow = await db.execute(sql`SELECT id FROM posts WHERE website_id = ${siteId} ORDER BY id LIMIT 1`);
    const postId = Number(rowsOf(postRow)[0]?.id);
    if (!postId) { done.push('ab_experiments=skipped(no post)'); return; }
    await db.execute(sql`
      INSERT INTO ab_experiments (target_type, target_id, post_id, name, hypothesis, status, variant_split, goal_metric, started_at, ended_at, created_by)
      VALUES
        ('post', ${postId}, ${postId}, 'Homepage hero — action-first vs value-first',
         'Leading with "Shop the roast" converts better than leading with the sourcing story.',
         'running', ${sql.raw(`'${JSON.stringify({ a: 50, b: 50 })}'::json`)}, 'click',
         now() - interval '11 days', NULL, 1),
        ('post', ${postId}, ${postId}, 'Free-shipping banner',
         'Surfacing the free-shipping threshold above the fold lifts add-to-cart.',
         'completed', ${sql.raw(`'${JSON.stringify({ a: 50, b: 50 })}'::json`)}, 'click',
         now() - interval '40 days', now() - interval '12 days', 1)
    `);
    const r1 = await db.execute(sql.raw('SELECT count(*)::int AS n FROM ab_experiments'));
    done.push(`ab_experiments=${Number(rowsOf(r1)[0]?.n ?? 0)}`);
  })();

  /* ── company coordinates (the CRM map panel) ──────────────────────────── */
  // CompanyMapImpl filters to companies with finite lat/lng and early-returns
  // when none qualify — so ungeocoded companies render a blank grey map panel
  // next to the cards, which is ~40% of the CRM screenshot.
  await db.execute(sql`
    UPDATE crm_companies SET latitude = 45.5152, longitude = -122.6784
    WHERE client_id = ${CLIENT_ID} AND latitude IS NULL AND id % 2 = 1
  `);
  await db.execute(sql`
    UPDATE crm_companies SET latitude = 47.6062, longitude = -122.3321
    WHERE client_id = ${CLIENT_ID} AND latitude IS NULL
  `);
  done.push('crm_companies.geocoded');

  console.log('SEEDED screenshot gaps →', done.join('  '));
  console.log(`site_id=${siteId} (use SITE_ID=${siteId} for the capture script)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
