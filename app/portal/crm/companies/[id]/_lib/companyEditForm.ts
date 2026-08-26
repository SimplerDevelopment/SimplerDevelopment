/**
 * Pure helpers for the company edit modal (PUX-018). Kept dependency-free
 * (no React) so tab-field grouping and dirty-state detection are unit
 * testable without rendering anything.
 */

export interface CompanyEditFormState {
  name: string;
  domain: string;
  industry: string;
  size: string;
  phone: string;
  website: string;
  address: string;
  latitude: string;
  longitude: string;
  logoUrl: string;
  notes: string;
}

/** Minimal shape of the company record the edit form is seeded from. */
export interface EditableCompanySource {
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  logoUrl: string | null;
  notes: string | null;
}

export const COMPANY_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];

/** Seeds edit-form state from a fetched company record, coercing nulls to ''. */
export function companyToEditForm(company: EditableCompanySource): CompanyEditFormState {
  return {
    name: company.name,
    domain: company.domain ?? '',
    industry: company.industry ?? '',
    size: company.size ?? '',
    phone: company.phone ?? '',
    website: company.website ?? '',
    address: company.address ?? '',
    latitude: company.latitude !== null && company.latitude !== undefined ? String(company.latitude) : '',
    longitude: company.longitude !== null && company.longitude !== undefined ? String(company.longitude) : '',
    logoUrl: company.logoUrl ?? '',
    notes: company.notes ?? '',
  };
}

/** Shallow field-by-field comparison — true if any tracked field changed since the modal opened. */
export function isEditFormDirty(initial: CompanyEditFormState, current: CompanyEditFormState): boolean {
  return (Object.keys(initial) as (keyof CompanyEditFormState)[]).some(
    key => initial[key] !== current[key],
  );
}

export type CompanyEditTabId = 'general' | 'details' | 'branding' | 'custom-fields';

interface CompanyEditTabDef {
  id: CompanyEditTabId;
  label: string;
  icon: string;
  /** Form fields that live on this tab. Empty for the custom-fields tab, which owns no form-state fields. */
  fields: (keyof CompanyEditFormState)[];
}

/**
 * Tab grouping for the edit modal, matching how someone actually fills the
 * form out: identity/classification first (General), then how to reach and
 * locate them (Details — contact info, address, free-form notes), then the
 * visual identity (Branding), then tenant-defined fields (Custom Fields).
 * Kept as data so `companyEditFormFieldCoverage` can assert every form field
 * has exactly one home.
 */
export const COMPANY_EDIT_TABS: readonly CompanyEditTabDef[] = [
  { id: 'general', label: 'General', icon: 'business', fields: ['name', 'domain', 'industry', 'size'] },
  { id: 'details', label: 'Details', icon: 'contact_page', fields: ['phone', 'website', 'address', 'latitude', 'longitude', 'notes'] },
  { id: 'branding', label: 'Branding', icon: 'image', fields: ['logoUrl'] },
  { id: 'custom-fields', label: 'Custom Fields', icon: 'tune', fields: [] },
];

const ALL_FORM_FIELDS: (keyof CompanyEditFormState)[] = [
  'name', 'domain', 'industry', 'size', 'phone', 'website',
  'address', 'latitude', 'longitude', 'logoUrl', 'notes',
];

/**
 * Returns every form field assigned to more than one tab, or missing from
 * all of them. Empty array means the tab grouping is a clean partition of
 * every editable field — used by a regression test so a future field added
 * to `CompanyEditFormState` can't silently fall off the tabs.
 */
export function companyEditFormFieldCoverage(): { duplicated: string[]; missing: string[] } {
  const assigned = COMPANY_EDIT_TABS.flatMap(t => t.fields);
  const counts = new Map<string, number>();
  for (const f of assigned) counts.set(f, (counts.get(f) ?? 0) + 1);
  const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([f]) => f);
  const missing = ALL_FORM_FIELDS.filter(f => !counts.has(f));
  return { duplicated, missing };
}
