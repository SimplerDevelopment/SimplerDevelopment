import type { IndustryTemplate, IndustryTemplateId } from './types';
import { genericTemplate } from './generic';
import { wealthAdvisoryTemplate } from './wealth-advisory';

const ALL_TEMPLATES: Record<IndustryTemplateId, IndustryTemplate> = {
  generic: genericTemplate,
  wealth_advisory: wealthAdvisoryTemplate,
};

export function getIndustryTemplate(id: string): IndustryTemplate {
  return ALL_TEMPLATES[id as IndustryTemplateId] ?? genericTemplate;
}

export function listIndustryTemplates(): IndustryTemplate[] {
  return Object.values(ALL_TEMPLATES);
}

export type { IndustryTemplate, IndustryTemplateId, RelationshipTypeOption } from './types';
