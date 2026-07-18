'use client';

import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const WEBSITE_NOTIFICATION_PRESETS: AutomationPreset[] = [
  {
    key: 'form_notification',
    name: 'Form Submission',
    description: 'Get notified when someone submits a form on your website',
    icon: 'mark_email_unread',
    trigger: { event: 'form.submitted' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New form submission on your website', body: 'Someone submitted a form on your website. Check your submissions to review and respond.' } }],
  },
  {
    key: 'page_published_notify',
    name: 'Page Published',
    description: 'Get notified when a new page or blog post is published',
    icon: 'publish',
    trigger: { event: 'page.published' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Page published: Review live version', body: 'A new page has been published on your website. Review the live version to ensure everything looks correct.' } }],
  },
  {
    key: 'order_placed_notify',
    name: 'New Order',
    description: 'Get notified when a customer places an order',
    icon: 'shopping_bag',
    trigger: { event: 'order.placed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New order placed: {{event.customerEmail}}', body: 'A new order has been placed by {{event.customerEmail}} for ${{event.total}}. Process and fulfill the order.' } }],
  },
  {
    key: 'order_shipped_notify',
    name: 'Order Shipped',
    description: 'Get notified when an order is marked as shipped',
    icon: 'local_shipping',
    trigger: { event: 'order.shipped' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Order shipped: {{event.customerEmail}}', body: 'An order for {{event.customerEmail}} has been shipped. Tracking and fulfillment details are available in your store dashboard.' } }],
  },
  {
    key: 'low_stock_notify',
    name: 'Low Stock Alert',
    description: 'Get notified when a product falls below your stock threshold',
    icon: 'inventory_2',
    trigger: { event: 'product.low_stock' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Low stock: {{event.productName}}', body: '{{event.productName}} has fallen below your low stock threshold ({{event.currentStock}} remaining). Consider reordering.' } }],
  },
];

export default function WebsiteNotificationSettings() {
  return (
    <ProductAutomationSettings
      productScope="website"
      presets={WEBSITE_NOTIFICATION_PRESETS}
      title="Notifications"
      description="Get alerted about important website and store events"
    />
  );
}
