// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/portal/crm',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import CrmImportExport from '@/components/portal/CrmImportExport';

function makeFakeFile(name = 'contacts.csv', content = 'firstName,lastName\nJohn,Doe'): File {
  return new File([content], name, { type: 'text/csv' });
}

function mockPreviewSuccess(headers: string[] = ['firstName', 'lastName'], sampleRows: string[][] = [['John', 'Doe']]) {
  return {
    ok: true,
    json: async () => ({ success: true, data: { headers, sampleRows } }),
  } as unknown as Response;
}

function mockPreviewFail(message = 'Bad file') {
  return {
    ok: true,
    json: async () => ({ success: false, message }),
  } as unknown as Response;
}

function mockPreviewNotOk() {
  return { ok: false, json: async () => ({}) } as unknown as Response;
}

function mockImportSuccess(imported = 5, skipped = 1, errors: string[] = []) {
  return {
    ok: true,
    json: async () => ({ success: true, data: { imported, skipped, errors } }),
  } as unknown as Response;
}

function mockImportFail(message = 'Import failed') {
  return {
    ok: true,
    json: async () => ({ success: false, message }),
  } as unknown as Response;
}

function mockExportSuccess() {
  return {
    ok: true,
    blob: async () => new Blob(['a,b\n1,2'], { type: 'text/csv' }),
  } as unknown as Response;
}

function mockExportFail() {
  return { ok: false, blob: async () => new Blob([]) } as unknown as Response;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/** Simulate a file being selected through the hidden file input. */
async function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  if (!input) throw new Error('No file input found');
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  await act(async () => {
    fireEvent.change(input);
  });
}

// ---------------------------------------------------------------------------
// Tests — render
// ---------------------------------------------------------------------------

describe('CrmImportExport — initial render', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('renders Export and Import buttons', () => {
    render(<CrmImportExport entityType="contact" />);
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Import')).toBeInTheDocument();
  });

  it('does not show the import modal by default', () => {
    render(<CrmImportExport entityType="contact" />);
    expect(screen.queryByText(/Import contacts/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — open/close modal
// ---------------------------------------------------------------------------

describe('CrmImportExport — modal open / close', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('opens import modal when Import button is clicked', () => {
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    // Modal title: "Import contacts" — multiple elements may contain this text
    expect(screen.getAllByText(/Import contacts/i).length).toBeGreaterThan(0);
  });

  it('shows upload step by default when modal opens', () => {
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    expect(screen.getByText(/Upload a CSV file/i)).toBeInTheDocument();
  });

  it('closes modal when close (X) button is clicked', () => {
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    // The close button has text 'close' (material icon text)
    const closeBtn = document.querySelector('.flex.items-center.justify-between button') as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(screen.queryAllByText(/Import contacts/i).length).toBe(0);
  });

  it('closes modal when backdrop overlay is clicked', () => {
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    const overlay = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(overlay);
    expect(screen.queryAllByText(/Import contacts/i).length).toBe(0);
  });

  it('shows correct entity type in modal title for company', () => {
    render(<CrmImportExport entityType="company" />);
    fireEvent.click(screen.getByText('Import'));
    // h3 contains "Import companys"
    const h3 = document.querySelector('.fixed h3') as HTMLElement;
    expect(h3.textContent).toMatch(/company/i);
  });

  it('shows correct entity type in modal title for deal', () => {
    render(<CrmImportExport entityType="deal" />);
    fireEvent.click(screen.getByText('Import'));
    const h3 = document.querySelector('.fixed h3') as HTMLElement;
    expect(h3.textContent).toMatch(/deal/i);
  });
});

// ---------------------------------------------------------------------------
// Tests — file upload / preview step
// ---------------------------------------------------------------------------

describe('CrmImportExport — file upload and preview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls preview API when a file is selected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockPreviewSuccess());
    global.fetch = fetchMock;
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/portal/crm/import/preview', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('transitions to map step after successful preview', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewSuccess(['firstName', 'email']));
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(screen.getByText(/Map CSV columns/i)).toBeInTheDocument();
    });
  });

  it('renders CSV header columns as mapping rows', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewSuccess(['FirstNameCol', 'EmailCol']));
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(screen.getAllByText('FirstNameCol').length).toBeGreaterThan(0);
      expect(screen.getAllByText('EmailCol').length).toBeGreaterThan(0);
    });
  });

  it('shows sample data rows in preview table', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewSuccess(['firstName'], [['Alice'], ['Bob']]));
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('shows error when preview API returns ok=false', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewNotOk());
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(screen.getByText('Failed to upload file. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows error message from preview API when success=false', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewFail('Invalid CSV format'));
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(screen.getByText('Invalid CSV format')).toBeInTheDocument();
    });
  });

  it('shows generic error when preview API returns no message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    } as unknown as Response);
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(screen.getByText('Failed to preview file')).toBeInTheDocument();
    });
  });

  it('auto-maps headers that match field values', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewSuccess(['firstName', 'email']));
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      // firstName should be auto-mapped to 'firstName' option
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const firstNameSelect = selects[0];
      expect(firstNameSelect.value).toBe('firstName');
    });
  });

  it('renders skip duplicates checkbox for contact entity', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewSuccess(['email']));
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(screen.getByText('Skip duplicate emails')).toBeInTheDocument();
    });
  });

  it('does not render skip duplicates checkbox for deal entity', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewSuccess(['title']));
    render(<CrmImportExport entityType="deal" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => {
      expect(screen.queryByText('Skip duplicate emails')).not.toBeInTheDocument();
    });
  });

  it('can change a column mapping via select', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockPreviewSuccess(['MyUniqueCol']));
    render(<CrmImportExport entityType="contact" />);
    fireEvent.click(screen.getByText('Import'));
    await selectFile(makeFakeFile());
    await waitFor(() => screen.getAllByText('MyUniqueCol'));
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: 'phone' } });
    expect(selects[0].value).toBe('phone');
  });
});

// ---------------------------------------------------------------------------
// Tests — import step (success / error)
// ---------------------------------------------------------------------------

describe('CrmImportExport — import submit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

    /** Find the modal's "Import" submit button (has bg-primary class, inside the modal) */
  function clickModalImportBtn() {
    const btn = document.querySelector('.fixed .flex.justify-end.gap-2 button.bg-primary') as HTMLButtonElement;
    if (!btn) throw new Error('Modal import button not found');
    fireEvent.click(btn);
  }

  async function reachMapStep(entityType: 'contact' | 'company' | 'deal' = 'contact') {
    const previewFetch = vi.fn()
      .mockResolvedValueOnce(mockPreviewSuccess(['HeaderA']));
    global.fetch = previewFetch;
    render(<CrmImportExport entityType={entityType} />);
    // Click the upload "Import" button (the toolbar one, not the modal submit)
    const importToolbarBtn = screen.getAllByText('Import')[0];
    fireEvent.click(importToolbarBtn);
    await selectFile(makeFakeFile());
    await waitFor(() => screen.getByText(/Map CSV columns/i));
    return previewFetch;
  }

  it('calls import API on Import button click', async () => {
    const previewFetch = await reachMapStep();
    previewFetch.mockResolvedValueOnce(mockImportSuccess());
    await act(async () => { clickModalImportBtn(); });
    await waitFor(() => {
      expect(previewFetch).toHaveBeenCalledWith('/api/portal/crm/import', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('shows importing spinner while import is in flight', async () => {
    let resolveImport!: (v: unknown) => void;
    const previewFetch = await reachMapStep();
    previewFetch.mockReturnValueOnce(new Promise(r => { resolveImport = r; }));
    act(() => { clickModalImportBtn(); });
    await waitFor(() => {
      expect(screen.getByText(/Importing/i)).toBeInTheDocument();
    });
    await act(async () => {
      resolveImport(mockImportSuccess());
    });
  });

  it('shows done step with imported count after success', async () => {
    const previewFetch = await reachMapStep();
    previewFetch.mockResolvedValueOnce(mockImportSuccess(10, 2));
    await act(async () => { clickModalImportBtn(); });
    await waitFor(() => {
      expect(screen.getByText(/10 contact\(s\) imported successfully/i)).toBeInTheDocument();
    });
  });

  it('shows skipped count when skipped > 0', async () => {
    const previewFetch = await reachMapStep();
    previewFetch.mockResolvedValueOnce(mockImportSuccess(3, 4));
    await act(async () => { clickModalImportBtn(); });
    await waitFor(() => {
      expect(screen.getByText(/4 skipped/)).toBeInTheDocument();
    });
  });

  it('shows per-row errors when result has errors', async () => {
    const previewFetch = await reachMapStep();
    previewFetch.mockResolvedValueOnce(mockImportSuccess(1, 0, ['Row 2: bad email', 'Row 3: missing name']));
    await act(async () => { clickModalImportBtn(); });
    await waitFor(() => {
      expect(screen.getByText('Row 2: bad email')).toBeInTheDocument();
      expect(screen.getByText('Row 3: missing name')).toBeInTheDocument();
    });
  });

  it('calls onImportComplete callback after successful import', async () => {
    const onImportComplete = vi.fn();
    const previewFetch = vi.fn().mockResolvedValueOnce(mockPreviewSuccess(['HeaderA']));
    global.fetch = previewFetch;
    render(<CrmImportExport entityType="contact" onImportComplete={onImportComplete} />);
    const importToolbarBtn = screen.getAllByText('Import')[0];
    fireEvent.click(importToolbarBtn);
    await selectFile(makeFakeFile());
    await waitFor(() => screen.getByText(/Map CSV columns/i));
    previewFetch.mockResolvedValueOnce(mockImportSuccess(1, 0));
    await act(async () => { clickModalImportBtn(); });
    await waitFor(() => {
      expect(onImportComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('shows import error message on failure and stays on map step', async () => {
    const previewFetch = await reachMapStep();
    previewFetch.mockResolvedValueOnce(mockImportFail('Duplicate key error'));
    await act(async () => { clickModalImportBtn(); });
    await waitFor(() => {
      expect(screen.getByText('Duplicate key error')).toBeInTheDocument();
      expect(screen.getByText(/Map CSV columns/i)).toBeInTheDocument();
    });
  });

  it('shows generic import error when no message provided', async () => {
    const previewFetch = await reachMapStep();
    previewFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    } as unknown as Response);
    await act(async () => { clickModalImportBtn(); });
    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeInTheDocument();
    });
  });

  it('done step Done button resets to closed state', async () => {
    const previewFetch = await reachMapStep();
    previewFetch.mockResolvedValueOnce(mockImportSuccess(1, 0));
    await act(async () => { clickModalImportBtn(); });
    await waitFor(() => screen.getByText(/imported successfully/i));
    // Done button — find by text
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryAllByText(/Import contacts/i).length).toBe(0);
  });

  it('Cancel button on map step resets to closed state', async () => {
    await reachMapStep();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryAllByText(/Import contacts/i).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — export
// ---------------------------------------------------------------------------

describe('CrmImportExport — export', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let anchorClickSpy: ReturnType<typeof vi.fn>;
  // Track anchors appended to body so we can assert click was called
  const appendedAnchors: HTMLAnchorElement[] = [];

  beforeEach(() => {
    vi.resetAllMocks();
    appendedAnchors.length = 0;
    anchorClickSpy = vi.fn();

    createObjectURL = vi.fn(() => 'blob:fake-url');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    // Intercept anchor creation only — patch createElement on document
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...rest: unknown[]) => {
      const el = originalCreateElement(tag, ...(rest as []));
      if (tag === 'a') {
        el.click = anchorClickSpy;
        appendedAnchors.push(el as HTMLAnchorElement);
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls export API with correct entityType param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockExportSuccess());
    global.fetch = fetchMock;
    render(<CrmImportExport entityType="contact" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Export'));
    });
    await waitFor(() => {
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('entityType=contact');
    });
  });

  it('passes currentFilters as query params to export API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockExportSuccess());
    global.fetch = fetchMock;
    render(<CrmImportExport entityType="contact" currentFilters={{ status: 'active', source: 'web' }} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Export'));
    });
    await waitFor(() => {
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('status=active');
      expect(url).toContain('source=web');
    });
  });

  it('triggers download link click on successful export', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockExportSuccess());
    render(<CrmImportExport entityType="contact" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Export'));
    });
    await waitFor(() => {
      expect(anchorClickSpy).toHaveBeenCalled();
    });
  });

  it('revokes object URL after download', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockExportSuccess());
    render(<CrmImportExport entityType="contact" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Export'));
    });
    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    });
  });

  it('shows export error in modal when API returns ok=false then import opened', async () => {
    // Export sets error state; error is shown inside the import modal panel.
    // Open the modal after the failed export to see the error message.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockExportFail())  // export call
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { headers: [], sampleRows: [] } }) } as unknown as Response); // preview if file selected
    global.fetch = fetchMock;
    render(<CrmImportExport entityType="contact" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Export'));
    });
    // Now open the import modal to see the error
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText('Import'));
    await waitFor(() => {
      expect(screen.getByText('Export failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows export error in modal when fetch throws then import opened', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network down'));
    render(<CrmImportExport entityType="contact" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Export'));
    });
    await waitFor(() => {
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });
    // Error is stored in state; open the modal to see it
    fireEvent.click(screen.getByText('Import'));
    await waitFor(() => {
      expect(screen.getByText('Export failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows exporting spinner while export is in flight', async () => {
    let resolveExport!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveExport = r; }));
    render(<CrmImportExport entityType="contact" />);
    act(() => {
      fireEvent.click(screen.getByText('Export'));
    });
    // Button is disabled while exporting
    const exportBtn = screen.getByText('Export').closest('button') as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
    await act(async () => {
      resolveExport(mockExportSuccess());
    });
  });

  it('skips empty filter values in export URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockExportSuccess());
    global.fetch = fetchMock;
    render(<CrmImportExport entityType="company" currentFilters={{ status: '', source: 'referral' }} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Export'));
    });
    await waitFor(() => {
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).not.toContain('status=');
      expect(url).toContain('source=referral');
    });
  });

  it('uses company entity type in export URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockExportSuccess());
    global.fetch = fetchMock;
    render(<CrmImportExport entityType="company" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Export'));
    });
    await waitFor(() => {
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('entityType=company');
    });
  });
});
