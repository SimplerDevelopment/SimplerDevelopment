/**
 * Booking-page AI tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { bookingPages, bookings } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export const bookingTools: Anthropic.Tool[] = [
  {
    name: 'get_my_booking_pages',
    description: 'Get all booking pages for this client with settings and upcoming booking counts.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_bookings_for_page',
    description: 'Get all bookings for a specific booking page.',
    input_schema: {
      type: 'object' as const,
      properties: { booking_page_id: { type: 'number', description: 'The booking page ID' } },
      required: ['booking_page_id'],
    },
  },
  {
    name: 'create_booking_page',
    description: 'Create a new booking page. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Booking page title' },
        slug: { type: 'string', description: 'URL slug for the booking page' },
        description: { type: 'string', description: 'Description shown to bookers' },
        duration: { type: 'number', description: 'Meeting duration in minutes (default 30)' },
      },
      required: ['title', 'slug'],
    },
  },
  {
    name: 'update_booking_page',
    description: 'Update an existing booking page. Only update fields the client explicitly asked to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_page_id: { type: 'number', description: 'The booking page ID' },
        title: { type: 'string', description: 'Booking page title' },
        description: { type: 'string', description: 'Description shown to bookers' },
        duration: { type: 'number', description: 'Meeting duration in minutes' },
        active: { type: 'boolean', description: 'Whether the booking page is active' },
      },
      required: ['booking_page_id'],
    },
  },
];

export type BookingHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const bookingHandlers: Record<string, BookingHandler> = {
  get_my_booking_pages: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: bookingPages.id,
      title: bookingPages.title,
      slug: bookingPages.slug,
      description: bookingPages.description,
      duration: bookingPages.duration,
      active: bookingPages.active,
      color: bookingPages.color,
      createdAt: bookingPages.createdAt,
    }).from(bookingPages).where(eq(bookingPages.clientId, clientId));

    const result = [];
    for (const page of rows) {
      const [countRow] = await db.select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(and(
          eq(bookings.bookingPageId, page.id),
          eq(bookings.status, 'confirmed'),
        ));
      result.push({ ...page, upcomingBookings: countRow?.count ?? 0 });
    }
    return result;
  },

  get_bookings_for_page: async (input, clientId, _userId) => {
    const bookingPageId = input.booking_page_id as number;
    const [page] = await db.select().from(bookingPages)
      .where(and(eq(bookingPages.id, bookingPageId), eq(bookingPages.clientId, clientId))).limit(1);
    if (!page) return { error: 'Booking page not found' };

    const rows = await db.select({
      id: bookings.id,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      status: bookings.status,
      answers: bookings.answers,
      createdAt: bookings.createdAt,
    }).from(bookings).where(eq(bookings.bookingPageId, bookingPageId)).orderBy(desc(bookings.startTime));
    return { bookingPage: page.title, bookings: rows };
  },

  create_booking_page: async (input, clientId, _userId) => {
    const title = input.title as string;
    const slug = input.slug as string;
    const description = input.description as string | undefined;
    const duration = input.duration as number | undefined;

    const [page] = await db.insert(bookingPages).values({
      clientId,
      title,
      slug,
      description: description ?? null,
      duration: duration ?? 30,
    }).returning();

    return { success: true, bookingPageId: page.id, message: `Booking page "${title}" created.` };
  },

  update_booking_page: async (input, clientId, _userId) => {
    const bookingPageId = input.booking_page_id as number;
    const [page] = await db.select().from(bookingPages)
      .where(and(eq(bookingPages.id, bookingPageId), eq(bookingPages.clientId, clientId))).limit(1);
    if (!page) return { error: 'Booking page not found' };

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) update.title = input.title;
    if (input.description !== undefined) update.description = input.description;
    if (input.duration !== undefined) update.duration = input.duration;
    if (input.active !== undefined) update.active = input.active;

    await db.update(bookingPages).set(update).where(eq(bookingPages.id, bookingPageId));

    return { success: true, message: `Booking page "${page.title}" updated.` };
  },
};
