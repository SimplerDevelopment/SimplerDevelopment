// Per-solution product screenshots shown in the /solutions/[slug] hero gallery.
// Web paths under public/screenshots/solutions/<slug>/. Captured against a
// fake-data demo tenant (Northwind Coffee Co. — no real client PII). Generated
// from the captured files; kept separate from lib/data/solutions.ts so the
// screenshot manifest can change independently of the solution copy/registry.
export const solutionScreenshots: Record<string, string[]> = {
  'agency': [
    '/screenshots/solutions/agency/01-agency.webp',
    '/screenshots/solutions/agency/02-branding.webp',
    '/screenshots/solutions/agency/03-custom-domain.webp',
  ],
  'ai-chatbot': [
    '/screenshots/solutions/ai-chatbot/01-inbox.webp',
    '/screenshots/solutions/ai-chatbot/02-widgets.webp',
  ],
  'ai-connect': [
    '/screenshots/solutions/ai-connect/01-api-keys.webp',
    '/screenshots/solutions/ai-connect/02-approvals.webp',
  ],
  'automations': [
    '/screenshots/solutions/automations/01-workflows.webp',
    '/screenshots/solutions/automations/02-workflow-builder.webp',
  ],
  'booking': [
    '/screenshots/solutions/booking/01-booking-list.webp',
    '/screenshots/solutions/booking/02-booking-calendar.webp',
    '/screenshots/solutions/booking/03-booking-analytics.webp',
    '/screenshots/solutions/booking/04-live-booking.webp',
  ],
  'company-brain': [
    '/screenshots/solutions/company-brain/01-brain-dashboard.webp',
    '/screenshots/solutions/company-brain/02-knowledge.webp',
    '/screenshots/solutions/company-brain/03-people.webp',
    '/screenshots/solutions/company-brain/04-decisions.webp',
    '/screenshots/solutions/company-brain/05-org-chart.webp',
    '/screenshots/solutions/company-brain/06-initiatives.webp',
    '/screenshots/solutions/company-brain/07-playbooks.webp',
    '/screenshots/solutions/company-brain/08-glossary.webp',
    '/screenshots/solutions/company-brain/09-ask.webp',
  ],
  'contracts': [
    '/screenshots/solutions/contracts/01-proposals.webp',
    '/screenshots/solutions/contracts/02-contracts.webp',
    '/screenshots/solutions/contracts/03-proposal-detail.webp',
    '/screenshots/solutions/contracts/04-contract-detail.webp',
  ],
  'crm': [
    '/screenshots/solutions/crm/01-crm-overview.webp',
    '/screenshots/solutions/crm/02-contacts.webp',
    '/screenshots/solutions/crm/03-deals-board.webp',
    '/screenshots/solutions/crm/04-contact-detail.webp',
    '/screenshots/solutions/crm/05-companies.webp',
  ],
  'ecommerce': [
    '/screenshots/solutions/ecommerce/01-products.webp',
    '/screenshots/solutions/ecommerce/02-orders.webp',
    '/screenshots/solutions/ecommerce/03-product-detail.webp',
    '/screenshots/solutions/ecommerce/04-live-product-page.webp',
  ],
  'email-marketing': [
    '/screenshots/solutions/email-marketing/01-email-overview.webp',
    '/screenshots/solutions/email-marketing/02-campaigns.webp',
    '/screenshots/solutions/email-marketing/03-lists.webp',
    '/screenshots/solutions/email-marketing/04-analytics.webp',
    '/screenshots/solutions/email-marketing/05-visual-editor.webp',
  ],
  'experiments': [
    '/screenshots/solutions/experiments/01-experiments-list.webp',
    '/screenshots/solutions/experiments/02-experiment-detail.webp',
  ],
  'help-desk': [
    '/screenshots/solutions/help-desk/01-inbox.webp',
    '/screenshots/solutions/help-desk/02-tickets.webp',
  ],
  'hosting': [
    '/screenshots/solutions/hosting/01-hosting.webp',
  ],
  'invoicing': [
    '/screenshots/solutions/invoicing/02-invoice-detail.webp',
    '/screenshots/solutions/invoicing/03-settings-billing.webp',
  ],
  'pitch-decks': [
    '/screenshots/solutions/pitch-decks/01-decks-list.webp',
    '/screenshots/solutions/pitch-decks/02-deck-detail.webp',
  ],
  'project-management': [
    '/screenshots/solutions/project-management/01-projects-list.webp',
    '/screenshots/solutions/project-management/02-project-board.webp',
    '/screenshots/solutions/project-management/03-my-tasks.webp',
    '/screenshots/solutions/project-management/04-card-edit.webp',
    '/screenshots/solutions/project-management/05-sprint-edit.webp',
    '/screenshots/solutions/project-management/06-sprint-report.webp',
  ],
  'publishing': [
    '/screenshots/solutions/publishing/01-board.webp',
    '/screenshots/solutions/publishing/02-calendar.webp',
    '/screenshots/solutions/publishing/03-campaigns.webp',
  ],
  'surveys': [
    '/screenshots/solutions/surveys/01-surveys-list.webp',
    '/screenshots/solutions/surveys/02-survey-detail.webp',
    '/screenshots/solutions/surveys/03-live-survey.webp',
  ],
  'websites': [
    '/screenshots/solutions/websites/01-websites.webp',
    '/screenshots/solutions/websites/02-site-entries.webp',
    '/screenshots/solutions/websites/03-visual-editor.webp',
  ],
};

export function getSolutionScreenshots(slug: string): string[] {
  return solutionScreenshots[slug] ?? [];
}
