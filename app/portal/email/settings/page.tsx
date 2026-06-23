'use client';

import { useState } from 'react';
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

export default function EmailSettingsPage() {
  const [defaultFromName, setDefaultFromName] = useState('');
  const [defaultFromEmail, setDefaultFromEmail] = useState('');
  const [defaultReplyTo, setDefaultReplyTo] = useState('');

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Email Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure defaults and automations for your email marketing</p>
      </div>

      {/* Sender Defaults */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <span className="material-icons text-lg text-primary">alternate_email</span>
          Default Sender
        </h3>
        <p className="text-sm text-muted-foreground">Set default sender details for new campaigns</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">From Name</label>
            <input value={defaultFromName} onChange={e => setDefaultFromName(e.target.value)} placeholder="Your Company Name" className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">From Email</label>
            <input value={defaultFromEmail} onChange={e => setDefaultFromEmail(e.target.value)} placeholder="hello@yourdomain.com" className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Reply-To Email</label>
          <input value={defaultReplyTo} onChange={e => setDefaultReplyTo(e.target.value)} placeholder="replies@yourdomain.com" className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="material-icons text-xs">info</span>
          From email must use a verified sending domain
        </p>
      </div>

      {/* Automations */}
      <div className="bg-card border border-border rounded-xl p-6">
        <ProductAutomationSettings
          productScope="email"
          presets={EMAIL_AUTOMATION_PRESETS}
          title="Email Automations"
          description="Automate subscriber engagement and campaign follow-ups"
        />
      </div>
    </div>
  );
}
