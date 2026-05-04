/**
 * Shared types for the CRM Deals page (kanban + drawer + form).
 * Extracted from app/portal/crm/deals/page.tsx during the refactor.
 */

export interface Pipeline {
  id: number;
  name: string;
  stages: Stage[];
}

export interface Stage {
  id: number;
  name: string;
  color: string | null;
  probability: number;
  order: number;
}

export interface Deal {
  id: number;
  title: string;
  value: number;
  status: string;
  priority: string;
  expectedCloseDate: string | null;
  contactId: number | null;
  contactName: string | null;
  companyId: number | null;
  companyName: string | null;
  stageId: number;
  pipelineId: number;
  notes: string | null;
  ownerId: number | null;
  ownerName: string | null;
  recurringValue: number | null;
  billingCycle: string | null;
  createdAt: string;
}

export interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  companyId: number | null;
}

export interface Company {
  id: number;
  name: string;
}

export interface Artifact {
  id: number;
  dealId: number;
  artifactType: string;
  artifactId: number;
  displayTitle: string;
  pinned: boolean;
  createdAt: string;
}

export interface AvailableArtifact {
  type: string;
  id: number;
  title: string;
}

export interface Comment {
  id: number;
  dealId: number;
  authorId: number;
  authorName: string | null;
  body: string;
  attachments: { url: string; filename: string; mimeType: string; fileSize: number }[];
  createdAt: string;
}

export interface MentionUser {
  id: number;
  name: string | null;
}

export type PanelTab = 'details' | 'artifacts' | 'comments';

export interface DealFormState {
  title: string;
  value: string;
  contactId: string;
  companyId: string;
  pipelineId: string;
  stageId: string;
  priority: string;
  expectedCloseDate: string;
  notes: string;
}

export interface DealEditFormState extends DealFormState {
  status: string;
}
