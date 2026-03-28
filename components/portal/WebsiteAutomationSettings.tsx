'use client';

import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const WEBSITE_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'form_to_crm',
    name: 'Form Submission to CRM',
    description: 'Automatically create a CRM contact when a visitor submits a form on your website',
    icon: 'contact_page',
    trigger: { event: 'form.submitted' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New form submission from website', body: 'A visitor submitted a form on your website. Review the submission and follow up.' } }],
  },
  {
    key: 'form_notification',
    name: 'Form Submission Notification',
    description: 'Get notified instantly when someone submits a form on your website',
    icon: 'notifications',
    trigger: { event: 'form.submitted' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New form submission on your website', body: 'Someone submitted a form on your website. Check your submissions to review and respond.' } }],
  },
  {
    key: 'page_published_notify',
    name: 'Page Published Alert',
    description: 'Get notified when a new page or blog post is published on your website',
    icon: 'publish',
    trigger: { event: 'page.published' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Page published: Review live version', body: 'A new page has been published on your website. Review the live version to ensure everything looks correct.' } }],
  },
  {
    key: 'order_placed_notify',
    name: 'New Order Notification',
    description: 'Get alerted when a customer places an order in your store',
    icon: 'shopping_bag',
    trigger: { event: 'order.placed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New order placed: {{event.customerEmail}}', body: 'A new order has been placed by {{event.customerEmail}} for ${{event.total}}. Process and fulfill the order.' } }],
  },
  {
    key: 'order_to_crm',
    name: 'Add Customer to CRM on Purchase',
    description: 'Automatically track new customers in your CRM when they make a purchase',
    icon: 'person_add',
    trigger: { event: 'order.paid' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New customer from store: {{event.customerEmail}}', body: 'A new customer ({{event.customerEmail}}) made a purchase. Add them to the CRM for follow-up and retention.' } }],
  },
  {
    key: 'post_purchase_followup',
    name: 'Post-Purchase Follow-up',
    description: 'Send a follow-up task after a customer purchase for review requests or upsells',
    icon: 'follow_the_signs',
    trigger: { event: 'order.paid' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Follow up with customer: {{event.customerEmail}}', body: 'Customer {{event.customerEmail}} made a purchase. Schedule a follow-up to request a review or offer related products.' }, delay: 1209600 }],
    settings: [
      {
        key: 'followUpDelay',
        label: 'Follow up after',
        type: 'select',
        options: [
          { value: '604800', label: '1 week' },
          { value: '1209600', label: '2 weeks' },
          { value: '2592000', label: '30 days' },
        ],
        defaultValue: '1209600',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
];

export default function WebsiteAutomationSettings() {
  return (
    <ProductAutomationSettings
      productScope="website"
      presets={WEBSITE_AUTOMATION_PRESETS}
      title="Website Automations"
      description="Automate form handling, notifications, and customer follow-ups"
    />
  );
}
