export type IndustryTemplateId = 'generic' | 'wealth_advisory';

export interface RelationshipTypeOption {
  id: string;
  label: string;
}

export interface IndustryTemplate {
  id: IndustryTemplateId;
  label: string;
  description: string;
  relationshipTypes: RelationshipTypeOption[];
  serviceLines: string[];
  defaultViews: string[];
  complianceDefaults: {
    requireHumanReviewForAi: boolean;
    auditAiChanges: boolean;
    blockedFields: string[];
  };
}
