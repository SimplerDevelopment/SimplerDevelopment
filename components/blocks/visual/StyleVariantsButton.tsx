'use client';

/**
 * "Try other styles" button + modal for the AI Style Picker.
 *
 * Renders a single button that, when clicked, opens a modal showing 3 AI-
 * generated style variants of the selected block. Each variant previews live
 * (using the block's actual render component with the variant's propsDelta
 * merged in). User clicks Apply on a variant → propsDelta is pushed to the
 * editor's normal update pipeline (so the undo stack records it).
 *
 * MVP: hero blocks only. The button hides itself for unsupported block types.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Block, BlockStyle, HeroBlock } from '@/types/blocks';
import { hasStyleSurface } from '@/lib/ai/style-variants/style-surface';
import { HeroBlockRender } from '@/components/blocks/render/HeroBlockRender';

export interface StyleVariantsButtonProps {
  block: Block;
  siteId: number;
  /** Called with a propsDelta when the user picks a variant. */
  onApply: (propsDelta: { style?: Partial<BlockStyle>; elementStyles?: Record<string, Partial<BlockStyle>> }) => void;
}

interface VariantResponse {
  philosophyId: string;
  label: string;
  rationale: string;
  propsDelta: {
    style?: Partial<BlockStyle>;
    elementStyles?: Record<string, Partial<BlockStyle>>;
  };
}

interface PhilosophyResponse {
  id: string;
  label: string;
  blurb: string;
}

export function StyleVariantsButton({ block, siteId, onApply }: StyleVariantsButtonProps) {
  const [open, setOpen] = useState(false);
  if (!hasStyleSurface(block.type)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full mb-4 inline-flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
      >
        <span className="material-icons text-base">auto_fix_high</span>
        Try other styles
      </button>
      {open && (
        <StyleVariantsModal
          block={block}
          siteId={siteId}
          onClose={() => setOpen(false)}
          onApply={(delta) => {
            onApply(delta);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface ModalProps {
  block: Block;
  siteId: number;
  onClose: () => void;
  onApply: (propsDelta: VariantResponse['propsDelta']) => void;
}

function StyleVariantsModal({ block, siteId, onClose, onApply }: ModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantResponse[]>([]);
  const [philosophies, setPhilosophies] = useState<PhilosophyResponse[]>([]);
  const [exploreOutsideBrand, setExploreOutsideBrand] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchVariants = useCallback(async (explore: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/cms/websites/${siteId}/blocks/restyle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block, exploreOutsideBrand: explore }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || `Request failed (${res.status})`);
      }
      setVariants(json.data.variants || []);
      setPhilosophies(json.data.philosophies || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate variants');
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [block, siteId]);

  // Initial fetch on mount
  useEffect(() => {
    void Promise.resolve().then(() => fetchVariants(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onToggleExplore = (next: boolean) => {
    setExploreOutsideBrand(next);
    void fetchVariants(next);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-background border border-border rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="material-icons text-primary">auto_fix_high</span>
              Try other styles
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-generated variants of this {block.type}. Click one to apply — your content stays the same.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
              <input
                type="checkbox"
                checked={exploreOutsideBrand}
                onChange={(e) => onToggleExplore(e.target.checked)}
                disabled={loading}
                className="rounded"
              />
              Explore outside brand
            </label>
            <button
              type="button"
              onClick={() => void fetchVariants(exploreOutsideBrand)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              <span className="material-icons text-sm">refresh</span>
              Regenerate
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <span className="material-icons">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && variants.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-center">
              <div>
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-solid border-primary border-r-transparent mb-4" />
                <p className="text-sm text-muted-foreground">Generating three style directions…</p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <p className="font-medium mb-1">Could not generate variants</p>
              <p className="text-xs opacity-90">{error}</p>
              <button
                type="button"
                onClick={() => void fetchVariants(exploreOutsideBrand)}
                className="mt-3 inline-flex items-center gap-1 rounded border border-destructive/40 px-2.5 py-1 text-xs hover:bg-destructive/10"
              >
                <span className="material-icons text-xs">refresh</span> Try again
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {variants.map((variant, i) => (
                <VariantCard
                  key={`${variant.philosophyId}-${i}`}
                  block={block}
                  variant={variant}
                  philosophy={philosophies.find((p) => p.id === variant.philosophyId)}
                  loading={loading}
                  onApply={() => onApply(variant.propsDelta)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Variant card with live preview ──────────────────────────────────────────

interface VariantCardProps {
  block: Block;
  variant: VariantResponse;
  philosophy?: PhilosophyResponse;
  loading: boolean;
  onApply: () => void;
}

function VariantCard({ block, variant, philosophy, loading, onApply }: VariantCardProps) {
  const previewBlock = useMemo<Block>(() => {
    const merged: Block = {
      ...block,
      style: { ...(block.style ?? {}), ...(variant.propsDelta.style ?? {}) },
      elementStyles: mergeElementStyles(block.elementStyles, variant.propsDelta.elementStyles),
    };
    return merged;
  }, [block, variant]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      {/* Preview frame — scaled-down render of the block with variant applied */}
      <div className="relative bg-muted/30 overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{ width: '1280px', height: '720px', transform: 'scale(0.31)' }}
        >
          {block.type === 'hero' ? (
            <HeroBlockRender block={previewBlock as HeroBlock} />
          ) : (
            <div className="p-8 text-sm text-muted-foreground">
              Preview not available for this block type yet.
            </div>
          )}
        </div>
      </div>

      {/* Meta + apply */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold text-sm">{variant.label}</h3>
          {philosophy && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {philosophy.id}
            </span>
          )}
        </div>
        {variant.rationale && (
          <p className="text-xs text-muted-foreground line-clamp-3">{variant.rationale}</p>
        )}
        <button
          type="button"
          onClick={onApply}
          disabled={loading}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <span className="material-icons text-base">check</span>
          Apply this style
        </button>
      </div>
    </div>
  );
}

function mergeElementStyles(
  base: Block['elementStyles'],
  delta: VariantResponse['propsDelta']['elementStyles'],
): Block['elementStyles'] {
  if (!delta) return base;
  const out: Record<string, Partial<BlockStyle>> = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(delta)) {
    out[k] = { ...(out[k] ?? {}), ...v };
  }
  return out;
}
