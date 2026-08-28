/**
 * PUX-195 (design doc screen 54): the one list of account-settings leaves,
 * read by the layout's nav and by the /portal/settings index page. Ten
 * routes (the doc counted eight; Billing and Team are leaves too).
 */
export const SETTINGS_TABS = [
  { href: '/portal/settings/profile', label: 'Profile', icon: 'person', description: 'Name, company, password and your portal subdomain' },
  { href: '/portal/settings/security', label: 'Security', icon: 'security', description: 'Two-factor authentication' },
  { href: '/portal/settings/notifications', label: 'Notifications', icon: 'notifications', description: 'What reaches you, and where' },
  { href: '/portal/settings/billing', label: 'Billing', icon: 'payments', description: 'Modules, payment methods and invoices' },
  { href: '/portal/settings/team', label: 'Team', icon: 'group', description: 'Members, roles and invites' },
  { href: '/portal/settings/ai', label: 'AI Assistant', icon: 'smart_toy', description: 'Usage and token receipts' },
  { href: '/portal/settings/api-keys', label: 'API Keys', icon: 'vpn_key', description: 'MCP endpoint and connectors' },
  { href: '/portal/settings/webhooks', label: 'Webhooks', icon: 'webhook', description: 'Endpoints, secrets and delivery' },
  { href: '/portal/settings/integrations', label: 'Integrations', icon: 'integration_instructions', description: 'Google Workspace, LinkedIn, Microsoft Teams' },
  { href: '/portal/settings/support', label: 'Support', icon: 'support_agent', description: 'Tickets and help from the team' },
] as const;
