// Per-solution product screenshots shown in the /solutions/[slug] hero gallery.
// Web paths under public/screenshots/solutions/<slug>/. Captured against a
// fake-data demo tenant (Northwind Coffee Co. — no real client PII). Generated
// from the captured files; kept separate from lib/data/solutions.ts so the
// screenshot manifest can change independently of the solution copy/registry.
export const solutionScreenshots: Record<string, string[]> = {
  'agency': [
    '/screenshots/solutions/agency/01-agency.png',
    '/screenshots/solutions/agency/02-branding.png',
    '/screenshots/solutions/agency/03-custom-domain.png',
  ],
  'ai-chatbot': [
    '/screenshots/solutions/ai-chatbot/01-inbox.png',
    '/screenshots/solutions/ai-chatbot/02-widgets.png',
  ],
  'ai-connect': [
    '/screenshots/solutions/ai-connect/01-api-keys.png',
    '/screenshots/solutions/ai-connect/02-approvals.png',
  ],
  'automations': [
    '/screenshots/solutions/automations/01-workflows.png',
    '/screenshots/solutions/automations/02-workflow-builder.png',
  ],
  'booking': [
    '/screenshots/solutions/booking/01-booking-list.png',
    '/screenshots/solutions/booking/02-booking-calendar.png',
    '/screenshots/solutions/booking/03-booking-analytics.png',
    '/screenshots/solutions/booking/04-live-booking.png',
  ],
  'company-brain': [
    '/screenshots/solutions/company-brain/01-brain-dashboard.png',
    '/screenshots/solutions/company-brain/02-knowledge.png',
    '/screenshots/solutions/company-brain/03-people.png',
    '/screenshots/solutions/company-brain/04-decisions.png',
    '/screenshots/solutions/company-brain/05-org-chart.png',
    '/screenshots/solutions/company-brain/06-initiatives.png',
    '/screenshots/solutions/company-brain/07-playbooks.png',
    '/screenshots/solutions/company-brain/08-glossary.png',
    '/screenshots/solutions/company-brain/09-ask.png',
  ],
  'contracts': [
    '/screenshots/solutions/contracts/01-proposals.png',
    '/screenshots/solutions/contracts/02-contracts.png',
    '/screenshots/solutions/contracts/03-proposal-detail.png',
    '/screenshots/solutions/contracts/04-contract-detail.png',
  ],
  'crm': [
    '/screenshots/solutions/crm/01-crm-overview.png',
    '/screenshots/solutions/crm/02-contacts.png',
    '/screenshots/solutions/crm/03-deals-board.png',
    '/screenshots/solutions/crm/04-contact-detail.png',
    '/screenshots/solutions/crm/05-companies.png',
  ],
  'ecommerce': [
    '/screenshots/solutions/ecommerce/01-products.png',
    '/screenshots/solutions/ecommerce/02-orders.png',
    '/screenshots/solutions/ecommerce/03-product-detail.png',
    '/screenshots/solutions/ecommerce/04-live-product-page.png',
  ],
  'email-marketing': [
    '/screenshots/solutions/email-marketing/01-email-overview.png',
    '/screenshots/solutions/email-marketing/02-campaigns.png',
    '/screenshots/solutions/email-marketing/03-lists.png',
    '/screenshots/solutions/email-marketing/04-analytics.png',
    '/screenshots/solutions/email-marketing/05-visual-editor.png',
  ],
  'experiments': [
    '/screenshots/solutions/experiments/01-experiments-list.png',
    '/screenshots/solutions/experiments/02-experiment-detail.png',
  ],
  'help-desk': [
    '/screenshots/solutions/help-desk/01-inbox.png',
    '/screenshots/solutions/help-desk/02-tickets.png',
    '/screenshots/solutions/help-desk/03-conversation-thread.png',
  ],
  'hosting': [
    '/screenshots/solutions/hosting/01-hosting.png',
    '/screenshots/solutions/hosting/02-hosting-detail.png',
  ],
  'invoicing': [
    '/screenshots/solutions/invoicing/01-billing.png',
    '/screenshots/solutions/invoicing/02-invoice-detail.png',
    '/screenshots/solutions/invoicing/03-settings-billing.png',
  ],
  'pitch-decks': [
    '/screenshots/solutions/pitch-decks/01-decks-list.png',
    '/screenshots/solutions/pitch-decks/02-deck-detail.png',
  ],
  'project-management': [
    '/screenshots/solutions/project-management/01-projects-list.png',
    '/screenshots/solutions/project-management/02-project-board.png',
    '/screenshots/solutions/project-management/03-my-tasks.png',
    '/screenshots/solutions/project-management/04-card-edit.png',
    '/screenshots/solutions/project-management/05-sprint-edit.png',
    '/screenshots/solutions/project-management/06-sprint-report.png',
  ],
  'publishing': [
    '/screenshots/solutions/publishing/01-board.png',
    '/screenshots/solutions/publishing/02-calendar.png',
    '/screenshots/solutions/publishing/03-campaigns.png',
  ],
  'surveys': [
    '/screenshots/solutions/surveys/01-surveys-list.png',
    '/screenshots/solutions/surveys/02-survey-detail.png',
    '/screenshots/solutions/surveys/03-live-survey.png',
  ],
  'websites': [
    '/screenshots/solutions/websites/01-websites.png',
    '/screenshots/solutions/websites/02-site-entries.png',
    '/screenshots/solutions/websites/03-visual-editor.png',
  ],
};

export function getSolutionScreenshots(slug: string): string[] {
  return solutionScreenshots[slug] ?? [];
}
