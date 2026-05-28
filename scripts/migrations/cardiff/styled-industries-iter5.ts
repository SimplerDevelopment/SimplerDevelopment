/**
 * Iter 5: Industries hub (post id 818) — back up the "25+ industries"
 * trust-band claim by extending the `industries-strips` html-render block
 * from 3 rows (Trucking, Dental, Restaurants) to 10 rows covering the
 * most-funded verticals on cardiff.co: Auto Repair, Contracting,
 * Medical, Salon & Beauty, Retail, Manufacturing, Agriculture, plus
 * the original 3.
 *
 * Iters 1-4 produced: minimal hero -> 4-up trust band (icon + stat + label)
 * -> alternating industry strips. With only 3 strips, the "25+ industries
 * funded" tile read as hollow; the page also ended abruptly after
 * Restaurants. Adding 7 verticals (10 total) gives the hub credible
 * breadth and a longer scroll that matches the trust band's promise.
 *
 * Mutates ONLY the `values.rows` array on the `industries-strips` block;
 * the html, fields schema, and other blocks are untouched. The block
 * already uses `data-repeat="rows"` with `{{rows.field}}` placeholders,
 * so the renderer iterates the new rows with no markup changes.
 *
 * Idempotent: rewrites `values.rows` on every run to the canonical list
 * below, so re-running converges. URLs point at cardiff.co (the source
 * site) so the editor sees real link targets the client can later
 * re-point at internal industry pages once they exist in the port.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 818;
const STRIPS_BLOCK_ID = 'industries-strips';

type Row = { name: string; description: string; url: string };

const ROWS: Row[] = [
  {
    name: 'Trucking',
    description:
      "As one of the top 10 most funded industries at Cardiff, truck transportation loans average $65,000 in approved loan amounts. We know how hard it is for truck drivers to maintain their routes and balance the business side of their freight service.",
    url: 'https://cardiff.co/industries/trucking/',
  },
  {
    name: 'Auto Repair',
    description:
      "Auto repair shops live and die by the equipment on the floor. Cardiff funds lifts, diagnostic computers, alignment racks, and the bay buildouts that let you take on more cars per day — with same-day decisions so you can quote the customer before they walk.",
    url: 'https://cardiff.co/industries/auto-repair/',
  },
  {
    name: 'Contracting & Construction',
    description:
      "From general contractors to specialty trades, Cardiff finances skid steers, trailers, scaffolding, and crew expansion. Revenue-based options work around the seasonal cash-flow swings every contractor knows too well, so you can take the next bid without thinning your working capital.",
    url: 'https://cardiff.co/industries/contractors/',
  },
  {
    name: 'Dental Practice',
    description:
      "According to the Bureau of Labor Statistics, the average dentist earns more than $150,000 a year. It's a salary that will go far in most places, but it doesn't mean it will cover all of the costs of opening and running a practice. That's why more dentists and other health care professionals are turning to small business loans to fund their practices.",
    url: 'https://cardiff.co/industries/dental-practice/',
  },
  {
    name: 'Medical & Healthcare',
    description:
      "Independent physicians, urgent care, chiropractic, and specialty clinics use Cardiff to fund imaging equipment, EMR upgrades, and practice expansions. We evaluate the health of your practice — not just your personal credit — so you can keep investing in patient care without putting growth on hold.",
    url: 'https://cardiff.co/industries/medical/',
  },
  {
    name: 'Restaurants',
    description:
      "At Cardiff, restaurants are among our top 5 funded industries. Our average restaurant approval is $95,000. Rates and terms depend heavily on the budget, credit, revenue, and needs of the business owner.",
    url: 'https://cardiff.co/industries/restaurants/',
  },
  {
    name: 'Salon & Beauty',
    description:
      "Salons, barbershops, spas, and med-spa operators rely on Cardiff for chairs, equipment, buildouts, and the working capital to bring on new stylists. Flexible repayment fits the steady-but-cyclical revenue of an appointment-based business, so growth never starves the chairs you already have.",
    url: 'https://cardiff.co/industries/salons/',
  },
  {
    name: 'Retail',
    description:
      "Brick-and-mortar retailers use Cardiff to stock up before peak seasons, expand to a second location, or refresh fixtures and POS systems. Revenue-based lending evaluates your real cash flow, so a strong holiday or summer season translates directly into approval — even when traditional banks pass.",
    url: 'https://cardiff.co/industries/retail/',
  },
  {
    name: 'Manufacturing',
    description:
      "From CNC shops to small-batch producers, Cardiff finances the machinery, automation, and inventory that let manufacturers fill bigger purchase orders. Equipment financing structures payments around the asset's useful life, so the loan and the line make sense on the same balance sheet.",
    url: 'https://cardiff.co/industries/manufacturing/',
  },
  {
    name: 'Agriculture',
    description:
      "Farms, ranches, and ag-services operators rely on Cardiff for tractors, irrigation, livestock equipment, and the operating capital that bridges planting to harvest. Seasonal repayment options align with grow cycles so the loan works with the land, not against it.",
    url: 'https://cardiff.co/industries/agriculture/',
  },
];

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }

  const idx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === STRIPS_BLOCK_ID,
  );
  if (idx === -1) {
    console.error(
      `Post ${POST_ID}: no block with id=${STRIPS_BLOCK_ID}; aborting (run iters 1-3 first).`,
    );
    process.exit(1);
  }
  const strips = parsed.blocks[idx];
  if (strips.type !== 'html-render') {
    console.error(
      `Post ${POST_ID}: block ${STRIPS_BLOCK_ID} is not html-render (was ${strips.type}); aborting.`,
    );
    process.exit(1);
  }

  const previousCount = Array.isArray(strips.values?.rows) ? strips.values.rows.length : 0;
  strips.values = { ...(strips.values || {}), rows: ROWS };

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Post ${POST_ID}: industries-strips rows ${previousCount} -> ${ROWS.length} (extended verticals).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
