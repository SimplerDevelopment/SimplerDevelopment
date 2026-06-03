import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom doesn't implement a handful of browser APIs that responsive hooks and
// the visual-editor / deck components rely on at render time. Provide inert
// stubs once, globally, so component tests don't throw on first render. Guarded
// so the node-environment (API) project is untouched and per-file mocks can
// still override. (Without matchMedia, ~150 component tests throw.)
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })) as unknown as typeof window.ResizeObserver;
  }
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(() => []),
    })) as unknown as typeof window.IntersectionObserver;
  }
  if (!window.scrollTo) {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  }
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
