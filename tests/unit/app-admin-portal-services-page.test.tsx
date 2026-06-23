// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks (before component import)
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/portal-services',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('@/lib/portal-utils', () => ({
  formatCents: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// SurveyBuilder renders complex conditional logic — stub it to a simple pass-through.
vi.mock('@/components/admin/SurveyBuilder', () => ({
  __esModule: true,
  default: ({ fields, onChange }: { fields: unknown[]; onChange: (v: unknown[]) => void }) =>
    React.createElement('div', { 'data-testid': 'survey-builder', 'data-fields': fields.length },
      React.createElement('button', {
        type: 'button',
        onClick: () => onChange([...fields, { id: 'new', type: 'text', label: 'New Field', placeholder: '', helpText: '', required: false, options: [], order: 0 }]),
      }, 'Add Survey Field'),
    ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ServiceFixture {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  price: number;
  billingCycle: string | null;
  active: boolean;
  features: string[];
  surveyFields: { id: string; type: string; label: string; placeholder: string; helpText: string; required: boolean; options: string[]; order: number }[];
  stripePriceId: string | null;
  stripeProductId: string | null;
}

function makeService(overrides: Partial<ServiceFixture> = {}): ServiceFixture {
  return {
    id: 1,
    name: 'Website Maintenance',
    slug: 'website-maintenance',
    description: 'Monthly upkeep',
    category: 'maintenance',
    price: 4999,
    billingCycle: 'monthly',
    active: true,
    features: ['Security updates', 'Backups'],
    surveyFields: [],
    stripePriceId: null,
    stripeProductId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function listResp(services: ServiceFixture[]) {
  return { json: async () => ({ success: true, data: services }) } as unknown as Response;
}

function actionResp(data: unknown) {
  return { json: async () => ({ success: true, data }) } as unknown as Response;
}

function errorResp(message = 'Failed') {
  return { json: async () => ({ success: false, message }) } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

import AdminPortalServicesPage from '@/app/admin/portal-services/page';

async function renderAndLoad(services: ServiceFixture[] = []) {
  global.fetch = vi.fn().mockResolvedValue(listResp(services));
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<AdminPortalServicesPage />);
  });
  // Wait for loading to clear
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
  return result!;
}

// ---------------------------------------------------------------------------
// Tests — initial render / load states
// ---------------------------------------------------------------------------

describe('AdminPortalServicesPage — initial render', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('shows loading state while fetching', () => {
    let resolveFetch!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveFetch = r; }));
    render(<AdminPortalServicesPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    act(() => { resolveFetch(listResp([])); });
  });

  it('renders the Services Catalog heading', async () => {
    await renderAndLoad([]);
    expect(screen.getByText('Services Catalog')).toBeInTheDocument();
  });

  it('renders descriptive subtitle text', async () => {
    await renderAndLoad([]);
    expect(screen.getByText(/Manage services and their intake surveys/i)).toBeInTheDocument();
  });

  it('shows empty state when no services exist', async () => {
    await renderAndLoad([]);
    expect(screen.getByText('No services yet. Create one above.')).toBeInTheDocument();
  });

  it('renders a service card after load', async () => {
    await renderAndLoad([makeService()]);
    expect(screen.getByText('Website Maintenance')).toBeInTheDocument();
  });

  it('calls correct API endpoint on mount', async () => {
    global.fetch = vi.fn().mockResolvedValue(listResp([]));
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => {
      expect(global.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('/api/admin/portal/services');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — service list display
// ---------------------------------------------------------------------------

describe('AdminPortalServicesPage — service list', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders service name and formatted price', async () => {
    await renderAndLoad([makeService({ price: 4999 })]);
    expect(screen.getByText('Website Maintenance')).toBeInTheDocument();
    expect(screen.getByText('$49.99')).toBeInTheDocument();
  });

  it('renders billing cycle when not "once"', async () => {
    await renderAndLoad([makeService({ billingCycle: 'monthly' })]);
    expect(screen.getByText('/monthly')).toBeInTheDocument();
  });

  it('does not render billing cycle for one-time services', async () => {
    await renderAndLoad([makeService({ billingCycle: 'once' })]);
    expect(screen.queryByText('/once')).not.toBeInTheDocument();
  });

  it('renders description when present', async () => {
    await renderAndLoad([makeService({ description: 'Monthly upkeep' })]);
    expect(screen.getByText('Monthly upkeep')).toBeInTheDocument();
  });

  it('renders category badge', async () => {
    await renderAndLoad([makeService({ category: 'maintenance' })]);
    expect(screen.getByText('maintenance')).toBeInTheDocument();
  });

  it('renders up to 4 feature chips', async () => {
    await renderAndLoad([makeService({ features: ['A', 'B', 'C', 'D', 'E'] })]);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    // 5th feature is collapsed into "+N more"
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('shows Active badge for active service', async () => {
    await renderAndLoad([makeService({ active: true })]);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Inactive badge for inactive service', async () => {
    await renderAndLoad([makeService({ active: false })]);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders survey fields count badge when service has survey fields', async () => {
    await renderAndLoad([makeService({
      surveyFields: [{ id: 'f1', type: 'text', label: 'Name', placeholder: '', helpText: '', required: true, options: [], order: 0 }],
    })]);
    expect(screen.getByText(/1 survey field/)).toBeInTheDocument();
  });

  it('shows Stripe synced badge when stripeProductId is set', async () => {
    await renderAndLoad([makeService({ stripeProductId: 'prod_abc' })]);
    expect(screen.getByText(/Stripe synced/i)).toBeInTheDocument();
  });

  it('shows No Stripe product badge when stripeProductId is null', async () => {
    await renderAndLoad([makeService({ stripeProductId: null })]);
    expect(screen.getByText(/No Stripe product/i)).toBeInTheDocument();
  });

  it('shows stripePriceId in mono text when present', async () => {
    await renderAndLoad([makeService({ stripePriceId: 'price_xyz', stripeProductId: 'prod_abc' })]);
    expect(screen.getByText('price_xyz')).toBeInTheDocument();
  });

  it('renders multiple services', async () => {
    await renderAndLoad([
      makeService({ id: 1, name: 'Service One' }),
      makeService({ id: 2, name: 'Service Two' }),
    ]);
    expect(screen.getByText('Service One')).toBeInTheDocument();
    expect(screen.getByText('Service Two')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — create form
// ---------------------------------------------------------------------------

describe('AdminPortalServicesPage — create form', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('shows create form when New Service button is clicked', async () => {
    await renderAndLoad([]);
    fireEvent.click(screen.getByText('New Service'));
    // Both the h2 heading and submit button say "Create Service"
    expect(screen.getAllByText('Create Service').length).toBeGreaterThan(0);
  });

  it('hides create form when Cancel is clicked', async () => {
    await renderAndLoad([]);
    fireEvent.click(screen.getByText('New Service'));
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    // After cancel the h2 heading is gone
    expect(screen.queryByRole('heading', { name: /Create Service/ })).not.toBeInTheDocument();
  });

  it('shows create form when New Service clicked again if already closed', async () => {
    await renderAndLoad([]);
    // toggle on
    fireEvent.click(screen.getByText('New Service'));
    expect(screen.getByRole('heading', { name: /Create Service/ })).toBeInTheDocument();
    // toggle off
    fireEvent.click(screen.getByText('New Service'));
    expect(screen.queryByRole('heading', { name: /Create Service/ })).not.toBeInTheDocument();
  });

  it('renders all form fields in create form', async () => {
    await renderAndLoad([]);
    fireEvent.click(screen.getByText('New Service'));
    expect(screen.getByText('Service Name')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Price (USD)')).toBeInTheDocument();
    expect(screen.getByText('Billing Cycle')).toBeInTheDocument();
    expect(screen.getByText('Features (one per line)')).toBeInTheDocument();
  });

  it('renders SurveyBuilder inside create form', async () => {
    await renderAndLoad([]);
    fireEvent.click(screen.getByText('New Service'));
    expect(screen.getByTestId('survey-builder')).toBeInTheDocument();
  });

  /** Find the first text input in the create/edit form (Service Name field). */
  function getNameInput(): HTMLInputElement {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const input = inputs.find(i => !i.value || i.closest('form'));
    // Fall back to first text input
    return inputs[0];
  }

  /** Find the price/number input. */
  function getPriceInput(): HTMLInputElement {
    return document.querySelector('input[type="number"]') as HTMLInputElement;
  }

  /** Find the submit button (bg-primary, type=submit). */
  function getSubmitBtn(): HTMLButtonElement {
    return document.querySelector('button[type="submit"].bg-primary') as HTMLButtonElement
      ?? document.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  it('submits create form and appends new service to list', async () => {
    const newService = makeService({ id: 99, name: 'New Dev Service', price: 9999 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([]))
      .mockResolvedValueOnce(actionResp(newService));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('New Service'));
    fireEvent.change(getNameInput(), { target: { value: 'New Dev Service' } });
    fireEvent.change(getPriceInput(), { target: { value: '99.99' } });

    await act(async () => {
      fireEvent.click(getSubmitBtn());
    });
    await waitFor(() => {
      expect(screen.getByText('New Dev Service')).toBeInTheDocument();
    });
  });

  it('shows error message when create API returns failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([]))
      .mockResolvedValueOnce(errorResp('Name already taken'));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('New Service'));
    fireEvent.change(getNameInput(), { target: { value: 'Dup Service' } });
    fireEvent.change(getPriceInput(), { target: { value: '10' } });

    await act(async () => {
      fireEvent.click(getSubmitBtn());
    });
    await waitFor(() => {
      expect(screen.getByText('Name already taken')).toBeInTheDocument();
    });
  });

  it('shows generic error when create API returns no message', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([]))
      .mockResolvedValueOnce({ json: async () => ({ success: false }) } as unknown as Response);
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('New Service'));
    fireEvent.change(getNameInput(), { target: { value: 'X' } });
    fireEvent.change(getPriceInput(), { target: { value: '5' } });

    await act(async () => {
      fireEvent.click(getSubmitBtn());
    });
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows Saving... button label while create is in flight', async () => {
    let resolveCreate!: (v: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([]))
      .mockReturnValueOnce(new Promise(r => { resolveCreate = r; }));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('New Service'));
    fireEvent.change(getNameInput(), { target: { value: 'Test' } });
    fireEvent.change(getPriceInput(), { target: { value: '1' } });

    act(() => {
      fireEvent.click(getSubmitBtn());
    });
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
    await act(async () => {
      resolveCreate(errorResp('err'));
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — edit form
// ---------------------------------------------------------------------------

describe('AdminPortalServicesPage — edit form', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  async function renderWithService(svc: ServiceFixture = makeService()) {
    global.fetch = vi.fn().mockResolvedValue(listResp([svc]));
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    return svc;
  }

  it('opens edit form when edit (pencil) button is clicked', async () => {
    await renderWithService();
    const editBtn = screen.getByTitle('Edit');
    fireEvent.click(editBtn);
    expect(screen.getByText(/Editing: Website Maintenance/)).toBeInTheDocument();
  });

  it('pre-fills service name in edit form', async () => {
    await renderWithService();
    fireEvent.click(screen.getByTitle('Edit'));
    // Find the first text input — that's the name field
    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Website Maintenance');
  });

  it('pre-fills price in edit form (in dollars)', async () => {
    await renderWithService(makeService({ price: 4999 }));
    fireEvent.click(screen.getByTitle('Edit'));
    const priceInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(priceInput.value).toBe('49.99');
  });

  it('pre-fills features in edit form textarea', async () => {
    await renderWithService(makeService({ features: ['Feature A', 'Feature B'] }));
    fireEvent.click(screen.getByTitle('Edit'));
    const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    const featuresArea = textareas.find(t => t.value.includes('Feature A'));
    expect(featuresArea).toBeDefined();
    expect(featuresArea!.value).toContain('Feature B');
  });

  it('saves edit and updates service in list', async () => {
    const updated = makeService({ name: 'Updated Service' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([makeService()]))
      .mockResolvedValueOnce(actionResp(updated));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Edit'));
    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Updated Service' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('Updated Service')).toBeInTheDocument();
    });
  });

  it('shows error message when save edit fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([makeService()]))
      .mockResolvedValueOnce(errorResp('Update conflict'));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Edit'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('Update conflict')).toBeInTheDocument();
    });
  });

  it('shows generic save error when no message returned', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([makeService()]))
      .mockResolvedValueOnce({ json: async () => ({ success: false }) } as unknown as Response);
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Edit'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('Failed to save')).toBeInTheDocument();
    });
  });

  it('closes edit form when Cancel is clicked', async () => {
    await renderWithService();
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText(/Editing:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument();
  });

  it('closing edit form reverts to service card view', async () => {
    await renderWithService();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.getByText('Website Maintenance')).toBeInTheDocument();
    expect(screen.getByTitle('Edit')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — delete
// ---------------------------------------------------------------------------

describe('AdminPortalServicesPage — delete', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.confirm = vi.fn(() => true);
  });

  it('calls DELETE API when delete button is clicked and confirmed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([makeService()]))
      .mockResolvedValueOnce(actionResp(null));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete'));
    });
    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      expect(calls.some(c => c[1]?.method === 'DELETE')).toBe(true);
    });
  });

  it('removes service from list after successful delete', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([makeService()]))
      .mockResolvedValueOnce(actionResp(null));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete'));
    });
    await waitFor(() => {
      expect(screen.queryByText('Website Maintenance')).not.toBeInTheDocument();
      expect(screen.getByText('No services yet. Create one above.')).toBeInTheDocument();
    });
  });

  it('does not delete when confirm returns false', async () => {
    global.confirm = vi.fn(() => false);
    const fetchMock = vi.fn().mockResolvedValue(listResp([makeService()]));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];
      expect(calls.some(c => c[1]?.method === 'DELETE')).toBe(false);
    });
    // Service still shown
    expect(screen.getByText('Website Maintenance')).toBeInTheDocument();
  });

  it('shows alert when delete fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([makeService()]))
      .mockResolvedValueOnce(errorResp('Cannot delete: in use'));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete'));
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Cannot delete: in use');
    });
    alertSpy.mockRestore();
  });

  it('confirms delete with service name in prompt', async () => {
    const confirmSpy = vi.fn(() => true);
    global.confirm = confirmSpy;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([makeService({ name: 'My Service' })]))
      .mockResolvedValueOnce(actionResp(null));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete'));
    });
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('My Service'));
  });
});

// ---------------------------------------------------------------------------
// Tests — toggle active
// ---------------------------------------------------------------------------

describe('AdminPortalServicesPage — toggle active', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('calls PATCH API with toggled active state', async () => {
    const svc = makeService({ id: 5, active: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([svc]))
      .mockResolvedValueOnce(actionResp({ ...svc, active: false }));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Active'));
    });
    await waitFor(() => {
      const patchCalls = (fetchMock.mock.calls as [string, RequestInit][]).filter(c => {
        const init = c[1];
        return init?.method === 'PATCH' && (c[0] as string).includes('portal/services');
      });
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('updates active badge optimistically when toggle succeeds', async () => {
    const svc = makeService({ id: 5, active: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([svc]))
      .mockResolvedValueOnce(actionResp({ ...svc, active: false }));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Active'));
    });
    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });
  });

  it('sends correct body to toggle PATCH API', async () => {
    const svc = makeService({ id: 7, active: false });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResp([svc]))
      .mockResolvedValueOnce(actionResp({ ...svc, active: true }));
    global.fetch = fetchMock;
    await act(async () => { render(<AdminPortalServicesPage />); });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Inactive'));
    });
    await waitFor(() => {
      const patchCalls = (fetchMock.mock.calls as [string, RequestInit][]).filter(c => c[1]?.method === 'PATCH');
      const body = JSON.parse(patchCalls[0][1].body as string);
      expect(body.id).toBe(7);
      expect(body.active).toBe(true);
    });
  });
});
