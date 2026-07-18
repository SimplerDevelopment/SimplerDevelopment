'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface BuilderState {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
}

interface BoxShadowBuilderProps {
  /** Raw CSS box-shadow value, e.g. "0 4px 6px -1px rgba(0,0,0,0.1)" or "" for none. */
  value: string;
  onChange: (value: string) => void;
}

const DEFAULT_COLOR = 'rgba(0, 0, 0, 0.1)';
const DEFAULT_STATE: BuilderState = { x: 0, y: 4, blur: 6, spread: 0, color: DEFAULT_COLOR, inset: false };

// Matches a CSS length token (bare "0" or a signed number with an optional unit).
const LENGTH_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|%)?$/i;

/**
 * Split off the first comma-separated shadow segment, respecting parens so a
 * color function like rgba(0, 0, 0, 0.1) isn't mistaken for a shadow boundary.
 * Multi-shadow values (comma-separated) are common in legacy presets — only
 * the first shadow is parsed into the builder; re-emitting always produces a
 * single shadow (preserving every layer on emit is explicitly not required).
 */
function firstShadowSegment(css: string): string {
  let depth = 0;
  let buf = '';
  for (const ch of css) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) break;
    buf += ch;
  }
  return buf.trim();
}

/** Split a single shadow segment into whitespace-separated tokens, respecting parens. */
function tokenizeShadow(str: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (buf) {
        tokens.push(buf);
        buf = '';
      }
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function parseLength(tok: string): number {
  const m = tok.match(/^(-?\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Parse a CSS box-shadow value into structured builder state. Returns null for
 * empty/none (VEQA-023). Handles the legacy preset strings the old `<select>`
 * offered (single or comma-separated — only the first shadow is read) plus any
 * well-formed single shadow `[inset] x y blur spread color` in any token order
 * CSS allows (inset may lead or trail; color may be hex/named/rgb()/rgba()/
 * hsl()/hsla() and may itself contain spaces inside parens). Never throws —
 * falls back to zeroed lengths / the default color for anything it can't
 * confidently read, so a malformed value degrades gracefully instead of
 * blanking the panel.
 */
function parseBoxShadow(css: string): BuilderState | null {
  if (!css || !css.trim()) return null;
  const segment = firstShadowSegment(css);
  if (!segment) return null;

  let inset = false;
  const withoutInset = segment
    .replace(/\binset\b/i, () => {
      inset = true;
      return '';
    })
    .trim();

  const tokens = tokenizeShadow(withoutInset);
  const lengths: number[] = [];
  let color = '';
  for (const tok of tokens) {
    if (LENGTH_RE.test(tok)) {
      lengths.push(parseLength(tok));
    } else if (!color) {
      color = tok;
    }
  }

  return {
    x: lengths[0] ?? 0,
    y: lengths[1] ?? 0,
    blur: lengths[2] ?? 0,
    spread: lengths[3] ?? 0,
    color: color || DEFAULT_COLOR,
    inset,
  };
}

function buildBoxShadow(state: BuilderState): string {
  return `${state.inset ? 'inset ' : ''}${state.x}px ${state.y}px ${state.blur}px ${state.spread}px ${state.color}`;
}

export function BoxShadowBuilder({ value, onChange }: BoxShadowBuilderProps) {
  const initial = useMemo(() => parseBoxShadow(value), [value]);
  const [state, setState] = useState<BuilderState | null>(initial);
  const [rawMode, setRawMode] = useState(false);
  const [rawValue, setRawValue] = useState(value || '');
  // Tracks the last value *this component* emitted, so the sync effect below
  // can tell a real external prop change apart from an echo of our own update
  // round-tripping back through the parent (mirrors GradientBuilder — VEQA-019).
  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    const isEcho = !!value && value === lastEmittedRef.current;
    if (!isEcho) {
      setState(parseBoxShadow(value));
      setRawValue(value || '');
    }
  }, [value]);

  const emit = (next: BuilderState | null) => {
    setState(next);
    const css = next ? buildBoxShadow(next) : '';
    lastEmittedRef.current = css;
    onChange(css);
  };

  const previewCss = state ? buildBoxShadow(state) : '';

  return (
    <div className="space-y-2.5">
      {/* Preview */}
      <div className="flex items-stretch gap-2">
        <div className="flex-1 h-10 flex items-center justify-center rounded border border-border bg-muted/30 overflow-hidden">
          <div
            className="h-4 w-10 rounded bg-background border border-border/50"
            style={{ boxShadow: previewCss || undefined }}
          />
        </div>
        {state && (
          <button
            type="button"
            onClick={() => emit(null)}
            className="px-2 text-muted-foreground hover:text-destructive"
            title="Clear shadow"
          >
            <span className="material-icons text-sm">close</span>
          </button>
        )}
      </div>

      {!state ? (
        <button
          type="button"
          onClick={() => emit(DEFAULT_STATE)}
          className="text-[11px] text-primary hover:text-primary/80 font-medium"
        >
          + Add shadow
        </button>
      ) : (
        <>
          {/* Mode tabs — CSS mode lets user paste/edit the raw shadow string */}
          <div className="flex gap-1 border-b border-border">
            <button
              type="button"
              onClick={() => setRawMode(false)}
              className={`px-2 py-1 text-[11px] font-medium border-b-2 -mb-px ${!rawMode ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => setRawMode(true)}
              className={`px-2 py-1 text-[11px] font-medium border-b-2 -mb-px ${rawMode ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              CSS
            </button>
          </div>

          {rawMode ? (
            <textarea
              value={rawValue}
              onChange={(e) => setRawValue(e.target.value)}
              onBlur={() => {
                const parsed = parseBoxShadow(rawValue);
                if (parsed) {
                  emit(parsed);
                } else if (!rawValue.trim()) {
                  emit(null);
                } else {
                  // Not parseable — treat as opaque raw value, push directly.
                  lastEmittedRef.current = rawValue;
                  onChange(rawValue);
                }
              }}
              placeholder="0 4px 6px 0 rgba(0, 0, 0, 0.1)"
              className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background font-mono min-h-[60px] resize-y"
              spellCheck={false}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">X Offset</label>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{state.x}px</span>
                  </div>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={state.x}
                    onChange={(e) => emit({ ...state, x: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Y Offset</label>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{state.y}px</span>
                  </div>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={state.y}
                    onChange={(e) => emit({ ...state, y: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Blur</label>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{state.blur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={state.blur}
                    onChange={(e) => emit({ ...state, blur: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Spread</label>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{state.spread}px</span>
                  </div>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={state.spread}
                    onChange={(e) => emit({ ...state, spread: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(state.color) ? state.color : '#000000'}
                    onChange={(e) => emit({ ...state, color: e.target.value })}
                    className="h-7 w-9 rounded border border-border cursor-pointer bg-transparent shrink-0"
                    title="Pick color"
                  />
                  <input
                    type="text"
                    value={state.color}
                    onChange={(e) => emit({ ...state, color: e.target.value })}
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background font-mono"
                    spellCheck={false}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.inset}
                  onChange={(e) => emit({ ...state, inset: e.target.checked })}
                  className="accent-primary"
                />
                Inset (inner shadow)
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}
