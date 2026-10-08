'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';

// Client-only pieces of SiteBlockRenderer. SiteBlockRenderer itself is a SERVER
// component (PUX-241) so that its page-level work — collecting Google Fonts from
// the block tree, which pulls in lib/blocks/page-fonts → html-render-template →
// the sanitize-html stack (postcss + htmlparser2 + entities, ~170 KB raw) — runs
// on the server only instead of being shipped to every visitor for a computation
// whose result is just SSR'd <link>/<style> markup. What genuinely needs the
// browser lives here.

// The editor renderer (~40KB + the full editing UI) only renders when
// `?_edit=true`. Lazy-load it (client-only) so visitors never download it.
const EditableBlockRenderer = dynamic(
  () => import('./EditableBlockRenderer').then((m) => m.EditableBlockRenderer),
  { ssr: false },
);

// The editor provider pulls in `useEditorMode` → the full block registry (all 64
// renderers) + dnd-kit. Lazy-load it (client-only) alongside
// EditableBlockRenderer so visitors never download it.
const EditorModeProvider = dynamic(
  () => import('@/components/visual-editor/EditorModeProvider').then((m) => m.EditorModeProvider),
  { ssr: false },
);

/** The visual-editor iframe's renderer (`?_edit=true`). */
export function SiteEditRenderer({ content }: { content: string }) {
  return (
    <EditorModeProvider>
      <EditableBlockRenderer content={content} />
    </EditorModeProvider>
  );
}

// Fires once the client has committed the block tree (effects run after the
// hydration commit), telling the gated custom-JS layers it is safe to mutate
// block DOM. See jsWrapper in SiteBlockRenderer for why this matters.
export function HydrationSignal() {
  useEffect(() => {
    const w = window as unknown as { __sdSiteHydrated?: boolean };
    w.__sdSiteHydrated = true;
    document.dispatchEvent(new Event('sd:hydrated'));
  }, []);
  return null;
}
