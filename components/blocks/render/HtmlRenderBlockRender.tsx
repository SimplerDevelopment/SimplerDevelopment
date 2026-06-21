'use client';

import { useEffect, useMemo, useRef } from 'react';
import { HtmlRenderBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { renderHtmlTemplate } from '@/lib/blocks/html-render-template';
import { useEditorModeContext } from '@/components/visual-editor/editor-mode-context';
import { sendToParent } from '@/lib/visual-editor/protocol';
import { IFRAME_MESSAGES } from '@/types/visual-editor';

interface HtmlRenderBlockRenderProps {
  block: HtmlRenderBlock;
}

export function HtmlRenderBlockRender({ block }: HtmlRenderBlockRenderProps) {
  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility
      )
    : '';

  const isContained = block.width === 'contained';
  const containerClass = isContained ? 'max-w-5xl mx-auto' : 'w-full';

  // Substitute `{{name}}` and `data-field` content from the block's saved
  // values. When fields/values are absent this is a no-op — legacy blocks
  // (raw HTML, no variables) render exactly as they did before.
  const rendered = useMemo(
    () => renderHtmlTemplate(block.html || '', block.fields, block.values),
    [block.html, block.fields, block.values],
  );

  if (!rendered) {
    return (
      <div className={responsiveClasses}>
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <span className="material-icons text-7xl text-muted-foreground/20 mb-4">code</span>
          <p className="text-muted-foreground">No HTML yet — paste markup in the block settings panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={responsiveClasses} data-block-id={block.id}>
      <div className={containerClass}>
        <InlineHtml html={rendered} blockId={block.id} />
      </div>
    </div>
  );
}

// Inlines arbitrary HTML into the parent DOM and re-creates each <script>
// element so the browser actually executes it (scripts that come in via
// dangerouslySetInnerHTML are inert by spec). Mirrors the inline branch of
// HtmlEmbedBlockRender so behavior is identical.
//
// In edit mode (visual editor iframe), it also wires every `[data-field]`
// element with `contenteditable="true"` and forwards input events to the
// parent so authors can type directly on the page. The parent receives them
// via the existing BLOCK_CONTENT_UPDATED channel and writes into the block's
// `values` map.
function InlineHtml({ html, blockId }: { html: string; blockId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const editor = useEditorModeContext();
  const isEditing = editor.active;
  // Suppress propagating local typing back through the next render — when the
  // parent echoes blocks back via BLOCKS_UPDATE the html prop changes, which
  // re-runs the wiring effect; without this, focus + caret jump back to start.
  const localEditRef = useRef(false);
  // Track the last html string we painted so we can skip DOM updates when
  // the content hasn't actually changed. React's dangerouslySetInnerHTML
  // can re-write innerHTML on cosmetic parent re-renders (hover toolbars,
  // selection chrome, etc.), which destroys nested DOM state including the
  // contenteditable attributes the user is mid-click-into. With this guard,
  // hover noise no longer thrashes the DOM and click-to-edit becomes stable.
  const lastHtmlRef = useRef<string | null>(null);
  // The html present at first render. We feed THIS (stable) value to
  // dangerouslySetInnerHTML so the content is server-rendered (in the initial
  // HTML — critical for LCP/CLS: an html-render hero must paint at first paint,
  // not after hydration). Because the ref value never changes, React writes the
  // innerHTML exactly once (SSR + hydration adopt it) and never re-manages it,
  // leaving all subsequent updates to the imperative path below — which
  // preserves the editor's contenteditable caret handling.
  const initialHtmlRef = useRef(html);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Re-create <script> tags so the browser actually executes them (scripts
    // present via SSR or innerHTML are inert by spec).
    const reviveScripts = () => {
      const scripts = Array.from(el.querySelectorAll('script'));
      for (const old of scripts) {
        const fresh = document.createElement('script');
        for (const { name, value } of Array.from(old.attributes)) {
          fresh.setAttribute(name, value);
        }
        if (old.textContent) fresh.textContent = old.textContent;
        old.replaceWith(fresh);
      }
    };
    if (lastHtmlRef.current === null) {
      // First mount: the content is ALREADY in the DOM from SSR
      // (dangerouslySetInnerHTML). Re-writing innerHTML here would destroy and
      // recreate the SSR subtree — re-painting the LCP element late and
      // shoving the page layout (CLS). Only revive the inert <script> tags.
      lastHtmlRef.current = html;
      reviveScripts();
      return;
    }
    // Subsequent genuine content changes (e.g. live edits): repaint imperatively
    // so React never clobbers contenteditable state mid-typing.
    if (lastHtmlRef.current !== html) {
      el.innerHTML = html;
      lastHtmlRef.current = html;
      reviveScripts();
    }
  }, [html]);

  // Wire up inline editing for every `[data-field]` element in the block.
  // Re-runs whenever the rendered HTML changes (which happens on parent echo
  // back); we restore caret position only when the change originated locally.
  useEffect(() => {
    const el = ref.current;
    if (!el || !isEditing) return;

    const targets = Array.from(el.querySelectorAll<HTMLElement>('[data-field]'));
    if (targets.length === 0) return;

    const debouncers = new Map<string, ReturnType<typeof setTimeout>>();
    const cleanups: Array<() => void> = [];

    for (const target of targets) {
      const fieldName = target.dataset.field || '';
      if (!fieldName) continue;

      // Skip data-fields inside a dynamic loop item — those are populated
      // from a fetched post, not the block's own values. Editing them would
      // write to a phantom path that resolves to nothing.
      if (target.closest('[data-loop-item]')) continue;

      // Resolve the field path. Three nesting contexts:
      //   - inside `data-repeat-item="name:index"` → `name.index.fieldName`
      //   - inside `data-group-item="name"`        → `name.fieldName`
      //   - top-level                              → `fieldName`
      // Repeat wins over group when both are present (a group nested inside
      // an array isn't supported today; the array path is the addressable one).
      const repeatAncestor = target.closest('[data-repeat-item]') as HTMLElement | null;
      const groupAncestor = repeatAncestor ? null : (target.closest('[data-group-item]') as HTMLElement | null);
      const fieldPath = repeatAncestor
        ? `${(repeatAncestor.dataset.repeatItem || '').replace(':', '.')}.${fieldName}`
        : groupAncestor
          ? `${groupAncestor.dataset.groupItem}.${fieldName}`
          : fieldName;

      target.setAttribute('contenteditable', 'true');
      target.classList.add('sd-field-editable');

      const onInput = () => {
        localEditRef.current = true;
        // Debounce 300ms so we don't flood the parent during typing
        const existing = debouncers.get(fieldPath);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          sendToParent(IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED, {
            blockId,
            field: fieldPath,
            value: target.innerHTML,
          });
        }, 300);
        debouncers.set(fieldPath, timer);
      };

      // Strip styles + scripts on paste so authors can't paste a Word doc that
      // ships with `<style>` blocks or `<span style="...">` everywhere.
      const onPaste = (e: ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/html') || e.clipboardData?.getData('text/plain') || '';
        const cleaned = sanitizeForRichText(text);
        document.execCommand('insertHTML', false, cleaned);
      };

      target.addEventListener('input', onInput);
      target.addEventListener('paste', onPaste);
      cleanups.push(() => {
        target.removeEventListener('input', onInput);
        target.removeEventListener('paste', onPaste);
        // Intentionally DO NOT removeAttribute('contenteditable') here.
        // The useEffect re-fires on every parent re-render (the `html`
        // string is regenerated by renderHtmlTemplate each render and the
        // dep comparison can see a new identity). Stripping contenteditable
        // during the micro-window between cleanup and re-attach turns the
        // user's in-flight click into a click on a non-editable element,
        // breaking click-to-edit. If the underlying element is actually
        // replaced (by dangerouslySetInnerHTML), it's already gone from
        // the DOM and our attribute removal is moot.
      });
    }

    return () => {
      for (const t of debouncers.values()) clearTimeout(t);
      for (const c of cleanups) c();
    };
  }, [html, isEditing, blockId]);

  // Reset the local-edit flag after the next render so external updates work
  useEffect(() => {
    localEditRef.current = false;
  }, [html]);

  // Click-to-swap on `<img data-field-image="X">` elements. Posts a
  // REQUEST_IMAGE_PICKER to the parent — parent opens a MediaPicker modal
  // targeting the field path; the picker writes back through the same
  // BLOCK_CONTENT_UPDATED channel as text edits.
  useEffect(() => {
    const el = ref.current;
    if (!el || !isEditing) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>('img[data-field-image]'));
    if (targets.length === 0) return;
    const cleanups: Array<() => void> = [];
    for (const target of targets) {
      const baseName = target.dataset.fieldImage || '';
      if (!baseName) continue;
      // Skip images inside a dynamic loop iteration — same reason as text
      // edits: their src came from a fetched post, not block values.
      if (target.closest('[data-loop-item]')) continue;
      // Resolve the field path. baseName is whatever placeholder fed the
      // `<img src="{{X}}">` (`annotateImageFields` snapshots it before
      // expansion), so it can already be a dotted path like "cta.image" or
      // "stats.value".
      //   - inside `data-repeat-item="name:index"`: inject the index between
      //     the array name and the rest, e.g. "stats.value" + "stats:2"
      //     → "stats.2.value". If the dotted prefix doesn't match the array
      //     name (unusual), fall back to baseName as-is.
      //   - inside `data-group-item="name"` or at top level: baseName already
      //     carries the right path; using it verbatim avoids "cta.cta.image".
      const repeatAncestor = target.closest('[data-repeat-item]') as HTMLElement | null;
      let fieldPath: string;
      if (repeatAncestor) {
        const [name, idx] = (repeatAncestor.dataset.repeatItem || '').split(':');
        fieldPath = baseName.startsWith(name + '.')
          ? `${name}.${idx}.${baseName.slice(name.length + 1)}`
          : baseName;
      } else {
        fieldPath = baseName;
      }

      target.style.cursor = 'pointer';
      target.classList.add('sd-image-editable');
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        sendToParent(IFRAME_MESSAGES.REQUEST_IMAGE_PICKER, {
          blockId,
          field: fieldPath,
          currentValue: target.getAttribute('src') || '',
        });
      };
      target.addEventListener('click', onClick);
      cleanups.push(() => {
        target.removeEventListener('click', onClick);
        target.style.cursor = '';
        target.classList.remove('sd-image-editable');
      });
    }
    return () => { for (const c of cleanups) c(); };
  }, [html, isEditing, blockId]);

  // Server-render the initial content (stable ref → React writes it once, then
  // the imperative useEffect above owns all updates). This makes html-render
  // blocks paint at first paint (huge for LCP/CLS) instead of after hydration.
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: initialHtmlRef.current }} />;
}

// Strip everything except a small allow-list of formatting tags so pasted
// content from Word/Google Docs doesn't pollute the document with inline
// styles, classes, or fonts.
function sanitizeForRichText(html: string): string {
  if (typeof window === 'undefined') return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'A', 'BR', 'P', 'UL', 'OL', 'LI', 'SPAN']);
  walk(tmp);
  return tmp.innerHTML;

  function walk(node: Node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!allowed.has(el.tagName)) {
          // Replace disallowed element with its text content
          const text = document.createTextNode(el.textContent || '');
          el.replaceWith(text);
        } else {
          // Strip every attribute except `href` on anchors
          const attrs = Array.from(el.attributes);
          for (const a of attrs) {
            if (el.tagName === 'A' && a.name === 'href') continue;
            el.removeAttribute(a.name);
          }
          walk(el);
        }
      } else if (child.nodeType !== Node.TEXT_NODE) {
        // Drop comments, processing instructions, etc.
        child.parentNode?.removeChild(child);
      }
    }
  }
}
