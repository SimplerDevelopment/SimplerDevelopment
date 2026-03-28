'use client';

import Link from 'next/link';
import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const EMAIL_AUTOMATION_PRESETS: AutomationPreset[] = [
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

export default function EmailAutomationsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/portal/email" className="hover:text-foreground transition-colors">Email Marketing</Link>
        <span className="material-icons text-xs">chevron_right</span>
        <span className="text-foreground">Automations</span>
      </div>

      <ProductAutomationSettings
        productScope="email"
        presets={EMAIL_AUTOMATION_PRESETS}
        title="Email Automations"
        description="Automate subscriber engagement and campaign follow-ups"
      />
    </div>
  );
}
