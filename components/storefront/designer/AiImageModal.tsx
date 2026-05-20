'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { AiImageStyle } from '@/lib/designer/aiPromptBuilder';
import {
  listAiPromptHistory,
  recordAiPrompt,
  type AiPromptHistoryEntry,
} from '@/lib/designer/aiPromptHistory';
import type { UploadedImageResult } from '@/lib/designer/types';

export interface AiImageModalRequest {
  prompt: string;
  style: AiImageStyle;
  transparent: boolean;
  n: number;
}

interface AiImageModalProps {
  open: boolean;
  onClose: () => void;
  /** Generates N variants. Returns the array of public URLs + dimensions
   *  so the modal can render a picker when N > 1. Rejects with a message
   *  we show inline. */
  onGenerate: (
    req: AiImageModalRequest,
  ) => Promise<{ variants: UploadedImageResult[] }>;
  /** Applies a chosen variant to the canvas (adds new layer or replaces
   *  the regenerate target). Modal calls this with whichever variant the
   *  customer picks; for N=1 it auto-picks. */
  onPick: (
    variant: UploadedImageResult,
    req: AiImageModalRequest,
  ) => Promise<void>;
  /** Pre-fill the form when re-opening in regenerate mode. */
  prefill?: {
    prompt: string;
    style: AiImageStyle;
    transparent: boolean;
  };
  /** When set, the modal flips its CTA to "Regenerate" and clarifies the
   *  intent (the DesignerShell side replaces the existing layer rather
   *  than adding a new one). The value is just a label for copy. */
  regenerateLayerName?: string;
}

const VARIATIONS_OPTIONS: Array<{
  value: number;
  label: string;
  hint: string;
}> = [
  { value: 1, label: '1', hint: 'Fastest, lowest cost' },
  { value: 2, label: '2', hint: 'Two takes — pick your favourite' },
  { value: 4, label: '4', hint: 'Four takes — best for hard prompts' },
];

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
  onPick,
  prefill,
  regenerateLayerName,
}: AiImageModalProps) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<AiImageStyle>('illustration');
  const [transparent, setTransparent] = useState(true);
  const [n, setN] = useState<number>(1);
  const [generating, setGenerating] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [variants, setVariants] = useState<UploadedImageResult[]>([]);
  const [lastRequest, setLastRequest] = useState<AiImageModalRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AiPromptHistoryEntry[]>([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const isRegenerate = Boolean(regenerateLayerName);
  const inPicker = variants.length > 1;

  useEffect(() => {
    if (!open) return;
    setError(null);
    // Drop any cached variants from a previous open so the picker doesn't
    // flash before the new generate kicks off.
    setVariants([]);
    setLastRequest(null);
    // Re-read recent prompts on each open so the list reflects history
    // entries written during the same session by other generations.
    setHistory(listAiPromptHistory());
    // Apply prefill on each open so a second "Regenerate" reseeds the form
    // even if the customer cancelled the first attempt with tweaked values.
    if (prefill) {
      setPrompt(prefill.prompt);
      setStyle(prefill.style);
      setTransparent(prefill.transparent);
    }
    const t = window.setTimeout(() => {
      const el = promptRef.current;
      if (!el) return;
      el.focus();
      // Move caret to end when prefilled — feels less disruptive than a
      // full select-all that the customer has to clear before typing.
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // Some browsers throw on programmatic selection; ignore.
      }
    }, 30);
    return () => window.clearTimeout(t);
    // We intentionally re-run on every open even when prefill is unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const req: AiImageModalRequest = {
      prompt: trimmed,
      style,
      transparent,
      n,
    };
    try {
      const result = await onGenerate(req);
      if (!result.variants || result.variants.length === 0) {
        setError('Model returned no images.');
        return;
      }
      // Single-variant path: auto-pick and close, matching the original
      // n=1 behaviour. Multi-variant path: stage the variants and let the
      // customer pick one.
      if (result.variants.length === 1) {
        setPlacing(true);
        try {
          await onPick(result.variants[0], req);
          recordAiPrompt({
            prompt: req.prompt,
            style: req.style,
            transparent: req.transparent,
          });
          setPrompt('');
          onClose();
        } finally {
          setPlacing(false);
        }
      } else {
        setVariants(result.variants);
        setLastRequest(req);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate image');
    } finally {
      setGenerating(false);
    }
  }, [prompt, style, transparent, n, onGenerate, onPick, onClose]);

  const handlePick = useCallback(
    async (variant: UploadedImageResult) => {
      if (!lastRequest) return;
      setPlacing(true);
      setError(null);
      try {
        await onPick(variant, lastRequest);
        recordAiPrompt({
          prompt: lastRequest.prompt,
          style: lastRequest.style,
          transparent: lastRequest.transparent,
        });
        setPrompt('');
        setVariants([]);
        setLastRequest(null);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to place image');
      } finally {
        setPlacing(false);
      }
    },
    [lastRequest, onPick, onClose],
  );

  const handleBackToForm = useCallback(() => {
    setVariants([]);
    setLastRequest(null);
    setError(null);
  }, []);

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
                {isRegenerate ? 'refresh' : 'auto_awesome'}
              </span>
              {isRegenerate ? 'Regenerate AI image' : 'Generate AI image'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isRegenerate
                ? `Tweak the prompt or style and we'll replace ${regenerateLayerName} with a fresh render.`
                : "Describe what you want — we'll create a print-ready PNG and drop it on your canvas."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating || placing}
            aria-label="Close"
            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        {/* Form view — shown when no variants are waiting to be picked.
            Picker view (below) takes over once the customer has generated
            n > 1 variants and needs to choose one. */}
        {!inPicker && (
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

            {/* Variations selector — hidden in regenerate mode because the
                Regenerate flow replaces a single layer's image, so a picker
                wouldn't compose cleanly with "swap this layer's URL in place". */}
            {!isRegenerate && (
              <div>
                <span className="block text-xs font-medium text-foreground mb-1">
                  Variations
                </span>
                <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
                  {VARIATIONS_OPTIONS.map((opt) => {
                    const active = n === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setN(opt.value)}
                        disabled={generating}
                        title={opt.hint}
                        className={`px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-foreground hover:bg-muted'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  {n === 1
                    ? 'One render — fastest, lowest cost.'
                    : `Generates ${n} variants — pick your favourite. Each counts against today's image quota.`}
                </p>
              </div>
            )}

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

            {/* Recent prompts — only shown when the customer has actually
                generated something in a past session. Reapplies the full
                request (style + transparent) on click so they don't have
                to remember which preset they used last time. */}
            {history.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Recent
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((entry) => (
                    <button
                      key={`${entry.at}-${entry.prompt}`}
                      type="button"
                      onClick={() => {
                        setPrompt(entry.prompt);
                        setStyle(entry.style);
                        setTransparent(entry.transparent);
                      }}
                      disabled={generating}
                      title={entry.prompt}
                      className="text-[11px] max-w-[18rem] truncate px-2 py-1 rounded-full border border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10 disabled:opacity-50"
                    >
                      <span className="material-icons text-[12px] mr-0.5 align-text-bottom text-primary">
                        history
                      </span>
                      {entry.prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                <span className="material-icons text-sm mt-px">
                  error_outline
                </span>
                <span className="flex-1 leading-snug">{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Picker view — N variants laid out so the customer can tap the
            one they want. Clicking either confirms the pick (modal closes
            after onPick) or surfaces the placement error inline. */}
        {inPicker && (
          <div className="p-5 space-y-3">
            <p className="text-xs text-muted-foreground">
              Click the variant you want — the others are discarded. The
              chosen image becomes a layer on your canvas.
            </p>
            <div
              className={`grid gap-3 ${
                variants.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
              }`}
            >
              {variants.map((v, idx) => (
                <button
                  key={v.url}
                  type="button"
                  onClick={() => void handlePick(v)}
                  disabled={placing}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-white hover:border-primary transition disabled:opacity-50"
                  title={`Pick variant ${idx + 1}`}
                  aria-label={`Pick variant ${idx + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.url}
                    alt={`AI variant ${idx + 1}`}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                  <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/55 text-white font-mono">
                    {idx + 1}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center bg-primary/0 group-hover:bg-primary/10 transition" />
                </button>
              ))}
            </div>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 px-3 py-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs"
              >
                <span className="material-icons text-sm mt-px">
                  error_outline
                </span>
                <span className="flex-1 leading-snug">{error}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20">
          <span className="text-[11px] text-muted-foreground leading-snug">
            {generating
              ? n > 1
                ? `Generating ${n} variants — this can take 30–60 seconds…`
                : 'Generating — this can take 15–30 seconds…'
              : inPicker
                ? 'Click a variant above to place it on the canvas.'
                : 'Generation is metered against this site’s AI quota.'}
          </span>
          <div className="flex items-center gap-2">
            {inPicker ? (
              <>
                <button
                  type="button"
                  onClick={handleBackToForm}
                  disabled={placing}
                  className="px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted text-foreground disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={placing || generating}
                  className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                  title="Generate a fresh batch with the same prompt + style"
                >
                  <span className="material-icons text-base">refresh</span>
                  Regenerate batch
                </button>
              </>
            ) : (
              <>
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
                      {isRegenerate ? 'Regenerating…' : 'Generating…'}
                    </>
                  ) : (
                    <>
                      <span className="material-icons text-base">
                        {isRegenerate ? 'refresh' : 'auto_awesome'}
                      </span>
                      {isRegenerate ? 'Regenerate' : 'Generate'}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
