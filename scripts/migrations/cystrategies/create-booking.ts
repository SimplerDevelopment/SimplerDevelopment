import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const CLIENT_ID = 98;

async function createBooking() {
  const { db } = await import('../../../lib/db');
  const { bookingPages } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Check if already exists
  const existing = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.clientId, CLIENT_ID), eq(bookingPages.slug, 'strategy-consultation')))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Booking page already exists: ID ${existing[0].id}, slug: ${existing[0].slug}`);
    process.exit(0);
  }

  const [page] = await db.insert(bookingPages).values({
    clientId: CLIENT_ID,
    title: '30-Minute Strategy Consultation',
    slug: 'strategy-consultation',
    description: 'Book a free 30-minute marketing strategy consultation with Cody York. We\'ll discuss your current marketing challenges, identify opportunities, and explore how a clear strategy can help your business grow.',
    duration: 30,
    bufferBefore: 5,
    bufferAfter: 15,
    maxAdvanceDays: 60,
    minNoticeMins: 120,
    timezone: 'America/New_York',
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
      { id: 'q1', label: 'What is your biggest marketing challenge right now?', type: 'textarea', required: true },
      { id: 'q2', label: 'Company website URL', type: 'text', required: false },
      { id: 'q3', label: 'How did you hear about CY Strategies?', type: 'text', required: false },
    ],
    color: '#1A1629',
    active: true,
    conferenceType: 'none',
  }).returning();

  console.log(`Booking page created: ID ${page.id}, slug: ${page.slug}`);
  console.log(`\nEmbed on site with booking block: { "type": "booking", "slug": "strategy-consultation" }`);
  console.log(`Public URL: /book/strategy-consultation`);

  process.exit(0);
}

createBooking().catch(err => { console.error(err); process.exit(1); });
