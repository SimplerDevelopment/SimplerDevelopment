/** Integration tests for the extracted HistoryPanel component. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryPanel } from '@/app/portal/tools/pitch-decks/[id]/_components/HistoryPanel';
import type { VersionMeta } from '@/app/portal/tools/pitch-decks/[id]/_lib/api';

const mockVersions: VersionMeta[] = [
  { id: 1, label: 'Manual checkpoint', trigger: 'manual', slideCount: 3, createdAt: '2026-05-01T12:00:00Z' },
  { id: 2, label: null, trigger: 'ai_generate', slideCount: 5, createdAt: '2026-05-01T11:00:00Z' },
];

describe('HistoryPanel', () => {
  it('renders versions with their labels and slide counts', () => {
    render(
      <HistoryPanel
        versions={mockVersions}
        savingVersion={false}
        restoring={false}
        slideCount={3}
        onClose={() => {}}
        onSaveCheckpoint={() => {}}
        onRestore={() => {}}
      />
    );

    expect(screen.getByRole('heading', { name: /Version History/ })).toBeTruthy();
    expect(screen.getByText('Manual checkpoint')).toBeTruthy();
    // null label falls back to triggerLabel mapping
    expect(screen.getByText('Before AI generate')).toBeTruthy();
    expect(screen.getByText(/3 slides/)).toBeTruthy();
    expect(screen.getByText(/5 slides/)).toBeTruthy();
  });

  it('shows an empty state when versions list is empty', () => {
    render(
      <HistoryPanel
        versions={[]}
        savingVersion={false}
        restoring={false}
        slideCount={3}
        onClose={() => {}}
        onSaveCheckpoint={() => {}}
        onRestore={() => {}}
      />
    );

    expect(screen.getByText(/No versions yet/)).toBeTruthy();
  });

  it('fires onRestore with the version id when Restore is clicked', () => {
    const onRestore = vi.fn();
    render(
      <HistoryPanel
        versions={mockVersions}
        savingVersion={false}
        restoring={false}
        slideCount={3}
        onClose={() => {}}
        onSaveCheckpoint={() => {}}
        onRestore={onRestore}
      />
    );
    // Restore buttons are visible after hover, but they exist in DOM regardless.
    const restoreButtons = screen.getAllByRole('button', { name: /Restore/ });
    fireEvent.click(restoreButtons[0]);
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it('fires onSaveCheckpoint when "Save Checkpoint" is clicked', () => {
    const onSaveCheckpoint = vi.fn();
    render(
      <HistoryPanel
        versions={mockVersions}
        savingVersion={false}
        restoring={false}
        slideCount={3}
        onClose={() => {}}
        onSaveCheckpoint={onSaveCheckpoint}
        onRestore={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Save Checkpoint/ }));
    expect(onSaveCheckpoint).toHaveBeenCalled();
  });
});
