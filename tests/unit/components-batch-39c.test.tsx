/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * Batch 39c — unit tests for 3 small admin React components:
 *   - components/admin/MediaGrid.tsx
 *   - components/admin/MediaUploadModal.tsx
 *   - components/admin/PostFormInner.tsx
 *
 * Heavy dependencies (the visual editor toolbar/viewport selector, and the
 * MediaDetailModal subcomponent) are mocked. These tests focus on rendering,
 * prop handling, and basic interaction wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import React from 'react';

// ---- MediaDetailModal mock (used by MediaGrid) -----------------------------
vi.mock('@/components/admin/MediaDetailModal', () => ({
  default: ({ media, onClose, onUpdate }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-media-detail-modal' },
      React.createElement('span', null, `modal:${media.filename}`),
      React.createElement(
        'button',
        { onClick: onClose, 'data-testid': 'modal-close' },
        'close',
      ),
      React.createElement(
        'button',
        { onClick: onUpdate, 'data-testid': 'modal-update' },
        'update',
      ),
    ),
}));

// ---- Visual editor subcomponent mocks (used by PostFormInner) --------------
vi.mock('@/components/blocks/VisualEditorToolbar', () => ({
  VisualEditorToolbar: () =>
    React.createElement('div', { 'data-testid': 'mock-visual-editor-toolbar' }, 'toolbar'),
}));
vi.mock('@/components/blocks/ViewportSelector', () => ({
  ViewportSelector: () =>
    React.createElement('div', { 'data-testid': 'mock-viewport-selector' }, 'viewport'),
}));

// Import after mocks are registered.
import MediaGrid from '@/components/admin/MediaGrid';
import MediaUploadModal from '@/components/admin/MediaUploadModal';
import { PostFormInnerControls } from '@/components/admin/PostFormInner';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ============================================================================
// MediaGrid
// ============================================================================
describe('MediaGrid', () => {
  const baseImage = {
    id: 1,
    filename: 'photo.png',
    url: 'https://cdn.test/photo.png',
    mimeType: 'image/png',
    fileSize: 500,
    width: 800,
    height: 600,
    alt: 'a photo',
    caption: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('shows the empty-state message when media is empty', () => {
    render(<MediaGrid media={[]} onUpdate={() => {}} />);
    expect(
      screen.getByText('No media found. Upload some files to get started!'),
    ).toBeTruthy();
  });

  it('renders an image thumbnail for image mime types', () => {
    const { container } = render(<MediaGrid media={[baseImage]} onUpdate={() => {}} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://cdn.test/photo.png');
    expect(img?.getAttribute('alt')).toBe('a photo');
  });

  it('renders a <video> for video mime types', () => {
    const item = { ...baseImage, mimeType: 'video/mp4', filename: 'clip.mp4' };
    const { container } = render(<MediaGrid media={[item]} onUpdate={() => {}} />);
    expect(container.querySelector('video')).toBeTruthy();
  });

  it('renders a document fallback for non-image, non-video mime types', () => {
    const item = { ...baseImage, mimeType: 'application/pdf', filename: 'doc.pdf' };
    render(<MediaGrid media={[item]} onUpdate={() => {}} />);
    expect(screen.getByText('description')).toBeTruthy();
  });

  it('formats file sizes correctly across thresholds', () => {
    const items = [
      { ...baseImage, id: 1, filename: 'a', fileSize: 512 },
      { ...baseImage, id: 2, filename: 'b', fileSize: 2048 },
      { ...baseImage, id: 3, filename: 'c', fileSize: 5_000_000 },
    ];
    render(<MediaGrid media={items} onUpdate={() => {}} />);
    expect(screen.getByText('512 B')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('4.8 MB')).toBeTruthy();
  });

  it('renders dimensions only when both width and height are set', () => {
    const withDims = { ...baseImage, id: 10, width: 100, height: 200, filename: 'd' };
    const noDims = { ...baseImage, id: 11, width: null, height: null, filename: 'e' };
    render(<MediaGrid media={[withDims, noDims]} onUpdate={() => {}} />);
    expect(screen.getByText('100 × 200')).toBeTruthy();
  });

  it('opens the detail modal when an item is clicked, and closes it', () => {
    render(<MediaGrid media={[baseImage]} onUpdate={() => {}} />);
    expect(screen.queryByTestId('mock-media-detail-modal')).toBeNull();
    fireEvent.click(screen.getByText('photo.png'));
    expect(screen.getByTestId('mock-media-detail-modal')).toBeTruthy();
    expect(screen.getByText('modal:photo.png')).toBeTruthy();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('mock-media-detail-modal')).toBeNull();
  });

  it('forwards onUpdate from the detail modal', () => {
    const onUpdate = vi.fn();
    render(<MediaGrid media={[baseImage]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('photo.png'));
    fireEvent.click(screen.getByTestId('modal-update'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// MediaUploadModal
// ============================================================================
describe('MediaUploadModal', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the initial upload prompt', () => {
    render(<MediaUploadModal onClose={() => {}} onComplete={() => {}} />);
    expect(screen.getByText('Upload Media')).toBeTruthy();
    expect(screen.getByText('Drop files here or click to browse')).toBeTruthy();
    expect(screen.getByText('Supports images, videos, and documents')).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<MediaUploadModal onClose={onClose} onComplete={() => {}} />);
    fireEvent.click(screen.getByText('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the file name and alt/caption inputs after a file is selected', () => {
    const { container } = render(
      <MediaUploadModal onClose={() => {}} onComplete={() => {}} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'foo.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    expect(screen.getByText('foo.txt')).toBeTruthy();
    expect(screen.getByPlaceholderText('Describe the image for accessibility')).toBeTruthy();
    expect(screen.getByPlaceholderText('Optional caption or description')).toBeTruthy();
    expect(screen.getByText('Upload')).toBeTruthy();
  });

  it('POSTs to the API and calls onComplete on success', async () => {
    const onComplete = vi.fn();
    const fetchSpy = vi
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true } as any);
    const { container } = render(
      <MediaUploadModal onClose={() => {}} onComplete={onComplete} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hi'], 'thing.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    // Fill alt + caption
    fireEvent.change(screen.getByPlaceholderText('Describe the image for accessibility'), {
      target: { value: 'alt-text' },
    });
    fireEvent.change(screen.getByPlaceholderText('Optional caption or description'), {
      target: { value: 'my caption' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Upload'));
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/media/upload');
    expect((opts as any).method).toBe('POST');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('uses the apiEndpoint override when provided', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true } as any);
    const { container } = render(
      <MediaUploadModal
        onClose={() => {}}
        onComplete={() => {}}
        apiEndpoint="/api/custom-upload"
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'y.txt', { type: 'text/plain' })],
    });
    fireEvent.change(input);
    await act(async () => {
      fireEvent.click(screen.getByText('Upload'));
    });
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/custom-upload');
  });

  it('alerts with the server error message when upload fails', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    vi.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'too large' }),
    } as any);
    const { container } = render(
      <MediaUploadModal onClose={() => {}} onComplete={() => {}} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'y.txt', { type: 'text/plain' })],
    });
    fireEvent.change(input);
    await act(async () => {
      fireEvent.click(screen.getByText('Upload'));
    });
    expect(alertSpy).toHaveBeenCalledWith('too large');
  });

  it('alerts with a generic message when fetch throws', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network'));
    const { container } = render(
      <MediaUploadModal onClose={() => {}} onComplete={() => {}} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'y.txt', { type: 'text/plain' })],
    });
    fireEvent.change(input);
    await act(async () => {
      fireEvent.click(screen.getByText('Upload'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Upload failed');
  });

  it('handles drag enter / drag leave by toggling drag state classes', () => {
    const { container } = render(
      <MediaUploadModal onClose={() => {}} onComplete={() => {}} />,
    );
    // The dropzone is the first div inside the modal containing border-dashed.
    // Active state adds a `bg-primary/5` class; inactive state has `border-border`.
    const dropzone = container.querySelector('.border-dashed') as HTMLElement;
    expect(dropzone).toBeTruthy();
    expect(dropzone.className).toContain('border-border');
    fireEvent.dragEnter(dropzone);
    expect(dropzone.className).toContain('bg-primary/5');
    expect(dropzone.className).not.toContain('border-border');
    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toContain('bg-primary/5');
    expect(dropzone.className).toContain('border-border');
  });
});

// ============================================================================
// PostFormInnerControls
// ============================================================================
describe('PostFormInnerControls', () => {
  it('renders the toolbar and viewport selector in blocks+visual mode', () => {
    render(
      <PostFormInnerControls
        contentMode="blocks"
        editorMode="visual"
        onEditorModeChange={() => {}}
        contentMenuOpen={false}
        onContentMenuToggle={() => {}}
        onContentModeChange={() => {}}
      />,
    );
    expect(screen.getByTestId('mock-visual-editor-toolbar')).toBeTruthy();
    expect(screen.getByTestId('mock-viewport-selector')).toBeTruthy();
    expect(screen.getByText('Block Editor')).toBeTruthy();
  });

  it('hides toolbar/viewport when not in visual mode', () => {
    render(
      <PostFormInnerControls
        contentMode="blocks"
        editorMode="classic"
        onEditorModeChange={() => {}}
        contentMenuOpen={false}
        onContentMenuToggle={() => {}}
        onContentModeChange={() => {}}
      />,
    );
    expect(screen.queryByTestId('mock-visual-editor-toolbar')).toBeNull();
    expect(screen.queryByTestId('mock-viewport-selector')).toBeNull();
    expect(screen.getByText('Classic')).toBeTruthy();
  });

  it('shows the "JSON" label when contentMode is raw', () => {
    render(
      <PostFormInnerControls
        contentMode="raw"
        editorMode="visual"
        onEditorModeChange={() => {}}
        contentMenuOpen={false}
        onContentMenuToggle={() => {}}
        onContentModeChange={() => {}}
      />,
    );
    expect(screen.getByText('JSON')).toBeTruthy();
  });

  it('opens the dropdown menu when contentMenuOpen is true', () => {
    render(
      <PostFormInnerControls
        contentMode="blocks"
        editorMode="visual"
        onEditorModeChange={() => {}}
        contentMenuOpen={true}
        onContentMenuToggle={() => {}}
        onContentModeChange={() => {}}
      />,
    );
    // Menu items only appear when open; "Block Editor" appears in both the
    // current-mode label AND the menu list, so we expect 2 occurrences.
    expect(screen.getAllByText('Block Editor').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Classic')).toBeTruthy();
    expect(screen.getByText('JSON')).toBeTruthy();
  });

  it('selecting "visual" calls onContentModeChange("blocks") + onEditorModeChange("visual")', () => {
    const onContentModeChange = vi.fn();
    const onEditorModeChange = vi.fn();
    const onContentMenuToggle = vi.fn();
    render(
      <PostFormInnerControls
        contentMode="raw"
        editorMode="classic"
        onEditorModeChange={onEditorModeChange}
        contentMenuOpen={true}
        onContentMenuToggle={onContentMenuToggle}
        onContentModeChange={onContentModeChange}
      />,
    );
    // Find the menu button by its text inside the open dropdown.
    fireEvent.click(screen.getByText('Block Editor'));
    expect(onContentModeChange).toHaveBeenCalledWith('blocks');
    expect(onEditorModeChange).toHaveBeenCalledWith('visual');
    expect(onContentMenuToggle).toHaveBeenCalled();
  });

  it('selecting "classic" calls onContentModeChange("blocks") + onEditorModeChange("classic")', () => {
    const onContentModeChange = vi.fn();
    const onEditorModeChange = vi.fn();
    render(
      <PostFormInnerControls
        contentMode="raw"
        editorMode="visual"
        onEditorModeChange={onEditorModeChange}
        contentMenuOpen={true}
        onContentMenuToggle={() => {}}
        onContentModeChange={onContentModeChange}
      />,
    );
    // "Classic" label appears once in the menu (since current mode is raw).
    fireEvent.click(screen.getByText('Classic'));
    expect(onContentModeChange).toHaveBeenCalledWith('blocks');
    expect(onEditorModeChange).toHaveBeenCalledWith('classic');
  });

  it('selecting "JSON" calls onContentModeChange("raw") and toggles the menu', () => {
    const onContentModeChange = vi.fn();
    const onContentMenuToggle = vi.fn();
    render(
      <PostFormInnerControls
        contentMode="blocks"
        editorMode="visual"
        onEditorModeChange={() => {}}
        contentMenuOpen={true}
        onContentMenuToggle={onContentMenuToggle}
        onContentModeChange={onContentModeChange}
      />,
    );
    fireEvent.click(screen.getByText('JSON'));
    expect(onContentModeChange).toHaveBeenCalledWith('raw');
    expect(onContentMenuToggle).toHaveBeenCalled();
  });

  it('main button click invokes onContentMenuToggle', () => {
    const onContentMenuToggle = vi.fn();
    render(
      <PostFormInnerControls
        contentMode="blocks"
        editorMode="visual"
        onEditorModeChange={() => {}}
        contentMenuOpen={false}
        onContentMenuToggle={onContentMenuToggle}
        onContentModeChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTitle('Editor Mode'));
    expect(onContentMenuToggle).toHaveBeenCalledTimes(1);
  });
});
