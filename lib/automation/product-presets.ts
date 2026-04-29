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
    name: 'Welcome Email',
    description: 'Send a welcome message when a new subscriber joins a list',
    icon: 'waving_hand',
    trigger: { event: 'email.subscriber.added' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New subscriber: {{event.email}}', body: 'A new subscriber ({{event.email}}) has joined your mailing list.' } }],
  },
  {
    key: 'unsubscribe_notification',
    name: 'Unsubscribe Notification',
    description: 'Get notified when someone unsubscribes from your list',
    icon: 'notifications',
    trigger: { event: 'email.subscriber.unsubscribed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Subscriber unsubscribed: {{event.email}}', body: '{{event.email}} has unsubscribed from your mailing list.' } }],
  },
  {
    key: 'campaign_sent_report',
    name: 'Campaign Sent Report',
    description: 'Create a follow-up task when a campaign is sent for tracking results',
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
    name: 'Add Subscribers to CRM',
    description: 'Automatically create a CRM contact when someone subscribes to your list',
    icon: 'person_add',
    trigger: { event: 'email.subscriber.added' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New email subscriber for CRM: {{event.email}}', body: 'Consider adding {{event.email}} as a CRM contact for nurturing.' } }],
  },
  {
    key: 're_engagement',
    name: 'Re-engagement Reminder',
    description: 'Get a reminder to send a re-engagement campaign to inactive subscribers',
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

export const PRODUCT_PRESET_GROUPS: ProductPresetGroup[] = [
  {
    productScope: 'email',
    label: 'Email Marketing',
    icon: 'email',
    description: 'Automate subscriber engagement and campaign follow-ups',
    presets: EMAIL_AUTOMATION_PRESETS,
  },
];
