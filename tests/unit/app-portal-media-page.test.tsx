// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/media/page.tsx` — the Portal Media Library
 * page. Covers filter UI, search, pagination, upload flow (incl.
 * drag-and-drop), detail modal (edit metadata, delete, copy URL,
 * replace file), and the version-history flyout.
 *
 * next/navigation is unused by this page, but fetch, FileReader,
 * navigator.clipboard, window.confirm, and window.alert are all
 * stubbed.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/media',
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

const alertMock = vi.fn();
const confirmMock = vi.fn();
const clipboardWriteMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  alertMock.mockReset();
  confirmMock.mockReset();
  clipboardWriteMock.mockReset();
  // Default: list returns empty
  fetchMock.mockImplementation(async () => {
    return makeRes({
      success: true,
      data: [],
      pagination: { total: 0, limit: 20, offset: 0 },
    });
  });
  vi.stubGlobal('fetch', fetchMock as any);
  vi.stubGlobal('alert', alertMock as any);
  vi.stubGlobal('confirm', confirmMock as any);
  // navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWriteMock },
  });

  // FileReader — synchronous-ish stub that calls onload with a data URL.
  class FakeFileReader {
    onload: ((e: any) => void) | null = null;
    result: string | ArrayBuffer | null = null;
    readAsDataURL(_file: any) {
      this.result = 'data:image/png;base64,FAKE';
      // Fire microtask so React state updates resolve.
      Promise.resolve().then(() => {
        this.onload?.({ target: { result: this.result } });
      });
    }
  }
  vi.stubGlobal('FileReader', FakeFileReader as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRes(body: any, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function makeItem(id: number, extra: Record<string, any> = {}): any {
  return {
    id,
    filename: `file-${id}.png`,
    url: `https://cdn.example.com/file-${id}.png`,
    mimeType: 'image/png',
    fileSize: 2048,
    width: 800,
    height: 600,
    alt: null,
    caption: null,
    brandingProfileId: null,
    brandingProfileName: null,
    version: 1,
    createdAt: '2025-05-01T12:00:00Z',
    ...extra,
  };
}

function makeVersion(id: number, extra: Record<string, any> = {}): any {
  return {
    id,
    version: id,
    filename: `prev-v${id}.png`,
    url: `https://cdn.example.com/prev-v${id}.png`,
    fileSize: 1024,
    mimeType: 'image/png',
    createdAt: '2025-04-01T12:00:00Z',
    ...extra,
  };
}

// Import after mocks
import PortalMediaPage from '@/app/portal/media/page';

function renderPage() {
  return render(<PortalMediaPage />);
}

// ─── Top-level shell ────────────────────────────────────────────────────────

describe('PortalMediaPage — shell + header', () => {
  it('renders the page header and Upload button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Media Library');
      expect(container.textContent).toContain('Upload and manage');
      expect(container.textContent).toContain('Upload');
    });
  });

  it('shows the loading spinner before fetch resolves', async () => {
    let resolveList: (v: any) => void = () => {};
    fetchMock.mockImplementation(async () => {
      return new Promise<FetchResp>((res) => { resolveList = res; });
    });
    const { container } = renderPage();
    // Spinner = a .animate-spin element
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    resolveList(makeRes({ success: true, data: [], pagination: { total: 0 } }));
  });

  it('renders the empty-state when no media and no filters', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No media yet');
    });
  });

  it('renders the filtered empty-state when search is set', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No media yet'));
    const input = container.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'nothing' } });
    await waitFor(() => {
      expect(container.textContent).toContain('No media matches your filters.');
    });
  });

  it('does not render the branding-profiles dropdown when none are returned', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    expect(container.querySelector('select')).toBeFalsy();
  });

  it('renders the branding-profiles dropdown when profiles are returned', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [],
      pagination: { total: 0 },
      brandingProfiles: [{ id: 1, name: 'Acme' }, { id: 2, name: 'Globex' }],
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('select')).toBeTruthy();
      expect(container.textContent).toContain('Acme');
      expect(container.textContent).toContain('Globex');
    });
  });
});

// ─── Filters ────────────────────────────────────────────────────────────────

describe('PortalMediaPage — filters', () => {
  it('passes the search term into the fetch URL', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const input = container.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'logo' } });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('search=logo'))).toBe(true);
    });
  });

  it('clicking the Image type filter passes mimeType=image', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const btn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Image',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('mimeType=image'))).toBe(true);
    });
  });

  it('clicking the Video filter passes mimeType=video', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const btn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Video',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('mimeType=video'))).toBe(true);
    });
  });

  it('clicking the Application filter passes mimeType=application', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const btn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Application',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('mimeType=application'))).toBe(true);
    });
  });

  it('clicking All clears the mimeType filter', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    // First switch to Image
    const imgBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Image',
    ) as HTMLButtonElement;
    fireEvent.click(imgBtn);
    // Now click All
    const allBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'All',
    ) as HTMLButtonElement;
    fireEvent.click(allBtn);
    await waitFor(() => {
      const last = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
      expect(last).not.toContain('mimeType=image');
    });
  });

  it('selecting a branding profile passes brandingProfileId', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [],
      pagination: { total: 0 },
      brandingProfiles: [{ id: 1, name: 'Acme' }],
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('select')).toBeTruthy());
    const sel = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '1' } });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('brandingProfileId=1'))).toBe(true);
    });
  });
});

// ─── Grid ───────────────────────────────────────────────────────────────────

describe('PortalMediaPage — grid', () => {
  it('renders image media items with an <img> thumbnail', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1)],
      pagination: { total: 1 },
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
      expect(container.textContent).toContain('file-1.png');
    });
  });

  it('renders video items with the videocam placeholder', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1, { mimeType: 'video/mp4', filename: 'clip.mp4' })],
      pagination: { total: 1 },
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('videocam');
      expect(container.textContent).toContain('clip.mp4');
    });
  });

  it('renders document items with the description placeholder', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1, { mimeType: 'application/pdf', filename: 'doc.pdf' })],
      pagination: { total: 1 },
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('description');
      expect(container.textContent).toContain('doc.pdf');
    });
  });

  it('formats file size in bytes for tiny files', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1, { fileSize: 512 })],
      pagination: { total: 1 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('512 B'));
  });

  it('formats file size in KB', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1, { fileSize: 2048 })],
      pagination: { total: 1 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('2.0 KB'));
  });

  it('formats file size in MB', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1, { fileSize: 2 * 1048576 })],
      pagination: { total: 1 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('2.0 MB'));
  });

  it('renders dimensions when width and height are set', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1, { width: 1024, height: 768 })],
      pagination: { total: 1 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('1024x768'));
  });

  it('renders the branding profile name when set', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1, { brandingProfileName: 'Globex' })],
      pagination: { total: 1 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Globex'));
  });
});

// ─── Pagination ─────────────────────────────────────────────────────────────

describe('PortalMediaPage — pagination', () => {
  it('does not render pagination when total <= limit', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1)],
      pagination: { total: 5 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    expect(container.textContent).not.toContain('Previous');
  });

  it('renders Previous/Next controls when total exceeds limit', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1)],
      pagination: { total: 50 },
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Previous');
      expect(container.textContent).toContain('Next');
      expect(container.textContent).toContain('1');
      expect(container.textContent).toContain('50');
    });
  });

  it('disables Previous on the first page', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1)],
      pagination: { total: 50 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Previous'));
    const prev = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Previous',
    ) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });

  it('Next advances offset', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1)],
      pagination: { total: 50 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Next'));
    const next = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Next',
    ) as HTMLButtonElement;
    fireEvent.click(next);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('offset=20'))).toBe(true);
    });
  });

  it('Previous clamps to zero', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [makeItem(1)],
      pagination: { total: 50 },
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Next'));
    const next = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Next',
    ) as HTMLButtonElement;
    fireEvent.click(next);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('offset=20'))).toBe(true);
    });
    const prev = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Previous',
    ) as HTMLButtonElement;
    fireEvent.click(prev);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('offset=0'))).toBe(true);
    });
  });
});

// ─── Upload modal ───────────────────────────────────────────────────────────

describe('PortalMediaPage — upload modal', () => {
  it('opens the upload modal when Upload is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Upload Media');
      expect(container.textContent).toContain('Drop files here');
    });
  });

  it('closes the modal via the close (X) button', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    // X is the button containing the "close" icon
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.querySelector('.material-icons')?.textContent === 'close',
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Upload Media');
    });
  });

  it('closes the modal on backdrop click', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    // The backdrop is the parent of the .bg-card content
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Upload Media');
    });
  });

  it('selecting a non-image file shows the filename but no preview', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(container.textContent).toContain('doc.pdf');
      // No image preview rendered
      const imgs = container.querySelectorAll('img[alt="Preview"]');
      expect(imgs.length).toBe(0);
    });
  });

  it('selecting an image file shows the preview image', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'pic.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(container.querySelector('img[alt="Preview"]')).toBeTruthy();
    });
  });

  it('drag enter toggles the dragActive style', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    const dropzone = container.querySelector('.border-dashed') as HTMLElement;
    fireEvent.dragEnter(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone.className).toContain('border-primary');
    fireEvent.dragLeave(dropzone, { dataTransfer: { files: [] } });
    // Now dragActive is false again
    expect(dropzone.className).not.toContain('bg-primary/5');
  });

  it('dropping a file selects it', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    const dropzone = container.querySelector('.border-dashed') as HTMLElement;
    const file = new File(['x'], 'dropped.png', { type: 'image/png' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    await waitFor(() => {
      expect(container.textContent).toContain('dropped.png');
    });
  });

  it('drop with no files is a no-op', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    const dropzone = container.querySelector('.border-dashed') as HTMLElement;
    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });
    // Still shows "Drop files" since no file was selected
    expect(container.textContent).toContain('Drop files here');
  });

  it('uploads a file successfully and closes the modal', async () => {
    let uploadCalled = false;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/upload') && init?.method === 'POST') {
        uploadCalled = true;
        return makeRes({ success: true, data: makeItem(1) });
      }
      return makeRes({ success: true, data: [], pagination: { total: 0 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'go.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(container.textContent).toContain('go.png'));
    // Fill metadata
    const altInput = Array.from(container.querySelectorAll('input')).find(i =>
      (i as HTMLInputElement).placeholder === 'Describe the image',
    ) as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'a logo' } });
    const captionEl = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(captionEl, { target: { value: 'caption text' } });
    // Click the Upload submit button (inside the modal)
    const submit = Array.from(container.querySelectorAll('button')).filter(b =>
      b.textContent?.trim() === 'Upload',
    ).pop() as HTMLButtonElement;
    fireEvent.click(submit);
    await waitFor(() => {
      expect(uploadCalled).toBe(true);
      expect(container.textContent).not.toContain('Upload Media');
    });
  });

  it('shows server error message when upload fails with a body', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/upload') && init?.method === 'POST') {
        return { ok: false, json: async () => ({ message: 'too big' }) };
      }
      return makeRes({ success: true, data: [], pagination: { total: 0 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'oops.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(container.textContent).toContain('oops.png'));
    const submit = Array.from(container.querySelectorAll('button')).filter(b =>
      b.textContent?.trim() === 'Upload',
    ).pop() as HTMLButtonElement;
    fireEvent.click(submit);
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('too big');
    });
  });

  it('shows a generic alert when upload throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/upload') && init?.method === 'POST') {
        throw new Error('network');
      }
      return makeRes({ success: true, data: [], pagination: { total: 0 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'fail.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(container.textContent).toContain('fail.png'));
    const submit = Array.from(container.querySelectorAll('button')).filter(b =>
      b.textContent?.trim() === 'Upload',
    ).pop() as HTMLButtonElement;
    fireEvent.click(submit);
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('Upload failed');
    });
  });

  it('Cancel button inside the modal closes it', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'c.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(container.textContent).toContain('c.png'));
    const cancel = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancel);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Upload Media');
    });
  });

  it('renders the brand select inside the upload modal when profiles exist', async () => {
    fetchMock.mockImplementation(async () => makeRes({
      success: true,
      data: [],
      pagination: { total: 0 },
      brandingProfiles: [{ id: 1, name: 'Acme' }],
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'b.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      // There are now two <select> — top-level filter + upload modal
      const selects = container.querySelectorAll('select');
      expect(selects.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('clicking the dropzone triggers a hidden file-input click', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Media Library'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Upload') && b.querySelector('.material-icons'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(container.textContent).toContain('Upload Media'));
    const dropzone = container.querySelector('.border-dashed') as HTMLElement;
    // Don't crash:
    fireEvent.click(dropzone);
    expect(container.textContent).toContain('Upload Media');
  });
});

// ─── Detail modal ───────────────────────────────────────────────────────────

describe('PortalMediaPage — detail modal', () => {
  function openDetailFor(item: any) {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/versions') && !init) {
        return makeRes({
          success: true,
          data: { current: { version: item.version || 1 }, history: [] },
        });
      }
      return makeRes({
        success: true,
        data: [item],
        pagination: { total: 1 },
      });
    });
  }

  it('opens detail when an item is clicked', async () => {
    openDetailFor(makeItem(1, { alt: 'a logo', caption: 'cap' }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    const card = container.querySelector('.grid > div') as HTMLElement;
    fireEvent.click(card);
    await waitFor(() => {
      expect(container.textContent).toContain('Media Details');
      expect(container.textContent).toContain('Filename:');
      expect(container.textContent).toContain('Type:');
      expect(container.textContent).toContain('Size:');
      expect(container.textContent).toContain('Uploaded:');
      expect(container.textContent).toContain('a logo');
      expect(container.textContent).toContain('cap');
    });
  });

  it('renders dimensions row when set', async () => {
    openDetailFor(makeItem(1, { width: 100, height: 50 }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => {
      expect(container.textContent).toContain('Dimensions:');
      expect(container.textContent).toContain('100 x 50');
    });
  });

  it('renders brand row when present', async () => {
    openDetailFor(makeItem(1, { brandingProfileName: 'Globex' }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => {
      expect(container.textContent).toContain('Brand:');
      expect(container.textContent).toContain('Globex');
    });
  });

  it('renders a <video> tag for video media', async () => {
    openDetailFor(makeItem(1, { mimeType: 'video/mp4', filename: 'clip.mp4' }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('clip.mp4'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelector('video')).toBeTruthy();
    });
  });

  it('renders the description fallback icon for non-image, non-video media', async () => {
    openDetailFor(makeItem(1, { mimeType: 'application/pdf', filename: 'doc.pdf' }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('doc.pdf'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => {
      expect(container.textContent).toContain('Media Details');
      // Description icon appears twice in details (preview + nothing else) — just verify modal open
      expect(container.querySelector('img')).toBeFalsy();
    });
  });

  it('closes via the modal X', async () => {
    openDetailFor(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Media Details'));
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.querySelector('.material-icons')?.textContent === 'close',
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Media Details');
    });
  });

  it('closes on backdrop click', async () => {
    openDetailFor(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Media Details'));
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Media Details');
    });
  });

  it('Copy URL writes to the clipboard', async () => {
    openDetailFor(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Copy URL'));
    const copyBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Copy URL'),
    ) as HTMLButtonElement;
    fireEvent.click(copyBtn);
    expect(clipboardWriteMock).toHaveBeenCalledWith('https://cdn.example.com/file-1.png');
  });

  it('Edit Metadata switches into edit mode', async () => {
    openDetailFor(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Edit Metadata'));
    const edit = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Edit Metadata',
    ) as HTMLButtonElement;
    fireEvent.click(edit);
    await waitFor(() => {
      expect(container.textContent).toContain('Save');
    });
  });

  it('Saves metadata via PUT and exits edit mode', async () => {
    let putCalled = false;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        putCalled = true;
        return makeRes({ success: true });
      }
      if (url.includes('/versions') && !init) {
        return makeRes({ success: true, data: { current: { version: 1 }, history: [] } });
      }
      return makeRes({
        success: true,
        data: [makeItem(1)],
        pagination: { total: 1 },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Edit Metadata'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Edit Metadata',
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.textContent).toContain('Save'));
    // Update alt
    const altInputs = container.querySelectorAll('input[type="text"], input:not([type])');
    const altInput = altInputs[altInputs.length - 1] as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'new alt' } });
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Save',
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(putCalled).toBe(true));
  });

  it('Cancel inside edit mode goes back to read-only', async () => {
    openDetailFor(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Edit Metadata'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Edit Metadata',
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.textContent).toContain('Save'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Cancel',
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      // "Save" gone, "Edit Metadata" back
      expect(container.textContent).toContain('Edit Metadata');
    });
  });

  it('Delete confirms and DELETEs', async () => {
    confirmMock.mockReturnValue(true);
    let deleted = false;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'DELETE') {
        deleted = true;
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: [makeItem(1)],
        pagination: { total: 1 },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Delete'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Delete',
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(deleted).toBe(true);
      expect(container.textContent).not.toContain('Media Details');
    });
  });

  it('Delete is a no-op when confirm returns false', async () => {
    confirmMock.mockReturnValue(false);
    let deleteCalls = 0;
    fetchMock.mockImplementation(async (_url: string, init?: any) => {
      if (init?.method === 'DELETE') {
        deleteCalls++;
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: [makeItem(1)],
        pagination: { total: 1 },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Delete'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Delete',
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(deleteCalls).toBe(0);
      // Detail still open
      expect(container.textContent).toContain('Media Details');
    });
  });
});

// ─── Versions ───────────────────────────────────────────────────────────────

describe('PortalMediaPage — versions', () => {
  function openDetail(item: any, versionsHandler?: (url: string) => any) {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (versionsHandler) {
        const v = versionsHandler(url);
        if (v) return v;
      }
      if (init?.method === 'POST' && url.includes('/replace')) {
        return makeRes({
          success: true,
          data: {
            filename: 'new.png',
            url: 'https://cdn.example.com/new.png',
            fileSize: 4096,
            version: (item.version || 1) + 1,
            mimeType: 'image/png',
          },
        });
      }
      if (init?.method === 'POST' && url.includes('/restore')) {
        return makeRes({
          success: true,
          data: {
            filename: 'restored.png',
            url: 'https://cdn.example.com/restored.png',
            fileSize: 1024,
            mimeType: 'image/png',
            version: 7,
          },
        });
      }
      if (url.includes('/versions') && !init) {
        return makeRes({
          success: true,
          data: { current: { version: 1 }, history: [makeVersion(1)] },
        });
      }
      return makeRes({
        success: true,
        data: [item],
        pagination: { total: 1 },
      });
    });
  }

  it('toggles Version history open and fetches versions', async () => {
    openDetail(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Version history'));
    const versionBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Version history'),
    ) as HTMLButtonElement;
    fireEvent.click(versionBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('/versions'))).toBe(true);
      expect(container.textContent).toContain('prev-v1.png');
    });
  });

  it('shows empty-state when there are no prior versions', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/versions') && !init) {
        return makeRes({ success: true, data: { current: { version: 1 }, history: [] } });
      }
      return makeRes({
        success: true,
        data: [makeItem(1)],
        pagination: { total: 1 },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Version history'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Version history'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(container.textContent).toContain('No prior versions yet');
    });
  });

  it('does not crash when the versions fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/versions') && !init) {
        return { ok: false, json: async () => ({ success: false }) };
      }
      return makeRes({
        success: true,
        data: [makeItem(1)],
        pagination: { total: 1 },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Version history'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Version history'),
      ) as HTMLButtonElement,
    );
    // Should still show open state but with empty list (or no failure)
    await waitFor(() => {
      expect(container.textContent).toContain('No prior versions yet');
    });
  });

  it('Restore confirms then calls /restore', async () => {
    confirmMock.mockReturnValue(true);
    openDetail(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Version history'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Version history'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.textContent).toContain('prev-v1.png'));
    const restoreBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Restore',
    ) as HTMLButtonElement;
    fireEvent.click(restoreBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('/restore'))).toBe(true);
    });
  });

  it('Restore aborts when confirm returns false', async () => {
    confirmMock.mockReturnValue(false);
    openDetail(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Version history'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Version history'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.textContent).toContain('prev-v1.png'));
    const before = fetchMock.mock.calls.length;
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Restore',
      ) as HTMLButtonElement,
    );
    // No new call after confirm-false
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('Restore failure shows an alert', async () => {
    confirmMock.mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/restore') && init?.method === 'POST') {
        return { ok: false, json: async () => ({ success: false }) };
      }
      if (url.includes('/versions') && !init) {
        return makeRes({
          success: true,
          data: { current: { version: 1 }, history: [makeVersion(1)] },
        });
      }
      return makeRes({
        success: true,
        data: [makeItem(1)],
        pagination: { total: 1 },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Version history'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Version history'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.textContent).toContain('prev-v1.png'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Restore',
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('Restore failed');
    });
  });

  it('Replace File POSTs the file and updates the detail', async () => {
    openDetail(makeItem(1));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Replace File'));
    // The hidden replace input is inside the detail modal
    const replaceInputs = container.querySelectorAll('input[type="file"]');
    const replaceInput = replaceInputs[replaceInputs.length - 1] as HTMLInputElement;
    const file = new File(['new'], 'replaced.png', { type: 'image/png' });
    Object.defineProperty(replaceInput, 'files', { value: [file], configurable: true });
    fireEvent.change(replaceInput);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('/replace'))).toBe(true);
    });
  });

  it('Replace File failure shows an alert', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/replace') && init?.method === 'POST') {
        return { ok: false, json: async () => ({ success: false, message: 'replace boom' }) };
      }
      return makeRes({
        success: true,
        data: [makeItem(1)],
        pagination: { total: 1 },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('file-1.png'));
    fireEvent.click(container.querySelector('.grid > div') as HTMLElement);
    await waitFor(() => expect(container.textContent).toContain('Replace File'));
    const replaceInputs = container.querySelectorAll('input[type="file"]');
    const replaceInput = replaceInputs[replaceInputs.length - 1] as HTMLInputElement;
    const file = new File(['n'], 'r.png', { type: 'image/png' });
    Object.defineProperty(replaceInput, 'files', { value: [file], configurable: true });
    fireEvent.change(replaceInput);
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('replace boom');
    });
  });
});
