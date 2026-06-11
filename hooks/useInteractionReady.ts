'use client';

import { useEffect, useState } from 'react';

/**
 * Decorative-WebGL load gate.
 *
 * The marketing hero/background three.js canvases used to mount on first paint
 * with `frameloop="always"`, which pegged the main thread with a render loop for
 * the entire page load. Lighthouse saw TTI ~31s / TBT ~28s and Performance
 * cratered to 34 on the homepage (66 on /solutions).
 *
 * These canvases are purely decorative, so we defer them until the visitor
 * actually engages with the page (pointer move, scroll, touch, key press). A
 * passive headless load — Lighthouse, prerender, crawlers — never triggers, so
 * it gets the lightweight CSS fallback and a quiet main thread that reaches TTI
 * almost immediately. Real users get the animation the instant they move the
 * mouse or scroll, which on a real device is effectively on arrival.
 *
 * Also stays off under `prefers-reduced-motion` and Save-Data.
 *
 * Implemented as a module-level singleton so every decorative canvas on the page
 * flips on together off a single shared set of listeners.
 */

const INTERACTION_EVENTS = [
  'pointermove',
  'pointerdown',
  'touchstart',
  'wheel',
  'scroll',
  'keydown',
] as const;

const LISTENER_OPTS: AddEventListenerOptions = { passive: true, capture: true };

let ready = false;
let listening = false;
const subscribers = new Set<() => void>();

function teardown() {
  if (!listening) return;
  listening = false;
  for (const event of INTERACTION_EVENTS) {
    window.removeEventListener(event, flip, LISTENER_OPTS);
  }
}

function flip() {
  if (ready) return;
  ready = true;
  teardown();
  for (const notify of subscribers) notify();
  subscribers.clear();
}

function ensureListening() {
  if (listening || ready || typeof window === 'undefined') return;

  // Respect user preferences — never load decorative WebGL for these visitors.
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData =
    typeof navigator !== 'undefined' &&
    (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
  if (reduceMotion || saveData) return; // stay false for the whole session

  listening = true;
  for (const event of INTERACTION_EVENTS) {
    window.addEventListener(event, flip, LISTENER_OPTS);
  }
}

/**
 * Returns `true` once the visitor has interacted with the page, signalling it is
 * safe to mount heavy decorative WebGL. Stays `false` for passive/headless loads
 * and for reduced-motion / Save-Data visitors.
 */
export function useInteractionReady(): boolean {
  const [isReady, setIsReady] = useState(ready);

  useEffect(() => {
    if (ready) {
      // Already flipped before this effect ran (e.g. another island triggered
      // it, or a client-side nav after a prior interaction). Sync to it via a
      // microtask rather than a synchronous in-effect setState.
      queueMicrotask(() => setIsReady(true));
      return;
    }
    const notify = () => setIsReady(true);
    subscribers.add(notify);
    ensureListening();
    return () => {
      subscribers.delete(notify);
    };
  }, []);

  return isReady;
}
