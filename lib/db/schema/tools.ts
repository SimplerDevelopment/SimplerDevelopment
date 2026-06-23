// Portal tools: pitch decks, booking pages and bookings, gift certificates, and Google Workspace / Zoom integrations.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, bigint, json, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { portalApiKeys, users } from './auth';
import { clientWebsites, clients } from './sites';
import { brandingProfiles } from './cms';
import { productVariants, products } from './store';
import { SurveyRecommendationConfig } from './surveys';

export interface PitchDeckSlide {
  id: string;
  type: 'cover' | 'problem' | 'solution' | 'features' | 'process' | 'metrics' | 'testimonial' | 'team' | 'pricing' | 'cta' | 'custom';
  headline?: string;
  subheadline?: string;
  body?: string;
  bullets?: string[];
  stats?: { label: string; value: string }[];
  steps?: { title: string; description: string }[];
  members?: { name: string; role: string; image?: string }[];
  tiers?: { name: string; price: string; features: string[]; highlighted?: boolean }[];
  columns?: number; // controls grid columns for items (2, 3, 4, etc.)
  image?: string;
  notes?: string;
}

// V2: Slides built with the CMS block editor

export interface PitchDeckSlideV2 {
  id: string;
  label: string; // Display name in sidebar ("Cover", "Problem", etc.)
  blocks: import('@/types/blocks').Block[];
  pageSettings?: import('@/types/blocks').PageSettings;
  notes?: string; // Speaker notes
  // Survey integration — when set, this slide expands into per-question slides in the viewer
  surveySlide?: boolean;
  surveyId?: number;
  /** Per-field block overrides for survey sub-slide editing. Key is the field ID. */
  surveyFieldBlocks?: Record<string, import('@/types/blocks').Block[]>;
  /**
   * @deprecated Source of truth moved to `surveys.recommendation`. Kept on the
   * type for backwards compat reads of decks created before the cutover; the
   * editor and renderer now go through the survey row. New writes are ignored.
   */
  surveyRecommendation?: SurveyRecommendationConfig;
  /**
   * Per-slide custom CSS. Auto-scoped to this slide via [data-slide-id="<slide.id>"]
   * — write rules without a prefix and they only apply to this slide.
   * Use `:root` or `.deck-root` selectors to escape the scope when needed.
   */
  customCss?: string;
  // Path groups — slides with a pathGroup belong to that branch, not the main sequence
  pathGroup?: string;
  // Decision slides — force the viewer to choose a path
  decisionSlide?: boolean;
  decisionOptions?: PitchDeckDecisionOption[];
  /**
   * Optional cover-style content for the decision slide. When set, the
   * decision slide renders a two-column intro layout (logo/wordmark, eyebrow,
   * headline + light punchline, rule, intro line, body, about, image) with
   * the decision options surfacing as CTA cards. When unset, the legacy
   * centered-grid layout is used.
   */
  decisionCover?: PitchDeckDecisionCover;
  /**
   * Per-slide draft overlay. The editor reads and writes `draft.*` when set;
   * the public deck renderer ignores `draft` entirely and always reads the
   * sibling live fields (`blocks`, `customCss`, `pageSettings`). The
   * `decks_publish_slide` / `decks_publish_all` MCP tools copy `draft.*`
   * onto the live fields and clear `draft`.
   *
   * `pendingCreate` / `pendingDelete` mirror the `SiteNavigationDraft`
   * convention: a `pendingCreate` slide exists in the slides array but its
   * live fields (`blocks`, `customCss`, etc.) are empty until publish;
   * a `pendingDelete` slide is a tombstone — still rendered live until the
   * publish step removes it.
   */
  draft?: {
    blocks?: import('@/types/blocks').Block[];
    customCss?: string;
    pageSettings?: import('@/types/blocks').PageSettings;
    notes?: string;
    pendingCreate?: boolean;
    pendingDelete?: boolean;
    updatedAt?: string; // ISO timestamp of the last draft write
    updatedBy?: number; // userId
  };
}

export interface PitchDeckDecisionOption {
  id: string;
  label: string;
  description?: string;
  /**
   * Small uppercase eyebrow shown above the label on the option card.
   * Useful for offering numbering ("01 / SNAPSHOT") or category tags.
   */
  eyebrow?: string;
  icon?: string; // Material Icon name
  pathGroup: string; // which path group this choice leads to
}

export interface PitchDeckDecisionCover {
  /** Logo image URL — rendered above the wordmark. Optional. */
  logo?: string;
  /** Small uppercase wordmark text (e.g. "CY STRATEGIES"). Has a bullet dot prefix. */
  wordmark?: string;
  /** Eyebrow line ("MARKETING STRATEGY CONSULTANT") */
  eyebrow?: string;
  /** Bold first headline line. */
  headline?: string;
  /** Light second headline line (the "punchline" — paired with headline visually). */
  punchline?: string;
  /** Smaller intro line (e.g. "Hi, I'm Cody."). Sits above body. */
  intro?: string;
  /** Body paragraph copy. Plain text — line breaks render as <br>. */
  body?: string;
  /** About paragraph(s) — separate paragraphs with a blank line. Renders with a top border. */
  about?: string;
  /** Right-column image URL (e.g. headshot). When set, layout becomes two-column. */
  image?: string;
  /** Alt text for image. */
  imageAlt?: string;
  /**
   * Slide background override. Falls back to slide.pageSettings.backgroundColor
   * → theme.backgroundColor.
   */
  backgroundColor?: string;
  /**
   * Slide text color override (used by headline / wordmark). Falls back to theme.textColor.
   */
  textColor?: string;
  /**
   * Muted/soft text color (used by eyebrow/intro/about). Falls back to a 70%-opacity textColor.
   */
  mutedColor?: string;
  /**
   * Light supporting text color (used by punchline/body). Falls back to mutedColor.
   */
  softColor?: string;
  /** Accent color (rule + dot + option-card icons). Falls back to theme.accentColor. */
  accentColor?: string;
}

export interface PitchDeckTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logo?: string;
  /** Survey-slide Next/Submit button background. Falls back to accentColor. */
  nextButtonColor?: string;
  /** Survey-slide Next/Submit button text color. Falls back to backgroundColor. */
  nextButtonTextColor?: string;
  /** Survey-slide Back button background. Falls back to a 15%-opacity textColor wash. */
  backButtonColor?: string;
  /** Survey-slide Back button text color. Falls back to textColor. */
  backButtonTextColor?: string;
  /**
   * Deck-global custom CSS injected once at the top of the presentation.
   * Use this for fonts, base typography, repeating background patterns,
   * and rules that need to span every slide.
   */
  customCss?: string;
  /**
   * Show the "01/12" slide counter overlay in the top-left of the
   * presentation. Defaults to true (counter shown). Set to false for decks
   * where slide chrome would clash with full-bleed content (e.g. uploaded
   * HTML decks). Auto-overridden to false on any slide whose content is a
   * single full-width html-embed block.
   */
  showSlideNumber?: boolean;
}

export const pitchDecks = pgTable('pitch_decks', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft, published, archived
  slides: json('slides').$type<PitchDeckSlide[] | PitchDeckSlideV2[]>().default([]),
  formatVersion: integer('format_version').default(1).notNull(), // 1 = legacy, 2 = block editor
  theme: json('theme').$type<PitchDeckTheme>().default({
    primaryColor: '#2563eb',
    accentColor: '#60a5fa',
    backgroundColor: '#0f172a',
    textColor: '#f8fafc',
    headingFont: 'Inter',
    bodyFont: 'Inter',
  }),
  sourceUrl: varchar('source_url', { length: 500 }), // website used for branding
  brandingProfileId: integer('branding_profile_id'), // FK to branding_profiles
  // SEO metadata (parity with posts table). When unset, the public renderer
  // falls back to title / description / branding.ogImageUrl.
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  ogImage: varchar('og_image', { length: 500 }),
  canonicalUrl: varchar('canonical_url', { length: 500 }),
  noIndex: boolean('no_index').default(false).notNull(),
  // Lightweight fork pointer — set by decks_fork. Points to pitch_decks.id of
  // the deck this row was duplicated from.
  parentDeckId: integer('parent_deck_id'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Viewer analytics on shared decks — one row per tracked event from the public
// presenter. slideIndex=null is a deck-open; non-null is a per-slide dwell.
export const pitchDeckViews = pgTable('pitch_deck_views', {
  id: serial('id').primaryKey(),
  deckId: integer('deck_id').notNull().references(() => pitchDecks.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 100 }), // anonymous viewer session
  slideIndex: integer('slide_index'), // null = deck open/view
  dwellMs: integer('dwell_ms'), // time-on-slide, when reported
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  deckIdx: index('pitch_deck_views_deck_idx').on(t.deckId, t.createdAt),
}));

export const pitchDeckVersions = pgTable('pitch_deck_versions', {
  id: serial('id').primaryKey(),
  deckId: integer('deck_id').notNull().references(() => pitchDecks.id, { onDelete: 'cascade' }),
  slides: json('slides').$type<PitchDeckSlide[] | PitchDeckSlideV2[]>().notNull(),
  theme: json('theme').$type<PitchDeckTheme>().notNull(),
  formatVersion: integer('format_version').default(1).notNull(),
  label: varchar('label', { length: 255 }), // null = auto-save, string = manual checkpoint
  trigger: varchar('trigger', { length: 50 }).notNull(), // 'manual', 'ai_generate', 'ai_slide_edit', 'ai_regenerate'
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── BOOKING TOOL ─────────────────────────────────────────────────────────────

export interface BookingAvailabilitySlot {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
  enabled: boolean;
}

export interface BookingQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
}

/** Per-booking-page style overrides. When set, these take precedence over the branding profile. */

export interface BookingPageStyling {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  headingFont?: string;
  bodyFont?: string;
  borderRadius?: string;
  buttonPrimaryBg?: string;
  buttonPrimaryText?: string;
  buttonBorderRadius?: string;
  hideTitle?: boolean;
  hideLogo?: boolean;
}

export const bookingPages = pgTable('booking_pages', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  price: integer('price').default(0).notNull(), // cents, 0 = free booking
  priceLabel: varchar('price_label', { length: 100 }), // "per person", "per session", etc.
  maxGuests: integer('max_guests'), // null = 1:1 appointment (no capacity tracking)
  duration: integer('duration').default(30).notNull(), // minutes
  bufferBefore: integer('buffer_before').default(0).notNull(), // minutes
  bufferAfter: integer('buffer_after').default(15).notNull(), // minutes
  maxAdvanceDays: integer('max_advance_days').default(60).notNull(),
  minNoticeMins: integer('min_notice_mins').default(60).notNull(),
  timezone: varchar('timezone', { length: 100 }).default('America/New_York').notNull(),
  availability: json('availability').$type<BookingAvailabilitySlot[]>().default([
    { day: 1, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 2, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 3, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 4, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 5, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 0, startTime: '09:00', endTime: '17:00', enabled: false },
    { day: 6, startTime: '09:00', endTime: '17:00', enabled: false },
  ]),
  questions: json('questions').$type<BookingQuestion[]>().default([]),
  color: varchar('color', { length: 7 }).default('#2563eb'),
  brandingProfileId: integer('branding_profile_id').references(() => brandingProfiles.id, { onDelete: 'set null' }),
  styling: json('styling').$type<BookingPageStyling>().default({}),
  // Feature toggles
  enableAddOns: boolean('enable_add_ons').default(false).notNull(),
  enableGiftCertificates: boolean('enable_gift_certificates').default(false).notNull(),
  enableDiscountCodes: boolean('enable_discount_codes').default(false).notNull(),
  enableWaivers: boolean('enable_waivers').default(false).notNull(),
  waiverContent: text('waiver_content'),
  requireWaiverBeforeBooking: boolean('require_waiver_before_booking').default(false).notNull(),
  checkinEnabled: boolean('checkin_enabled').default(false).notNull(),
  active: boolean('active').default(true).notNull(),
  googleCalendarSync: boolean('google_calendar_sync').default(false).notNull(),
  conferenceType: varchar('conference_type', { length: 20 }).default('none').notNull(), // none, google_meet, zoom
  thumbnail: varchar('thumbnail', { length: 500 }), // preview image URL
  // Staff assignment
  allowStaffSelection: boolean('allow_staff_selection').default(false).notNull(), // let customers pick a staff member
  assignedMembers: json('assigned_members').$type<number[]>().default([]), // user IDs of staff who handle this page
  // Round-robin / load-balanced assignment
  // 'fixed' — single owner; 'round_robin' — fewest bookings in next 7 days
  // (tiebreaker: longest since last booking); 'fewest_upcoming' — fewest
  // total upcoming bookings.
  assignmentMode: varchar('assignment_mode', { length: 20 }).default('fixed').notNull(),
  // Optional manual round-robin pool. When null, all booking_page_members
  // (active) are eligible. Each entry can carry a weight for weighted RR.
  roundRobinPool: json('round_robin_pool').$type<{ userId: number; weight: number }[]>(),
  // Group / class bookings. 'individual' — one booking per slot;
  // 'group' — one slot accepts multiple attendees (capped by groupCapacity).
  bookingType: varchar('booking_type', { length: 20 }).default('individual').notNull(),
  groupCapacity: integer('group_capacity'), // null when bookingType = 'individual'
  // Reschedule settings (Phase 1)
  rescheduleEnabled: boolean('reschedule_enabled').default(true).notNull(),
  rescheduleWindowHours: integer('reschedule_window_hours').default(24).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // E2 perf — admin booking lists every page joined to clients ordered by
  // createdAt; per-client booking-page filters also hit this path.
  index('booking_pages_client_idx').on(t.clientId),
]);

// Per-member availability overrides for booking pages

export const bookingPageMembers = pgTable('booking_page_members', {
  id: serial('id').primaryKey(),
  bookingPageId: integer('booking_page_id').notNull().references(() => bookingPages.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 255 }), // public-facing name (falls back to users.name)
  color: varchar('color', { length: 7 }), // calendar color for this member
  availability: json('availability').$type<BookingAvailabilitySlot[]>(), // null = use page defaults
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('booking_page_members_page_user_idx').on(t.bookingPageId, t.userId),
]);

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  bookingPageId: integer('booking_page_id').notNull().references(() => bookingPages.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  guestName: varchar('guest_name', { length: 255 }).notNull(),
  guestEmail: varchar('guest_email', { length: 255 }).notNull(),
  guestPhone: varchar('guest_phone', { length: 50 }),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  timezone: varchar('timezone', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('confirmed').notNull(), // confirmed, cancelled, completed, no_show
  answers: json('answers').$type<Record<string, string>>(),
  notes: text('notes'),
  googleEventId: varchar('google_event_id', { length: 255 }),
  meetingLink: varchar('meeting_link', { length: 500 }),
  cancelToken: varchar('cancel_token', { length: 64 }).notNull(),
  cancelledAt: timestamp('cancelled_at'),
  // Staff assignment
  assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  // Round-robin/fewest-upcoming assignment result. Distinct from assignedTo:
  // assignedTo can be set by staff selection or manual reassignment, while
  // assignedUserId records which user the auto-assigner chose at create time
  // (null when assignmentMode = 'fixed'). assignedTo is the source of truth
  // for the calendar; this column is the audit trail.
  assignedUserId: integer('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  // Capacity
  groupSize: integer('group_size').default(1).notNull(),
  // Payment
  subtotal: integer('subtotal').default(0).notNull(), // cents
  discountTotal: integer('discount_total').default(0).notNull(),
  total: integer('total').default(0).notNull(), // cents
  discountCode: varchar('discount_code', { length: 50 }),
  giftCertificateCode: varchar('gift_certificate_code', { length: 50 }),
  giftCertificateAmount: integer('gift_certificate_amount').default(0).notNull(),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  paymentStatus: varchar('payment_status', { length: 20 }).default('free').notNull(), // free, pending, paid, refunded
  paidAt: timestamp('paid_at'),
  // Check-in
  checkinCode: varchar('checkin_code', { length: 10 }),
  checkedInAt: timestamp('checked_in_at'),
  checkedInBy: integer('checked_in_by').references(() => users.id, { onDelete: 'set null' }),
  // Reminder dispatch — set when /api/cron/booking-reminders sends a
  // pre-booking nudge to the guest. NULL = no reminder sent yet. The cron
  // is idempotent: it only picks rows where this column is NULL.
  reminderSentAt: timestamp('reminder_sent_at'),
  // Reschedule support (Phase 1)
  rescheduleToken: varchar('reschedule_token', { length: 64 }).unique(),
  previousStartTime: timestamp('previous_start_time'),
  previousEndTime: timestamp('previous_end_time'),
  rescheduleCount: integer('reschedule_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // E2 perf — admin booking aggregator groups by bookingPageId; the upcoming
  // window scans by (startTime, status). Per-client filters also exist.
  index('bookings_client_idx').on(t.clientId),
  index('bookings_booking_page_idx').on(t.bookingPageId),
  index('bookings_start_status_idx').on(t.startTime, t.status),
]);

// ─── BOOKING ATTENDEES (group / class bookings) ───────────────────────────
// Used only when the parent booking_pages.bookingType = 'group'. For
// individual bookings, the bookings row IS the single attendee — no row
// is created here. For group bookings, one bookings row represents the
// slot ("class") and N attendee rows represent the registrants.
export const bookingAttendees = pgTable('booking_attendees', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  notes: text('notes'),
  status: varchar('status', { length: 20 }).default('confirmed').notNull(), // 'confirmed' | 'cancelled' | 'waitlist'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type BookingAttendee = typeof bookingAttendees.$inferSelect;
export type NewBookingAttendee = typeof bookingAttendees.$inferInsert;

export const googleCalendarTokens = pgTable('google_calendar_tokens', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  calendarId: varchar('calendar_id', { length: 255 }).default('primary').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── GOOGLE WORKSPACE INTEGRATION ─────────────────────────────────────────
// See: .planning/milestones/google-workspace
// Per-client (shared org connection) and per-user (personal connection within a client).

export const googleWorkspaceClientConnections = pgTable('google_workspace_client_connections', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),
  googleAccountEmail: varchar('google_account_email', { length: 320 }).notNull(),
  googleAccountId: varchar('google_account_id', { length: 64 }).notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  syncSettings: jsonb('sync_settings').$type<{
    aggressiveness: 'off' | 'passive' | 'moderate' | 'aggressive';
    storeBodies: boolean;
  }>().notNull().default({ aggressiveness: 'moderate', storeBodies: true }),
  gmailHistoryId: varchar('gmail_history_id', { length: 64 }),
  driveStartPageToken: varchar('drive_start_page_token', { length: 128 }),
  calendarSyncToken: text('calendar_sync_token'),
  contactsSyncToken: text('contacts_sync_token'),
  lastSyncAt: timestamp('last_sync_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const googleWorkspaceUserConnections = pgTable('google_workspace_user_connections', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  googleAccountEmail: varchar('google_account_email', { length: 320 }).notNull(),
  googleAccountId: varchar('google_account_id', { length: 64 }).notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  syncSettings: jsonb('sync_settings').$type<{
    aggressiveness: 'off' | 'passive' | 'moderate' | 'aggressive';
    storeBodies: boolean;
  }>().notNull().default({ aggressiveness: 'passive', storeBodies: false }),
  gmailHistoryId: varchar('gmail_history_id', { length: 64 }),
  gmailWatchExpiration: timestamp('gmail_watch_expiration'),
  driveStartPageToken: varchar('drive_start_page_token', { length: 128 }),
  // drive.changes.watch push-channel state. Channels expire ≤ 7 days
  // (typically 1 day) and a daily cron re-subscribes near expiration.
  // driveChannelToken is the secret we hand to Google; webhook handler
  // validates the X-Goog-Channel-Token header against it.
  driveChannelId: varchar('drive_channel_id', { length: 64 }),
  driveChannelResourceId: varchar('drive_channel_resource_id', { length: 64 }),
  driveChannelExpiration: timestamp('drive_channel_expiration'),
  driveChannelToken: varchar('drive_channel_token', { length: 64 }),
  calendarSyncToken: text('calendar_sync_token'),
  contactsSyncToken: text('contacts_sync_token'),
  lastSyncAt: timestamp('last_sync_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  clientUserUnique: uniqueIndex('google_workspace_user_connections_client_user_unique').on(table.clientId, table.userId),
  driveChannelIdIdx: uniqueIndex('google_workspace_user_connections_drive_channel_id').on(table.driveChannelId),
}));

export type GoogleWorkspaceClientConnection = typeof googleWorkspaceClientConnections.$inferSelect;

export type NewGoogleWorkspaceClientConnection = typeof googleWorkspaceClientConnections.$inferInsert;

export type GoogleWorkspaceUserConnection = typeof googleWorkspaceUserConnections.$inferSelect;

export type NewGoogleWorkspaceUserConnection = typeof googleWorkspaceUserConnections.$inferInsert;

// ─── ENTERPRISE TIER: Per-tenant OAuth credentials ────────────────────────
// One row per enterprise client. The client owns their own GCP project + OAuth
// client; we store the credentials here and use them to mint per-tenant OAuth
// flows. Standard-tier clients (MX-based email tracking) have no row.
//
// See: drizzle/0054_workspace_tenant_credentials.sql header for the security
// note on plaintext storage of oauth_client_secret and pubsub_verification_token.

export const googleWorkspaceTenantCredentials = pgTable('google_workspace_tenant_credentials', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),
  googleProjectId: varchar('google_project_id', { length: 64 }).notNull(),
  oauthClientId: text('oauth_client_id').notNull(),
  oauthClientSecretEncrypted: text('oauth_client_secret_encrypted').notNull(),
  oauthRedirectUri: text('oauth_redirect_uri').notNull(),
  pubsubTopic: text('pubsub_topic').notNull(),
  pubsubVerificationToken: text('pubsub_verification_token').notNull(),
  consentScreenUserType: varchar('consent_screen_user_type', { length: 16 })
    .$type<'internal' | 'external'>()
    .notNull()
    .default('internal'),
  status: varchar('status', { length: 16 })
    .$type<'pending' | 'configured' | 'active' | 'revoked'>()
    .notNull()
    .default('pending'),
  configuredByUserId: integer('configured_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  pubsubTokenUnique: uniqueIndex('google_workspace_tenant_credentials_token_idx').on(table.pubsubVerificationToken),
}));

export type GoogleWorkspaceTenantCredentials = typeof googleWorkspaceTenantCredentials.$inferSelect;

export type NewGoogleWorkspaceTenantCredentials = typeof googleWorkspaceTenantCredentials.$inferInsert;

// ─── MICROSOFT TEAMS ────────────────────────────────────────────────────────
// Per-user delegated OAuth grants for Microsoft 365 / Teams. Mirrors
// googleWorkspaceUserConnections in shape — multi-tenant by design (Azure AD
// app registration uses signInAudience: AzureADMultipleOrgs). Subscription
// columns are populated by the renewal cron + webhook flow (PR 2). Delegated
// transcripts permission only sees meetings where the user is organizer or
// co-organizer; a participant-only path requires app-only + RSC and isn't
// part of the MVP.

export const microsoftTeamsUserConnections = pgTable('microsoft_teams_user_connections', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Microsoft Entra ID (Azure AD) tenant the connected user lives in. Distinct
  // from our own SimplerDevelopment clientId — this is the customer's M365
  // tenant.
  microsoftTenantId: varchar('microsoft_tenant_id', { length: 64 }).notNull(),
  // Stable Graph user object id (oid claim) — preferred over UPN/email for
  // referencing the user across token refreshes and tenant changes.
  microsoftUserId: varchar('microsoft_user_id', { length: 64 }).notNull(),
  microsoftAccountEmail: varchar('microsoft_account_email', { length: 320 }).notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  // Graph change-notification subscription state. Subscriptions for transcripts
  // expire ≤ 60 minutes (Microsoft hard cap) — a 25-minute renewal cron must
  // re-subscribe before expiration. clientState is the secret we hand to Graph;
  // webhook handler validates the body's `clientState` field against it.
  subscriptionId: varchar('subscription_id', { length: 64 }),
  subscriptionResource: text('subscription_resource'),
  subscriptionExpiration: timestamp('subscription_expiration'),
  subscriptionClientState: varchar('subscription_client_state', { length: 64 }),
  // Delta token watermark — fallback when notifications are missed and we
  // need to re-page through transcripts since last successful sync.
  deltaToken: text('delta_token'),
  lastSyncAt: timestamp('last_sync_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  clientUserUnique: uniqueIndex('microsoft_teams_user_connections_client_user_unique').on(table.clientId, table.userId),
  subscriptionIdIdx: uniqueIndex('microsoft_teams_user_connections_subscription_id').on(table.subscriptionId),
}));

export type MicrosoftTeamsUserConnection = typeof microsoftTeamsUserConnections.$inferSelect;

export type NewMicrosoftTeamsUserConnection = typeof microsoftTeamsUserConnections.$inferInsert;

export const zoomTokens = pgTable('zoom_tokens', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── BOOKING ADD-ONS, WAIVERS, QUOTES, DATE OVERRIDES ─────────────────────

export const bookingAddOns = pgTable('booking_add_ons', {
  id: serial('id').primaryKey(),
  bookingPageId: integer('booking_page_id').notNull().references(() => bookingPages.id, { onDelete: 'cascade' }),
  source: varchar('source', { length: 10 }).default('custom').notNull(), // custom, product
  // Custom add-on fields
  name: varchar('name', { length: 255 }),
  description: text('description'),
  price: integer('price'), // cents
  image: varchar('image', { length: 500 }),
  // Product reference fields (when source = 'product')
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  // Common
  maxQuantity: integer('max_quantity').default(10),
  active: boolean('active').default(true).notNull(),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const bookingSelectedAddOns = pgTable('booking_selected_add_ons', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  addOnId: integer('add_on_id').notNull().references(() => bookingAddOns.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').default(1).notNull(),
  unitPrice: integer('unit_price').notNull(), // snapshot price at time of booking (cents)
  productName: varchar('product_name', { length: 255 }).notNull(), // snapshot name
});

export const bookingWaivers = pgTable('booking_waivers', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  bookingPageId: integer('booking_page_id').notNull().references(() => bookingPages.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  signerName: varchar('signer_name', { length: 255 }).notNull(),
  signerEmail: varchar('signer_email', { length: 255 }).notNull(),
  signatureData: text('signature_data').notNull(), // base64 PNG from signature pad
  waiverContent: text('waiver_content').notNull(), // snapshot of waiver text at time of signing
  ipAddress: varchar('ip_address', { length: 45 }),
  signedAt: timestamp('signed_at').defaultNow().notNull(),
});

export const bookingQuotes = pgTable('booking_quotes', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  bookingPageId: integer('booking_page_id').references(() => bookingPages.id, { onDelete: 'set null' }),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 50 }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  price: integer('price').notNull(), // cents
  lineItems: json('line_items').$type<{ name: string; quantity: number; unitPrice: number }[]>().default([]),
  startTime: timestamp('start_time'),
  endTime: timestamp('end_time'),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, paid, cancelled, expired
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  paidAt: timestamp('paid_at'),
  bookingId: integer('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bookingDateOverrides = pgTable('booking_date_overrides', {
  id: serial('id').primaryKey(),
  bookingPageId: integer('booking_page_id').notNull().references(() => bookingPages.id, { onDelete: 'cascade' }),
  date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD
  type: varchar('type', { length: 10 }).notNull(), // available, blocked
  startTime: varchar('start_time', { length: 5 }), // "09:00" (for type=available)
  endTime: varchar('end_time', { length: 5 }),     // "17:00" (for type=available)
  note: varchar('note', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('booking_date_overrides_page_date_idx').on(t.bookingPageId, t.date),
]);

// ─── GIFT CERTIFICATES ──────────────────────────────────────────────────────

export const giftCertificates = pgTable('gift_certificates', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'set null' }),
  code: varchar('code', { length: 50 }).notNull().unique(),
  initialAmount: integer('initial_amount').notNull(), // cents
  remainingAmount: integer('remaining_amount').notNull(), // cents
  status: varchar('status', { length: 20 }).default('pending_payment').notNull(),
  // pending_payment, active, fully_redeemed, expired, cancelled
  purchaserName: varchar('purchaser_name', { length: 255 }).notNull(),
  purchaserEmail: varchar('purchaser_email', { length: 255 }).notNull(),
  recipientName: varchar('recipient_name', { length: 255 }),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  personalMessage: text('personal_message'),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  paymentStatus: varchar('payment_status', { length: 20 }).default('pending'),
  redeemableAt: varchar('redeemable_at', { length: 20 }).default('both').notNull(), // booking, store, both
  expiresAt: timestamp('expires_at'), // null = never expires
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const giftCertificateRedemptions = pgTable('gift_certificate_redemptions', {
  id: serial('id').primaryKey(),
  giftCertificateId: integer('gift_certificate_id').notNull().references(() => giftCertificates.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), // cents redeemed
  context: varchar('context', { length: 20 }).notNull(), // booking, store
  referenceId: integer('reference_id'), // booking.id or order.id
  referenceType: varchar('reference_type', { length: 20 }), // booking, order
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── EMAIL CAMPAIGNS ────────────────────────────────────────────────────────

// ─── MCP tool call telemetry ────────────────────────────────────────────────
//
// Per-call audit log of every tool invocation through the in-repo MCP server.
// Captures size + duration + tokens so we can spot expensive tools, blast
// radius on errors, and rank-order callers. Raw events have a 14-day TTL via
// the mcp-cleanup cron; anything older lives only in the daily rollup table
// below (kept forever).
//
// Token estimation is content-aware (JSON ~3.0 chars/tok, hex/UUID ~2.0,
// CJK ~1.0) but still an estimate — async reconciliation against Claude's
// count_tokens API self-tunes coefficients.

export const mcpToolCalls = pgTable('mcp_tool_calls', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  apiKeyId: integer('api_key_id').references(() => portalApiKeys.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  toolName: varchar('tool_name', { length: 100 }).notNull(),
  requestBytes: integer('request_bytes').default(0).notNull(),
  responseBytes: integer('response_bytes').default(0).notNull(),
  estimatedTokens: integer('estimated_tokens').default(0).notNull(),
  durationMs: integer('duration_ms').default(0).notNull(),
  success: boolean('success').default(true).notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('mcp_tool_calls_client_created_idx').on(t.clientId, t.createdAt),
  index('mcp_tool_calls_tool_created_idx').on(t.toolName, t.createdAt),
]);

// Daily aggregates of mcp_tool_calls. Persisted forever; raw events table has
// a 14-day TTL. Re-runnable via UPSERT on (day, client_id, tool_name).
// p95_* columns use percentile_cont(0.95) — friction signal (avg drowns in
// the cheap-tool count, max overstates).
export const mcpToolCallDailyRollups = pgTable('mcp_tool_call_daily_rollups', {
  id: serial('id').primaryKey(),
  day: timestamp('day', { mode: 'date' }).notNull(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  toolName: varchar('tool_name', { length: 100 }).notNull(),
  callCount: integer('call_count').default(0).notNull(),
  successCount: integer('success_count').default(0).notNull(),
  errorCount: integer('error_count').default(0).notNull(),
  // bigint: per-day accumulators sum across every call for a (client, tool);
  // a busy tool overflows int4 (~2.1B) over long windows. mode:'number' keeps
  // the JS surface a number (safe < 2^53) so rollup/usage-stats need no change.
  totalRequestBytes: bigint('total_request_bytes', { mode: 'number' }).default(0).notNull(),
  totalResponseBytes: bigint('total_response_bytes', { mode: 'number' }).default(0).notNull(),
  totalEstimatedTokens: bigint('total_estimated_tokens', { mode: 'number' }).default(0).notNull(),
  totalDurationMs: bigint('total_duration_ms', { mode: 'number' }).default(0).notNull(),
  p95ResponseBytes: integer('p95_response_bytes').default(0).notNull(),
  p95EstimatedTokens: integer('p95_estimated_tokens').default(0).notNull(),
  p95DurationMs: integer('p95_duration_ms').default(0).notNull(),
  maxResponseBytes: integer('max_response_bytes').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('mcp_rollups_day_client_tool_uq').on(t.day, t.clientId, t.toolName),
  index('mcp_rollups_day_idx').on(t.day),
  index('mcp_rollups_client_day_idx').on(t.clientId, t.day),
]);

