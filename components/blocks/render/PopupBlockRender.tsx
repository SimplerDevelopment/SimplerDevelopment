'use client';

// PopupBlock — fixed-position modal that triggers per the configured behavior.
//
// Frequency persistence is keyed by `popup-shown:<block.id>` in localStorage:
//   - 'always'           → no key written, popup triggers every visit
//   - 'once-per-session' → key written under sessionStorage (cleared on tab close)
//   - 'once-per-week'    → key written under localStorage with `expiresAt` ms
//
// Exit-intent fires when the cursor crosses the top edge of the viewport
// (mouseleave on document.documentElement with clientY <= 0). This only
// works on pointer devices — mobile browsers will never fire it. Authors who
// want a mobile-friendly trigger should pick 'time-delay' or 'scroll-percent'
// instead.
//
// CTA: pure link. We render an <a> with `rel="noopener noreferrer"` and
// `target="_blank"` when the URL looks external. Click does NOT capture form
// submissions — that's a future step.

import { useEffect, useRef, useState } from 'react';
import type { PopupBlock } from '@/types/blocks';

interface PopupBlockRenderProps {
  block: PopupBlock;
}

const STORAGE_KEY_PREFIX = 'sd2026:popup-shown:';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function readSeen(blockId: string, frequency: PopupBlock['frequency']): boolean {
  if (typeof window === 'undefined' || !blockId) return false;
  if (frequency === 'always') return false;
  const key = STORAGE_KEY_PREFIX + blockId;
  try {
    if (frequency === 'once-per-session') {
      return window.sessionStorage.getItem(key) !== null;
    }
    if (frequency === 'once-per-week') {
      const raw = window.localStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { expiresAt: number };
      if (typeof parsed?.expiresAt !== 'number') return false;
      if (parsed.expiresAt < Date.now()) {
        window.localStorage.removeItem(key);
        return false;
      }
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function writeSeen(blockId: string, frequency: PopupBlock['frequency']): void {
  if (typeof window === 'undefined' || !blockId) return;
  if (frequency === 'always') return;
  const key = STORAGE_KEY_PREFIX + blockId;
  try {
    if (frequency === 'once-per-session') {
      window.sessionStorage.setItem(key, '1');
    } else if (frequency === 'once-per-week') {
      window.localStorage.setItem(
        key,
        JSON.stringify({ expiresAt: Date.now() + ONE_WEEK_MS }),
      );
    }
  } catch {
    /* noop — Safari private mode etc. */
  }
}

function isExternalUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return false;
  return /^https?:\/\//i.test(url);
}

export function PopupBlockRender({ block }: PopupBlockRenderProps) {
  const {
    trigger = 'page-load',
    delaySeconds = 5,
    scrollPercent = 50,
    frequency = 'once-per-session',
    headline,
    body,
    ctaLabel,
    ctaUrl,
    dismissable = true,
  } = block;

  const [open, setOpen] = useState(false);
  const armedRef = useRef(false);

  useEffect(() => {
    // Skip rendering during SSR / when frequency cap already hit.
    if (readSeen(block.id, frequency)) return;
    if (armedRef.current) return;
    armedRef.current = true;

    const show = () => {
      if (readSeen(block.id, frequency)) return;
      setOpen(true);
      writeSeen(block.id, frequency);
    };

    let cleanup: (() => void) | undefined;

    if (trigger === 'page-load') {
      // Defer one tick so the popup doesn't flash before paint settles.
      const t = window.setTimeout(show, 50);
      cleanup = () => window.clearTimeout(t);
    } else if (trigger === 'time-delay') {
      const t = window.setTimeout(show, Math.max(0, delaySeconds) * 1000);
      cleanup = () => window.clearTimeout(t);
    } else if (trigger === 'scroll-percent') {
      const handler = () => {
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - doc.clientHeight;
        if (scrollable <= 0) return;
        const pct = (window.scrollY / scrollable) * 100;
        if (pct >= scrollPercent) {
          window.removeEventListener('scroll', handler);
          show();
        }
      };
      window.addEventListener('scroll', handler, { passive: true });
      cleanup = () => window.removeEventListener('scroll', handler);
    } else if (trigger === 'exit-intent') {
      const handler = (e: MouseEvent) => {
        // Mouse left the viewport from the top.
        if (e.clientY <= 0) {
          document.documentElement.removeEventListener('mouseleave', handler);
          show();
        }
      };
      document.documentElement.addEventListener('mouseleave', handler);
      cleanup = () => document.documentElement.removeEventListener('mouseleave', handler);
    }

    return cleanup;
  }, [block.id, trigger, delaySeconds, scrollPercent, frequency]);

  // Esc-to-close, only when dismissable.
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissable]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`popup-${block.id}-title`}
      data-popup-block-id={block.id}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
      onClick={dismissable ? () => setOpen(false) : undefined}
    >
      <div
        className="relative bg-background text-foreground rounded-lg shadow-xl max-w-lg w-full p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {dismissable && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <span className="material-icons text-base">close</span>
          </button>
        )}
        <h2
          id={`popup-${block.id}-title`}
          className="text-2xl font-semibold mb-3"
        >
          {headline}
        </h2>
        {body && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none mb-5"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        )}
        {ctaLabel && ctaUrl && (
          <a
            href={ctaUrl}
            target={isExternalUrl(ctaUrl) ? '_blank' : undefined}
            rel={isExternalUrl(ctaUrl) ? 'noopener noreferrer' : undefined}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            {ctaLabel}
            <span className="material-icons text-base">arrow_forward</span>
          </a>
        )}
      </div>
    </div>
  );
}
