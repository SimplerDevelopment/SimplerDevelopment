// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — heavy sub-components from product-designer that pull in canvas/webgl
// ---------------------------------------------------------------------------

vi.mock('@/components/product-designer/components/HTMLEditor', () => ({
  HTMLEditor: ({ value, onChange, placeholder }: any) =>
    React.createElement('textarea', {
      'data-testid': 'html-editor',
      value: value ?? '',
      placeholder,
      onChange: (e: any) => onChange(e.target.value),
    }),
}));

// EditorContext — provide a minimal default context
vi.mock('@/components/product-designer/EditorContext', () => {
  const ctx = React.createContext({
    websiteId: 0,
    controlMode: 'preview',
    product: null,
    style: null,
    side: null,
    setStyle: () => {},
    setSide: () => {},
    setControlMode: () => {},
    addLayer: () => {},
    updateLayer: () => {},
    removeLayer: () => {},
    layers: [],
    setLayers: () => {},
    selectedLayer: null,
    setSelectedLayer: () => {},
    selectedLayers: [],
    setSelectedLayers: () => {},
    styleOverrides: {},
    setStyleOverrides: () => {},
    quantity: 1,
    setQuantity: () => {},
    showModal: false,
    setShowModal: () => {},
    carouselMode: false,
    currentDesignId: null,
    setCurrentDesignId: () => {},
    designState: {
      isSaved: true,
      isAutoSaving: false,
      lastSavedAt: null,
      hasUnsavedChanges: false,
      name: 'Test',
    },
    setDesignState: () => {},
    designName: 'Test',
    setDesignName: () => {},
    saveDesign: () => Promise.resolve(null),
    loadDesign: () => Promise.resolve(false),
    createNewDesign: () => {},
    autoSave: () => Promise.resolve(),
  });
  return { EditorContext: ctx };
});

// MainView — purely visual, not under test
vi.mock('@/components/product-designer/MainView', () => ({
  MainView: () => React.createElement('div', { 'data-testid': 'main-view' }),
}));

// react-icons — simple stubs
vi.mock('react-icons/bs', () => ({
  BsCheck2: () => React.createElement('span', { 'data-testid': 'check-icon' }),
  BsX: () => React.createElement('span', { 'data-testid': 'x-icon' }),
}));

// ---------------------------------------------------------------------------
// Subject under test (imported AFTER mocks)
// ---------------------------------------------------------------------------
import { StoreAssignmentTable } from '@/components/product-designer/StoreAssignmentTable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORES = [
  { id: 1, name: 'Alpha Store' },
  { id: 2, name: 'Beta Store' },
  { id: 3, name: 'Gamma Store' },
];

const PRODUCT = { id: 42, name: 'Test Product', catalogId: 42 };

function makeProps(overrides: Partial<React.ComponentProps<typeof StoreAssignmentTable>> = {}) {
  return {
    product: PRODUCT,
    availableStores: STORES,
    onAssignToStores: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoreAssignmentTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Render ---

  it('renders the header title "Add To Store"', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    expect(screen.getByText('Add To Store')).toBeInTheDocument();
  });

  it('renders product name in the subtitle', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    expect(screen.getByText(/Assign Test Product to stores/i)).toBeInTheDocument();
  });

  it('renders all available store rows', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    expect(screen.getByText('Alpha Store')).toBeInTheDocument();
    expect(screen.getByText('Beta Store')).toBeInTheDocument();
    expect(screen.getByText('Gamma Store')).toBeInTheDocument();
  });

  it('shows "0 of 3 stores selected" initially', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    expect(screen.getByText(/0 of 3 stores selected/i)).toBeInTheDocument();
  });

  it('shows product name from productOverview when provided', () => {
    render(
      <StoreAssignmentTable
        {...makeProps({
          productOverview: {
            name: 'Override Name',
            brand: { name: 'Nike' },
          },
        })}
      />,
    );
    expect(screen.getByText('Override Name')).toBeInTheDocument();
    expect(screen.getByText('Nike')).toBeInTheDocument();
  });

  it('shows design name badge when designData.designName provided', () => {
    render(
      <StoreAssignmentTable
        {...makeProps({
          designData: { designName: 'My Cool Design', designId: 7 },
        })}
      />,
    );
    // The design name appears in both the subtitle span and the badge span
    const matches = screen.getAllByText(/My Cool Design/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Verify the badge specifically contains "Design: My Cool Design"
    expect(screen.getByText(/Design: My Cool Design/i)).toBeInTheDocument();
  });

  it('renders "Select All Stores" button initially', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    expect(screen.getByRole('button', { name: /Select All Stores/i })).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('renders disabled Add button when no stores selected', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    const addBtn = screen.getByRole('button', { name: /Add To 0 Store/i });
    expect(addBtn).toBeDisabled();
  });

  // --- Store toggle (assign/unassign) ---

  it('selects a store on click and updates counter', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    const row = screen.getByText('Alpha Store').closest('div[class*="rounded-lg"]') as HTMLElement;
    fireEvent.click(row);
    expect(screen.getByText(/1 of 3 stores selected/i)).toBeInTheDocument();
  });

  it('deselects a store on second click', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    const row = screen.getByText('Alpha Store').closest('div[class*="rounded-lg"]') as HTMLElement;
    fireEvent.click(row);
    expect(screen.getByText(/1 of 3 stores selected/i)).toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.getByText(/0 of 3 stores selected/i)).toBeInTheDocument();
  });

  it('enables Add button after selecting a store', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    const row = screen.getByText('Alpha Store').closest('div[class*="rounded-lg"]') as HTMLElement;
    fireEvent.click(row);
    const addBtn = screen.getByRole('button', { name: /Add To 1 Store/i });
    expect(addBtn).not.toBeDisabled();
  });

  it('uses plural "Stores" when multiple stores selected', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    const rows = STORES.map(
      (s) => screen.getByText(s.name).closest('div[class*="rounded-lg"]') as HTMLElement,
    );
    fireEvent.click(rows[0]);
    fireEvent.click(rows[1]);
    expect(screen.getByRole('button', { name: /Add To 2 Stores/i })).toBeInTheDocument();
  });

  // --- Select all / deselect all ---

  it('selects all stores on "Select All Stores" click', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Select All Stores/i }));
    expect(screen.getByText(/3 of 3 stores selected/i)).toBeInTheDocument();
  });

  it('toggles "Select All Stores" button to "Deselect All" when all are selected', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Select All Stores/i }));
    expect(screen.getByRole('button', { name: /Deselect All/i })).toBeInTheDocument();
  });

  it('deselects all when clicking "Deselect All"', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Select All Stores/i }));
    fireEvent.click(screen.getByRole('button', { name: /Deselect All/i }));
    expect(screen.getByText(/0 of 3 stores selected/i)).toBeInTheDocument();
  });

  // --- Close / Cancel ---

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<StoreAssignmentTable {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when × header button is clicked', () => {
    const onClose = vi.fn();
    render(<StoreAssignmentTable {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // --- Save (assign) ---

  it('calls onAssignToStores with correct storeIds and then onClose', async () => {
    const onAssignToStores = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<StoreAssignmentTable {...makeProps({ onAssignToStores, onClose })} />);

    const row = screen.getByText('Alpha Store').closest('div[class*="rounded-lg"]') as HTMLElement;
    fireEvent.click(row);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add To 1 Store/i }));
    });

    await waitFor(() => expect(onAssignToStores).toHaveBeenCalledOnce());
    const [arg] = onAssignToStores.mock.calls[0];
    expect(arg.storeIds).toContain(1);
    expect(arg.catalogId).toBe(42);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('passes designId and designName from designData', async () => {
    const onAssignToStores = vi.fn().mockResolvedValue(undefined);
    render(
      <StoreAssignmentTable
        {...makeProps({
          onAssignToStores,
          designData: { designId: 99, designName: 'Summer Design' },
        })}
      />,
    );

    const row = screen.getByText('Alpha Store').closest('div[class*="rounded-lg"]') as HTMLElement;
    fireEvent.click(row);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add To 1 Store/i }));
    });

    await waitFor(() => expect(onAssignToStores).toHaveBeenCalledOnce());
    const [arg] = onAssignToStores.mock.calls[0];
    expect(arg.designId).toBe(99);
    expect(arg.designName).toBe('Summer Design');
  });

  it('shows "Adding..." while the save is in-flight', async () => {
    let resolveAssign!: () => void;
    const onAssignToStores = vi.fn(
      () => new Promise<void>((res) => { resolveAssign = res; }),
    );

    render(<StoreAssignmentTable {...makeProps({ onAssignToStores })} />);
    const row = screen.getByText('Alpha Store').closest('div[class*="rounded-lg"]') as HTMLElement;
    fireEvent.click(row);

    fireEvent.click(screen.getByRole('button', { name: /Add To 1 Store/i }));
    expect(await screen.findByText('Adding...')).toBeInTheDocument();

    await act(async () => { resolveAssign(); });
  });

  it('does not call onAssignToStores when no stores are selected', async () => {
    const onAssignToStores = vi.fn();
    render(<StoreAssignmentTable {...makeProps({ onAssignToStores })} />);
    // Button is disabled, but call the handler path directly via the disabled button
    // (the button guard is tested via the disabled state; we just verify it stays clean)
    expect(screen.getByRole('button', { name: /Add To 0 Store/i })).toBeDisabled();
    expect(onAssignToStores).not.toHaveBeenCalled();
  });

  it('handles onAssignToStores rejection gracefully (no crash)', async () => {
    const onAssignToStores = vi.fn().mockRejectedValue(new Error('network error'));
    const onClose = vi.fn();
    render(<StoreAssignmentTable {...makeProps({ onAssignToStores, onClose })} />);

    const row = screen.getByText('Alpha Store').closest('div[class*="rounded-lg"]') as HTMLElement;
    fireEvent.click(row);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add To 1 Store/i }));
    });

    // onClose must NOT have been called after error
    await waitFor(() => expect(onAssignToStores).toHaveBeenCalledOnce());
    expect(onClose).not.toHaveBeenCalled();
  });

  // --- Design name input ---

  it('renders design name input with default "Custom Design"', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    const input = screen.getByPlaceholderText(/Enter design name/i) as HTMLInputElement;
    expect(input.value).toBe('Custom Design');
  });

  it('pre-fills design name input from designData.designName', () => {
    render(
      <StoreAssignmentTable
        {...makeProps({ designData: { designName: 'Preset Name' } })}
      />,
    );
    const input = screen.getByPlaceholderText(/Enter design name/i) as HTMLInputElement;
    expect(input.value).toBe('Preset Name');
  });

  it('updates design name input on change', () => {
    render(<StoreAssignmentTable {...makeProps()} />);
    const input = screen.getByPlaceholderText(/Enter design name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Name' } });
    expect(input.value).toBe('New Name');
  });

  // --- Renders correctly with zero stores ---

  it('renders gracefully with no stores', () => {
    render(<StoreAssignmentTable {...makeProps({ availableStores: [] })} />);
    expect(screen.getByText(/0 of 0 stores selected/i)).toBeInTheDocument();
  });
});
