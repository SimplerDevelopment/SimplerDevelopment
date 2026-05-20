/**
 * Manually-authored drop — bypasses the research + concept stages of the
 * autonomous pipeline. Inserts a brief + concept row with a hand-written
 * slogan + visual prompt, then runs the designer + publisher to produce
 * a sellable product.
 *
 * Used when we want to ship a specific shirt idea that the autonomous
 * researcher/concept-writer would not pick on its own — e.g. brand-signature
 * Trump-themed riffs, holiday drops, anniversary shirts.
 *
 *   bun scripts/magamommy/create-custom-drop.ts
 *   bun scripts/magamommy/create-custom-drop.ts --slogan="Make Bedtime Great Again" --prompt="..." --week=2026-06-02
 *
 * Defaults to the hard-coded "Make Bedtime Great Again." concept.
 *
 * Safe-by-default: refuses to run against known production DB proxies
 * unless ALLOW_PROD=1, same pattern as bootstrap-tenant.ts.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const PROD_INDICATORS = [
  'tramway.proxy.rlwy.net:43167',
  'metro.proxy.rlwy.net:25565',
];

function verifyDbTarget(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    console.error('[create-custom-drop] DATABASE_URL is not set.');
    process.exit(1);
  }
  const hitProd =
    PROD_INDICATORS.some((p) => url.includes(p)) ||
    process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
  const override = process.env.ALLOW_PROD === '1';
  const redacted = url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
  console.log(`[create-custom-drop] DATABASE_URL → ${redacted}`);
  if (hitProd && !override) {
    console.error('  REFUSING to run against production. Re-run with ALLOW_PROD=1 if intentional.');
    process.exit(1);
  }
}

interface Args {
  slogan: string;
  tagline: string;
  visualPrompt: string;
  style: 'bold' | 'satire' | 'classic';
  placement: 'front' | 'back';
  weekOf: Date;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit?.slice(`--${k}=`.length);
  };
  const today = new Date();
  // Default to next-month so it never collides with an autonomous weekly drop.
  const defaultWeek = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 2));

  return {
    slogan: get('slogan') ?? 'Make Bedtime Great Again.',
    tagline: get('tagline') ?? 'From the only First Lady that matters.',
    visualPrompt:
      get('prompt') ??
      'A cartoonish patriotic bald eagle wearing a frilly white sleeping cap, perched on a red-white-and-blue banner ribbon reading "MAGA", holding a tiny baby bottle in one talon, surrounded by stars, in a classic vintage Americana folk-art illustration style. Bold thick outlines, flat fill colors, no fine detail, no real people, no real-world brands.',
    style: (get('style') as Args['style']) ?? 'classic',
    placement: (get('placement') as Args['placement']) ?? 'front',
    weekOf: get('week') ? new Date(get('week') + 'T00:00:00Z') : defaultWeek,
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  verifyDbTarget();
  const args = parseArgs();
  console.log('[create-custom-drop] args:', { ...args, weekOf: ymd(args.weekOf) });

  const { db } = await import('../../lib/db');
  const {
    clientWebsites,
    magamommyBriefs,
    magamommyConcepts,
    magamommyDrops,
    products,
  } = await import('../../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');
  const { runWeeklyDrop } = await import('../../lib/magamommy/orchestrator');

  // ── Resolve Magamommy website + template product ─────────────────────────
  let [site] = await db
    .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
    .from(clientWebsites)
    .where(eq(clientWebsites.domain, 'magamommy.com'))
    .limit(1);
  if (!site) {
    [site] = await db
      .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
      .from(clientWebsites)
      .where(eq(clientWebsites.subdomain, 'magamommy'))
      .limit(1);
  }
  if (!site) {
    throw new Error('Magamommy site not found — run bootstrap-tenant.ts first.');
  }

  const [template] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.websiteId, site.id), eq(products.slug, 'heavyweight-tee-template')))
    .limit(1);
  if (!template) {
    throw new Error('Template product not found — run bootstrap-tenant.ts first.');
  }

  const weekStr = ymd(args.weekOf);
  console.log(`[create-custom-drop] target website=${site.id} weekOf=${weekStr} template=${template.id}`);

  // ── Refuse to clobber an existing drop for this week ─────────────────────
  const [existingDrop] = await db
    .select({ id: magamommyDrops.id, status: magamommyDrops.status })
    .from(magamommyDrops)
    .where(and(eq(magamommyDrops.websiteId, site.id), eq(magamommyDrops.weekOf, weekStr)))
    .limit(1);
  if (existingDrop) {
    throw new Error(
      `A drop already exists for ${weekStr} (id=${existingDrop.id}, status=${existingDrop.status}). ` +
        `Pick a different --week or delete the existing drop first.`,
    );
  }

  // ── Insert brief (placeholder — manual drops aren't research-driven) ─────
  const [brief] = await db
    .insert(magamommyBriefs)
    .values({
      websiteId: site.id,
      weekOf: weekStr,
      topics: [
        {
          slug: 'manual-drop',
          headline: `Manual Magamommy drop: ${args.slogan}`,
          context: 'Hand-authored brand drop, not derived from this week\'s news cycle.',
          sourceUrls: [],
        },
      ],
      rawModelResponse: '[manual-drop] no model call',
    })
    .returning({ id: magamommyBriefs.id });
  console.log(`[create-custom-drop] inserted brief id=${brief.id}`);

  // ── Insert concept ────────────────────────────────────────────────────────
  const [concept] = await db
    .insert(magamommyConcepts)
    .values({
      websiteId: site.id,
      briefId: brief.id,
      topicSlug: 'manual-drop',
      slogan: args.slogan,
      tagline: args.tagline,
      visualPrompt: args.visualPrompt,
      palette: [
        { name: 'flag-red', hex: '#BF0A30' },
        { name: 'navy', hex: '#002868' },
        { name: 'white', hex: '#FFFFFF' },
      ],
      placement: args.placement,
      style: args.style,
      alternatives: [],
    })
    .returning({ id: magamommyConcepts.id });
  console.log(`[create-custom-drop] inserted concept id=${concept.id} slogan="${args.slogan}"`);

  // ── Seed the drop row with brief+concept set; orchestrator's resume logic
  //    will pick up at designer (skips research + concept-writer). ──────────
  const [drop] = await db
    .insert(magamommyDrops)
    .values({
      websiteId: site.id,
      weekOf: weekStr,
      status: 'pending',
      briefId: brief.id,
      conceptId: concept.id,
    })
    .returning({ id: magamommyDrops.id });
  console.log(`[create-custom-drop] seeded drop id=${drop.id} week=${weekStr}`);

  // ── Run the orchestrator — it'll skip research/concept and just do design+publish.
  console.log('[create-custom-drop] running designer + publisher...');
  const result = await runWeeklyDrop({ websiteId: site.id, weekOf: args.weekOf });

  console.log('\n──── CUSTOM DROP RESULT ────');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'live') {
    console.error('[create-custom-drop] drop did not reach live status.');
    process.exit(1);
  }
  console.log(`\n✓ Live at: ${result.publicUrl}`);
  console.log('\nNext: re-run compose-storefront.ts --force to feature this drop on the home page.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[create-custom-drop] FAILED:', err);
  process.exit(1);
});
