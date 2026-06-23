'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Slim top-of-page loading bar shown during client-side route changes on public
 * sites. App Router has no global "navigation started" event, so we detect the
 * start by intercepting clicks on same-origin <a> links (covers nav links,
 * in-content links, and CTAs) and finish when usePathname() changes. Content
 * stays visible the whole time (unlike a route-segment loading.tsx, which blanks
 * the page). Dependency-free; brand-colored.
 */
export function SiteRouteProgress({ color = '#cfa122' }: { color?: string }) {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedFor = useRef<string | null>(null);

  function clearTimers() {
    if (trickle.current) { clearInterval(trickle.current); trickle.current = null; }
    if (safety.current) { clearTimeout(safety.current); safety.current = null; }
  }

  function start() {
    clearTimers();
    setVisible(true);
    setProgress(8);
    // Ease toward 90% while the next route renders.
    trickle.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(0.4, (90 - p) * 0.06) : p));
    }, 180);
    // Safety: if a navigation is cancelled / lands on the same path, don't hang.
    safety.current = setTimeout(() => finish(), 10000);
  }

  function finish() {
    clearTimers();
    setProgress(100);
    setTimeout(() => { setVisible(false); setProgress(0); }, 280);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      let url: URL;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      startedFor.current = url.pathname;
      start();
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Finish when the route actually changes (skip the initial mount).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => () => clearTimers(), []);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: 3,
        zIndex: 99999,
        width: `${progress}%`,
        background: color,
        boxShadow: `0 0 10px ${color}, 0 0 4px ${color}`,
        opacity: visible ? 1 : 0,
        transition:
          progress >= 100
            ? 'width 0.2s ease, opacity 0.45s ease 0.2s'
            : 'width 0.2s ease, opacity 0.15s ease',
        pointerEvents: 'none',
        borderRadius: '0 2px 2px 0',
      }}
    />
  );
}
