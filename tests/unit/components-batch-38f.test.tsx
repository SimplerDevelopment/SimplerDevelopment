// @vitest-environment jsdom
/**
 * Batch 38f — unit tests for 4 small React components:
 *   - components/admin/DeletePostButton.tsx
 *   - components/brain/TagEditor.tsx
 *   - components/brain/NoteActionButtons.tsx
 *   - components/brain/NoteMetaStrip.tsx
 *
 * Heavy dependencies (next/navigation, next/link) are mocked. These tests
 * focus on rendering, prop handling, and basic interaction wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import React from 'react';

// ---- next/navigation mock (used by DeletePostButton) ------------------------
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

// ---- next/link mock (used by NoteActionButtons) ----------------------------
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Import after mocks are registered.
import DeletePostButton from '@/components/admin/DeletePostButton';
import TagEditor from '@/components/brain/TagEditor';
import NoteActionButtons from '@/components/brain/NoteActionButtons';
import NoteMetaStrip from '@/components/brain/NoteMetaStrip';
import type { BrainNote } from '@/lib/brain/types';

// Shared brain note factory.
function makeNote(overrides: Partial<BrainNote> = {}): BrainNote {
  return {
    id: 1,
    title: 'Test note',
    body: 'body',
    tags: [],
    meetingId: null,
    relationshipOverlayId: null,
    companyId: null,
    dealId: null,
    contactId: null,
    confidentialityLevel: 'standard',
    pinned: false,
    source: 'manual',
    attachmentUrl: null,
    attachmentFilename: null,
    attachmentMimeType: null,
    attachmentFileSize: null,
    sourceUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refreshMock.mockReset();
});

// ============================================================================
// DeletePostButton
// ============================================================================
describe('DeletePostButton', () => {
  beforeEach(() => {
    // jsdom doesn't implement confirm/alert as proper functions; stub them.
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the Delete label initially', () => {
    render(<DeletePostButton postId={42} />);
    expect(screen.getByRole('button')).toHaveTextContent('Delete');
  });

  it('does nothing when confirm is rejected', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true } as any);
    render(<DeletePostButton postId={42} />);
    fireEvent.click(screen.getByRole('button'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls fetch DELETE and router.refresh on success', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true } as any);
    render(<DeletePostButton postId={99} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/posts/99', { method: 'DELETE' });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('alerts when DELETE response is not ok', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    vi.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false } as any);
    render(<DeletePostButton postId={1} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Failed to delete post');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('alerts when fetch throws', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network down'));
    render(<DeletePostButton postId={1} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(alertSpy).toHaveBeenCalledWith('An error occurred');
  });
});

// ============================================================================
// TagEditor
// ============================================================================
describe('TagEditor', () => {
  it('renders each tag as a chip', () => {
    render(<TagEditor tags={['alpha', 'beta']} onCommit={() => {}} />);
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('removes a tag when its close button is clicked', () => {
    const onCommit = vi.fn();
    render(<TagEditor tags={['alpha', 'beta']} onCommit={onCommit} />);
    fireEvent.click(screen.getByLabelText('remove alpha'));
    expect(onCommit).toHaveBeenCalledWith(['beta']);
  });

  it('commits a new tag on Enter and clears the input', () => {
    const onCommit = vi.fn();
    render(<TagEditor tags={['alpha']} onCommit={onCommit} />);
    const input = screen.getByPlaceholderText('add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'gamma' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(['alpha', 'gamma']);
    expect(input.value).toBe('');
  });

  it('does not duplicate an existing tag on Enter', () => {
    const onCommit = vi.fn();
    render(<TagEditor tags={['alpha']} onCommit={onCommit} />);
    const input = screen.getByPlaceholderText('add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'alpha' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Should NOT call onCommit because alpha already exists, but does clear input.
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('does not commit an empty/whitespace value on Enter', () => {
    const onCommit = vi.fn();
    render(<TagEditor tags={[]} onCommit={onCommit} />);
    const input = screen.getByPlaceholderText('add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('removes the last tag on Backspace when input is empty', () => {
    const onCommit = vi.fn();
    render(<TagEditor tags={['a', 'b', 'c']} onCommit={onCommit} />);
    const input = screen.getByPlaceholderText('add tag…') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onCommit).toHaveBeenCalledWith(['a', 'b']);
  });

  it('does not pop a tag on Backspace when input is non-empty', () => {
    const onCommit = vi.fn();
    render(<TagEditor tags={['a']} onCommit={onCommit} />);
    const input = screen.getByPlaceholderText('add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

// ============================================================================
// NoteActionButtons
// ============================================================================
describe('NoteActionButtons', () => {
  it('renders pin, zen link, and delete by default', () => {
    const note = makeNote();
    render(
      <NoteActionButtons note={note} onPatch={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByTitle('Pin')).toBeTruthy();
    expect(screen.getByTitle('Zen mode (focused single-pane view)')).toBeTruthy();
    expect(screen.getByTitle('Delete note')).toBeTruthy();
  });

  it('hides the zen link when showZenLink is false', () => {
    const note = makeNote();
    render(
      <NoteActionButtons
        note={note}
        onPatch={() => {}}
        onDelete={() => {}}
        showZenLink={false}
      />,
    );
    expect(screen.queryByTitle('Zen mode (focused single-pane view)')).toBeNull();
  });

  it('shows "Unpin" title when the note is pinned', () => {
    const note = makeNote({ pinned: true });
    render(
      <NoteActionButtons note={note} onPatch={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByTitle('Unpin')).toBeTruthy();
  });

  it('toggles pinned via onPatch when pin button is clicked', () => {
    const onPatch = vi.fn();
    const note = makeNote({ pinned: false });
    render(<NoteActionButtons note={note} onPatch={onPatch} onDelete={() => {}} />);
    fireEvent.click(screen.getByTitle('Pin'));
    expect(onPatch).toHaveBeenCalledWith({ pinned: true });
  });

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <NoteActionButtons note={makeNote()} onPatch={() => {}} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByTitle('Delete note'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('zen link uses the correct knowledge route', () => {
    const note = makeNote({ id: 1234 });
    render(<NoteActionButtons note={note} onPatch={() => {}} onDelete={() => {}} />);
    const link = screen.getByTitle('Zen mode (focused single-pane view)') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/portal/brain/knowledge/1234');
  });
});

// ============================================================================
// NoteMetaStrip
// ============================================================================
describe('NoteMetaStrip', () => {
  it('renders collapsed by default and shows the confidentiality badge', () => {
    const note = makeNote({ confidentialityLevel: 'restricted', tags: ['x', 'y'] });
    render(<NoteMetaStrip note={note} onPatch={() => {}} />);
    expect(screen.getByText('Metadata')).toBeTruthy();
    expect(screen.getByText('restricted')).toBeTruthy();
    // The expanded section's "Confidentiality" label should be absent while collapsed.
    expect(screen.queryByText('Confidentiality')).toBeNull();
  });

  it('shows tag count using correct singular/plural', () => {
    const { rerender } = render(
      <NoteMetaStrip note={makeNote({ tags: ['only'] })} onPatch={() => {}} />,
    );
    expect(screen.getByText('1 tag')).toBeTruthy();
    rerender(<NoteMetaStrip note={makeNote({ tags: ['a', 'b'] })} onPatch={() => {}} />);
    expect(screen.getByText('2 tags')).toBeTruthy();
  });

  it('expands when the Metadata button is clicked', () => {
    render(<NoteMetaStrip note={makeNote()} onPatch={() => {}} />);
    fireEvent.click(screen.getByText('Metadata'));
    expect(screen.getByText('Confidentiality')).toBeTruthy();
  });

  it('shows the source URL link when expanded and sourceUrl set', () => {
    const note = makeNote({ sourceUrl: 'https://example.com/foo' });
    render(<NoteMetaStrip note={note} onPatch={() => {}} />);
    fireEvent.click(screen.getByText('Metadata'));
    const link = screen.getByText('https://example.com/foo') as HTMLAnchorElement;
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.getAttribute('href')).toBe('https://example.com/foo');
  });

  it('shows the attachment link when an attachment is present', () => {
    const note = makeNote({
      attachmentFilename: 'doc.pdf',
      attachmentUrl: 'https://cdn.example.com/doc.pdf',
    });
    render(<NoteMetaStrip note={note} onPatch={() => {}} />);
    fireEvent.click(screen.getByText('Metadata'));
    const link = screen.getByText('doc.pdf').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://cdn.example.com/doc.pdf');
  });

  it('falls back to # when an attachment is present but url is missing', () => {
    const note = makeNote({ attachmentFilename: 'doc.pdf', attachmentUrl: null });
    render(<NoteMetaStrip note={note} onPatch={() => {}} />);
    fireEvent.click(screen.getByText('Metadata'));
    const link = screen.getByText('doc.pdf').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#');
  });

  it('calls onPatch when confidentiality select changes', () => {
    const onPatch = vi.fn();
    render(<NoteMetaStrip note={makeNote()} onPatch={onPatch} />);
    fireEvent.click(screen.getByText('Metadata'));
    fireEvent.change(screen.getByDisplayValue('standard'), {
      target: { value: 'confidential' },
    });
    expect(onPatch).toHaveBeenCalledWith({ confidentialityLevel: 'confidential' });
  });

  it('forwards tag changes from the embedded TagEditor', () => {
    const onPatch = vi.fn();
    render(
      <NoteMetaStrip note={makeNote({ tags: ['a'] })} onPatch={onPatch} />,
    );
    fireEvent.click(screen.getByText('Metadata'));
    fireEvent.click(screen.getByLabelText('remove a'));
    expect(onPatch).toHaveBeenCalledWith({ tags: [] });
  });
});
