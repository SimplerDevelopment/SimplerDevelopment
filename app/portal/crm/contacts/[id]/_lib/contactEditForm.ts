/**
 * Pure helpers for the contact edit modal (PUX-025, mirrors the company
 * modal from PUX-018). Kept dependency-free (no React) so tab-field
 * grouping and dirty-state detection are unit testable without rendering
 * anything.
 */

export interface ContactEditFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  title: string;
  companyId: string;
  status: string;
  source: string;
  address: string;
  avatarUrl: string;
}

/** Minimal shape of the contact record the edit form is seeded from. */
export interface EditableContactSource {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  title: string | null;
  companyId: number | null;
  /** Denormalised company name, used only to seed the typeahead's closed-state label. */
  companyName: string | null;
  status: string;
  source: string | null;
  address: string | null;
  avatarUrl: string | null;
}

export const CONTACT_STATUS_OPTIONS = ['lead', 'active', 'customer', 'inactive'];
export const CONTACT_SOURCE_OPTIONS = ['web', 'referral', 'cold-call', 'event', 'social', 'other'];

/** Seeds edit-form state from a fetched contact record, coercing nulls to ''. */
export function contactToEditForm(contact: EditableContactSource): ContactEditFormState {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    linkedinUrl: contact.linkedinUrl ?? '',
    title: contact.title ?? '',
    companyId: contact.companyId ? String(contact.companyId) : '',
    status: contact.status,
    source: contact.source ?? '',
    address: contact.address ?? '',
    avatarUrl: contact.avatarUrl ?? '',
  };
}

/** Shallow field-by-field comparison — true if any tracked field changed since the modal opened. */
export function isEditFormDirty(initial: ContactEditFormState, current: ContactEditFormState): boolean {
  return (Object.keys(initial) as (keyof ContactEditFormState)[]).some(
    key => initial[key] !== current[key],
  );
}

export type ContactEditTabId = 'general' | 'details' | 'custom-fields';

interface ContactEditTabDef {
  id: ContactEditTabId;
  label: string;
  icon: string;
  /** Form fields that live on this tab. Empty for the custom-fields tab, which owns no form-state fields. */
  fields: (keyof ContactEditFormState)[];
}

/**
 * Tab grouping for the edit modal, matching how someone actually fills the
 * form out: who this is (General — name, title, company, status, photo),
 * then how to reach them (Details — email, phone, LinkedIn, address,
 * source), then tenant-defined fields (Custom Fields). Kept as data so
 * `contactEditFormFieldCoverage` can assert every form field has exactly
 * one home.
 */
export const CONTACT_EDIT_TABS: readonly ContactEditTabDef[] = [
  { id: 'general', label: 'General', icon: 'person', fields: ['firstName', 'lastName', 'title', 'companyId', 'status', 'avatarUrl'] },
  { id: 'details', label: 'Details', icon: 'contact_page', fields: ['email', 'phone', 'linkedinUrl', 'address', 'source'] },
  { id: 'custom-fields', label: 'Custom Fields', icon: 'tune', fields: [] },
];

const ALL_FORM_FIELDS: (keyof ContactEditFormState)[] = [
  'firstName', 'lastName', 'email', 'phone', 'linkedinUrl', 'title',
  'companyId', 'status', 'source', 'address', 'avatarUrl',
];

/**
 * Returns every form field assigned to more than one tab, or missing from
 * all of them. Empty array means the tab grouping is a clean partition of
 * every editable field — used by a regression test so a future field added
 * to `ContactEditFormState` can't silently fall off the tabs.
 */
export function contactEditFormFieldCoverage(): { duplicated: string[]; missing: string[] } {
  const assigned = CONTACT_EDIT_TABS.flatMap(t => t.fields);
  const counts = new Map<string, number>();
  for (const f of assigned) counts.set(f, (counts.get(f) ?? 0) + 1);
  const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([f]) => f);
  const missing = ALL_FORM_FIELDS.filter(f => !counts.has(f));
  return { duplicated, missing };
}
