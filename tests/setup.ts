import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// testing-library's async helpers (waitFor, findBy*) have their OWN timeout,
// defaulting to 1000ms and completely independent of vitest's `testTimeout`.
// Raising testTimeout to 30s (see vitest.config.ts) therefore did nothing for
// this class of failure: a heavy jsdom component gets 30s from vitest and 1s
// from waitFor, and on a loaded CI runner the second one is what runs out.
//
// The symptom is a nondeterministic red on a DIFFERENT spec each run — three
// consecutive CI runs failed shard 1, nothing, then shard 3, on unrelated
// component tests that all pass in isolation. Each false red costs a full suite
// re-run, so this is one of the more expensive kinds of slow.
//
// 5s is margin for a slow render, not cover for a broken one: a component that
// never renders still fails, just 4s later.
configure({ asyncUtilTimeout: 5_000 });

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
    // Must be a real class/function constructor — vi.fn().mockImplementation(arrow)
    // produces an arrow that throws "is not a constructor" when a component calls
    // `new ResizeObserver(callback)` (e.g. MarqueeBlockRender's vertical-scroll measurement).
    window.ResizeObserver = class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(_callback: ResizeObserverCallback) {}
    } as unknown as typeof window.ResizeObserver;
  }
  if (!window.IntersectionObserver) {
    // Must be a real class/function constructor — vi.fn().mockImplementation(arrow)
    // produces an arrow that throws "is not a constructor" when next/link calls
    // `new IntersectionObserver(callback)` inside use-intersection.tsx.
    window.IntersectionObserver = class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => [] as IntersectionObserverEntry[]);
      constructor(
        _callback: IntersectionObserverCallback,
        _options?: IntersectionObserverInit,
      ) {}
    } as unknown as typeof window.IntersectionObserver;
  }
  if (!window.scrollTo) {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  }
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
