// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

// next/link -> render as anchor passthrough
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children),
}));

// next/navigation — usePathname controllable per test
const pathnameRef: { current: string } = { current: '/portal' };
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}));

// useAgencyChrome — controllable per test
const agencyState: { agencyName: string | null; whiteLabelEnabled: boolean } = {
  agencyName: null,
  whiteLabelEnabled: false,
};
vi.mock('@/components/portal/AgencyChromeProvider', () => ({
  useAgencyChrome: () => agencyState,
}));

// react-icons/md — build a tiny mock surface that exposes at least a couple of
// real-looking Md* components so IconPicker has something to render and we can
// reason about what gets shown deterministically.
vi.mock('react-icons/md', () => {
  const make = (label: string) =>
    function MdMock({ size, className }: { size?: number; className?: string }) {
      return React.createElement('span', {
        'data-testid': `icon-${label}`,
        'data-size': String(size ?? ''),
        className,
      }, label);
    };
  return {
    MdDashboard: make('MdDashboard'),
    MdBarChart: make('MdBarChart'),
    MdHome: make('MdHome'),
    MdSearch: make('MdSearch'),
    MdSettings: make('MdSettings'),
    // a non-function export to exercise the filter branch
    NotAnIcon: 'string-value',
    mdLower: () => null,
  };
});

// ---------------------------------------------------------------------------
// Import under test (must come AFTER mocks)
// ---------------------------------------------------------------------------
import { ContrastMatrix } from '@/components/portal/ContrastMatrix';
import CrmDuplicateWarning from '@/components/portal/CrmDuplicateWarning';
import { IconPicker } from '@/components/portal/IconPicker';
import PortalTitle, { resolvePortalTitle } from '@/components/portal/PortalTitle';

// ---------------------------------------------------------------------------
// ContrastMatrix
// ---------------------------------------------------------------------------
describe('ContrastMatrix', () => {
  afterEach(() => cleanup());

  it('renders the heading and WCAG reference link', () => {
    render(<ContrastMatrix branding={{}} />);
    expect(screen.getByText(/Accessibility/i)).toBeTruthy();
    const link = screen.getByText(/WCAG reference/i) as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders a row for each default contrast pair', () => {
    const { container } = render(
      <ContrastMatrix
        branding={{
          primaryColor: '#0066cc',
          textColor: '#111111',
          backgroundColor: '#ffffff',
          navBackground: '#000000',
          navTextColor: '#ffffff',
          linkColor: '#0033aa',
          buttonStyle: { primaryBg: '#0066cc', primaryText: '#ffffff' },
        }}
      />,
    );
    const rows = container.querySelectorAll('[data-pair-id]');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(row => {
      expect(row.getAttribute('data-grade')).toBeTruthy();
      expect(row.getAttribute('data-ratio')).toMatch(/^\d+\.\d{2}$/);
    });
  });

  it('shows the em-dash preview when fg/bg are missing', () => {
    const { container } = render(<ContrastMatrix branding={{}} />);
    // At least one preview chip should fall back to the em-dash label
    const dashCells = Array.from(container.querySelectorAll('div')).filter(
      d => d.textContent === '—',
    );
    expect(dashCells.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CrmDuplicateWarning
// ---------------------------------------------------------------------------
describe('CrmDuplicateWarning', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing when no contact fields supplied', () => {
    const { container } = render(
      <CrmDuplicateWarning email="" phone="" firstName="" lastName="" />,
    );
    expect(container.firstChild).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debounces, fetches, and renders duplicate matches', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 7,
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            phone: '555-1212',
            status: 'lead',
            matchReasons: ['exact_email', 'name_fuzzy'],
          },
        ],
      }),
    });

    render(
      <CrmDuplicateWarning
        email="jane@example.com"
        phone=""
        firstName="Jane"
        lastName="Doe"
      />,
    );

    // Before the debounce fires, no fetch
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledWith = fetchMock.mock.calls[0][0] as string;
    expect(calledWith.startsWith('/api/portal/crm/contacts/duplicates?')).toBe(true);
    expect(calledWith).toContain('email=jane%40example.com');

    // After resolve, the warning UI should appear
    expect(screen.getByText(/Potential duplicate/i)).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('Email match')).toBeTruthy();
    expect(screen.getByText('Similar name')).toBeTruthy();
  });

  it('renders nothing if the API returns non-ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const { container } = render(
      <CrmDuplicateWarning email="x@y.com" phone="" firstName="X" lastName="Y" />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(container.textContent ?? '').not.toMatch(/Potential duplicate/i);
  });
});

// ---------------------------------------------------------------------------
// IconPicker
// ---------------------------------------------------------------------------
describe('IconPicker', () => {
  afterEach(() => cleanup());

  it('renders the placeholder label when no value is set', () => {
    render(<IconPicker value={undefined} onChange={() => {}} />);
    expect(screen.getByText('Choose icon...')).toBeTruthy();
    expect(screen.getByText('Icon')).toBeTruthy();
  });

  it('honours custom label', () => {
    render(<IconPicker value={undefined} onChange={() => {}} label="Pick one" />);
    expect(screen.getByText('Pick one')).toBeTruthy();
  });

  it('opens the picker and renders icon grid when the trigger is clicked', () => {
    render(<IconPicker value={undefined} onChange={() => {}} />);
    const trigger = screen.getByText('Choose icon...').closest('button')!;
    fireEvent.click(trigger);

    // Search input should appear after opening
    const search = screen.getByPlaceholderText('Search icons...') as HTMLInputElement;
    expect(search).toBeTruthy();

    // At least one mocked icon should be rendered (we registered 5 Md* mocks)
    expect(screen.getAllByTestId(/^icon-Md/).length).toBeGreaterThan(0);
  });

  it('calls onChange with the material-style name when an icon is selected', () => {
    const onChange = vi.fn();
    render(<IconPicker value={undefined} onChange={onChange} />);
    const trigger = screen.getByText('Choose icon...').closest('button')!;
    fireEvent.click(trigger);

    // Pick the MdBarChart mock — its parent button is the one we click
    const iconEl = screen.getByTestId('icon-MdBarChart');
    fireEvent.click(iconEl.closest('button')!);

    expect(onChange).toHaveBeenCalledTimes(1);
    // MdBarChart -> bar_chart
    expect(onChange).toHaveBeenCalledWith('bar_chart');
  });

  it('filters icons by search query and shows the empty-state when nothing matches', () => {
    render(<IconPicker value={undefined} onChange={() => {}} />);
    fireEvent.click(screen.getByText('Choose icon...').closest('button')!);
    const search = screen.getByPlaceholderText('Search icons...') as HTMLInputElement;

    fireEvent.change(search, { target: { value: 'zzzzzzzz-no-match' } });
    expect(screen.getByText(/No icons match/i)).toBeTruthy();
  });

  it('renders the current icon label when a value is provided', () => {
    render(<IconPicker value="dashboard" onChange={() => {}} />);
    // "dashboard" -> MdDashboard -> readable label "Dashboard"
    expect(screen.getByText('Dashboard')).toBeTruthy();
    // And the mock dashboard icon is rendered in the trigger
    expect(screen.getByTestId('icon-MdDashboard')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PortalTitle / resolvePortalTitle
// ---------------------------------------------------------------------------
describe('resolvePortalTitle', () => {
  it('resolves exact-match top-level routes', () => {
    expect(resolvePortalTitle('/portal')).toBe('Portal');
    expect(resolvePortalTitle('/portal/dashboard')).toBe('Dashboard');
    expect(resolvePortalTitle('/portal/approvals')).toBe('Approvals');
  });

  it('resolves parameterised routes', () => {
    expect(resolvePortalTitle('/portal/projects/42')).toBe('Project');
    expect(resolvePortalTitle('/portal/projects')).toBe('Projects');
    expect(resolvePortalTitle('/portal/crm/contacts/9')).toBe('Contact');
    expect(resolvePortalTitle('/portal/websites/1/posts/2/edit')).toBe('Edit Post');
  });

  it('prefers more-specific patterns over broader ones (order matters)', () => {
    // /communications/:id/review is more specific than /communications/:id
    expect(resolvePortalTitle('/portal/brain/communications/15/review')).toBe(
      'Review Communication',
    );
    expect(resolvePortalTitle('/portal/brain/communications/15')).toBe('Communication');
    expect(resolvePortalTitle('/portal/brain/communications')).toBe('Communications');
  });

  it('falls back to "Portal" for unknown routes', () => {
    expect(resolvePortalTitle('/totally/unknown/path')).toBe('Portal');
    expect(resolvePortalTitle('/portal/does-not-exist')).toBe('Portal');
  });
});

describe('PortalTitle component', () => {
  beforeEach(() => {
    pathnameRef.current = '/portal/dashboard';
    agencyState.agencyName = null;
    agencyState.whiteLabelEnabled = false;
    document.title = '';
  });

  afterEach(() => cleanup());

  it('sets document.title using the default app name when white-label is off', () => {
    render(<PortalTitle />);
    expect(document.title).toBe('Dashboard | SimplerDevelopment');
  });

  it('uses the agency name when white-label is enabled', () => {
    agencyState.agencyName = 'Acme Co';
    agencyState.whiteLabelEnabled = true;
    pathnameRef.current = '/portal/approvals';
    render(<PortalTitle />);
    expect(document.title).toBe('Approvals | Acme Co');
  });

  it('falls back to the default app when white-label is enabled but agencyName is empty', () => {
    agencyState.agencyName = null;
    agencyState.whiteLabelEnabled = true;
    pathnameRef.current = '/portal';
    render(<PortalTitle />);
    expect(document.title).toBe('Portal | SimplerDevelopment');
  });

  it('returns null (renders nothing visible)', () => {
    const { container } = render(<PortalTitle />);
    expect(container.firstChild).toBeNull();
  });
});
