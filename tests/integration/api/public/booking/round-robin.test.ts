/**
 * Round-robin / fewest-upcoming / fixed assignment — public booking flow.
 *
 * Hits POST /api/public/booking/[slug]/book repeatedly against a page that
 * has assignmentMode + roundRobinPool configured, then asserts the
 * distribution of bookings.assignedUserId across the pool.
 *
 * The pure assignment math is covered in tests/unit/booking-assign.test.ts.
 * These specs exercise the DB-coupled pickAssignee path end-to-end through
 * the public route handler — i.e. the full real-world write path that a
 * customer would trigger.
 *
 * Stripe / Google / Zoom / Resend are mocked so the test never dials out.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/email/booking-emails', () => ({
  sendGuestConfirmation: vi.fn().mockResolvedValue(undefined),
  sendHostNotification: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: vi.fn().mockResolvedValue(null),
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/zoom', () => ({
  createZoomMeeting: vi.fn().mockResolvedValue(null),
  deleteZoomMeeting: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/branding', () => ({
  getBrandingByBookingPageSlug: vi.fn().mockResolvedValue(null),
  brandingToCssVars: vi.fn().mockReturnValue({}),
}));

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

type AssignmentMode = 'fixed' | 'round_robin' | 'fewest_upcoming';

interface SeedRRPageOpts {
  label?: string;
  assignmentMode: AssignmentMode;
  staffCount?: number;
  // when true, persist the staff IDs into roundRobinPool with weight=1
  useExplicitPool?: boolean;
}

async function seedStaffUser(label: string): Promise<number> {
  const sql = getTestSql();
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES (${label}, ${email}, ${'x'}, ${'editor'}, true)
    RETURNING id
  `;
  return u.id;
}

async function seedRoundRobinPage(opts: SeedRRPageOpts) {
  const ctx = await sessionForNewClientUser(opts.label ?? 'rr');
  const sql = getTestSql();
  const slug = `rr-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const availability = JSON.stringify(
    [0, 1, 2, 3, 4, 5, 6].map(day => ({
      day, startTime: '00:00', endTime: '23:59', enabled: true,
    })),
  );

  const staffCount = opts.staffCount ?? 3;
  const staffIds: number[] = [];
  for (let i = 0; i < staffCount; i++) {
    staffIds.push(await seedStaffUser(`${opts.label ?? 'rr'}-staff-${i}`));
  }

  const roundRobinPool = opts.useExplicitPool
    ? JSON.stringify(staffIds.map(id => ({ userId: id, weight: 1 })))
    : null;

  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
      client_id, title, slug, duration, max_advance_days, min_notice_mins,
      timezone, availability, active, price, max_guests, checkin_enabled,
      enable_discount_codes, enable_add_ons, enable_gift_certificates,
      enable_waivers, require_waiver_before_booking, allow_staff_selection,
      buffer_before, buffer_after, conference_type, google_calendar_sync,
      color, assignment_mode, round_robin_pool, booking_type, group_capacity
    )
    VALUES (
      ${ctx.client.id}, 'RR Test', ${slug}, 30,
      365, 0,
      'UTC', ${availability}::jsonb, true,
      0, NULL, false,
      false, false, false,
      false, false, false,
      0, 0, 'none', false,
      '#2563eb', ${opts.assignmentMode},
      ${roundRobinPool === null ? null : roundRobinPool}::jsonb,
      'individual', NULL
    )
    RETURNING id
  `;

  // Always seed page members so roundRobinPool resolution finds them as
  // active. (When useExplicitPool=false this is the source of the pool;
  // when useExplicitPool=true the pool resolver still requires the userId
  // to be an active member.)
  for (const userId of staffIds) {
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.booking_page_members
        (booking_page_id, user_id, active)
      VALUES (${p.id}, ${userId}, true)
    `;
  }

  return { pageId: p.id, slug, clientId: ctx.client.id, ownerId: ctx.user.id, staffIds };
}

// Pick N distinct hour-aligned UTC slots across separate days so the
// 1:1 conflict guard never fires. Round-robin uses next-7-day load, but
// "future" alone (>= now) is enough for fewest_upcoming.
function distinctSlots(n: number): Date[] {
  const slots: Date[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    // Spread across days 1..n+1 so individual-mode conflict guard is safe.
    d.setUTCDate(d.getUTCDate() + 1 + i);
    d.setUTCHours(12, 0, 0, 0);
    slots.push(d);
  }
  return slots;
}

async function bookOnce(slug: string, slot: Date, suffix: string | number) {
  const route = await import('@/app/api/public/booking/[slug]/book/route');
  return callHandler<{ success: boolean; data: { id: number } }>(
    route as unknown as Record<string, unknown>, 'POST',
    {
      params: { slug },
      body: {
        name: `Guest ${suffix}`,
        email: `guest-${suffix}@test.local`,
        startTime: slot.toISOString(),
      },
    },
  );
}

async function fetchAssignments(pageId: number): Promise<number[]> {
  const sql = getTestSql();
  const rows = await sql<{ assigned_user_id: number | null; assigned_to: number | null }[]>`
    SELECT assigned_user_id, assigned_to
    FROM ${sql(TEST_SCHEMA)}.bookings
    WHERE booking_page_id = ${pageId}
    ORDER BY id ASC
  `;
  return rows.map(r => r.assigned_user_id ?? r.assigned_to ?? -1);
}

function tally(ids: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

describe('public booking POST — assignmentMode=round_robin @booking @public', () => {
  it('distributes 9 bookings ~evenly (3 per staff, ±1) across a 3-staff explicit pool', async () => {
    const { slug, pageId, staffIds } = await seedRoundRobinPage({
      label: 'rr-explicit',
      assignmentMode: 'round_robin',
      staffCount: 3,
      useExplicitPool: true,
    });
    const slots = distinctSlots(9);
    for (let i = 0; i < 9; i++) {
      const r = await bookOnce(slug, slots[i], i);
      expect(r.status, `booking #${i} should succeed`).toBe(200);
    }
    const assigned = await fetchAssignments(pageId);
    expect(assigned).toHaveLength(9);
    // Every booking must have been auto-assigned to someone in the pool.
    for (const id of assigned) {
      expect(staffIds, `assigned id ${id} not in staff pool`).toContain(id);
    }
    const counts = tally(assigned);
    // Even spread: each staff gets 2..4 of the 9. Allows ±1 tolerance from
    // a perfect 3/3/3 split, which is what round-robin promises in spec.
    for (const sid of staffIds) {
      const c = counts.get(sid) ?? 0;
      expect(c, `staff ${sid} got ${c}, expected 2..4`).toBeGreaterThanOrEqual(2);
      expect(c, `staff ${sid} got ${c}, expected 2..4`).toBeLessThanOrEqual(4);
    }
    // Sanity: total adds up.
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    expect(total).toBe(9);
  });

  it('round_robin without explicit pool falls back to all active members of the page', async () => {
    const { slug, pageId, staffIds } = await seedRoundRobinPage({
      label: 'rr-default',
      assignmentMode: 'round_robin',
      staffCount: 3,
      useExplicitPool: false,
    });
    const slots = distinctSlots(9);
    for (let i = 0; i < 9; i++) {
      const r = await bookOnce(slug, slots[i], i);
      expect(r.status).toBe(200);
    }
    const assigned = await fetchAssignments(pageId);
    const counts = tally(assigned);
    for (const sid of staffIds) {
      const c = counts.get(sid) ?? 0;
      expect(c).toBeGreaterThanOrEqual(2);
      expect(c).toBeLessThanOrEqual(4);
    }
  });
});

describe('public booking POST — assignmentMode=fewest_upcoming @booking @public', () => {
  it('distributes 9 bookings ~evenly across a 3-staff explicit pool', async () => {
    const { slug, pageId, staffIds } = await seedRoundRobinPage({
      label: 'fu',
      assignmentMode: 'fewest_upcoming',
      staffCount: 3,
      useExplicitPool: true,
    });
    const slots = distinctSlots(9);
    for (let i = 0; i < 9; i++) {
      const r = await bookOnce(slug, slots[i], i);
      expect(r.status).toBe(200);
    }
    const assigned = await fetchAssignments(pageId);
    const counts = tally(assigned);
    for (const sid of staffIds) {
      const c = counts.get(sid) ?? 0;
      expect(c).toBeGreaterThanOrEqual(2);
      expect(c).toBeLessThanOrEqual(4);
    }
    expect(Array.from(counts.values()).reduce((a, b) => a + b, 0)).toBe(9);
  });
});

describe('public booking POST — assignmentMode=fixed @booking @public', () => {
  it('does not auto-assign; assignedUserId stays null and assignedTo follows legacy fallback', async () => {
    // Fixed mode with NO assigned_members → the route shouldn't pick anyone.
    // assignedUserId (the auto-assigner audit column) must be null on every
    // booking; assignedTo can either be null (no legacy fallback) or the
    // page owner if assignedMembers is set — we keep it null here.
    const { slug, pageId } = await seedRoundRobinPage({
      label: 'fixed',
      assignmentMode: 'fixed',
      staffCount: 3,
      useExplicitPool: true,
    });
    const slots = distinctSlots(3);
    for (let i = 0; i < 3; i++) {
      const r = await bookOnce(slug, slots[i], i);
      expect(r.status).toBe(200);
    }
    const sql = getTestSql();
    const rows = await sql<{ assigned_user_id: number | null; assigned_to: number | null }[]>`
      SELECT assigned_user_id, assigned_to
      FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE booking_page_id = ${pageId}
      ORDER BY id ASC
    `;
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      // assignedUserId is the auto-assigner audit; in 'fixed' mode it must
      // never be populated — pickAssignee returns null and the route leaves
      // autoAssignedUserId at null.
      expect(r.assigned_user_id).toBeNull();
    }
  });

  it('fixed mode with a single assignedMembers entry routes every booking to that user', async () => {
    // Legacy fallback path: when assignmentMode='fixed' but assigned_members
    // is set to a single user, the route still copies that user into
    // assignedTo (without touching assignedUserId).
    const ctx = await sessionForNewClientUser('fixed-legacy');
    const sql = getTestSql();
    const ownerStaffId = await seedStaffUser('fixed-legacy-owner');
    const slug = `fxd-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const availability = JSON.stringify(
      [0, 1, 2, 3, 4, 5, 6].map(day => ({
        day, startTime: '00:00', endTime: '23:59', enabled: true,
      })),
    );
    const assignedMembers = JSON.stringify([ownerStaffId]);

    const [p] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
        client_id, title, slug, duration, max_advance_days, min_notice_mins,
        timezone, availability, active, price, max_guests, checkin_enabled,
        enable_discount_codes, enable_add_ons, enable_gift_certificates,
        enable_waivers, require_waiver_before_booking, allow_staff_selection,
        buffer_before, buffer_after, conference_type, google_calendar_sync,
        color, assignment_mode, booking_type, assigned_members
      )
      VALUES (
        ${ctx.client.id}, 'Fixed Legacy', ${slug}, 30,
        365, 0,
        'UTC', ${availability}::jsonb, true,
        0, NULL, false,
        false, false, false,
        false, false, false,
        0, 0, 'none', false,
        '#2563eb', 'fixed', 'individual', ${assignedMembers}::jsonb
      )
      RETURNING id
    `;

    const slots = distinctSlots(3);
    for (let i = 0; i < 3; i++) {
      const r = await bookOnce(slug, slots[i], i);
      expect(r.status).toBe(200);
    }
    const rows = await sql<{ assigned_user_id: number | null; assigned_to: number | null }[]>`
      SELECT assigned_user_id, assigned_to
      FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE booking_page_id = ${p.id}
      ORDER BY id ASC
    `;
    for (const r of rows) {
      expect(r.assigned_to).toBe(ownerStaffId);
      expect(r.assigned_user_id).toBeNull();
    }
  });
});
