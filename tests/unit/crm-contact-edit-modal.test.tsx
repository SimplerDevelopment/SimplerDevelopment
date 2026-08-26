// @vitest-environment jsdom
/**
 * Unit tests for `ContactEditModal` — the CRM contact edit modal (PUX-025),
 * mirroring the company edit modal from PUX-018
 * (`app/portal/crm/companies/[id]/_components/CompanyEditModal.tsx`).
 *
 * Renders the modal component directly (not the whole detail page): seeds
 * it with a contact, asserts every field is populated from that contact,
 * changes a field, submits, and asserts the PUT request sent to
 * `/api/portal/crm/contacts/:id` carries the expected payload — the same
 * shape the inline form used to send (`{...editForm, companyId: number |
 * null}`) — before the `onSaved` callback fires.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks (must precede component import) ──────────────────────────────────

vi.mock('@/components/admin/MediaPicker', () => ({
  __esModule: true,
  default: ({ value, onChange, label }: any) =>
    React.createElement('div', { 'data-testid': 'media-picker' },
      React.createElement('span', null, `MP:${label}`),
      React.createElement('button', {
        type: 'button',
        onClick: () => onChange('https://cdn.test/new-avatar.png'),
      }, 'pick-avatar'),
      React.createElement('span', { 'data-testid': 'media-picker-value' }, value || ''),
    ),
}));

vi.mock('@/components/portal/CrmCompanyTypeaheadPicker', () => ({
  __esModule: true,
  default: ({ value, selectedLabel, onChange, placeholder }: any) =>
    React.createElement(
      'select',
      {
        'data-testid': 'company-typeahead',
        value: value ?? '',
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const v = e.target.value;
          if (!v) { onChange(null); return; }
          onChange({ id: Number(v), name: 'Beta LLC' });
        },
      },
      [
        React.createElement('option', { key: '__none', value: '' }, placeholder ?? selectedLabel ?? 'None'),
        React.createElement('option', { key: '42', value: '42' }, 'Acme Corp'),
        React.createElement('option', { key: '99', value: '99' }, 'Beta LLC'),
      ],
    ),
}));

const customFieldsSaveSpy = vi.fn().mockResolvedValue(true);
let customFieldsDirty = false;

vi.mock('@/components/portal/CrmCustomFieldsPanel', () => {
  const PanelImpl = React.forwardRef<any, any>((props: any, ref) => {
    React.useImperativeHandle(ref, () => ({
      save: customFieldsSaveSpy,
      reload: vi.fn(),
      isDirty: () => customFieldsDirty,
    }));
    return React.createElement(
      'div',
      { 'data-testid': 'crm-custom-fields' },
      `panel:${props.entityType}:${props.entityId}:${props.externalMode}`,
    );
  });
  PanelImpl.displayName = 'CrmCustomFieldsPanelMock';
  return { __esModule: true, default: PanelImpl };
});

// Component under test — imported after mocks.
import ContactEditModal from '../../app/portal/crm/contacts/[id]/_components/ContactEditModal';
import type { EditableContactSource } from '../../app/portal/crm/contacts/[id]/_lib/contactEditForm';

const baseContact: EditableContactSource = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@acme.test',
  phone: '555-1234',
  linkedinUrl: 'https://linkedin.com/in/janedoe',
  title: 'VP Sales',
  companyId: 42,
  companyName: 'Acme Corp',
  status: 'active',
  source: 'referral',
  address: '1 Way, Town',
  avatarUrl: 'https://cdn.test/jane.png',
};

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

describe('ContactEditModal', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    customFieldsSaveSpy.mockResolvedValue(true);
    customFieldsDirty = false;
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { id: 1 } }));
    global.fetch = fetchMock as any;
    vi.stubGlobal('confirm', vi.fn(() => true));
    window.confirm = vi.fn(() => true);
  });

  // ── Rendering / population ────────────────────────────────────────────────

  it('populates every field on the General and Details tabs from the contact', () => {
    const { container } = render(
      <ContactEditModal contactId={1} contact={baseContact} onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    // General tab (default active)
    const firstName = container.querySelector('input[required]') as HTMLInputElement;
    expect(firstName.value).toBe('Jane');
    expect(screen.getByTestId('company-typeahead')).toHaveValue('42');
    expect(screen.getByTestId('media-picker-value').textContent).toBe('https://cdn.test/jane.png');
    const statusSelect = Array.from(container.querySelectorAll('select')).find(
      s => s.getAttribute('data-testid') !== 'company-typeahead',
    ) as HTMLSelectElement;
    expect(statusSelect.value).toBe('active');

    // Switch to Details tab
    fireEvent.click(screen.getByText('Details'));
    const inputs = Array.from(container.querySelectorAll('input'));
    const emailInput = inputs.find(i => i.type === 'email') as HTMLInputElement;
    expect(emailInput.value).toBe('jane@acme.test');
    const urlInput = inputs.find(i => i.type === 'url') as HTMLInputElement;
    expect(urlInput.value).toBe('https://linkedin.com/in/janedoe');
  });

  it('renders the Custom Fields tab panel in edit mode, scoped to this contact', () => {
    render(<ContactEditModal contactId={7} contact={baseContact} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText('Custom Fields'));
    expect(screen.getByTestId('crm-custom-fields').textContent).toBe('panel:contact:7:edit');
  });

  // ── Submit → payload ──────────────────────────────────────────────────────

  it('submits the expected PUT payload and calls onSaved on success', async () => {
    const onSaved = vi.fn();
    const { container } = render(
      <ContactEditModal contactId={1} contact={baseContact} onClose={vi.fn()} onSaved={onSaved} />,
    );

    const firstName = container.querySelector('input[required]') as HTMLInputElement;
    fireEvent.change(firstName, { target: { value: 'Janet' } });

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/portal/crm/contacts/1',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      firstName: 'Janet',
      lastName: 'Doe',
      email: 'jane@acme.test',
      phone: '555-1234',
      linkedinUrl: 'https://linkedin.com/in/janedoe',
      title: 'VP Sales',
      companyId: 42,
      status: 'active',
      source: 'referral',
      address: '1 Way, Town',
      avatarUrl: 'https://cdn.test/jane.png',
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    // Custom-fields save is flushed as part of the same submit.
    expect(customFieldsSaveSpy).toHaveBeenCalledOnce();
  });

  it('sends companyId as null when the company is cleared', async () => {
    const { container } = render(
      <ContactEditModal contactId={1} contact={baseContact} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByTestId('company-typeahead'), { target: { value: '' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).companyId).toBeNull();
  });

  it('shows the API error and does not call onSaved when the save fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, message: 'Save failed.' }));
    const onSaved = vi.fn();
    const { container } = render(
      <ContactEditModal contactId={1} contact={baseContact} onClose={vi.fn()} onSaved={onSaved} />,
    );
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Save failed.');
    });
    expect(onSaved).not.toHaveBeenCalled();
  });
});
