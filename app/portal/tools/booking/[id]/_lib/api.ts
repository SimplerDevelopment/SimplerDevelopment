/**
 * Thin REST helpers for the booking-page editor. All endpoints follow the
 * `{ success, data | message }` envelope; helpers return the parsed JSON so
 * callers can branch on `success`.
 *
 * Centralizes URL construction so the panel components stay declarative and
 * the same fetch pattern is used everywhere.
 */
import type {
  BookingPageData,
  Booking,
  PageMember,
  TeamMember,
  BrandingProfileSummary,
} from './types';

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

const json = { 'Content-Type': 'application/json' } as const;

export async function getBookingPage(id: string | number): Promise<Envelope<BookingPageData>> {
  const res = await fetch(`/api/portal/tools/booking/${id}`);
  return res.json();
}

export async function updateBookingPage(
  id: string | number,
  body: Record<string, unknown>,
): Promise<Envelope<BookingPageData>> {
  const res = await fetch(`/api/portal/tools/booking/${id}`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteBookingPage(id: string | number): Promise<Envelope<unknown>> {
  const res = await fetch(`/api/portal/tools/booking/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function listBookings(id: string | number): Promise<Envelope<Booking[]>> {
  const res = await fetch(`/api/portal/tools/booking/${id}/bookings`);
  return res.json();
}

export async function updateBooking(
  pageId: string | number,
  bookingId: number,
  body: Record<string, unknown>,
): Promise<Envelope<Booking>> {
  const res = await fetch(`/api/portal/tools/booking/${pageId}/bookings/${bookingId}`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function listMembers(
  id: string | number,
): Promise<Envelope<{ members: PageMember[]; teamMembers: TeamMember[] }>> {
  const res = await fetch(`/api/portal/tools/booking/${id}/members`);
  return res.json();
}

export async function addMember(
  id: string | number,
  body: { userId: number; displayName: string | null; color: string },
): Promise<Envelope<PageMember>> {
  const res = await fetch(`/api/portal/tools/booking/${id}/members`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateMember(
  id: string | number,
  body: { memberId: number; active?: boolean },
): Promise<Envelope<PageMember>> {
  const res = await fetch(`/api/portal/tools/booking/${id}/members`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function removeMember(
  id: string | number,
  memberId: number,
): Promise<Envelope<unknown>> {
  const res = await fetch(`/api/portal/tools/booking/${id}/members?memberId=${memberId}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function listBrandingProfiles(): Promise<Envelope<BrandingProfileSummary[]>> {
  const res = await fetch('/api/portal/branding/profiles');
  return res.json();
}
