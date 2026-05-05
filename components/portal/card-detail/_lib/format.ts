/**
 * Pure formatters and lookup tables for the card-detail modal.
 *
 * Extracted from the original CardDetailModal.tsx so section components can
 * import them without dragging in the dispatcher.
 */
import type { Activity } from './types';

export const ARTIFACT_ICONS: Record<string, string> = {
  website: 'language',
  email_campaign: 'campaign',
  pitch_deck: 'slideshow',
  proposal: 'description',
  booking: 'calendar_month',
  survey: 'poll',
  project: 'folder',
};

export const ARTIFACT_LABELS: Record<string, string> = {
  website: 'Website',
  email_campaign: 'Email Campaign',
  pitch_deck: 'Pitch Deck',
  proposal: 'Proposal',
  booking: 'Booking',
  survey: 'Survey',
  project: 'Project',
};

export function artifactUrl(type: string, id: number): string | null {
  switch (type) {
    case 'website':
      return `/portal/websites/${id}`;
    case 'email_campaign':
      return `/portal/email/campaigns/${id}`;
    case 'pitch_deck':
      return `/portal/tools/pitch-decks/${id}`;
    case 'proposal':
      return `/portal/crm/proposals/${id}`;
    case 'booking':
      return `/portal/tools/booking/${id}`;
    case 'survey':
      return `/portal/surveys/${id}`;
    case 'project':
      return `/portal/projects/${id}`;
    default:
      return null;
  }
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Render the human-readable activity line for one activity row. */
export function formatActivity(a: Activity): string {
  const who = a.userName ?? 'Someone';
  const p = a.payload ?? {};
  const q = (v: unknown) => (typeof v === 'string' ? `"${v}"` : String(v));
  switch (a.type) {
    case 'card.created':
      return `${who} created this card`;
    case 'card.title_changed':
      return `${who} renamed to ${q(p.to)}`;
    case 'card.description_changed':
      return `${who} edited the description`;
    case 'card.priority_changed':
      return `${who} set priority to ${p.to ?? 'none'}`;
    case 'card.due_date_changed':
      return p.to
        ? `${who} set due date to ${new Date(String(p.to)).toLocaleDateString()}`
        : `${who} cleared the due date`;
    case 'card.assigned':
      return `${who} assigned the card`;
    case 'card.unassigned':
      return `${who} unassigned the card`;
    case 'card.sprint_changed':
      return p.to ? `${who} moved to a sprint` : `${who} removed from the sprint`;
    case 'card.column_changed':
      return `${who} moved the card to another column`;
    case 'card.label_added':
      return `${who} added label "${p.name}"`;
    case 'card.label_removed':
      return `${who} removed label "${p.name}"`;
    case 'card.commented':
      return `${who} commented`;
    case 'card.file_added':
      return `${who} attached a file`;
    case 'card.checklist_item_added':
      return `${who} added checklist item "${p.text}"`;
    case 'card.checklist_item_completed':
      return `${who} completed "${p.text}"`;
    case 'card.checklist_item_uncompleted':
      return `${who} reopened "${p.text}"`;
    case 'card.checklist_item_removed':
      return `${who} removed checklist item "${p.text}"`;
    case 'card.assignee_added':
      return `${who} assigned ${p.name ?? 'someone'}`;
    case 'card.assignee_removed':
      return `${who} removed ${p.name ?? 'someone'}`;
    case 'card.dependency_added':
      return `${who} added blocker "${p.title ?? p.blockerCardId}"`;
    case 'card.dependency_removed':
      return `${who} removed a blocker`;
    default:
      return `${who} ${a.type}`;
  }
}
