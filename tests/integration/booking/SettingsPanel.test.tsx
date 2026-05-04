/**
 * Integration tests for the extracted SettingsPanel component.
 *
 * Verifies:
 *  - title/description inputs are wired to setters
 *  - duration select renders the canonical option set
 *  - active toggle flips the controlled boolean
 *  - conferencing-type selector switches between none/google_meet/zoom
 *  - delete-confirmation flow only fires onDelete on the second click
 *
 * MediaPicker is stubbed to keep this a pure-Settings test (no media API).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '@/app/portal/tools/booking/[id]/_components/SettingsPanel';

vi.mock('@/components/admin/MediaPicker', () => ({
  default: () => <div data-testid="media-picker-stub" />,
}));

function renderPanel(overrides: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const setters = {
    setTitle: vi.fn(),
    setDescription: vi.fn(),
    setDuration: vi.fn(),
    setBufferBefore: vi.fn(),
    setBufferAfter: vi.fn(),
    setMaxAdvanceDays: vi.fn(),
    setMinNoticeMins: vi.fn(),
    setTimezone: vi.fn(),
    setActive: vi.fn(),
    setConferenceType: vi.fn(),
    setThumbnail: vi.fn(),
    setDeleteConfirm: vi.fn(),
    onDelete: vi.fn(),
  };
  const defaults = {
    title: 'Strategy Call',
    description: 'A 30-minute intro chat',
    duration: 30,
    bufferBefore: 0,
    bufferAfter: 15,
    maxAdvanceDays: 60,
    minNoticeMins: 60,
    timezone: 'America/New_York',
    active: true,
    conferenceType: 'none',
    thumbnail: '',
    deleteConfirm: false,
  };
  const props = { ...defaults, ...setters, ...overrides };
  render(<SettingsPanel {...props} />);
  return { props, setters };
}

describe('SettingsPanel', () => {
  it('renders title and description with current values', () => {
    renderPanel();
    expect((screen.getByDisplayValue('Strategy Call') as HTMLInputElement).value).toBe(
      'Strategy Call',
    );
    expect(
      (screen.getByDisplayValue('A 30-minute intro chat') as HTMLTextAreaElement).value,
    ).toBe('A 30-minute intro chat');
  });

  it('calls setTitle when the title input changes', () => {
    const { setters } = renderPanel();
    const input = screen.getByDisplayValue('Strategy Call');
    fireEvent.change(input, { target: { value: 'Strategy Call (renamed)' } });
    expect(setters.setTitle).toHaveBeenCalledWith('Strategy Call (renamed)');
  });

  it('renders the canonical duration option set', () => {
    renderPanel();
    const select = screen.getByDisplayValue('30 minutes') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual([
      '15 minutes',
      '30 minutes',
      '45 minutes',
      '60 minutes',
      '90 minutes',
      '120 minutes',
    ]);
  });

  it('flips active when the toggle is clicked', () => {
    const { setters } = renderPanel({ active: true });
    // The active toggle is the first toggle button on the page (in the
    // settings grid). The danger-zone "Delete" button has different text.
    const buttons = screen.getAllByRole('button');
    const toggle = buttons.find(
      (b) => b.className.includes('inline-flex') && b.className.includes('rounded-full'),
    );
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);
    expect(setters.setActive).toHaveBeenCalledWith(false);
  });

  it('switches conference type when a different option card is clicked', () => {
    const { setters } = renderPanel({ conferenceType: 'none' });
    fireEvent.click(screen.getByText('Google Meet'));
    expect(setters.setConferenceType).toHaveBeenCalledWith('google_meet');
    fireEvent.click(screen.getByText('Zoom'));
    expect(setters.setConferenceType).toHaveBeenCalledWith('zoom');
  });

  it('renders the danger-zone trigger and arms confirmation on click', () => {
    const { setters } = renderPanel({ deleteConfirm: false });
    fireEvent.click(screen.getByRole('button', { name: /Delete Booking Page/ }));
    expect(setters.setDeleteConfirm).toHaveBeenCalledWith(true);
    // Without confirmation, onDelete is NOT fired.
    expect(setters.onDelete).not.toHaveBeenCalled();
  });

  it('fires onDelete from the confirmation step', () => {
    const { setters } = renderPanel({ deleteConfirm: true });
    fireEvent.click(screen.getByRole('button', { name: /Yes, delete/ }));
    expect(setters.onDelete).toHaveBeenCalledTimes(1);
  });

  it('updates buffer fields via the number inputs', () => {
    const { setters } = renderPanel();
    const bufferBefore = screen.getByDisplayValue('0') as HTMLInputElement;
    fireEvent.change(bufferBefore, { target: { value: '5' } });
    expect(setters.setBufferBefore).toHaveBeenCalledWith(5);
  });
});
