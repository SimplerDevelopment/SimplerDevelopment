/**
 * Shared types for the booking-page editor.
 *
 * Extracted from the original page.tsx during the refactor. The shapes mirror
 * what `/api/portal/tools/booking/:id` and friends return; keep them in sync
 * with `lib/db/schema.ts` and the tools/booking API routes.
 */

export interface AvailabilitySlot {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export interface BookingQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
}

export interface BookingPageData {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  maxAdvanceDays: number;
  minNoticeMins: number;
  timezone: string;
  availability: AvailabilitySlot[];
  questions: BookingQuestion[];
  color: string;
  brandingProfileId: number | null;
  active: boolean;
  googleCalendarSync: boolean;
  conferenceType: string;
  allowStaffSelection: boolean;
  assignedMembers: number[];
  // Round-robin / group fields. Optional for backwards compat with
  // existing serialized records that predate the migration.
  assignmentMode?: 'fixed' | 'round_robin' | 'fewest_upcoming';
  roundRobinPool?: { userId: number; weight: number }[] | null;
  bookingType?: 'individual' | 'group';
  groupCapacity?: number | null;
  // Monetization fields
  price?: number | null;
  priceLabel?: string | null;
  enableAddOns?: boolean;
  enableGiftCertificates?: boolean;
  enableDiscountCodes?: boolean;
  enableWaivers?: boolean;
  waiverContent?: string | null;
  requireWaiverBeforeBooking?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  assignedTo: number | null;
  answers: Record<string, string> | null;
  notes: string | null;
  createdAt: string;
}

export interface PageMember {
  id: number;
  userId: number;
  displayName: string | null;
  color: string | null;
  availability: AvailabilitySlot[] | null;
  active: boolean;
  userName: string;
  userEmail: string;
}

export interface TeamMember {
  userId: number;
  role: string;
  name: string;
  email: string;
}

export interface BrandingProfileSummary {
  id: number;
  name: string;
  isDefault: boolean;
  primaryColor: string | null;
  logoUrl: string | null;
}

export type StylingMap = Record<string, string | boolean | undefined>;

export type Tab =
  | 'settings'
  | 'styling'
  | 'availability'
  | 'questions'
  | 'embed'
  | 'bookings'
  | 'staff'
  | 'automations';

export interface TabDef {
  key: Tab;
  label: string;
  icon: string;
}
