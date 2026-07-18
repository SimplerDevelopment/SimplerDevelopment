import type { IndustryTemplate } from './types';

export const genericTemplate: IndustryTemplate = {
  id: 'generic',
  label: 'Generic',
  description: 'A flexible default that fits most teams.',
  relationshipTypes: [
    { id: 'company', label: 'Company' },
    { id: 'prospect', label: 'Prospect' },
    { id: 'partner', label: 'Partner' },
    { id: 'vendor', label: 'Vendor' },
  ],
  serviceLines: [],
  defaultViews: ['Today', 'Needs Review', 'Overdue'],
  complianceDefaults: {
    requireHumanReviewForAi: true,
    auditAiChanges: true,
    blockedFields: [],
  },
};
