// Per-product automation presets shown in the Brain Automations "Presets"
// tab. Each preset is a one-toggle rule the user can enable, optionally with
// a few configurable fields (delay, etc). Saving a preset writes a regular
// row in `automation_rules` with `source = 'settings'` and a `productScope`
// matching the product the preset belongs to — so the runtime engine treats
// presets identically to NLP- or template-built rules.

import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

export const EMAIL_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'welcome_email',
    name: 'Welcome Email (team ticket)',
    description:
      'Opens a support ticket for your team to send a personalised welcome when a new subscriber joins a list. (A transactional-email send action is not yet available — this creates a ticket as a manual step.)',
    icon: 'waving_hand',
    trigger: { event: 'email.subscriber.added' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New subscriber: {{event.email}}', body: 'A new subscriber ({{event.email}}) joined your mailing list. Send them a welcome message.' } }],
  },
  {
    key: 'unsubscribe_notification',
    name: 'Unsubscribe Notification (team ticket)',
    description:
      'Opens a support ticket for your team when someone unsubscribes from your list. (A direct notification send action is not yet available — this creates a ticket as a manual step.)',
    icon: 'notifications',
    trigger: { event: 'email.subscriber.unsubscribed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Subscriber unsubscribed: {{event.email}}', body: '{{event.email}} has unsubscribed from your mailing list.' } }],
  },
  {
    key: 'campaign_sent_report',
    name: 'Campaign Sent Follow-up (team ticket)',
    description:
      'Opens a ticket to remind your team to check campaign engagement metrics after the delay period. (A scheduled-report send action is not yet available — this creates a ticket as a manual step.)',
    icon: 'assessment',
    trigger: { event: 'email.campaign.sent' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Review results: {{event.name}}', body: 'Campaign "{{event.name}}" has been sent. Check engagement metrics in 24-48 hours.' }, delay: 86400 }],
    settings: [
      {
        key: 'reportDelay',
        label: 'Check results after',
        type: 'select',
        options: [
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
    key: 'subscriber_to_crm',
    name: 'Add Subscriber to CRM',
    description:
      'Automatically creates a CRM contact when someone subscribes to your list.',
    icon: 'person_add',
    trigger: { event: 'email.subscriber.added' },
    actions: [{
      tool: 'create_crm_contact',
      params: {
        email: '{{event.email}}',
        name: '{{event.name}}',
        notes: 'Auto-created from email subscriber sign-up.',
      },
    }],
  },
  {
    key: 're_engagement',
    name: 'Re-engagement Reminder (team ticket)',
    description:
      'Opens a ticket reminding your team to send a re-engagement campaign to non-openers after a campaign. (An automated re-engagement send action is not yet available — this creates a ticket as a manual step.)',
    icon: 'refresh',
    trigger: { event: 'email.campaign.sent' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Re-engagement opportunity', body: 'Review non-openers from your recent campaign "{{event.name}}" and consider a targeted follow-up.' }, delay: 604800 }],
    settings: [
      {
        key: 'reEngageDelay',
        label: 'Remind after',
        type: 'select',
        options: [
          { value: '259200', label: '3 days' },
          { value: '604800', label: '1 week' },
          { value: '1209600', label: '2 weeks' },
        ],
        defaultValue: '604800',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
];

export interface ProductPresetGroup {
  productScope: string;
  label: string;
  icon: string;
  description: string;
  presets: AutomationPreset[];
}

export const BOOKING_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'booking_to_crm_contact',
    name: 'New Booking → CRM Contact',
    description:
      'Automatically creates a CRM contact when a guest books a slot, so every new lead lands in your pipeline.',
    icon: 'person_add',
    trigger: { event: 'booking.guest_booked' },
    actions: [{
      tool: 'create_crm_contact',
      params: {
        first_name: '{{event.guestName}}',
        email: '{{event.guestEmail}}',
        phone: '{{event.guestPhone}}',
        source: 'web',
        status: 'lead',
        notes: 'Auto-created from booking: {{event.pageTitle}}',
      },
    }],
  },
  {
    key: 'booking_confirmed_to_deal',
    name: 'Confirmed Booking → CRM Deal',
    description:
      'Opens a CRM deal when a paid booking is confirmed, so revenue opportunities flow directly into your sales pipeline.',
    icon: 'handshake',
    trigger: { event: 'booking.confirmed' },
    actions: [{
      tool: 'create_crm_deal',
      params: {
        title: 'Booking: {{event.pageTitle}} — {{event.guestName}}',
        value: '{{event.total}}',
        notes: 'Auto-created from confirmed booking on {{event.startTime}}. Guest: {{event.guestEmail}}',
        priority: 'medium',
      },
    }],
  },
  {
    key: 'booking_team_ticket',
    name: 'New Booking → Team Ticket',
    description:
      'Opens a support ticket for your team when a new booking arrives so nothing falls through the cracks.',
    icon: 'confirmation_number',
    trigger: { event: 'booking.guest_booked' },
    actions: [{
      tool: 'create_support_ticket',
      params: {
        subject: 'New booking: {{event.pageTitle}} — {{event.guestName}}',
        body: '{{event.guestName}} ({{event.guestEmail}}) booked a slot on {{event.pageTitle}} starting {{event.startTime}}.',
      },
    }],
  },
];

export const SURVEY_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'survey_response_to_crm_contact',
    name: 'Survey Response → CRM Contact',
    description:
      'Creates a CRM contact when a respondent submits their email address in a survey, capturing every inbound lead automatically.',
    icon: 'person_add',
    trigger: { event: 'survey.response_submitted' },
    conditions: [{ field: 'respondentEmail', operator: 'exists' }],
    actions: [{
      tool: 'create_crm_contact',
      params: {
        first_name: '{{event.respondentName}}',
        email: '{{event.respondentEmail}}',
        source: 'web',
        status: 'lead',
        notes: 'Auto-created from survey response: {{event.surveyTitle}}',
      },
    }],
  },
  {
    key: 'survey_response_to_deal',
    name: 'Survey Response → CRM Deal',
    description:
      'Opens a deal in your pipeline when someone submits a survey that signals purchase intent — ideal for quote-request or needs-assessment forms.',
    icon: 'attach_money',
    trigger: { event: 'survey.response_submitted' },
    actions: [{
      tool: 'create_crm_deal',
      params: {
        title: 'Survey inquiry: {{event.surveyTitle}} — {{event.respondentName}}',
        notes: 'Auto-created from survey "{{event.surveyTitle}}" submitted by {{event.respondentEmail}}',
        priority: 'medium',
      },
    }],
  },
  {
    key: 'survey_response_ticket',
    name: 'Survey Response → Team Ticket',
    description:
      'Opens a support ticket for your team when a new survey response arrives so someone follows up promptly.',
    icon: 'assignment',
    trigger: { event: 'survey.response_submitted' },
    actions: [{
      tool: 'create_support_ticket',
      params: {
        subject: 'New survey response: {{event.surveyTitle}}',
        body: '{{event.respondentName}} ({{event.respondentEmail}}) submitted a response to "{{event.surveyTitle}}". Review it in the portal.',
      },
    }],
  },
];

export const PRODUCT_PRESET_GROUPS: ProductPresetGroup[] = [
  {
    productScope: 'email',
    label: 'Email Marketing',
    icon: 'email',
    description: 'Automate subscriber engagement and campaign follow-ups',
    presets: EMAIL_AUTOMATION_PRESETS,
  },
  {
    productScope: 'booking',
    label: 'Bookings',
    icon: 'calendar_month',
    description: 'Capture leads and open deals automatically when guests book',
    presets: BOOKING_AUTOMATION_PRESETS,
  },
  {
    productScope: 'survey',
    label: 'Surveys',
    icon: 'poll',
    description: 'Turn survey responses into CRM contacts and deals automatically',
    presets: SURVEY_AUTOMATION_PRESETS,
  },
];
