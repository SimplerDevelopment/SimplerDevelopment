'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { AiImageStyle } from '@/lib/designer/aiPromptBuilder';
import type { UploadedImageResult } from '@/lib/designer/types';

interface AiImageModalProps {
  open: boolean;
  onClose: () => void;
  /** Caller-supplied generator. Resolves with the public URL + dimensions
   *  of the freshly-uploaded image. Rejects with a message we show inline. */
  onGenerate: (req: {
    prompt: string;
    style: AiImageStyle;
    transparent: boolean;
  }) => Promise<UploadedImageResult>;
  /** Called after the generated image is fully placed on the canvas. */
  onPlaced?: () => void;
}

const STYLE_OPTIONS: Array<{
  value: AiImageStyle;
  label: string;
  hint: string;
}> = [
  {
    value: 'illustration',
    label: 'Illustration',
    hint: 'Flat vector, strong outlines — safest for screen / DTG printing',
  },
  {
    value: 'graphic',
    label: 'Graphic',
    hint: 'Bold poster look, limited palette',
  },
  { value: 'photo', label: 'Photo', hint: 'Realistic photo, isolated subject' },
  { value: 'auto', label: 'Raw', hint: "Pass my prompt through as-written" },
];

const EXAMPLE_PROMPTS = [
  'a happy corgi wearing a chef hat',
  'a vintage motorcycle silhouette at sunset',
  'a single white pine tree',
  'a smiling avocado holding a microphone',
];

/**
 * Modal that takes a casual prompt + style preset and asks the server to
 * generate a print-ready PNG via `POST .../ai-image`. The server applies
 * the print-optimised prompt prefix and (when transparent is on) requests
 * a transparent background from the model so the result drops cleanly
 * onto any shirt colour.
 */
export default function AiImageModal({
  open,
  onClose,
  onGenerate,
  onPlaced,
}: AiImageModalProps) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<AiImageStyle>('illustration');
  const [transparent, setTransparent] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = window.setTimeout(() => promptRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // Lock body scroll while open — matches PreviewModal.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Describe the image you want to generate.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await onGenerate({ prompt: trimmed, style, transparent });
      onPlaced?.();
      // Clear + close so the customer can immediately start positioning the
      // new layer. Their prompt is intentionally discarded — a fresh idea
      // for the next generation, not a copy-pasteable history.
      setPrompt('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate image');
    } finally {
      setGenerating(false);
    }
  }, [prompt, style, transparent, onGenerate, onPlaced, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  // Portal to document.body so the `fixed` positioning isn't trapped
  // inside the sidebar's transformed containing block (the mobile slide-in
  // drawer uses `transform`, which turns `fixed` into "fixed relative to
  // that element"). Without the portal the modal renders inside the
  // 320 px sidebar instead of as a centred overlay.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generate AI image"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={generating ? undefined : onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-background border border-border shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-primary">
                auto_awesome
              </span>
              Generate AI image
            </h2>
            <p className="text-xs text-muted-foreground">
              Describe what you want — we&apos;ll create a print-ready PNG and
              drop it on your canvas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            aria-label="Close"
            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label
              htmlFor="ai-image-prompt"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Describe your image
            </label>
            <textarea
              id="ai-image-prompt"
              ref={promptRef}
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={1000}
              disabled={generating}
              placeholder="e.g. a happy corgi wearing a chef hat"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleGenerate();
                }
              }}
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Cmd / Ctrl + Enter to generate</span>
              <span>{prompt.length}/1000</span>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-foreground mb-1">
              Style
            </span>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map((opt) => {
                const active = style === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStyle(opt.value)}
                    disabled={generating}
                    className={`text-left px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                    title={opt.hint}
                  >
                    <span className="block font-medium">{opt.label}</span>
                    <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5">
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="inline-flex items-start gap-2 text-sm text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              disabled={generating}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Transparent background</span>
              <span className="block text-[11px] text-muted-foreground">
                Recommended for printing on apparel — the model returns a
                cleanly cut-out PNG that sits over the shirt colour.
              </span>
            </span>
          </label>

          {!prompt.trim() && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Try one of these
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    disabled={generating}
                    className="text-[11px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 px-3 py-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs"
            >
              <span className="material-icons text-sm mt-px">error_outline</span>
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20">
          <span className="text-[11px] text-muted-foreground leading-snug">
            {generating
              ? 'Generating — this can take 15–30 seconds…'
              : 'Generation is metered against this site’s AI quota.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating || !prompt.trim()}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {generating ? (
                <>
                  <span className="material-icons text-base animate-spin">
                    refresh
                  </span>
                  Generating…
                </>
              ) : (
                <>
                  <span className="material-icons text-base">auto_awesome</span>
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
