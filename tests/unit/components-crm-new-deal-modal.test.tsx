// @vitest-environment jsdom
/**
 * Unit tests for NewDealModal — the inline "New Deal" form in the CRM deals
 * kanban view. Props: pipelines, selectedPipelineId, contacts, companies,
 * initialForm, onCompanyCreated, onContactCreated, onCreated. The component
 * uses react-select for contact picking, CrmCompanyTypeaheadPicker for company,
 * MarkdownView for notes preview, and calls api.createDeal / api.createCompany
 * / api.createContact via the _lib/api module.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the component import
// ---------------------------------------------------------------------------

const mockCreateDeal = vi.fn();
const mockCreateCompany = vi.fn();
const mockCreateContact = vi.fn();

vi.mock('../../app/portal/crm/deals/_lib/api', () => ({
  createDeal: (...args: unknown[]) => mockCreateDeal(...args),
  createCompany: (...args: unknown[]) => mockCreateCompany(...args),
  createContact: (...args: unknown[]) => mockCreateContact(...args),
}));

// react-select → native <select> so fireEvent.change works
vi.mock('react-select', () => ({
  default: function ReactSelectStub({
    options,
    value,
    onChange,
    isDisabled,
    placeholder,
  }: {
    options: { value: number; label: string }[];
    value: { value: number; label: string } | null;
    onChange: (v: { value: number; label: string } | null) => void;
    isDisabled?: boolean;
    placeholder?: string;
  }) {
    return React.createElement(
      'select',
      {
        'data-testid': 'react-select-contact',
        disabled: isDisabled,
        value: value ? String(value.value) : '',
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const v = e.target.value;
          if (!v) { onChange(null); return; }
          const opt = (options ?? []).find((o) => String(o.value) === v);
          onChange(opt ?? null);
        },
      },
      [
        React.createElement('option', { key: '__ph', value: '' }, placeholder ?? ''),
        ...(options ?? []).map((o) =>
          React.createElement('option', { key: String(o.value), value: String(o.value) }, o.label),
        ),
      ],
    );
  },
}));

// CrmCompanyTypeaheadPicker → native <select> driven by the companies prop
vi.mock('@/components/portal/CrmCompanyTypeaheadPicker', () => ({
  default: function CrmCompanyTypeaheadPickerStub({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    selectedLabel?: string | null;
    onChange: (opt: { id: number; name: string } | null) => void;
    placeholder?: string;
  }) {
    return React.createElement(
      'select',
      {
        'data-testid': 'company-typeahead',
        value: value ?? '',
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const v = e.target.value;
          if (!v) { onChange(null); return; }
          const text = (e.target as HTMLSelectElement).options[
            (e.target as HTMLSelectElement).selectedIndex
          ]?.text ?? String(v);
          onChange({ id: Number(v), name: text });
        },
      },
      [
        React.createElement('option', { key: '__none', value: '' }, placeholder ?? 'None'),
        React.createElement('option', { key: '1', value: '1' }, 'Acme Corp'),
        React.createElement('option', { key: '2', value: '2' }, 'Beta LLC'),
      ],
    );
  },
}));

// MarkdownView → passthrough div
vi.mock('@/components/portal/MarkdownView', () => ({
  default: function MarkdownViewStub({ children }: { children: React.ReactNode }) {
    return React.createElement('div', { 'data-testid': 'markdown-view' }, children);
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { Pipeline, Contact, Company, DealFormState } from '../../app/portal/crm/deals/_lib/types';

const pipeline1: Pipeline = {
  id: 10,
  name: 'Sales',
  stages: [
    { id: 100, name: 'Lead', color: null, probability: 10, order: 1 },
    { id: 101, name: 'Proposal', color: '#aaa', probability: 50, order: 2 },
    { id: 102, name: 'Closed', color: '#0f0', probability: 100, order: 3 },
  ],
};

const pipeline2: Pipeline = {
  id: 20,
  name: 'Upsell',
  stages: [
    { id: 200, name: 'Qualify', color: null, probability: 20, order: 1 },
    { id: 201, name: 'Negotiate', color: null, probability: 70, order: 2 },
  ],
};

const contacts: Contact[] = [
  { id: 1, firstName: 'Alice', lastName: 'Foo', companyId: 1 },
  { id: 2, firstName: 'Bob', lastName: 'Bar', companyId: 2 },
  { id: 3, firstName: 'Carl', lastName: '', companyId: 1 },
];

const companies: Company[] = [
  { id: 1, name: 'Acme Corp' },
  { id: 2, name: 'Beta LLC' },
];

const emptyForm: DealFormState = {
  title: '',
  value: '',
  contactId: '',
  companyId: '',
  pipelineId: '10',
  stageId: '100',
  priority: 'medium',
  expectedCloseDate: '',
  notes: '',
};

function makeProps(overrides: Partial<Parameters<typeof NewDealModal>[0]> = {}) {
  return {
    pipelines: [pipeline1, pipeline2],
    selectedPipelineId: 10,
    contacts,
    companies,
    initialForm: emptyForm,
    onCompanyCreated: vi.fn(),
    onContactCreated: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Component under test — imported AFTER mocks
// ---------------------------------------------------------------------------
import NewDealModal from '../../app/portal/crm/deals/_components/NewDealModal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getByPlaceholder(container: HTMLElement, ph: string) {
  return container.querySelector(`[placeholder="${ph}"]`) as HTMLInputElement | null;
}

function getTitleInput(container: HTMLElement) {
  const inputs = container.querySelectorAll('input');
  // title is the first text input (not type=number, not type=date)
  return Array.from(inputs).find(
    (i) => !i.type || i.type === 'text',
  ) as HTMLInputElement;
}

function getValueInput(container: HTMLElement) {
  return container.querySelector('input[type="number"]') as HTMLInputElement;
}

function getSubmitButton(container: HTMLElement) {
  return container.querySelector('button[type="submit"]') as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NewDealModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateDeal.mockResolvedValue({ success: true, data: { id: 42 } });
    mockCreateCompany.mockResolvedValue({ success: true, data: { id: 99, name: 'NewCo' } });
    mockCreateContact.mockResolvedValue({
      success: true,
      data: { id: 88, firstName: 'New', lastName: 'Contact', companyId: null },
    });
  });

  // ── Rendering ───────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the "New Deal" heading', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(container.textContent).toContain('New Deal');
    });

    it('renders the Title input', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(getTitleInput(container)).toBeTruthy();
    });

    it('renders the Value (number) input', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(getValueInput(container)).toBeTruthy();
    });

    it('renders the company typeahead picker', () => {
      render(<NewDealModal {...makeProps()} />);
      expect(screen.getByTestId('company-typeahead')).toBeTruthy();
    });

    it('renders the contact select (react-select stub) disabled when no company chosen', () => {
      render(<NewDealModal {...makeProps()} />);
      const sel = screen.getByTestId('react-select-contact') as HTMLSelectElement;
      expect(sel.disabled).toBe(true);
    });

    it('renders pipeline select with all pipeline names', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(container.textContent).toContain('Sales');
      expect(container.textContent).toContain('Upsell');
    });

    it('renders stage select with stages for the initial pipeline, sorted by order', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(container.textContent).toContain('Lead');
      expect(container.textContent).toContain('Proposal');
      expect(container.textContent).toContain('Closed');
    });

    it('renders priority select with Low/Medium/High', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(container.textContent).toContain('Low');
      expect(container.textContent).toContain('Medium');
      expect(container.textContent).toContain('High');
    });

    it('renders the date input', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const dateInput = container.querySelector('input[type="date"]');
      expect(dateInput).toBeTruthy();
    });

    it('renders the notes textarea in write mode by default', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(container.querySelector('textarea')).toBeTruthy();
    });

    it('renders the Create Deal submit button', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(getSubmitButton(container)).toBeTruthy();
      expect(getSubmitButton(container)!.textContent).toContain('Create Deal');
    });

    it('renders no error message on initial render', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      expect(container.querySelector('.text-destructive')).toBeNull();
    });

    it('initialForm values are reflected in the inputs', () => {
      const form: DealFormState = {
        ...emptyForm,
        title: 'Pre-filled Deal',
        value: '1500',
        priority: 'high',
        pipelineId: '10',
        stageId: '101',
      };
      const { container } = render(<NewDealModal {...makeProps({ initialForm: form })} />);
      const titleInput = getTitleInput(container);
      expect((titleInput as HTMLInputElement).value).toBe('Pre-filled Deal');
      const valueInput = getValueInput(container);
      expect((valueInput as HTMLInputElement).value).toBe('1500');
    });
  });

  // ── Field updates ────────────────────────────────────────────────────────

  describe('field interactions', () => {
    it('typing in title updates the input value', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const title = getTitleInput(container);
      fireEvent.change(title, { target: { value: 'My New Deal' } });
      expect(title.value).toBe('My New Deal');
    });

    it('typing in value updates the number input', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const val = getValueInput(container);
      fireEvent.change(val, { target: { value: '2500.50' } });
      expect(val.value).toBe('2500.50');
    });

    it('changing pipeline select updates stages shown', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      // Find pipeline select (has options "Sales"/"Upsell" by pipeline id 10/20)
      const pipelineSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.value === '10'),
      ) as HTMLSelectElement;
      fireEvent.change(pipelineSelect, { target: { value: '20' } });
      expect(container.textContent).toContain('Qualify');
      expect(container.textContent).toContain('Negotiate');
      // Sales-only stages should be gone
      expect(container.textContent).not.toContain('Lead');
    });

    it('changing priority select updates the selected value', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const prioritySelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.value === 'low'),
      ) as HTMLSelectElement;
      fireEvent.change(prioritySelect, { target: { value: 'high' } });
      expect(prioritySelect.value).toBe('high');
    });

    it('typing notes into the textarea updates its value', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: '**important**' } });
      expect(textarea.value).toBe('**important**');
    });
  });

  // ── Notes preview toggle ─────────────────────────────────────────────────

  describe('notes preview toggle', () => {
    it('clicking Preview shows the MarkdownView and hides the textarea', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: '**bold**' } });
      fireEvent.click(screen.getByText('Preview'));
      expect(container.querySelector('textarea')).toBeNull();
      expect(screen.getByTestId('markdown-view')).toBeTruthy();
    });

    it('clicking Write from Preview mode restores the textarea', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.click(screen.getByText('Preview'));
      fireEvent.click(screen.getByText('Write'));
      expect(container.querySelector('textarea')).toBeTruthy();
    });

    it('Preview of empty notes shows "Nothing to preview." message', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.click(screen.getByText('Preview'));
      expect(container.textContent).toContain('Nothing to preview.');
    });
  });

  // ── Inline company creation ──────────────────────────────────────────────

  describe('inline company creation', () => {
    it('clicking "+ New" next to Company shows the company input', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      // Find the "+ New" button in the Company section
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      // First "+ New" is the company one (Company section comes before Contact)
      fireEvent.click(newButtons[0]);
      const companyNameInput = getByPlaceholder(container, 'Company name');
      expect(companyNameInput).toBeTruthy();
    });

    it('clicking "+ New" again (Cancel) hides the company input', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const newButtons = () =>
        Array.from(container.querySelectorAll('button[type="button"]')).filter(
          (b) => b.textContent?.trim() === '+ New' || b.textContent?.trim() === 'Cancel',
        );
      fireEvent.click(newButtons()[0]);
      // Now the button reads "Cancel"
      const cancelBtn = newButtons().find((b) => b.textContent?.trim() === 'Cancel');
      expect(cancelBtn).toBeTruthy();
      fireEvent.click(cancelBtn!);
      expect(getByPlaceholder(container, 'Company name')).toBeNull();
    });

    it('creating a company calls api.createCompany with the trimmed name', async () => {
      const onCompanyCreated = vi.fn();
      const { container } = render(
        <NewDealModal {...makeProps({ onCompanyCreated })} />,
      );
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      fireEvent.click(newButtons[0]);
      const input = getByPlaceholder(container, 'Company name')!;
      fireEvent.change(input, { target: { value: '  NewCo  ' } });
      // Click the check button (last button in the company row)
      const checkBtn = input.closest('div')!.querySelector('button[type="button"]') as HTMLButtonElement;
      fireEvent.click(checkBtn);
      await waitFor(() => {
        expect(mockCreateCompany).toHaveBeenCalledWith('NewCo');
      });
    });

    it('onCompanyCreated callback is called with the new company', async () => {
      const onCompanyCreated = vi.fn();
      const { container } = render(
        <NewDealModal {...makeProps({ onCompanyCreated })} />,
      );
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      fireEvent.click(newButtons[0]);
      const input = getByPlaceholder(container, 'Company name')!;
      fireEvent.change(input, { target: { value: 'NewCo' } });
      const checkBtn = input.closest('div')!.querySelector('button[type="button"]') as HTMLButtonElement;
      fireEvent.click(checkBtn);
      await waitFor(() => {
        expect(onCompanyCreated).toHaveBeenCalledWith({ id: 99, name: 'NewCo' });
      });
    });

    it('pressing Enter in the company name input triggers creation', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      fireEvent.click(newButtons[0]);
      const input = getByPlaceholder(container, 'Company name')!;
      fireEvent.change(input, { target: { value: 'KeyCo' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => {
        expect(mockCreateCompany).toHaveBeenCalledWith('KeyCo');
      });
    });

    it('does not call createCompany when the company name is blank', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      fireEvent.click(newButtons[0]);
      const input = getByPlaceholder(container, 'Company name')!;
      fireEvent.change(input, { target: { value: '   ' } });
      const checkBtn = input.closest('div')!.querySelector('button[type="button"]') as HTMLButtonElement;
      fireEvent.click(checkBtn);
      expect(mockCreateCompany).not.toHaveBeenCalled();
    });
  });

  // ── Inline contact creation ──────────────────────────────────────────────

  describe('inline contact creation', () => {
    it('clicking "+ New" in the Contact section shows the contact form', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      // Second "+ New" is for contacts
      fireEvent.click(newButtons[1]);
      expect(getByPlaceholder(container, 'First name *')).toBeTruthy();
    });

    it('clicking Cancel in the contact section hides the form', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      fireEvent.click(newButtons[1]);
      const cancelBtns = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === 'Cancel',
      );
      fireEvent.click(cancelBtns[0]);
      expect(getByPlaceholder(container, 'First name *')).toBeNull();
    });

    it('creating a contact calls api.createContact with trimmed fields', async () => {
      const onContactCreated = vi.fn();
      const { container } = render(
        <NewDealModal {...makeProps({ onContactCreated })} />,
      );
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      fireEvent.click(newButtons[1]);
      fireEvent.change(getByPlaceholder(container, 'First name *')!, {
        target: { value: 'New' },
      });
      fireEvent.change(getByPlaceholder(container, 'Last name')!, {
        target: { value: 'Contact' },
      });
      fireEvent.change(getByPlaceholder(container, 'Email')!, {
        target: { value: 'new@test.com' },
      });
      const emailInput = getByPlaceholder(container, 'Email')!;
      const checkBtn = emailInput.closest('div')!.querySelector('button[type="button"]') as HTMLButtonElement;
      fireEvent.click(checkBtn);
      await waitFor(() => {
        expect(mockCreateContact).toHaveBeenCalledWith(
          expect.objectContaining({
            firstName: 'New',
            lastName: 'Contact',
            email: 'new@test.com',
          }),
        );
      });
    });

    it('onContactCreated callback is called after success', async () => {
      const onContactCreated = vi.fn();
      const { container } = render(
        <NewDealModal {...makeProps({ onContactCreated })} />,
      );
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      fireEvent.click(newButtons[1]);
      fireEvent.change(getByPlaceholder(container, 'First name *')!, {
        target: { value: 'New' },
      });
      const emailInput = getByPlaceholder(container, 'Email')!;
      const checkBtn = emailInput.closest('div')!.querySelector('button[type="button"]') as HTMLButtonElement;
      fireEvent.click(checkBtn);
      await waitFor(() => {
        expect(onContactCreated).toHaveBeenCalledWith(
          expect.objectContaining({ id: 88, firstName: 'New' }),
        );
      });
    });

    it('pressing Enter in the email field triggers contact creation', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const newButtons = Array.from(container.querySelectorAll('button[type="button"]')).filter(
        (b) => b.textContent?.trim() === '+ New',
      );
      fireEvent.click(newButtons[1]);
      fireEvent.change(getByPlaceholder(container, 'First name *')!, {
        target: { value: 'Key' },
      });
      fireEvent.keyDown(getByPlaceholder(container, 'Email')!, { key: 'Enter' });
      await waitFor(() => {
        expect(mockCreateContact).toHaveBeenCalledWith(
          expect.objectContaining({ firstName: 'Key' }),
        );
      });
    });
  });

  // ── Contact options filtering by company ─────────────────────────────────

  describe('contact options — company filter', () => {
    it('contact select is enabled and shows contacts for the selected company', () => {
      const { container } = render(
        <NewDealModal
          {...makeProps({ initialForm: { ...emptyForm, companyId: '1' } })}
        />,
      );
      const sel = screen.getByTestId('react-select-contact') as HTMLSelectElement;
      expect(sel.disabled).toBe(false);
      // contacts with companyId === 1: Alice Foo (id 1) and Carl (id 3)
      const options = Array.from(sel.options).map((o) => o.value);
      expect(options).toContain('1');
      expect(options).toContain('3');
      // Bob Bar is companyId 2 — should NOT appear
      expect(options).not.toContain('2');
    });

    it('contact label falls back to "Contact #N" when name is empty', () => {
      const sparse: Contact[] = [
        { id: 5, firstName: '', lastName: '', companyId: 1 },
      ];
      render(
        <NewDealModal
          {...makeProps({
            contacts: sparse,
            initialForm: { ...emptyForm, companyId: '1' },
          })}
        />,
      );
      const sel = screen.getByTestId('react-select-contact') as HTMLSelectElement;
      const opt = Array.from(sel.options).find((o) => o.value === '5');
      expect(opt?.text).toBe('Contact #5');
    });
  });

  // ── Form submission — success ────────────────────────────────────────────

  describe('form submission — success', () => {
    it('submitting the form calls api.createDeal', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Test Deal' } });
      fireEvent.change(getValueInput(container), { target: { value: '5000' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledOnce();
      });
    });

    it('submission passes value converted to cents', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Cents Test' } });
      fireEvent.change(getValueInput(container), { target: { value: '12.50' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ value: 1250 }),
        );
      });
    });

    it('onCreated callback is called on successful submission', async () => {
      const onCreated = vi.fn();
      const { container } = render(<NewDealModal {...makeProps({ onCreated })} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'New Deal' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(onCreated).toHaveBeenCalledOnce();
      });
    });

    it('submission sends the currently-selected pipeline id', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Pipeline Test' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ pipelineId: 10 }),
        );
      });
    });

    it('submission sends the default first stage id when no stageId chosen', async () => {
      const { container } = render(
        <NewDealModal {...makeProps({ initialForm: { ...emptyForm, stageId: '' } })} />,
      );
      fireEvent.change(getTitleInput(container), { target: { value: 'Stage Test' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ stageId: 100 }),
        );
      });
    });

    it('submission sends contactId as null when none selected', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Null Contact' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ contactId: null }),
        );
      });
    });

    it('submission sends companyId as null when none selected', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Null Company' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ companyId: null }),
        );
      });
    });

    it('submission sends notes as null when the field is empty', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'No Notes' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ notes: null }),
        );
      });
    });

    it('submission sends notes content when filled', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Has Notes' } });
      fireEvent.change(container.querySelector('textarea')!, { target: { value: 'Some notes' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ notes: 'Some notes' }),
        );
      });
    });

    it('disables the submit button while saving', async () => {
      let resolve!: () => void;
      mockCreateDeal.mockReturnValue(
        new Promise<{ success: boolean; data: { id: number } }>((res) => {
          resolve = () => res({ success: true, data: { id: 1 } });
        }),
      );
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Saving' } });
      fireEvent.submit(container.querySelector('form')!);
      // Button should be disabled while the promise is pending
      expect(getSubmitButton(container)!.disabled).toBe(true);
      resolve();
      await waitFor(() => {
        expect(getSubmitButton(container)!.disabled).toBe(false);
      });
    });
  });

  // ── Form submission — error ──────────────────────────────────────────────

  describe('form submission — error', () => {
    it('shows the API error message when createDeal returns success:false', async () => {
      mockCreateDeal.mockResolvedValue({ success: false, message: 'Deal creation failed' });
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Bad Deal' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(container.textContent).toContain('Deal creation failed');
      });
    });

    it('shows a fallback message when no message is provided', async () => {
      mockCreateDeal.mockResolvedValue({ success: false });
      const { container } = render(<NewDealModal {...makeProps()} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'No Msg' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(container.textContent).toContain('Failed to create deal.');
      });
    });

    it('does not call onCreated when submission fails', async () => {
      mockCreateDeal.mockResolvedValue({ success: false, message: 'Error' });
      const onCreated = vi.fn();
      const { container } = render(<NewDealModal {...makeProps({ onCreated })} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Fail' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(container.textContent).toContain('Error');
      });
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('error message clears on subsequent submit attempt', async () => {
      mockCreateDeal
        .mockResolvedValueOnce({ success: false, message: 'First error' })
        .mockResolvedValueOnce({ success: true, data: { id: 1 } });
      const onCreated = vi.fn();
      const { container } = render(<NewDealModal {...makeProps({ onCreated })} />);
      fireEvent.change(getTitleInput(container), { target: { value: 'Retry Deal' } });
      // First submit — fails
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(container.textContent).toContain('First error');
      });
      // Second submit — should clear the error before resolving
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(onCreated).toHaveBeenCalled();
      });
      expect(container.textContent).not.toContain('First error');
    });
  });

  // ── Pipeline switching ────────────────────────────────────────────────────

  describe('pipeline switching', () => {
    it('switching pipeline resets stageId to first stage of the new pipeline', () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const pipelineSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.value === '10'),
      ) as HTMLSelectElement;
      fireEvent.change(pipelineSelect, { target: { value: '20' } });
      // Stage select should now show pipeline 2's stages
      const stageSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.textContent === 'Qualify'),
      ) as HTMLSelectElement;
      expect(stageSelect).toBeTruthy();
      // The value should be the first stage of pipeline 20 (200)
      expect(stageSelect.value).toBe('200');
    });

    it('selecting a stage updates the stageId in form state', async () => {
      const { container } = render(<NewDealModal {...makeProps()} />);
      const stageSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.textContent === 'Lead'),
      ) as HTMLSelectElement;
      fireEvent.change(stageSelect, { target: { value: '102' } });
      fireEvent.change(getTitleInput(container), { target: { value: 'Stage Deal' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ stageId: 102 }),
        );
      });
    });
  });

  // ── selectedPipelineId fallback ──────────────────────────────────────────

  describe('selectedPipelineId fallback', () => {
    it('uses selectedPipelineId when form.pipelineId is empty', async () => {
      const { container } = render(
        <NewDealModal
          {...makeProps({
            initialForm: { ...emptyForm, pipelineId: '' },
            selectedPipelineId: 10,
          })}
        />,
      );
      fireEvent.change(getTitleInput(container), { target: { value: 'Fallback Test' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(mockCreateDeal).toHaveBeenCalledWith(
          expect.objectContaining({ pipelineId: 10 }),
        );
      });
    });
  });
});
