// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/account/profile',
  useSearchParams: () => new URLSearchParams(),
}));

// CustomerAuthContext — named export hook
const mockRefreshCustomer = vi.fn();
let mockToken: string | null = 'test-token-123';

vi.mock('@/components/storefront/account/CustomerAuthContext', () => ({
  useCustomerAuth: () => ({ token: mockToken, refreshCustomer: mockRefreshCustomer }),
}));

// RequireAuth — just renders children
vi.mock('@/components/storefront/account/RequireAuth', () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// AccountLayout — just renders children
vi.mock('@/components/storefront/account/AccountLayout', () => ({
  AccountLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'account-layout' }, children),
}));

// ---------------------------------------------------------------------------
// Component under test (imported after mocks)
// ---------------------------------------------------------------------------

import { ProfileClient } from '@/app/sites/[domain]/account/profile/ProfileClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchResponder = (url: string, init?: RequestInit) => unknown;

function installFetchMock(responder: FetchResponder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = responder(url, init);
    return {
      ok: true,
      json: async () => body,
    } as unknown as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const baseProfile = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '555-1234',
  addresses: [],
};

const baseAddress = {
  id: 1,
  label: 'Home',
  line1: '123 Main St',
  line2: 'Apt 4B',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
  country: 'US',
  isDefault: true,
};

function defaultFetch(url: string, init?: RequestInit): unknown {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
    return { success: true, data: baseProfile };
  }
  if (url.includes('/account') && !url.includes('/addresses') && method === 'PATCH') {
    return { success: true };
  }
  if (url.includes('/addresses') && method === 'POST') {
    return { success: true };
  }
  if (url.includes('/addresses') && method === 'PATCH') {
    return { success: true };
  }
  if (url.includes('/addresses') && method === 'DELETE') {
    return { success: true };
  }
  return {};
}

function renderProfile(props: { siteId?: number; domain?: string } = {}) {
  return render(
    <ProfileClient siteId={props.siteId ?? 1} domain={props.domain ?? 'example.com'} />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileClient', () => {
  beforeEach(() => {
    mockToken = 'test-token-123';
    mockRefreshCustomer.mockClear();
    installFetchMock(defaultFetch);
    // Stub window.confirm for deleteAddress tests
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading spinner initially', () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderProfile();
    const spinner = document.querySelector('.material-icons.animate-spin');
    expect(spinner).toBeTruthy();
    expect(spinner?.textContent).toBe('progress_activity');
  });

  it('does not fetch when token is null', () => {
    mockToken = null;
    const fetchMock = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;
    renderProfile();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Successful load ────────────────────────────────────────────────────────

  it('renders the My Profile heading after load', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('My Profile')).toBeTruthy();
  });

  it('renders the Personal Information section after load', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('Personal Information')).toBeTruthy();
  });

  it('populates firstName field with fetched data', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const inputs = document.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
    const firstNameInput = inputs[0];
    expect(firstNameInput.value).toBe('Jane');
  });

  it('populates lastName field with fetched data', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const inputs = document.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
    expect(inputs[1].value).toBe('Doe');
  });

  it('renders email field as disabled with fetched email', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    expect(emailInput).toBeTruthy();
    expect(emailInput.value).toBe('jane@example.com');
    expect(emailInput.disabled).toBe(true);
  });

  it('populates phone field with fetched data', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const phoneInput = document.querySelector('input[type="tel"]') as HTMLInputElement;
    expect(phoneInput).toBeTruthy();
    expect(phoneInput.value).toBe('555-1234');
  });

  it('renders the Address Book section', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('Address Book')).toBeTruthy();
  });

  it('renders "No saved addresses." when addresses list is empty', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('No saved addresses.')).toBeTruthy();
  });

  it('does not set profile fields when API returns success=false', async () => {
    installFetchMock((url) => {
      if (url.includes('/account') && !url.includes('/addresses')) {
        return { success: false };
      }
      return defaultFetch(url);
    });
    await act(async () => { renderProfile(); });
    await flush();
    const inputs = document.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
    // firstName and lastName should remain empty
    expect(inputs[0].value).toBe('');
    expect(inputs[1].value).toBe('');
  });

  // ── Form field editing ─────────────────────────────────────────────────────

  it('allows editing firstName input', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const inputs = document.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: 'John' } });
    });
    expect(inputs[0].value).toBe('John');
  });

  it('allows editing lastName input', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const inputs = document.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
    await act(async () => {
      fireEvent.change(inputs[1], { target: { value: 'Smith' } });
    });
    expect(inputs[1].value).toBe('Smith');
  });

  it('allows editing phone input', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const phoneInput = document.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(phoneInput, { target: { value: '999-8765' } });
    });
    expect(phoneInput.value).toBe('999-8765');
  });

  // ── Profile save: success ──────────────────────────────────────────────────

  it('shows success message after saving profile', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(screen.getByText('Profile updated successfully.')).toBeTruthy();
  });

  it('calls refreshCustomer after successful profile save', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(mockRefreshCustomer).toHaveBeenCalledTimes(1);
  });

  it('sends PATCH with firstName, lastName, phone on form submit', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await act(async () => { renderProfile(); });
    await flush();
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toHaveProperty('firstName');
    expect(body).toHaveProperty('lastName');
    expect(body).toHaveProperty('phone');
  });

  it('does not fetch profile when token is null from the start', async () => {
    mockToken = null;
    const fetchMock = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;
    await act(async () => { renderProfile(); });
    await flush();
    // useEffect guard: if (!token) return — no fetch should be issued
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not show success message when profile save returns success=false', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'PATCH') {
        return { success: false };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(screen.queryByText('Profile updated successfully.')).toBeNull();
  });

  it('shows Save Changes button by default', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('Save Changes')).toBeTruthy();
  });

  it('success message shows a check_circle icon', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    const icons = Array.from(document.querySelectorAll('span.material-icons'));
    expect(icons.some((el) => el.textContent === 'check_circle')).toBe(true);
  });

  // ── Address book: list with addresses ──────────────────────────────────────

  it('renders address items when profile has addresses', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText(/123 Main St/)).toBeTruthy();
  });

  it('renders "Default" badge for isDefault address', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('Default')).toBeTruthy();
  });

  it('renders address line2 when present', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText(/Apt 4B/)).toBeTruthy();
  });

  it('renders city, state, zip, country for address', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText(/Springfield/)).toBeTruthy();
    expect(screen.getByText(/IL/)).toBeTruthy();
  });

  it('uses "Address" label when addr.label is falsy', async () => {
    const noLabelAddress = { ...baseAddress, label: undefined };
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [noLabelAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('Address')).toBeTruthy();
  });

  it('does not show "Default" badge for non-default address', async () => {
    const nonDefault = { ...baseAddress, isDefault: false };
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [nonDefault] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.queryByText('Default')).toBeNull();
  });

  // ── Add address form ───────────────────────────────────────────────────────

  it('shows "Add Address" button', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    expect(screen.getByText('Add Address')).toBeTruthy();
  });

  it('clicking "Add Address" shows the address form', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText('Add Address'));
    });
    expect(screen.getByText('Address Line 1')).toBeTruthy();
    expect(screen.getByText('Label (optional)')).toBeTruthy();
  });

  it('clicking "Cancel" in address form hides it', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('Add Address')); });
    await act(async () => { fireEvent.click(screen.getByText('Cancel')); });
    expect(screen.queryByText('Address Line 1')).toBeNull();
  });

  it('submitting the add address form calls POST to addresses endpoint', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await act(async () => { renderProfile(); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('Add Address')); });

    // Fill required fields
    const allForms = document.querySelectorAll('form');
    // Second form is address form
    const addressForm = allForms[1] as HTMLFormElement;

    await act(async () => { fireEvent.submit(addressForm); });
    await flush();

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url.includes('/addresses') && (init as RequestInit)?.method === 'POST',
    );
    expect(postCall).toBeTruthy();
  });

  it('hides address form after successful address save', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('Add Address')); });

    const allForms = document.querySelectorAll('form');
    const addressForm = allForms[1] as HTMLFormElement;
    await act(async () => { fireEvent.submit(addressForm); });
    await flush();
    expect(screen.queryByText('Address Line 1')).toBeNull();
  });

  it('address form submit button label shows "Add Address" when not editing', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('Add Address')); });
    // The submit button text in the form
    const submitBtns = Array.from(document.querySelectorAll('button[type="submit"]'));
    expect(submitBtns.some((b) => b.textContent?.includes('Add Address'))).toBe(true);
  });

  // ── Edit address form ──────────────────────────────────────────────────────

  it('clicking edit button for an address opens address form with "Update Address" label', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();

    const editBtn = document.querySelector('button[title="Edit address"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(editBtn); });

    const submitBtns = Array.from(document.querySelectorAll('button[type="submit"]'));
    expect(submitBtns.some((b) => b.textContent?.includes('Update Address'))).toBe(true);
  });

  it('edit form pre-fills with address data', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();

    const editBtn = document.querySelector('button[title="Edit address"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(editBtn); });

    // The label field should be pre-filled with 'Home'
    const allTextInputs = document.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
    const labelInput = Array.from(allTextInputs).find((i) => i.value === 'Home');
    expect(labelInput).toBeTruthy();
  });

  it('updating an address sends PATCH to the correct address URL', async () => {
    const fetchMock = installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();

    const editBtn = document.querySelector('button[title="Edit address"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(editBtn); });

    const allForms = document.querySelectorAll('form');
    const addressForm = allForms[1] as HTMLFormElement;
    await act(async () => { fireEvent.submit(addressForm); });
    await flush();

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url.includes(`/addresses/${baseAddress.id}`) && (init as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
  });

  // ── Delete address ─────────────────────────────────────────────────────────

  it('clicking delete button calls confirm dialog', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();

    const deleteBtn = document.querySelector('button[title="Delete address"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(deleteBtn); });
    expect(window.confirm).toHaveBeenCalledWith('Remove this address?');
  });

  it('sends DELETE when confirm returns true', async () => {
    const fetchMock = installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();

    const deleteBtn = document.querySelector('button[title="Delete address"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(deleteBtn); });
    await flush();

    const deleteCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url.includes(`/addresses/${baseAddress.id}`) && (init as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
  });

  it('does not send DELETE when confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    fetchMock.mockClear();

    const deleteBtn = document.querySelector('button[title="Delete address"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(deleteBtn); });
    await flush();

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCall).toBeUndefined();
  });

  // ── Address form field editing ─────────────────────────────────────────────

  it('can type into address label field', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('Add Address')); });

    const allTextInputs = document.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
    // In the address form, label is first input after the profile form inputs (2)
    // Profile: firstName[0], lastName[1]; address form starts at different position
    // Find the label input by placeholder
    const labelInput = Array.from(allTextInputs).find(
      (i) => i.placeholder === 'e.g. Home, Office',
    ) as HTMLInputElement;
    expect(labelInput).toBeTruthy();
    await act(async () => {
      fireEvent.change(labelInput, { target: { value: 'Office' } });
    });
    expect(labelInput.value).toBe('Office');
  });

  it('refetches profile after successful address delete', async () => {
    const fetchMock = installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return {
          success: true,
          data: { ...baseProfile, addresses: [baseAddress] },
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { renderProfile(); });
    await flush();
    const initialGetCalls = fetchMock.mock.calls.filter(
      ([url, init]) => url.includes('/account') && (init?.method ?? 'GET') === 'GET',
    ).length;

    const deleteBtn = document.querySelector('button[title="Delete address"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(deleteBtn); });
    await flush();

    const afterGetCalls = fetchMock.mock.calls.filter(
      ([url, init]) => url.includes('/account') && !url.includes('/addresses') && (init?.method ?? 'GET') === 'GET',
    ).length;
    // Should have fetched at least once more after delete
    expect(afterGetCalls).toBeGreaterThan(initialGetCalls);
  });

  // ── Account layout wrapper ─────────────────────────────────────────────────

  it('renders inside AccountLayout wrapper', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    expect(document.querySelector('[data-testid="account-layout"]')).toBeTruthy();
  });

  // ── Fetch error silently handled ───────────────────────────────────────────

  it('handles fetch errors silently on initial load', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network error'))) as unknown as typeof fetch;
    await act(async () => { renderProfile(); });
    await flush();
    // Should not throw; loading state resolves
    expect(screen.queryByText('progress_activity')).toBeNull();
  });

  it('handles fetch errors silently on profile save', async () => {
    installFetchMock((url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/account') && !url.includes('/addresses') && method === 'GET') {
        return { success: true, data: baseProfile };
      }
      return defaultFetch(url, init);
    });
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH') throw new Error('save failed');
      return { ok: true, json: async () => defaultFetch(url, init) } as unknown as Response;
    }) as unknown as typeof fetch;

    await act(async () => { renderProfile(); });
    await flush();
    const form = document.querySelector('form') as HTMLFormElement;
    // Should not throw
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(screen.queryByText('Profile updated successfully.')).toBeNull();
  });

  // ── Address form fields: city, state, zip, country ─────────────────────────

  it('shows City, State, ZIP, Country fields in address form', async () => {
    await act(async () => { renderProfile(); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('Add Address')); });
    expect(screen.getByText('City')).toBeTruthy();
    expect(screen.getByText('State')).toBeTruthy();
    expect(screen.getByText('ZIP')).toBeTruthy();
    expect(screen.getByText('Country')).toBeTruthy();
  });

  // ── waitFor-based success banner ───────────────────────────────────────────

  it('success banner appears after save (waitFor variant)', async () => {
    renderProfile();
    await waitFor(() => expect(screen.getByText('Save Changes')).toBeTruthy());
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('Profile updated successfully.')).toBeTruthy();
    });
  });
});
