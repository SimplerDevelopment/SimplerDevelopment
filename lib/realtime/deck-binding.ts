/**
 * Bidirectional binding between the pitch-deck editor's React state
 * (`PitchDeckSlideV2[]`) and the Yjs `slides` Y.Array<Y.Map> in `doc-model.ts`.
 *
 * Public shape mirrors `lib/realtime/post-binding.ts` (Phase 2a). A consumer
 * calls `bindDeckToYjs(...)` once per editor mount, receives:
 *   - `applyLocalSlides(slides)` — push a local edit into the Y doc; tagged
 *     with origin `'local-deck'` so we ignore it on the way back.
 *   - `unbind()` — detach the observer and clear references.
 *
 * Initial seed:
 *   - If the Y array is empty (we're the first/only client), seed it with
 *     `initialSlides` so peers sync from us.
 *   - Otherwise the Y state is the authority — fire `onRemoteSlides` immediately
 *     so React state matches what the document already contains.
 *
 * Tradeoff: each local edit currently re-serializes the entire slides array
 * via `slidesToYArray` (wipe + push). This is consistent with the post-blocks
 * binding for v1 and gives us correct semantics at the cost of rewriting the
 * whole array on every keystroke. For pitch decks (typically 5–30 slides) this
 * is fine. A future refactor can do per-slide diffing.
 */

import * as Y from 'yjs';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import {
  getOrCreateSlidesArray,
  slidesToYArray,
  yArrayToSlides,
} from './doc-model';

/** Origin tag for transactions initiated by the local editor. */
const LOCAL_ORIGIN = 'local-deck';

export interface BindDeckToYjsOptions {
  ydoc: Y.Doc;
  initialSlides: PitchDeckSlideV2[];
  /** Called whenever the Y doc changes from a remote peer. */
  onRemoteSlides: (slides: PitchDeckSlideV2[]) => void;
}

export interface DeckBinding {
  /** Push a local change (full-array replace) into the Y doc. */
  applyLocalSlides: (slides: PitchDeckSlideV2[]) => void;
  /** Detach the observer. Idempotent. */
  unbind: () => void;
}

export function bindDeckToYjs(opts: BindDeckToYjsOptions): DeckBinding {
  const { ydoc, initialSlides, onRemoteSlides } = opts;
  const yArr = getOrCreateSlidesArray(ydoc);

  // Initial seed: empty Y → push our state; otherwise read Y as source of truth.
  if (yArr.length === 0 && initialSlides.length > 0) {
    ydoc.transact(() => {
      slidesToYArray(initialSlides, yArr);
    }, LOCAL_ORIGIN);
  } else if (yArr.length > 0) {
    // Y already has state — surface it to React immediately so the editor
    // displays the collaborative state on mount, not the stale fetch.
    try {
      onRemoteSlides(yArrayToSlides(yArr));
    } catch {
      // Defensive: never throw out of bind on an initial-sync read.
    }
  }

  // Deep observer: covers both top-level array changes (insert/delete/reorder)
  // and changes to individual slide Y.Maps (e.g. renaming a slide, editing
  // notes). Filter out our own transactions via the origin tag.
  let unbound = false;
  const handler = (
    _events: Array<Y.YEvent<Y.Array<Y.Map<unknown>> | Y.Map<unknown>>>,
    transaction: Y.Transaction
  ): void => {
    if (unbound) return;
    if (transaction.origin === LOCAL_ORIGIN) return;
    onRemoteSlides(yArrayToSlides(yArr));
  };
  yArr.observeDeep(handler);

  return {
    applyLocalSlides: (slides) => {
      if (unbound) return;
      ydoc.transact(() => {
        slidesToYArray(slides, yArr);
      }, LOCAL_ORIGIN);
    },
    unbind: () => {
      if (unbound) return;
      unbound = true;
      yArr.unobserveDeep(handler);
    },
  };
}
