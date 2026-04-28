import type { IndustryTemplate } from './types';

export const wealthAdvisoryTemplate: IndustryTemplate = {
  id: 'wealth_advisory',
  label: 'Wealth Advisory',
  description: 'Households, divorce cases, family business, plan sponsors, prospects, referral partners.',
  relationshipTypes: [
    { id: 'household', label: 'Household' },
    { id: 'divorce_case', label: 'Divorce Case' },
    { id: 'family_business', label: 'Family Business' },
    { id: 'plan_sponsor', label: 'Plan Sponsor' },
    { id: 'prospect', label: 'Prospect' },
    { id: 'referral_partner', label: 'Referral Partner' },
  ],
  serviceLines: [
    'Investments & Planning',
    'Divorce',
    'Family Business',
    'Cryptocurrency Education',
    'Retirement Plans',
  ],
  defaultViews: [
    'Founder Today',
    'EA Queue',
    'Ops Review',
    'Advisor Review',
    'Compliance Review',
  ],
  complianceDefaults: {
    requireHumanReviewForAi: true,
    auditAiChanges: true,
    blockedFields: ['ssn', 'tax_id', 'account_number', 'routing_number'],
  },
};
