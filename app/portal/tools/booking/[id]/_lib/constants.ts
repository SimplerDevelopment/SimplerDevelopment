/**
 * Static lookups for the booking-page editor:
 *  - tab metadata
 *  - day-of-week labels
 *  - duration options
 *  - booking automation presets
 *
 * Values mirror the original page.tsx — do not change semantics during the
 * refactor; downstream renderers / preset registry depend on the keys.
 */
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';
import type { TabDef } from './types';

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const TABS: TabDef[] = [
  { key: 'settings', label: 'Settings', icon: 'settings' },
  { key: 'styling', label: 'Styling', icon: 'palette' },
  { key: 'availability', label: 'Availability', icon: 'schedule' },
  { key: 'questions', label: 'Questions', icon: 'quiz' },
  { key: 'embed', label: 'Embed', icon: 'code' },
  { key: 'bookings', label: 'Bookings', icon: 'event' },
  { key: 'staff', label: 'Staff', icon: 'group' },
  { key: 'automations', label: 'Automations', icon: 'bolt' },
];

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export const BOOKING_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'confirmation_email',
    name: 'Confirmation Email',
    description:
      'Automatically send a confirmation email when someone books an appointment',
    icon: 'mark_email_read',
    trigger: { event: 'booking.created' },
    actions: [
      {
        tool: 'create_support_ticket',
        params: {
          subject: 'Booking confirmation for {{event.guestName}}',
          body: 'Booking confirmed for {{event.guestName}} ({{event.guestEmail}}) on {{event.date}} at {{event.time}}',
        },
      },
    ],
  },
  {
    key: 'reminder',
    name: 'Appointment Reminder',
    description: 'Send a reminder before the scheduled appointment',
    icon: 'alarm',
    trigger: { event: 'booking.confirmed' },
    actions: [
      {
        tool: 'create_support_ticket',
        params: {
          subject: 'Reminder: Upcoming booking with {{event.guestName}}',
          body: 'You have an upcoming appointment with {{event.guestName}} ({{event.guestEmail}})',
        },
        delay: 86400,
      },
    ],
    settings: [
      {
        key: 'reminderTiming',
        label: 'Send reminder',
        type: 'select',
        options: [
          { value: '3600', label: '1 hour before' },
          { value: '7200', label: '2 hours before' },
          { value: '86400', label: '1 day before' },
          { value: '172800', label: '2 days before' },
        ],
        defaultValue: '86400',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
  {
    key: 'follow_up',
    name: 'Post-Appointment Follow-up',
    description: 'Send a follow-up message after the appointment is completed',
    icon: 'follow_the_signs',
    trigger: { event: 'booking.confirmed' },
    actions: [
      {
        tool: 'create_support_ticket',
        params: {
          subject: 'Follow-up: How was your appointment?',
          body: 'Thank you for your appointment, {{event.guestName}}. We hope everything went well!',
        },
        delay: 86400,
      },
    ],
    settings: [
      {
        key: 'followUpDelay',
        label: 'Send after',
        type: 'select',
        options: [
          { value: '3600', label: '1 hour' },
          { value: '86400', label: '1 day' },
          { value: '172800', label: '2 days' },
          { value: '604800', label: '1 week' },
        ],
        defaultValue: '86400',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
  {
    key: 'create_crm_contact',
    name: 'Add to CRM',
    description:
      'Automatically create a CRM contact when someone books for the first time',
    icon: 'person_add',
    trigger: { event: 'booking.created' },
    actions: [
      {
        tool: 'create_support_ticket',
        params: {
          subject: 'New booking contact: {{event.guestName}}',
          body: 'New contact from booking: {{event.guestName}} - {{event.guestEmail}}',
        },
      },
    ],
  },
  {
    key: 'team_notification',
    name: 'Notify Team',
    description: 'Create a task for your team when a new booking is made',
    icon: 'group',
    trigger: { event: 'booking.created' },
    actions: [
      {
        tool: 'create_support_ticket',
        params: {
          subject: 'New booking: {{event.guestName}} on {{event.date}}',
          body: 'A new booking has been made by {{event.guestName}} ({{event.guestEmail}}). Please prepare accordingly.',
        },
      },
    ],
  },
];
