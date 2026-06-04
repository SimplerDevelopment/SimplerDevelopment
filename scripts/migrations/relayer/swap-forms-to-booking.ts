/**
 * Replace the html-render briefing FORMS on the Relayer home + contact pages with a `booking`
 * block that embeds the /book/relayer-demo booking page. Self-contained + idempotent.
 *   npx tsx scripts/migrations/relayer/swap-forms-to-booking.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
if (process.env.RL_DATABASE_URL) process.env.DATABASE_URL = process.env.RL_DATABASE_URL;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PROD = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
if ((PROD.some((p) => DATABASE_URL.includes(p)) || process.env.RAILWAY_ENVIRONMENT_NAME === 'production') && process.env.ALLOW_PROD !== '1') {
  console.error('REFUSING: DATABASE_URL points at a production host.'); process.exit(1);
}

const WEBSITE_ID = parseInt(process.env.RL_WEBSITE_ID || '447', 10);
const BOOKING_SLUG = 'relayer-demo';
const FORM_IDS = new Set(['brief-form', 'contact-form']);

type Block = { id?: string; type?: string; html?: string; blocks?: Block[]; columns?: Array<{ blocks?: Block[] }> } & Record<string, unknown>;

function bookingBlock(id: string, order: number): Block {
  return {
    id, type: 'booking', order, slug: BOOKING_SLUG,
    showPageTitle: false, showDescription: false, showSteps: true, showLogo: false,
    styleOverrides: {
      primaryColor: '#032916', backgroundColor: '#FFFFFF', textColor: '#032916',
      formBg: '#FFFFFF', inputBg: '#FBFAF8', headingFont: 'Space Grotesk', bodyFont: 'Hanken Grotesk',
      buttonBg: '#23EE92', buttonText: '#032916', buttonBorderRadius: '52px', borderRadius: '16px',
    },
  };
}

/** Returns count of forms replaced. Recurses through section.blocks and columns[].blocks. */
function replaceForms(blocks: Block[] | undefined): number {
  if (!Array.isArray(blocks)) return 0;
  let n = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const isForm = b && b.type === 'html-render' &&
      ((b.id && FORM_IDS.has(b.id)) || (typeof b.html === 'string' && b.html.includes('Organization Type')));
    if (isForm) {
      blocks[i] = bookingBlock((b.id as string) || `booking-${i}`, (b as { order?: number }).order ?? i);
      n++;
      continue;
    }
    if (b?.blocks) n += replaceForms(b.blocks);
    if (Array.isArray(b?.columns)) for (const col of b.columns) n += replaceForms(col.blocks);
  }
  return n;
}

async function run() {
  const { db } = await import('../../../lib/db');
  const { eq, and, inArray } = await import('drizzle-orm');
  const { posts } = await import('../../../lib/db/schema');

  const rows = await db.select().from(posts).where(and(eq(posts.websiteId, WEBSITE_ID), inArray(posts.slug, ['home', 'contact'])));
  for (const row of rows) {
    const data = JSON.parse(row.content) as { blocks: Block[]; version?: string };
    const replaced = replaceForms(data.blocks);
    if (replaced > 0) {
      await db.update(posts).set({ content: JSON.stringify(data), updatedAt: new Date() }).where(eq(posts.id, row.id));
    }
    console.log(`[swap] ${row.slug} (id=${row.id}) — ${replaced} form block(s) → booking`);
  }
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
