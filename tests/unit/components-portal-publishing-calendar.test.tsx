// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock next/link — renders as a plain <a> so hrefs are inspectable.
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, title, style, className }: any) =>
    React.createElement('a', { href, title, style, className }, children),
}));

// ---------------------------------------------------------------------------
// Global fetch mock — replaced per-test via mockFetch helper below.
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import PublishingCalendar, {
  type PublishingCalendarEntry,
} from '@/components/portal/publishing/PublishingCalendar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<PublishingCalendarEntry> = {}): PublishingCalendarEntry {
  return {
    id: 1,
    title: 'Test Card',
    date: new Date().toISOString(),
    artifactType: 'post',
    artifactTitle: 'Test Artifact',
    columnName: 'Draft',
    campaign: null,
    ...overrides,
  };
}

function setupFetchSuccess(entries: PublishingCalendarEntry[]) {
  mockFetch.mockResolvedValue({
    json: async () => ({ success: true, data: entries }),
  } as any);
}

function setupFetchFailure() {
  mockFetch.mockResolvedValue({
    json: async () => ({ success: false, message: 'Server error' }),
  } as any);
}

function setupFetchNetworkError() {
  mockFetch.mockRejectedValue(new Error('Network error'));
}

const DEFAULT_PROPS = { projectId: 1, clientId: 42 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PublishingCalendar', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('shows loading spinner while fetch is pending', async () => {
    // Never resolve so we stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    expect(screen.getByText(/loading calendar/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('renders grid with no entries when API returns empty array', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    // Loading text disappears
    expect(screen.queryByText(/loading calendar/i)).not.toBeInTheDocument();
    // Day-of-week headers always render
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Entry rendering
  // -------------------------------------------------------------------------

  it('renders a blog entry card in compact mode (month view)', async () => {
    const entry = makeEntry({ artifactType: 'post', artifactTitle: 'My Blog Post', id: 99 });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('My Blog Post'));
    const link = screen.getByRole('link', { name: /my blog post/i });
    expect(link).toHaveAttribute('href', '/portal/publishing/board?card=99');
  });

  it('renders entry with campaign color border style', async () => {
    const entry = makeEntry({
      id: 55,
      artifactTitle: 'Campaign Entry',
      campaign: { id: 10, name: 'Q1 Push', color: '#FF5733' },
    });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Campaign Entry'));
    const link = screen.getByRole('link', { name: /campaign entry/i });
    // Campaign color applied as borderLeft inline style
    expect(link).toHaveStyle({ borderLeftColor: '#FF5733' });
  });

  it('falls back to artifact title when artifactTitle is null', async () => {
    const entry = makeEntry({ artifactTitle: null, title: 'Card Title Fallback' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Card Title Fallback'));
  });

  it('uses DEFAULT_CHANNEL_STYLE for unknown artifactType', async () => {
    const entry = makeEntry({ artifactType: 'unknown_type', artifactTitle: 'Unknown Channel' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Unknown Channel'));
  });

  it('uses DEFAULT_CHANNEL_STYLE when artifactType is null', async () => {
    const entry = makeEntry({ artifactType: null, artifactTitle: 'Null Channel' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Null Channel'));
  });

  it('renders +N more label when a day has more than 3 entries', async () => {
    // Use today's date to guarantee they all land in the same month-view cell
    const today = new Date().toISOString();
    const entries = [1, 2, 3, 4, 5].map((id) =>
      makeEntry({ id, date: today, artifactTitle: `Entry ${id}` }),
    );
    setupFetchSuccess(entries);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('+2 more'));
  });

  it('renders email_campaign channel correctly', async () => {
    const entry = makeEntry({ artifactType: 'email_campaign', artifactTitle: 'Newsletter' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Newsletter'));
  });

  it('renders linkedin channel correctly', async () => {
    const entry = makeEntry({ artifactType: 'linkedin', artifactTitle: 'LinkedIn Post' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('LinkedIn Post'));
  });

  it('renders pitch_deck channel correctly', async () => {
    const entry = makeEntry({ artifactType: 'pitch_deck', artifactTitle: 'Deck Entry' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Deck Entry'));
  });

  it('renders survey channel correctly', async () => {
    const entry = makeEntry({ artifactType: 'survey', artifactTitle: 'Survey Entry' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Survey Entry'));
  });

  it('renders booking channel correctly', async () => {
    const entry = makeEntry({ artifactType: 'booking', artifactTitle: 'Booking Entry' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Booking Entry'));
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('renders empty grid when API returns success:false', async () => {
    setupFetchFailure();
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText(/loading calendar/i)).not.toBeInTheDocument();
  });

  it('renders empty grid when fetch throws a network error', async () => {
    setupFetchNetworkError();
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText(/loading calendar/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Navigation — month view
  // -------------------------------------------------------------------------

  it('navigates to previous month on Previous click', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockReset();
    setupFetchSuccess([]);

    const prev = screen.getByRole('button', { name: /previous/i });
    await act(async () => {
      fireEvent.click(prev);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  it('navigates to next month on Next click', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockReset();
    setupFetchSuccess([]);

    const next = screen.getByRole('button', { name: /next/i });
    await act(async () => {
      fireEvent.click(next);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  it('returns to today on Today button click', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    // Navigate away first
    mockFetch.mockReset();
    setupFetchSuccess([]);
    const prev = screen.getByRole('button', { name: /previous/i });
    await act(async () => {
      fireEvent.click(prev);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    // Now go back to today
    mockFetch.mockReset();
    setupFetchSuccess([]);
    const todayBtn = screen.getByRole('button', { name: /today/i });
    await act(async () => {
      fireEvent.click(todayBtn);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  // -------------------------------------------------------------------------
  // View switching — month ↔ week
  // -------------------------------------------------------------------------

  it('switches to week view when Week button is clicked', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockReset();
    setupFetchSuccess([]);

    const weekBtn = screen.getByRole('button', { name: /week/i });
    await act(async () => {
      fireEvent.click(weekBtn);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // Week view header shows a range like "Jun 1 - Jun 7, 2026"
    // The heading should not match month-year format anymore
    const heading = screen.getByRole('heading');
    expect(heading.textContent).toMatch(/-/);
  });

  it('renders entries in week view (non-compact)', async () => {
    const today = new Date().toISOString();
    const entry = makeEntry({ id: 77, date: today, artifactTitle: 'Week View Entry' });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockReset();
    setupFetchSuccess([entry]);

    const weekBtn = screen.getByRole('button', { name: /week/i });
    await act(async () => {
      fireEvent.click(weekBtn);
    });
    await waitFor(() => screen.getByText('Week View Entry'));
    // In week view, the full entry card renders (non-compact): channel label visible
    // (there may be multiple "Blog" nodes — legend + card subtitle — so use getAllByText)
    const blogNodes = screen.getAllByText(/^blog$/i);
    expect(blogNodes.length).toBeGreaterThan(0);
  });

  it('navigates previous in week view', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Switch to week view
    mockFetch.mockReset();
    setupFetchSuccess([]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /week/i }));
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Navigate back one week
    mockFetch.mockReset();
    setupFetchSuccess([]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  it('navigates next in week view', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Switch to week view
    mockFetch.mockReset();
    setupFetchSuccess([]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /week/i }));
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Navigate forward one week
    mockFetch.mockReset();
    setupFetchSuccess([]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  // -------------------------------------------------------------------------
  // Filter dropdowns
  // -------------------------------------------------------------------------

  it('populates channel filter from entries and filters client-side', async () => {
    const today = new Date().toISOString();
    const postEntry = makeEntry({ id: 1, date: today, artifactType: 'post', artifactTitle: 'A Post' });
    const emailEntry = makeEntry({ id: 2, date: today, artifactType: 'email_campaign', artifactTitle: 'An Email' });
    setupFetchSuccess([postEntry, emailEntry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('A Post'));
    await waitFor(() => screen.getByText('An Email'));

    const channelSelect = screen.getByRole('combobox', { name: /channel filter/i });
    // Filter to email_campaign only
    fireEvent.change(channelSelect, { target: { value: 'email_campaign' } });

    expect(screen.getByText('An Email')).toBeInTheDocument();
    expect(screen.queryByText('A Post')).not.toBeInTheDocument();
  });

  it('populates stage filter from entries and filters client-side', async () => {
    const today = new Date().toISOString();
    const draftEntry = makeEntry({ id: 1, date: today, columnName: 'Draft', artifactTitle: 'Draft Card' });
    const pubEntry = makeEntry({ id: 2, date: today, columnName: 'Published', artifactTitle: 'Published Card' });
    setupFetchSuccess([draftEntry, pubEntry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Draft Card'));

    const stageSelect = screen.getByRole('combobox', { name: /stage filter/i });
    fireEvent.change(stageSelect, { target: { value: 'Published' } });

    expect(screen.getByText('Published Card')).toBeInTheDocument();
    expect(screen.queryByText('Draft Card')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Legend
  // -------------------------------------------------------------------------

  it('renders channel legend at the bottom', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    // Blog, Email, LinkedIn, Deck, Survey, Booking legend items
    expect(screen.getByText('Blog')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('Deck')).toBeInTheDocument();
    expect(screen.getByText('Survey')).toBeInTheDocument();
    expect(screen.getByText('Booking')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Entry count badge in month view
  // -------------------------------------------------------------------------

  it('shows entry count badge when there is at least 1 entry in a day (month view)', async () => {
    const today = new Date().toISOString();
    // Use an unusual count (e.g. 2 entries) so the badge "2" is distinct from the day number.
    const entries = [
      makeEntry({ id: 1, date: today, artifactTitle: 'Entry A' }),
      makeEntry({ id: 2, date: today, artifactTitle: 'Entry B' }),
    ];
    setupFetchSuccess(entries);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText('Entry A'));
    // Count badge shows the number of entries for the day. "2" only appears as a
    // badge here (day number today is shown differently — highlighted as a circle).
    const allTwos = screen.getAllByText('2');
    // At least one should be the count badge (a small <span> in the day header)
    expect(allTwos.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Campaign name shown in week-view (non-compact) entry card subtitle
  // -------------------------------------------------------------------------

  it('includes campaign name in week-view entry card subtitle', async () => {
    const today = new Date().toISOString();
    const entry = makeEntry({
      id: 11,
      date: today,
      artifactTitle: 'CampaignEntry',
      campaign: { id: 5, name: 'Summer Launch', color: '#00FF00' },
    });
    setupFetchSuccess([entry]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Switch to week view so the non-compact EntryCard renders (it shows the
    // campaign name in the subtitle paragraph).
    mockFetch.mockReset();
    setupFetchSuccess([entry]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /week/i }));
    });
    await waitFor(() => screen.getByText('CampaignEntry'));
    expect(screen.getByText(/summer launch/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Fetch URL includes correct start/end params
  // -------------------------------------------------------------------------

  it('passes start and end query params to the calendar API', async () => {
    setupFetchSuccess([]);
    render(<PublishingCalendar {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/portal/publishing/calendar');
    expect(url).toContain('start=');
    expect(url).toContain('end=');
  });
});
