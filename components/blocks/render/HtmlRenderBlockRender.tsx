'use client';

import { useEffect, useMemo, useRef } from 'react';
import { HtmlRenderBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { renderHtmlTemplate } from '@/lib/blocks/html-render-template';
import { useEditorModeContext } from '@/components/visual-editor/EditorModeProvider';
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scripts = Array.from(el.querySelectorAll('script'));
    for (const old of scripts) {
      const fresh = document.createElement('script');
      for (const { name, value } of Array.from(old.attributes)) {
        fresh.setAttribute(name, value);
      }
      if (old.textContent) fresh.textContent = old.textContent;
      old.replaceWith(fresh);
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

      // Detect array-item context. If this data-field lives inside a
      // `data-repeat-item="name:index"` element, the field-update path is
      // `name.index.subfield` so the parent writes into the array entry
      // instead of a top-level field. Top-level fields keep their bare name.
      const itemAncestor = target.closest('[data-repeat-item]') as HTMLElement | null;
      const itemPath = itemAncestor?.dataset.repeatItem || ''; // e.g. "stats:2"
      const fieldPath = itemPath
        ? `${itemPath.replace(':', '.')}.${fieldName}`
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
        target.removeAttribute('contenteditable');
        target.classList.remove('sd-field-editable');
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
      // Same item-context resolution as text edits: an img inside a
      // [data-repeat-item="stats:2"] writes to `stats.2.<baseName>`.
      const itemAncestor = target.closest('[data-repeat-item]') as HTMLElement | null;
      const itemPath = itemAncestor?.dataset.repeatItem || '';
      const fieldPath = itemPath
        ? `${itemPath.replace(':', '.')}.${baseName}`
        : baseName;

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

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
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
