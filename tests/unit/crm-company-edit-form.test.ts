/**
 * Unit tests for the pure helpers backing the CRM company edit modal
 * (PUX-018) — `app/portal/crm/companies/[id]/_lib/companyEditForm.ts`.
 *
 * These are the two pieces of real logic the modal introduces: seeding +
 * dirty-state detection for the edit form, and the tab/field grouping that
 * decides which tab a given field renders in. Deliberately not testing
 * markup/rendering here — that's covered by the page-level integration
 * tests in `app-crm-companies-id-page.test.tsx`.
 */
import { describe, it, expect } from 'vitest';
import {
  companyEditFormFieldCoverage,
  companyToEditForm,
  isEditFormDirty,
  type CompanyEditFormState,
  type EditableCompanySource,
} from '@/app/portal/crm/companies/[id]/_lib/companyEditForm';

const fullCompany: EditableCompanySource = {
  name: 'Acme Corp',
  domain: 'acme.test',
  industry: 'Software',
  size: '11-50',
  phone: '555-1234',
  website: 'https://acme.test',
  address: '1 Way, Town',
  latitude: '40.7128',
  longitude: '-74.0060',
  logoUrl: 'https://cdn.test/logo.png',
  notes: 'VIP client',
};

describe('companyToEditForm', () => {
  it('carries every field through unchanged when all are set', () => {
    expect(companyToEditForm(fullCompany)).toEqual({
      name: 'Acme Corp',
      domain: 'acme.test',
      industry: 'Software',
      size: '11-50',
      phone: '555-1234',
      website: 'https://acme.test',
      address: '1 Way, Town',
      latitude: '40.7128',
      longitude: '-74.0060',
      logoUrl: 'https://cdn.test/logo.png',
      notes: 'VIP client',
    });
  });

  it('coerces null fields to empty strings', () => {
    const form = companyToEditForm({
      ...fullCompany,
      domain: null, industry: null, size: null, phone: null,
      website: null, address: null, logoUrl: null, notes: null,
      latitude: null, longitude: null,
    });
    expect(form.domain).toBe('');
    expect(form.latitude).toBe('');
    expect(form.longitude).toBe('');
    expect(form.notes).toBe('');
  });

  it('stringifies numeric latitude/longitude (as the API may return them numerically)', () => {
    const form = companyToEditForm({ ...fullCompany, latitude: 12.34, longitude: -56.78 });
    expect(form.latitude).toBe('12.34');
    expect(form.longitude).toBe('-56.78');
  });

  it('preserves latitude/longitude of exactly 0 rather than treating it as unset', () => {
    const form = companyToEditForm({ ...fullCompany, latitude: 0, longitude: 0 });
    expect(form.latitude).toBe('0');
    expect(form.longitude).toBe('0');
  });
});

describe('isEditFormDirty', () => {
  const initial: CompanyEditFormState = companyToEditForm(fullCompany);

  it('is false when nothing changed', () => {
    expect(isEditFormDirty(initial, { ...initial })).toBe(false);
  });

  it('is true when any single field changes', () => {
    expect(isEditFormDirty(initial, { ...initial, name: 'Renamed' })).toBe(true);
    expect(isEditFormDirty(initial, { ...initial, notes: 'edited' })).toBe(true);
    expect(isEditFormDirty(initial, { ...initial, logoUrl: 'https://cdn.test/new.png' })).toBe(true);
  });

  it('is false again once a change is reverted back to the initial value', () => {
    const changed = { ...initial, name: 'Renamed' };
    const reverted = { ...changed, name: initial.name };
    expect(isEditFormDirty(initial, reverted)).toBe(false);
  });
});

describe('companyEditFormFieldCoverage', () => {
  it('assigns every editable company field to exactly one tab', () => {
    // Guards against a field silently falling off the tabs (or landing on
    // two at once) if CompanyEditFormState grows a new field later without
    // updating COMPANY_EDIT_TABS.
    expect(companyEditFormFieldCoverage()).toEqual({ duplicated: [], missing: [] });
  });
});
