/**
 * Relayer demo booking page → public at /book/relayer-demo, embedded via the `booking` block.
 * Self-contained (no _shared dep) + idempotent. Creates the page ACTIVE.
 *   npx tsx scripts/migrations/relayer/import-booking.ts
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

const CLIENT_ID = parseInt(process.env.RL_CLIENT_ID || '161', 10);
const WEBSITE_ID = parseInt(process.env.RL_WEBSITE_ID || '447', 10);
const BRANDING_PROFILE_ID = parseInt(process.env.RL_BRANDING_ID || '46', 10);
const BOOKING_SLUG = 'relayer-demo';
const FOREST = '#032916', MINT = '#23EE92', CREAM = '#E1DDD5';

async function run() {
  const { db } = await import('../../../lib/db');
  const { eq } = await import('drizzle-orm');
  const { bookingPages } = await import('../../../lib/db/schema');

  const values = {
    clientId: CLIENT_ID,
    websiteId: WEBSITE_ID,
    brandingProfileId: BRANDING_PROFILE_ID,
    title: 'Product Briefing',
    slug: BOOKING_SLUG,
    description:
      'See how Relayer creates shared visibility and execution across your dealer network. The briefing covers the post-sale gap, how the platform works, and a tailored path to implementation.',
    duration: 30,
    bufferAfter: 15,
    maxAdvanceDays: 60,
    minNoticeMins: 120,
    timezone: 'America/New_York',
    color: FOREST,
    availability: [
      { day: 1, startTime: '09:00', endTime: '17:00', enabled: true },
      { day: 2, startTime: '09:00', endTime: '17:00', enabled: true },
      { day: 3, startTime: '09:00', endTime: '17:00', enabled: true },
      { day: 4, startTime: '09:00', endTime: '17:00', enabled: true },
      { day: 5, startTime: '09:00', endTime: '17:00', enabled: true },
      { day: 0, startTime: '09:00', endTime: '17:00', enabled: false },
      { day: 6, startTime: '09:00', endTime: '17:00', enabled: false },
    ],
    questions: [
      { id: 'company', label: 'Company', type: 'text', required: true },
      { id: 'title', label: 'Title', type: 'text', required: false },
      { id: 'orgType', label: 'Organization Type', type: 'select', required: true,
        options: ['OEM / Manufacturer', 'Dealer Group', 'Technology Partner', 'Consultant / Advisor', 'Other'] },
    ],
    styling: {
      primaryColor: FOREST, accentColor: MINT, backgroundColor: CREAM, textColor: FOREST,
      headingFont: 'Space Grotesk', bodyFont: 'Hanken Grotesk', borderRadius: '16px',
      buttonPrimaryBg: MINT, buttonPrimaryText: FOREST, buttonBorderRadius: '52px',
    },
    conferenceType: 'none',
    googleCalendarSync: false,
    active: true,
  };

  const [existing] = await db.select().from(bookingPages).where(eq(bookingPages.slug, BOOKING_SLUG)).limit(1);
  if (existing) {
    await db.update(bookingPages).set({ ...(values as never), updatedAt: new Date() }).where(eq(bookingPages.id, existing.id));
    console.log(`[import-booking] Updated booking page "${BOOKING_SLUG}" id=${existing.id} (active=${values.active})`);
  } else {
    const [created] = await db.insert(bookingPages).values(values as never).returning();
    console.log(`[import-booking] Created booking page "${BOOKING_SLUG}" id=${created.id} (active=${values.active})`);
  }
  console.log(`  Public: /book/${BOOKING_SLUG}`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
