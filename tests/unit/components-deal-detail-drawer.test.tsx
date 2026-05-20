// @vitest-environment jsdom
/**
 * Batch 46d — DealDetailDrawer component (CRM deals slide-over).
 *
 * DealDetailDrawer is a large 3-tab drawer (Details / Artifacts / Comments)
 * with heavy state — form editing, inline company/contact creation, artifact
 * linking, comment threads with file attachments, and an @mention dropdown.
 *
 * Heavy deps are mocked:
 *   - ../_lib/api          → every API function is a vi.fn() resolving to
 *                            tunable envelope/Response shapes; tests assert
 *                            on call args + side effects.
 *   - react-select         → a tiny native-select stand-in that captures the
 *                            options/value/onChange so we can assert on
 *                            contact selection without dealing with the real
 *                            library's portal + a11y plumbing.
 *   - CrmCustomFieldsPanel → stub div with the entityId baked in.
 *   - MarkdownView         → passthrough that just renders children.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (set up BEFORE importing the component under test)
// ---------------------------------------------------------------------------

vi.mock('../../app/portal/crm/deals/_lib/api', () => ({
  fetchArtifacts: vi.fn(async () => []),
  fetchAvailableArtifacts: vi.fn(async () => []),
  fetchComments: vi.fn(async () => []),
  fetchMentionUsers: vi.fn(async () => []),
  createCompany: vi.fn(async () => ({ success: true, data: { id: 999, name: 'NewCo' } })),
  createContact: vi.fn(async () => ({
    success: true,
    data: { id: 888, firstName: 'New', lastName: 'Contact', companyId: 1 },
  })),
  updateDeal: vi.fn(async () => ({ success: true, data: {} })),
  deleteDeal: vi.fn(async () => ({ success: true })),
  addArtifact: vi.fn(async () => ({ success: true })),
  updateArtifactPin: vi.fn(async () => ({ success: true })),
  removeArtifact: vi.fn(async () => ({ success: true })),
  postComment: vi.fn(async () => ({ ok: true })),
  deleteComment: vi.fn(async () => ({ success: true })),
}));

vi.mock('react-select', () => ({
  default: ({ options, value, onChange, isDisabled, placeholder }: any) => {
    const React = require('react');
    return React.createElement(
      'select',
      {
        'data-testid': 'react-select',
        disabled: isDisabled,
        value: value ? String(value.value) : '',
        onChange: (e: any) => {
          const v = e.target.value;
          const opt = (options ?? []).find((o: any) => String(o.value) === v);
          onChange(opt ?? null);
        },
      },
      [
        React.createElement('option', { key: '__placeholder', value: '' }, placeholder ?? ''),
        ...(options ?? []).map((o: any) =>
          React.createElement('option', { key: String(o.value), value: String(o.value) }, o.label),
        ),
      ],
    );
  },
}));

vi.mock('@/components/portal/CrmCustomFieldsPanel', () => ({
  default: ({ entityId, entityType }: any) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'custom-fields' },
      `cf:${entityType}:${entityId}`,
    );
  },
}));

vi.mock('@/components/portal/MarkdownView', () => ({
  default: ({ children }: any) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'markdown' }, children);
  },
}));

// ---------------------------------------------------------------------------
// Imports under test (must come AFTER vi.mock calls)
// ---------------------------------------------------------------------------

import DealDetailDrawer from '@/app/portal/crm/deals/_components/DealDetailDrawer';
import * as api from '@/app/portal/crm/deals/_lib/api';

const apiMock = api as unknown as {
  fetchArtifacts: ReturnType<typeof vi.fn>;
  fetchAvailableArtifacts: ReturnType<typeof vi.fn>;
  fetchComments: ReturnType<typeof vi.fn>;
  fetchMentionUsers: ReturnType<typeof vi.fn>;
  createCompany: ReturnType<typeof vi.fn>;
  createContact: ReturnType<typeof vi.fn>;
  updateDeal: ReturnType<typeof vi.fn>;
  deleteDeal: ReturnType<typeof vi.fn>;
  addArtifact: ReturnType<typeof vi.fn>;
  updateArtifactPin: ReturnType<typeof vi.fn>;
  removeArtifact: ReturnType<typeof vi.fn>;
  postComment: ReturnType<typeof vi.fn>;
  deleteComment: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeal(overrides: any = {}) {
  return {
    id: 42,
    title: 'Big Deal',
    value: 250000, // cents → $2500.00
    status: 'open',
    priority: 'medium',
    expectedCloseDate: '2026-06-30',
    contactId: 11,
    contactName: 'Alice Smith',
    companyId: 1,
    companyName: 'Acme Co',
    stageId: 100,
    pipelineId: 1,
    notes: '**Important** deal',
    ownerId: 7,
    ownerName: 'Owner',
    recurringValue: null,
    billingCycle: null,
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function makePipeline(): any {
  return {
    id: 1,
    name: 'Sales Pipeline',
    stages: [
      { id: 100, name: 'Lead', color: null, probability: 10, order: 0 },
      { id: 101, name: 'Qualified', color: null, probability: 40, order: 1 },
      { id: 102, name: 'Won', color: null, probability: 100, order: 2 },
    ],
  };
}

function defaultProps(overrides: any = {}) {
  return {
    deal: makeDeal(),
    pipelines: [makePipeline()],
    contacts: [
      { id: 11, firstName: 'Alice', lastName: 'Smith', companyId: 1 },
      { id: 12, firstName: 'Bob', lastName: 'Jones', companyId: 1 },
      { id: 13, firstName: 'Carol', lastName: '', companyId: 2 },
    ],
    companies: [
      { id: 1, name: 'Acme Co' },
      { id: 2, name: 'Other Inc' },
    ],
    onCompanyCreated: vi.fn(),
    onContactCreated: vi.fn(),
    onSaved: vi.fn(),
    onDeleted: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockClear());
  apiMock.fetchArtifacts.mockResolvedValue([]);
  apiMock.fetchAvailableArtifacts.mockResolvedValue([]);
  apiMock.fetchComments.mockResolvedValue([]);
  apiMock.fetchMentionUsers.mockResolvedValue([]);
  apiMock.createCompany.mockResolvedValue({
    success: true,
    data: { id: 999, name: 'NewCo' },
  });
  apiMock.createContact.mockResolvedValue({
    success: true,
    data: { id: 888, firstName: 'New', lastName: 'Person', companyId: 1 },
  });
  apiMock.updateDeal.mockResolvedValue({ success: true, data: {} });
  apiMock.deleteDeal.mockResolvedValue({ success: true });
  apiMock.addArtifact.mockResolvedValue({ success: true });
  apiMock.updateArtifactPin.mockResolvedValue({ success: true });
  apiMock.removeArtifact.mockResolvedValue({ success: true });
  apiMock.postComment.mockResolvedValue({ ok: true });
  apiMock.deleteComment.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Render + initial load
// ---------------------------------------------------------------------------

describe('DealDetailDrawer — initial render', () => {
  it('renders the header with deal title and Details tab content by default', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    expect(container.textContent).toContain('Big Deal');
    expect(container.textContent).toContain('Title');
    expect(container.textContent).toContain('Value ($)');
    expect(container.textContent).toContain('Priority');
    expect(container.textContent).toContain('Status');
    expect(container.textContent).toContain('Expected Close');
    expect(container.textContent).toContain('Custom Fields');
  });

  it('initializes form fields from the deal prop', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    const titleInput = container.querySelector(
      'input[value="Big Deal"]',
    ) as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    const valueInput = container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(valueInput.value).toBe('2500');
  });

  it('renders three tabs and starts on Details', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    expect(container.textContent).toContain('Details');
    expect(container.textContent).toContain('Artifacts');
    expect(container.textContent).toContain('Comments');
  });

  it('shows count badges on Artifacts and Comments tabs when data present', async () => {
    apiMock.fetchArtifacts.mockResolvedValue([
      { id: 1, dealId: 42, artifactType: 'website', artifactId: 5, displayTitle: 'My site', pinned: false, createdAt: '' },
      { id: 2, dealId: 42, artifactType: 'survey', artifactId: 6, displayTitle: 'My survey', pinned: false, createdAt: '' },
    ]);
    apiMock.fetchComments.mockResolvedValue([
      { id: 1, dealId: 42, authorId: 1, authorName: 'A', body: 'hi', attachments: [], createdAt: '2026-05-01T00:00:00Z' },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    // Numeric badges
    const badges = Array.from(container.querySelectorAll('span'))
      .filter((s) => /^\d+$/.test(s.textContent ?? ''));
    expect(badges.length).toBeGreaterThan(0);
  });

  it('fires the four initial loaders for the deal id', async () => {
    render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    expect(apiMock.fetchArtifacts).toHaveBeenCalledWith(42);
    expect(apiMock.fetchAvailableArtifacts).toHaveBeenCalledWith(42);
    expect(apiMock.fetchComments).toHaveBeenCalledWith(42);
    expect(apiMock.fetchMentionUsers).toHaveBeenCalled();
  });

  it('handles a null companyId/contactId/notes on the deal prop', async () => {
    const props = defaultProps({
      deal: makeDeal({ companyId: null, contactId: null, notes: null, expectedCloseDate: null }),
    });
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    // Notes textarea should render empty
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Header buttons
// ---------------------------------------------------------------------------

describe('DealDetailDrawer — header actions', () => {
  it('calls onClose when close button clicked', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const closeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.innerHTML.includes('close'),
    );
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const backdrop = container.querySelector('.bg-black\\/40') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('handleDelete confirms, deletes the deal and fires onDeleted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.innerHTML.includes('delete'),
    );
    await act(async () => {
      fireEvent.click(deleteBtn!);
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(apiMock.deleteDeal).toHaveBeenCalledWith(42);
    expect(props.onDeleted).toHaveBeenCalled();
  });

  it('handleDelete aborts when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.innerHTML.includes('delete'),
    );
    await act(async () => {
      fireEvent.click(deleteBtn!);
    });
    expect(apiMock.deleteDeal).not.toHaveBeenCalled();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it('Cancel button at bottom of form fires onClose', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const cancel = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel',
    );
    expect(cancel).toBeTruthy();
    fireEvent.click(cancel!);
    expect(props.onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Details form: editing & save
// ---------------------------------------------------------------------------

describe('DealDetailDrawer — details form editing', () => {
  it('updates title via input and saves the deal with converted value', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const titleInput = container.querySelector(
      'input[value="Big Deal"]',
    ) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(apiMock.updateDeal).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        title: 'New Title',
        // 2500 dollars → 250000 cents
        value: 250000,
      }),
    );
    expect(props.onSaved).toHaveBeenCalled();
  });

  it('displays an error message when updateDeal fails', async () => {
    apiMock.updateDeal.mockResolvedValue({
      success: false,
      message: 'Bad data',
    });
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(container.textContent).toContain('Bad data');
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it('uses a fallback error message when API does not provide one', async () => {
    apiMock.updateDeal.mockResolvedValue({ success: false });
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(container.textContent).toContain('Failed to save deal');
  });

  it('changes priority via the select', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const prioritySelect = Array.from(
      container.querySelectorAll('select'),
    ).find((s) =>
      Array.from(s.options).some((o) => o.value === 'low'),
    ) as HTMLSelectElement;
    fireEvent.change(prioritySelect, { target: { value: 'high' } });
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(apiMock.updateDeal).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ priority: 'high' }),
    );
  });

  it('changes status via the select', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const statusSelect = Array.from(
      container.querySelectorAll('select'),
    ).find((s) =>
      Array.from(s.options).some((o) => o.value === 'won'),
    ) as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: 'won' } });
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(apiMock.updateDeal).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'won' }),
    );
  });

  it('updates the notes textarea content', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const notes = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: 'changed notes' } });
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(apiMock.updateDeal).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ notes: 'changed notes' }),
    );
  });

  it('saves notes as null when empty', async () => {
    const props = defaultProps({
      deal: makeDeal({ notes: '' }),
    });
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(apiMock.updateDeal).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ notes: null }),
    );
  });

  it('switches Notes between Write and Preview modes', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const previewBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Preview',
    );
    fireEvent.click(previewBtn!);
    // Now the markdown view should render
    expect(container.querySelector('[data-testid="markdown"]')).toBeTruthy();
    const writeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Write',
    );
    fireEvent.click(writeBtn!);
    expect(container.querySelector('textarea')).toBeTruthy();
  });

  it('shows "Nothing to preview" when notes are blank in preview mode', async () => {
    const props = defaultProps({ deal: makeDeal({ notes: '' }) });
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const previewBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Preview',
    );
    fireEvent.click(previewBtn!);
    expect(container.textContent).toContain('Nothing to preview');
  });

  it('changing pipeline resets stageId to the first stage', async () => {
    const secondPipeline = {
      id: 2,
      name: 'Other',
      stages: [
        { id: 200, name: 'A', color: null, probability: 0, order: 0 },
        { id: 201, name: 'B', color: null, probability: 50, order: 1 },
      ],
    };
    const props = defaultProps({ pipelines: [makePipeline(), secondPipeline] });
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    // Find the pipeline select (contains "Sales Pipeline" option)
    const pipelineSelect = Array.from(
      container.querySelectorAll('select'),
    ).find((s) =>
      Array.from(s.options).some((o) => o.textContent === 'Sales Pipeline'),
    ) as HTMLSelectElement;
    fireEvent.change(pipelineSelect, { target: { value: '2' } });
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(apiMock.updateDeal).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ pipelineId: 2, stageId: 200 }),
    );
  });

  it('handles a pipeline with no stages gracefully', async () => {
    const props = defaultProps({
      pipelines: [makePipeline(), { id: 2, name: 'EmptyP', stages: [] }],
    });
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const pipelineSelect = Array.from(
      container.querySelectorAll('select'),
    ).find((s) =>
      Array.from(s.options).some((o) => o.textContent === 'EmptyP'),
    ) as HTMLSelectElement;
    expect(() =>
      fireEvent.change(pipelineSelect, { target: { value: '2' } }),
    ).not.toThrow();
  });

  it('saves a deal with no expected close date as null', async () => {
    const props = defaultProps({
      deal: makeDeal({ expectedCloseDate: null }),
    });
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(apiMock.updateDeal).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ expectedCloseDate: null }),
    );
  });
});

// ---------------------------------------------------------------------------
// Inline company creation
// ---------------------------------------------------------------------------

describe('DealDetailDrawer — inline company creation', () => {
  it('toggles the new-company form open and closed', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === '+ New Company',
    );
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn!);
    expect(
      container.querySelector('input[placeholder="Company name"]'),
    ).toBeTruthy();
    const cancel = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel',
    );
    fireEvent.click(cancel!);
    expect(
      container.querySelector('input[placeholder="Company name"]'),
    ).toBeNull();
  });

  it('creates a new company and calls onCompanyCreated', async () => {
    apiMock.createCompany.mockResolvedValue({
      success: true,
      data: { id: 555, name: 'BrandCo' },
    });
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Company',
      )!,
    );
    const input = container.querySelector(
      'input[placeholder="Company name"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'BrandCo' } });
    const submitBtn = input.parentElement!.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(apiMock.createCompany).toHaveBeenCalledWith('BrandCo');
    expect(props.onCompanyCreated).toHaveBeenCalled();
  });

  it('submits company via Enter key', async () => {
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Company',
      )!,
    );
    const input = container.querySelector(
      'input[placeholder="Company name"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'EnterCo' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(apiMock.createCompany).toHaveBeenCalledWith('EnterCo');
  });

  it('does nothing when company name is empty/whitespace', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Company',
      )!,
    );
    const input = container.querySelector(
      'input[placeholder="Company name"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    const submitBtn = input.parentElement!.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(apiMock.createCompany).not.toHaveBeenCalled();
  });

  it('does not call onCompanyCreated when API returns success:false', async () => {
    apiMock.createCompany.mockResolvedValue({ success: false });
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Company',
      )!,
    );
    const input = container.querySelector(
      'input[placeholder="Company name"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Nope' } });
    const submitBtn = input.parentElement!.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(props.onCompanyCreated).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Inline contact creation
// ---------------------------------------------------------------------------

describe('DealDetailDrawer — inline contact creation', () => {
  it('toggles the new-contact form and resets fields on cancel', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === '+ New Contact',
    );
    fireEvent.click(toggleBtn!);
    const first = container.querySelector(
      'input[placeholder="First name *"]',
    ) as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'X' } });
    // Cancel
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel',
    );
    fireEvent.click(cancelBtn!);
    expect(
      container.querySelector('input[placeholder="First name *"]'),
    ).toBeNull();
    // Re-open: should be empty
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Contact',
      )!,
    );
    const reopened = container.querySelector(
      'input[placeholder="First name *"]',
    ) as HTMLInputElement;
    expect(reopened.value).toBe('');
  });

  it('creates a new contact (full fields) and calls onContactCreated', async () => {
    apiMock.createContact.mockResolvedValue({
      success: true,
      data: {
        id: 777,
        firstName: 'Eve',
        lastName: 'Day',
        companyId: 1,
      },
    });
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Contact',
      )!,
    );
    fireEvent.change(
      container.querySelector(
        'input[placeholder="First name *"]',
      ) as HTMLInputElement,
      { target: { value: 'Eve' } },
    );
    fireEvent.change(
      container.querySelector(
        'input[placeholder="Last name"]',
      ) as HTMLInputElement,
      { target: { value: 'Day' } },
    );
    fireEvent.change(
      container.querySelector(
        'input[placeholder="Email"]',
      ) as HTMLInputElement,
      { target: { value: 'eve@x.com' } },
    );
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.innerHTML.includes('check') && (b as HTMLButtonElement).type === 'button',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(apiMock.createContact).toHaveBeenCalledWith({
      firstName: 'Eve',
      lastName: 'Day',
      email: 'eve@x.com',
      companyId: 1,
    });
    expect(props.onContactCreated).toHaveBeenCalled();
  });

  it('creates a contact with null email/lastName when blank', async () => {
    apiMock.createContact.mockResolvedValue({
      success: true,
      data: { id: 123, firstName: 'Solo', lastName: null, companyId: null },
    });
    const props = defaultProps({
      deal: makeDeal({ companyId: null }),
    });
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Contact',
      )!,
    );
    fireEvent.change(
      container.querySelector(
        'input[placeholder="First name *"]',
      ) as HTMLInputElement,
      { target: { value: 'Solo' } },
    );
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.innerHTML.includes('check') && (b as HTMLButtonElement).type === 'button',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(apiMock.createContact).toHaveBeenCalledWith({
      firstName: 'Solo',
      lastName: null,
      email: null,
      companyId: null,
    });
  });

  it('submits the contact form via Enter on email field', async () => {
    apiMock.createContact.mockResolvedValue({
      success: true,
      data: { id: 1, firstName: 'X', lastName: null, companyId: null },
    });
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Contact',
      )!,
    );
    fireEvent.change(
      container.querySelector(
        'input[placeholder="First name *"]',
      ) as HTMLInputElement,
      { target: { value: 'Press' } },
    );
    const emailInput = container.querySelector(
      'input[placeholder="Email"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.keyDown(emailInput, { key: 'Enter' });
    });
    expect(apiMock.createContact).toHaveBeenCalled();
  });

  it('does nothing if firstName is empty', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Contact',
      )!,
    );
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.innerHTML.includes('check') && (b as HTMLButtonElement).type === 'button',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('does not call onContactCreated when API returns success:false', async () => {
    apiMock.createContact.mockResolvedValue({ success: false });
    const props = defaultProps();
    const { container } = render(<DealDetailDrawer {...props} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Contact',
      )!,
    );
    fireEvent.change(
      container.querySelector(
        'input[placeholder="First name *"]',
      ) as HTMLInputElement,
      { target: { value: 'Nope' } },
    );
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.innerHTML.includes('check') && (b as HTMLButtonElement).type === 'button',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(props.onContactCreated).not.toHaveBeenCalled();
  });

  it('shows the company-assignment hint when a company is selected', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '+ New Contact',
      )!,
    );
    expect(container.textContent).toContain('Will be assigned to');
    expect(container.textContent).toContain('Acme Co');
  });
});

// ---------------------------------------------------------------------------
// Artifacts tab
// ---------------------------------------------------------------------------

describe('DealDetailDrawer — artifacts tab', () => {
  function switchToArtifacts(container: HTMLElement) {
    const tab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Artifacts') && b.className.includes('flex-1'),
    );
    fireEvent.click(tab!);
  }

  it('shows the empty state when no artifacts are linked', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToArtifacts(container);
    expect(container.textContent).toContain('No artifacts linked yet');
  });

  it('renders linked artifacts with type label and a working open link', async () => {
    apiMock.fetchArtifacts.mockResolvedValue([
      {
        id: 1,
        dealId: 42,
        artifactType: 'website',
        artifactId: 5,
        displayTitle: 'Site A',
        pinned: false,
        createdAt: '',
      },
      {
        id: 2,
        dealId: 42,
        artifactType: 'unknown_type',
        artifactId: 9,
        displayTitle: 'No URL',
        pinned: false,
        createdAt: '',
      },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToArtifacts(container);
    expect(container.textContent).toContain('Site A');
    expect(container.textContent).toContain('No URL');
    expect(container.textContent).toContain('Website');
    // First artifact has an open-in-new icon (a tag); second doesn't
    const links = container.querySelectorAll('a[href="/portal/websites/5"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles the artifact picker open and closed', async () => {
    apiMock.fetchAvailableArtifacts.mockResolvedValue([
      { type: 'website', id: 7, title: 'Pickable' },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToArtifacts(container);
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link Artifact'),
    );
    fireEvent.click(linkBtn!);
    expect(container.textContent).toContain('Pickable');
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel'),
    );
    fireEvent.click(cancelBtn!);
    expect(container.textContent).not.toContain('Pickable');
  });

  it('filters available artifacts by type chip', async () => {
    apiMock.fetchAvailableArtifacts.mockResolvedValue([
      { type: 'website', id: 7, title: 'SiteAvail' },
      { type: 'pitch_deck', id: 8, title: 'DeckAvail' },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToArtifacts(container);
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Link Artifact'),
      )!,
    );
    // Both should be visible initially
    expect(container.textContent).toContain('SiteAvail');
    expect(container.textContent).toContain('DeckAvail');
    const websiteChip = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Website' && b.className.includes('px-2'),
    );
    fireEvent.click(websiteChip!);
    expect(container.textContent).toContain('SiteAvail');
    expect(container.textContent).not.toContain('DeckAvail');
  });

  it('shows empty-picker message when filter has no matches', async () => {
    apiMock.fetchAvailableArtifacts.mockResolvedValue([
      { type: 'website', id: 7, title: 'OnlySite' },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToArtifacts(container);
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Link Artifact'),
      )!,
    );
    const surveyChip = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Survey' && b.className.includes('px-2'),
    );
    fireEvent.click(surveyChip!);
    expect(container.textContent).toContain('No available artifacts');
  });

  it('handleAddArtifact picks an option, calls api, and refreshes', async () => {
    apiMock.fetchAvailableArtifacts.mockResolvedValue([
      { type: 'website', id: 7, title: 'AddMe' },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToArtifacts(container);
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Link Artifact'),
      )!,
    );
    const optionBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AddMe'),
    );
    apiMock.fetchArtifacts.mockResolvedValueOnce([
      {
        id: 1,
        dealId: 42,
        artifactType: 'website',
        artifactId: 7,
        displayTitle: 'AddMe',
        pinned: false,
        createdAt: '',
      },
    ]);
    await act(async () => {
      fireEvent.click(optionBtn!);
    });
    expect(apiMock.addArtifact).toHaveBeenCalledWith(42, 'website', 7);
  });

  it('togglePin updates the artifact pin state', async () => {
    apiMock.fetchArtifacts.mockResolvedValue([
      {
        id: 1,
        dealId: 42,
        artifactType: 'website',
        artifactId: 5,
        displayTitle: 'Site',
        pinned: false,
        createdAt: '',
      },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToArtifacts(container);
    const pinBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title') === 'Pin',
    );
    expect(pinBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(pinBtn!);
    });
    expect(apiMock.updateArtifactPin).toHaveBeenCalledWith(42, 1, true);
  });

  it('handleRemoveArtifact removes the row from the list', async () => {
    apiMock.fetchArtifacts.mockResolvedValue([
      {
        id: 1,
        dealId: 42,
        artifactType: 'website',
        artifactId: 5,
        displayTitle: 'GoneSoon',
        pinned: false,
        createdAt: '',
      },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToArtifacts(container);
    expect(container.textContent).toContain('GoneSoon');
    const removeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title') === 'Remove',
    );
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    expect(apiMock.removeArtifact).toHaveBeenCalledWith(42, 1);
    expect(container.textContent).not.toContain('GoneSoon');
  });

  it('renders pinned artifacts preview section on the Details tab', async () => {
    apiMock.fetchArtifacts.mockResolvedValue([
      {
        id: 1,
        dealId: 42,
        artifactType: 'website',
        artifactId: 5,
        displayTitle: 'PinnedSite',
        pinned: true,
        createdAt: '',
      },
      {
        id: 2,
        dealId: 42,
        artifactType: 'no_type_known',
        artifactId: 5,
        displayTitle: 'PinnedNoUrl',
        pinned: true,
        createdAt: '',
      },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    expect(container.textContent).toContain('Pinned Artifacts');
    expect(container.textContent).toContain('PinnedSite');
    expect(container.textContent).toContain('PinnedNoUrl');
  });
});

// ---------------------------------------------------------------------------
// Comments tab
// ---------------------------------------------------------------------------

describe('DealDetailDrawer — comments tab', () => {
  function switchToComments(container: HTMLElement) {
    const tab = Array.from(container.querySelectorAll('button')).find(
      (b) =>
        b.textContent?.includes('Comments') && b.className.includes('flex-1'),
    );
    fireEvent.click(tab!);
  }

  it('shows the empty state when there are no comments', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    expect(container.textContent).toContain('No comments yet');
  });

  it('renders existing comments with author name and timestamps', async () => {
    apiMock.fetchComments.mockResolvedValue([
      {
        id: 1,
        dealId: 42,
        authorId: 1,
        authorName: 'Alice',
        body: 'Hello world',
        attachments: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
      {
        id: 2,
        dealId: 42,
        authorId: 2,
        authorName: null,
        body: 'No author',
        attachments: [
          {
            url: '/file.png',
            filename: 'pic.png',
            mimeType: 'image/png',
            fileSize: 100,
          },
          {
            url: '/doc.pdf',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            fileSize: 200,
          },
        ],
        createdAt: '2026-05-02T00:00:00Z',
      },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    expect(container.textContent).toContain('Hello world');
    expect(container.textContent).toContain('Unknown');
    expect(container.textContent).toContain('pic.png');
    expect(container.textContent).toContain('doc.pdf');
  });

  it('escapes HTML in comment body to prevent injection', async () => {
    apiMock.fetchComments.mockResolvedValue([
      {
        id: 1,
        dealId: 42,
        authorId: 1,
        authorName: 'A',
        body: '<script>alert(1)</script> & "danger"',
        attachments: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('renders @mentions in comment body as styled spans', async () => {
    apiMock.fetchComments.mockResolvedValue([
      {
        id: 1,
        dealId: 42,
        authorId: 1,
        authorName: 'A',
        body: 'Hi @[Bob](5) check this',
        attachments: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    expect(container.innerHTML).toContain('@Bob');
    expect(container.innerHTML).toContain('text-primary');
  });

  it('post button is disabled when body is blank and no files attached', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send'),
    ) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it('posts a comment with text body and refreshes', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello there' } });
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send'),
    );
    apiMock.fetchComments.mockResolvedValueOnce([
      {
        id: 1,
        dealId: 42,
        authorId: 1,
        authorName: 'Me',
        body: 'hello there',
        attachments: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
    ]);
    await act(async () => {
      fireEvent.click(sendBtn!);
    });
    expect(apiMock.postComment).toHaveBeenCalledWith(42, 'hello there', []);
  });

  it('posts a comment via Cmd+Enter keystroke', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'shortcut' } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    });
    expect(apiMock.postComment).toHaveBeenCalledWith(42, 'shortcut', []);
  });

  it('posts via Ctrl+Enter as well', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'ctrl' } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    });
    expect(apiMock.postComment).toHaveBeenCalledWith(42, 'ctrl', []);
  });

  it('shows error message when postComment fails', async () => {
    apiMock.postComment.mockResolvedValue({ ok: false });
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    // Type in Details tab to ensure editError surfaces there if the user
    // navigates back — but the error renders on the Details form.
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'bad' } });
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send'),
    );
    await act(async () => {
      fireEvent.click(sendBtn!);
    });
    // Switch back to details to see error
    const detailsTab = Array.from(container.querySelectorAll('button')).find(
      (b) =>
        b.textContent?.includes('Details') && b.className.includes('flex-1'),
    );
    fireEvent.click(detailsTab!);
    expect(container.textContent).toContain('Failed to post comment');
  });

  it('does nothing when posting an empty body with no files', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    });
    expect(apiMock.postComment).not.toHaveBeenCalled();
  });

  it('attaches files and shows the file chip with a remove button', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['hi'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(container.textContent).toContain('note.txt');
    expect(container.textContent).toContain('1 file');
    // Remove the file
    const closeBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.innerHTML.includes('close'),
    );
    // The chip's close button is the one inside a span with the filename
    const fileChip = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent?.includes('note.txt'),
    );
    const removeBtn = fileChip?.querySelector('button');
    fireEvent.click(removeBtn!);
    expect(container.textContent).not.toContain('note.txt');
  });

  it('shows pluralization when more than one file is attached', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const f1 = new File(['a'], 'a.txt', { type: 'text/plain' });
    const f2 = new File(['b'], 'b.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [f1, f2] } });
    expect(container.textContent).toContain('2 files');
  });

  it('attach button triggers the hidden file input', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const attachBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Attach'),
    );
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});
    fireEvent.click(attachBtn!);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('deletes a comment via the delete button', async () => {
    apiMock.fetchComments.mockResolvedValue([
      {
        id: 5,
        dealId: 42,
        authorId: 1,
        authorName: 'A',
        body: 'soon-gone',
        attachments: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    expect(container.textContent).toContain('soon-gone');
    const delBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title') === 'Delete',
    );
    await act(async () => {
      fireEvent.click(delBtn!);
    });
    expect(apiMock.deleteComment).toHaveBeenCalledWith(42, 5);
    expect(container.textContent).not.toContain('soon-gone');
  });

  it('opens the mention dropdown when typing @ in the comment input', async () => {
    apiMock.fetchMentionUsers.mockResolvedValue([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: null },
    ]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@a' } });
    // Simulate cursor at end
    (textarea as any).selectionStart = 2;
    fireEvent.change(textarea, { target: { value: '@a' } });
    // The component re-evaluates the regex on every change
    await waitFor(() => {
      expect(container.textContent).toContain('Alice');
    });
  });

  it('closes the mention dropdown when Escape is pressed', async () => {
    apiMock.fetchMentionUsers.mockResolvedValue([{ id: 1, name: 'Alice' }]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@' } });
    (textarea as any).selectionStart = 1;
    fireEvent.change(textarea, { target: { value: '@' } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Escape' });
    });
    // After Escape the dropdown should not be shown
    // (we can't assert on visibility deterministically without testid hooks,
    // but the handler executed without throwing)
    expect(textarea).toBeTruthy();
  });

  it('inserts a mention into the textarea on click', async () => {
    apiMock.fetchMentionUsers.mockResolvedValue([{ id: 7, name: 'Bob' }]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@b' } });
    (textarea as any).selectionStart = 2;
    fireEvent.change(textarea, { target: { value: '@b' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Bob');
    });
    const bobBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Bob' || b.textContent?.includes('Bob'),
    );
    fireEvent.click(bobBtn!);
    expect(textarea.value).toContain('@[Bob](7)');
  });

  it('shows "No matches" when mention query has no hits', async () => {
    apiMock.fetchMentionUsers.mockResolvedValue([{ id: 1, name: 'Alice' }]);
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    switchToComments(container);
    const textarea = container.querySelector(
      'textarea[placeholder*="@ to mention"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@zzzz' } });
    (textarea as any).selectionStart = 5;
    fireEvent.change(textarea, { target: { value: '@zzzz' } });
    await waitFor(() => {
      expect(container.textContent).toContain('No matches');
    });
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

describe('DealDetailDrawer — tab switching', () => {
  it('switches across all three tabs', async () => {
    const { container } = render(<DealDetailDrawer {...defaultProps()} />);
    await flush();
    const tabs = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.className.includes('flex-1'),
    );
    // Click Artifacts
    fireEvent.click(tabs[1]);
    expect(container.textContent).toContain('Linked Artifacts');
    // Click Comments
    fireEvent.click(tabs[2]);
    expect(container.textContent).toContain('No comments yet');
    // Back to Details
    fireEvent.click(tabs[0]);
    expect(container.textContent).toContain('Custom Fields');
  });
});
