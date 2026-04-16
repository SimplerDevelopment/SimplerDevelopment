import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../../lib/db');
  const { bookingPages } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));

  const slug = 'london-approach-call';
  const values = {
    clientId: ids.clientId,
    websiteId: ids.websiteId,
    title: 'Schedule a Call',
    slug,
    description: 'Book a 30-minute consultation with our recruiting team to discuss your hiring needs.',
    duration: 30,
    bufferAfter: 15,
    timezone: 'America/New_York',
    color: '#124334',
    brandingProfileId: ids.brandingProfileId,
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
      { id: 'q1', label: 'What role are you looking to fill? (or: what type of role are you seeking?)', type: 'textarea', required: false },
    ],
    conferenceType: 'google_meet',
    googleCalendarSync: false,
    active: true,
  };

  const [existing] = await db.select().from(bookingPages).where(eq(bookingPages.slug, slug)).limit(1);
  if (existing) {
    await db.update(bookingPages).set(values as any).where(eq(bookingPages.id, existing.id));
    console.log(`Booking page updated: ID ${existing.id}`);
    ids.bookingPageId = existing.id;
  } else {
    const [created] = await db.insert(bookingPages).values(values as any).returning();
    console.log(`Booking page created: ID ${created.id}`);
    ids.bookingPageId = created.id;
  }

  fs.writeFileSync(path.join(__dirname, 'ids.json'), JSON.stringify(ids, null, 2));
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
