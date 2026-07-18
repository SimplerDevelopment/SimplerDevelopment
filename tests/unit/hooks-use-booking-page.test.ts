// @vitest-environment jsdom
/**
 * Unit tests for useBookingPage hook.
 *
 * Strategy: mock the entire `_lib/api` module so no real fetch is issued.
 * Each test drives a specific branch (initial load success/error, save
 * success/error, remove success/error, cancelBooking, reassignBooking,
 * refreshBookings, refreshMembers) and asserts resulting state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── mock the api module ──────────────────────────────────────────────────────
vi.mock(
  '@/app/portal/tools/booking/[id]/_lib/api',
  () => ({
    getBookingPage: vi.fn(),
    listBookings: vi.fn(),
    listMembers: vi.fn(),
    listBrandingProfiles: vi.fn(),
    updateBookingPage: vi.fn(),
    deleteBookingPage: vi.fn(),
    updateBooking: vi.fn(),
  }),
);

import * as api from '@/app/portal/tools/booking/[id]/_lib/api';
import { useBookingPage } from '@/app/portal/tools/booking/[id]/_hooks/useBookingPage';
import type { BookingPageData, Booking, PageMember, TeamMember, BrandingProfileSummary } from '@/app/portal/tools/booking/[id]/_lib/types';

// ── fixtures ─────────────────────────────────────────────────────────────────

function makePage(overrides: Partial<BookingPageData> = {}): BookingPageData {
  return {
    id: 1,
    title: 'Test Page',
    slug: 'test-page',
    description: 'A description',
    duration: 30,
    bufferBefore: 0,
    bufferAfter: 15,
    maxAdvanceDays: 60,
    minNoticeMins: 60,
    timezone: 'America/New_York',
    availability: [],
    questions: [],
    color: '#ff0000',
    brandingProfileId: 5,
    active: true,
    googleCalendarSync: false,
    conferenceType: 'zoom',
    allowStaffSelection: true,
    assignedMembers: [],
    assignmentMode: 'round_robin',
    roundRobinPool: [{ userId: 2, weight: 1 }],
    bookingType: 'group',
    groupCapacity: 10,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 42,
    guestName: 'Alice',
    guestEmail: 'alice@example.com',
    guestPhone: null,
    startTime: '2024-06-01T10:00:00Z',
    endTime: '2024-06-01T10:30:00Z',
    timezone: 'America/New_York',
    status: 'confirmed',
    assignedTo: null,
    answers: null,
    notes: null,
    createdAt: '2024-05-01T00:00:00Z',
    ...overrides,
  };
}

const stubMember: PageMember = {
  id: 1,
  userId: 10,
  displayName: 'Bob',
  color: '#123456',
  availability: null,
  active: true,
  userName: 'bob',
  userEmail: 'bob@example.com',
};

const stubTeamMember: TeamMember = {
  userId: 10,
  role: 'member',
  name: 'Bob',
  email: 'bob@example.com',
};

const stubBranding: BrandingProfileSummary = {
  id: 5,
  name: 'Default',
  isDefault: true,
  primaryColor: '#333',
  logoUrl: null,
};

// ── helpers ───────────────────────────────────────────────────────────────────

function setupHappyPath(page = makePage()) {
  vi.mocked(api.getBookingPage).mockResolvedValue({ success: true, data: page });
  vi.mocked(api.listBookings).mockResolvedValue({ success: true, data: [] });
  vi.mocked(api.listMembers).mockResolvedValue({
    success: true,
    data: { members: [stubMember], teamMembers: [stubTeamMember] },
  });
  vi.mocked(api.listBrandingProfiles).mockResolvedValue({ success: true, data: [stubBranding] });
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('useBookingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initial load ──────────────────────────────────────────────────────────

  it('starts in loading state with blank form fields', () => {
    setupHappyPath();
    const { result } = renderHook(() => useBookingPage('1'));
    // Before any async effects settle
    expect(result.current.loading).toBe(true);
    expect(result.current.page).toBeNull();
    expect(result.current.error).toBe('');
  });

  it('populates all form fields from the API response on success', async () => {
    const page = makePage();
    setupHappyPath(page);
    const { result } = renderHook(() => useBookingPage('1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.page).toEqual(page);
    expect(result.current.title).toBe('Test Page');
    expect(result.current.description).toBe('A description');
    expect(result.current.duration).toBe(30);
    expect(result.current.color).toBe('#ff0000');
    expect(result.current.brandingProfileId).toBe(5);
    expect(result.current.bufferBefore).toBe(0);
    expect(result.current.bufferAfter).toBe(15);
    expect(result.current.maxAdvanceDays).toBe(60);
    expect(result.current.minNoticeMins).toBe(60);
    expect(result.current.timezone).toBe('America/New_York');
    expect(result.current.active).toBe(true);
    expect(result.current.conferenceType).toBe('zoom');
    expect(result.current.allowStaffSelection).toBe(true);
    expect(result.current.assignmentMode).toBe('round_robin');
    expect(result.current.roundRobinPool).toEqual([{ userId: 2, weight: 1 }]);
    expect(result.current.bookingType).toBe('group');
    expect(result.current.groupCapacity).toBe(10);
  });

  it('falls back to default values when optional fields are missing', async () => {
    const page = makePage({
      description: null,
      color: undefined as unknown as string,
      brandingProfileId: null,
      conferenceType: undefined as unknown as string,
      allowStaffSelection: undefined as unknown as boolean,
      assignmentMode: undefined,
      roundRobinPool: null,
      bookingType: undefined,
      groupCapacity: null,
    });
    setupHappyPath(page);
    const { result } = renderHook(() => useBookingPage('1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.description).toBe('');
    expect(result.current.color).toBe('#2563eb');
    expect(result.current.brandingProfileId).toBeNull();
    expect(result.current.conferenceType).toBe('none');
    expect(result.current.allowStaffSelection).toBe(false);
    expect(result.current.assignmentMode).toBe('fixed');
    expect(result.current.roundRobinPool).toEqual([]);
    expect(result.current.bookingType).toBe('individual');
    expect(result.current.groupCapacity).toBeNull();
  });

  it('sets error when getBookingPage returns success=false', async () => {
    vi.mocked(api.getBookingPage).mockResolvedValue({
      success: false,
      data: null as unknown as BookingPageData,
      message: 'Not found',
    });
    vi.mocked(api.listBookings).mockResolvedValue({ success: true, data: [] });
    vi.mocked(api.listMembers).mockResolvedValue({
      success: true,
      data: { members: [], teamMembers: [] },
    });
    vi.mocked(api.listBrandingProfiles).mockResolvedValue({ success: true, data: [] });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.page).toBeNull();
    expect(result.current.error).toBe('Booking page not found');
  });

  it('sets error when getBookingPage throws', async () => {
    vi.mocked(api.getBookingPage).mockRejectedValue(new Error('network'));
    vi.mocked(api.listBookings).mockResolvedValue({ success: true, data: [] });
    vi.mocked(api.listMembers).mockResolvedValue({
      success: true,
      data: { members: [], teamMembers: [] },
    });
    vi.mocked(api.listBrandingProfiles).mockResolvedValue({ success: true, data: [] });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Failed to load booking page');
  });

  it('loads bookings list from listBookings on mount', async () => {
    const page = makePage();
    const booking = makeBooking();
    vi.mocked(api.getBookingPage).mockResolvedValue({ success: true, data: page });
    vi.mocked(api.listBookings).mockResolvedValue({ success: true, data: [booking] });
    vi.mocked(api.listMembers).mockResolvedValue({
      success: true,
      data: { members: [], teamMembers: [] },
    });
    vi.mocked(api.listBrandingProfiles).mockResolvedValue({ success: true, data: [] });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.bookingsList).toHaveLength(1);
    expect(result.current.bookingsList[0].id).toBe(42);
  });

  it('loads page members and team members from listMembers on mount', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pageMembers).toEqual([stubMember]);
    expect(result.current.teamMembers).toEqual([stubTeamMember]);
  });

  it('loads branding profiles from listBrandingProfiles on mount', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.brandingProfiles).toEqual([stubBranding]);
  });

  it('silently ignores listBookings failures', async () => {
    vi.mocked(api.getBookingPage).mockResolvedValue({ success: true, data: makePage() });
    vi.mocked(api.listBookings).mockRejectedValue(new Error('fail'));
    vi.mocked(api.listMembers).mockResolvedValue({
      success: true,
      data: { members: [], teamMembers: [] },
    });
    vi.mocked(api.listBrandingProfiles).mockResolvedValue({ success: true, data: [] });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.bookingsList).toEqual([]);
    expect(result.current.error).toBe('');
  });

  it('silently ignores listMembers failures', async () => {
    vi.mocked(api.getBookingPage).mockResolvedValue({ success: true, data: makePage() });
    vi.mocked(api.listBookings).mockResolvedValue({ success: true, data: [] });
    vi.mocked(api.listMembers).mockRejectedValue(new Error('fail'));
    vi.mocked(api.listBrandingProfiles).mockResolvedValue({ success: true, data: [] });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.staffLoading).toBe(false);
    expect(result.current.pageMembers).toEqual([]);
  });

  // ── form field setters ─────────────────────────────────────────────────────

  it('setTitle / setDescription / setDuration update state immediately', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setTitle('New Title');
      result.current.setDescription('New Desc');
      result.current.setDuration(60);
    });

    expect(result.current.title).toBe('New Title');
    expect(result.current.description).toBe('New Desc');
    expect(result.current.duration).toBe(60);
  });

  it('setColor / setBrandingProfileId / setActive update state', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setColor('#abcdef');
      result.current.setBrandingProfileId(7);
      result.current.setActive(false);
    });

    expect(result.current.color).toBe('#abcdef');
    expect(result.current.brandingProfileId).toBe(7);
    expect(result.current.active).toBe(false);
  });

  it('setError allows the caller to inject an error message', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setError('custom error');
    });

    expect(result.current.error).toBe('custom error');
  });

  // ── save ──────────────────────────────────────────────────────────────────

  it('save: sets saving=true, then saved=true on API success, then clears saved', async () => {
    const page = makePage();
    const updatedPage = makePage({ title: 'Updated' });
    setupHappyPath(page);
    vi.mocked(api.updateBookingPage).mockResolvedValue({ success: true, data: updatedPage });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.useFakeTimers();
    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.save();
    });

    // saving should flip on
    expect(result.current.saving).toBe(true);

    await act(async () => {
      await savePromise!;
    });

    expect(result.current.saving).toBe(false);
    expect(result.current.saved).toBe(true);
    expect(result.current.page).toEqual(updatedPage);

    // After 2 s the saved flag clears
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.saved).toBe(false);

    vi.useRealTimers();
  });

  it('save: sends the current form state as the request body', async () => {
    const page = makePage({ title: 'Original', duration: 30 });
    setupHappyPath(page);
    vi.mocked(api.updateBookingPage).mockResolvedValue({ success: true, data: page });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setTitle('Changed');
      result.current.setDuration(45);
    });

    await act(async () => {
      await result.current.save();
    });

    expect(api.updateBookingPage).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ title: 'Changed', duration: 45 }),
    );
  });

  it('save: sets error from message when success=false', async () => {
    setupHappyPath();
    vi.mocked(api.updateBookingPage).mockResolvedValue({
      success: false,
      data: null as unknown as BookingPageData,
      message: 'Validation failed',
    });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saved).toBe(false);
    expect(result.current.error).toBe('Validation failed');
    expect(result.current.saving).toBe(false);
  });

  it('save: sets generic error when updateBookingPage throws', async () => {
    setupHappyPath();
    vi.mocked(api.updateBookingPage).mockRejectedValue(new Error('net'));

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toBe('Failed to save changes');
    expect(result.current.saving).toBe(false);
  });

  it('save: falls back to "Failed to save" when success=false and no message', async () => {
    setupHappyPath();
    vi.mocked(api.updateBookingPage).mockResolvedValue({
      success: false,
      data: null as unknown as BookingPageData,
    });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toBe('Failed to save');
  });

  // ── remove ────────────────────────────────────────────────────────────────

  it('remove: returns true on success', async () => {
    setupHappyPath();
    vi.mocked(api.deleteBookingPage).mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returnVal: boolean | undefined;
    await act(async () => {
      returnVal = await result.current.remove();
    });

    expect(returnVal).toBe(true);
    expect(result.current.error).toBe('');
  });

  it('remove: returns false and sets error when success=false', async () => {
    setupHappyPath();
    vi.mocked(api.deleteBookingPage).mockResolvedValue({
      success: false,
      data: null,
      message: 'Cannot delete',
    });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returnVal: boolean | undefined;
    await act(async () => {
      returnVal = await result.current.remove();
    });

    expect(returnVal).toBe(false);
    expect(result.current.error).toBe('Cannot delete');
  });

  it('remove: returns false and sets generic error when deleteBookingPage throws', async () => {
    setupHappyPath();
    vi.mocked(api.deleteBookingPage).mockRejectedValue(new Error('net'));

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returnVal: boolean | undefined;
    await act(async () => {
      returnVal = await result.current.remove();
    });

    expect(returnVal).toBe(false);
    expect(result.current.error).toBe('Failed to delete booking page');
  });

  // ── cancelBooking ─────────────────────────────────────────────────────────

  it('cancelBooking: calls updateBooking with status=cancelled then refreshes list', async () => {
    const booking = makeBooking();
    setupHappyPath();
    vi.mocked(api.listBookings)
      .mockResolvedValueOnce({ success: true, data: [booking] })
      .mockResolvedValueOnce({ success: true, data: [] }); // after cancel refresh

    vi.mocked(api.updateBooking).mockResolvedValue({ success: true, data: booking });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.cancelBooking(42);
    });

    expect(api.updateBooking).toHaveBeenCalledWith('1', 42, { status: 'cancelled' });
    // list should have been refreshed (second call returns [])
    expect(result.current.bookingsList).toEqual([]);
  });

  it('cancelBooking: silently ignores when updateBooking throws', async () => {
    setupHappyPath();
    vi.mocked(api.updateBooking).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.cancelBooking(42);
    });

    expect(result.current.error).toBe('');
  });

  // ── reassignBooking ───────────────────────────────────────────────────────

  it('reassignBooking: calls updateBooking with assignedTo then refreshes list', async () => {
    const booking = makeBooking();
    setupHappyPath();
    vi.mocked(api.listBookings)
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [booking] }); // after reassign refresh

    vi.mocked(api.updateBooking).mockResolvedValue({ success: true, data: booking });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reassignBooking(42, 7);
    });

    expect(api.updateBooking).toHaveBeenCalledWith('1', 42, { assignedTo: 7 });
    expect(result.current.bookingsList).toEqual([booking]);
  });

  it('reassignBooking: silently ignores thrown errors', async () => {
    setupHappyPath();
    vi.mocked(api.updateBooking).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reassignBooking(42, null);
    });

    expect(result.current.error).toBe('');
  });

  // ── refreshBookings ───────────────────────────────────────────────────────

  it('refreshBookings: updates bookingsList from API', async () => {
    const booking = makeBooking();
    setupHappyPath();
    vi.mocked(api.listBookings)
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [booking] });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshBookings();
    });

    expect(result.current.bookingsList).toEqual([booking]);
  });

  it('refreshBookings: silently ignores thrown errors', async () => {
    setupHappyPath();
    vi.mocked(api.listBookings)
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshBookings();
    });

    expect(result.current.error).toBe('');
  });

  // ── refreshMembers ────────────────────────────────────────────────────────

  it('refreshMembers: updates pageMembers and teamMembers', async () => {
    setupHappyPath();
    const newMember: PageMember = { ...stubMember, id: 99, displayName: 'Carol' };
    vi.mocked(api.listMembers)
      .mockResolvedValueOnce({ success: true, data: { members: [stubMember], teamMembers: [stubTeamMember] } })
      .mockResolvedValueOnce({ success: true, data: { members: [newMember], teamMembers: [] } });

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshMembers();
    });

    expect(result.current.pageMembers).toEqual([newMember]);
    expect(result.current.teamMembers).toEqual([]);
    expect(result.current.staffLoading).toBe(false);
  });

  it('refreshMembers: clears staffLoading even when listMembers throws', async () => {
    setupHappyPath();
    vi.mocked(api.listMembers)
      .mockResolvedValueOnce({ success: true, data: { members: [], teamMembers: [] } })
      .mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useBookingPage('1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshMembers();
    });

    expect(result.current.staffLoading).toBe(false);
  });
});
