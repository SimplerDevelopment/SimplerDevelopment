// Extracted verbatim from app/portal/tools/booking/calendar/page.tsx (PUX-181) — the booking home renders the same week.

export interface CalendarBooking {
  id: number;
  bookingPageId: number;
  guestName: string;
  guestEmail: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  assignedTo: number | null;
  groupSize: number;
  total: number;
  pageTitle: string;
  pageColor: string;
  assignedMember: { name: string; color: string } | null;
}
