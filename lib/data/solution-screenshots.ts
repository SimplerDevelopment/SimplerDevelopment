// Per-solution product screenshots shown in the /solutions/[slug] hero gallery.
// Web paths under public/screenshots/solutions/<slug>/.
//
// Every entry here was captured by scripts/capture-solution-screenshots.ts and
// PASSED lib/screenshots/audit.ts — no empty states, no e2e fixture names, no
// localhost URLs, no NaN. A slug with no entry renders no gallery on purpose:
// the page falls back to its icon visual, which beats shipping a known-bad image.
export const solutionScreenshots: Record<string, string[]> = {
  'agency': [
    '/screenshots/solutions/agency/02-branding.webp',
    '/screenshots/solutions/agency/03-custom-domain.webp',
  ],
  'ai-chatbot': [
    '/screenshots/solutions/ai-chatbot/01-inbox.webp',
  ],
  'ai-connect': [
    '/screenshots/solutions/ai-connect/02-approvals.webp',
  ],
  'automations': [
    '/screenshots/solutions/automations/01-workflows.webp',
  ],
  'booking': [
    '/screenshots/solutions/booking/02-booking-calendar.webp',
    '/screenshots/solutions/booking/03-booking-analytics.webp',
  ],
  'company-brain': [
    '/screenshots/solutions/company-brain/03-people.webp',
    '/screenshots/solutions/company-brain/04-decisions.webp',
    '/screenshots/solutions/company-brain/05-org-chart.webp',
    '/screenshots/solutions/company-brain/06-initiatives.webp',
    '/screenshots/solutions/company-brain/07-playbooks.webp',
    '/screenshots/solutions/company-brain/08-glossary.webp',
  ],
  'contracts': [
    '/screenshots/solutions/contracts/01-proposals.webp',
    '/screenshots/solutions/contracts/02-contracts.webp',
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
  ],
  'email-marketing': [
    '/screenshots/solutions/email-marketing/01-email-overview.webp',
    '/screenshots/solutions/email-marketing/02-campaigns.webp',
    '/screenshots/solutions/email-marketing/03-lists.webp',
    '/screenshots/solutions/email-marketing/04-analytics.webp',
  ],
  'experiments': [
    '/screenshots/solutions/experiments/01-experiments-list.webp',
    '/screenshots/solutions/experiments/02-experiment-detail.webp',
  ],
  'help-desk': [
    '/screenshots/solutions/help-desk/01-tickets.webp',
    '/screenshots/solutions/help-desk/02-ticket-detail.webp',
  ],
  'hosting': [
    '/screenshots/solutions/hosting/01-hosting.webp',
  ],
  'pitch-decks': [
    '/screenshots/solutions/pitch-decks/01-decks-list.webp',
  ],
  'project-management': [
    '/screenshots/solutions/project-management/01-projects-list.webp',
    '/screenshots/solutions/project-management/02-project-board.webp',
    '/screenshots/solutions/project-management/03-my-tasks.webp',
  ],
  'publishing': [
    '/screenshots/solutions/publishing/01-board.webp',
    '/screenshots/solutions/publishing/02-calendar.webp',
    '/screenshots/solutions/publishing/03-campaigns.webp',
  ],
  'surveys': [
    '/screenshots/solutions/surveys/01-surveys-list.webp',
    '/screenshots/solutions/surveys/02-survey-detail.webp',
  ],
  'websites': [
    '/screenshots/solutions/websites/01-websites.webp',
    '/screenshots/solutions/websites/02-site-entries.webp',
  ],
};

export function getSolutionScreenshots(slug: string): string[] {
  return solutionScreenshots[slug] ?? [];
}
