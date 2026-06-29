'use client';

import { useEffect, useMemo, useState } from 'react';

type GradientType = 'linear' | 'radial' | 'conic';

interface ColorStop {
  id: string;
  color: string;
  /** Position 0-100 (percent) */
  position: number;
}

interface BuilderState {
  type: GradientType;
  /** Angle in deg — linear + conic only (0-360) */
  angle: number;
  /** Radial shape */
  radialShape: 'circle' | 'ellipse';
  /** Radial position keyword */
  radialPosition: string;
  /** Ordered color stops. 0 items = no background, 1 = solid, 2+ = gradient. */
  stops: ColorStop[];
}

interface BackgroundColorsControlProps {
  backgroundColor: string;
  backgroundGradient: string;
  onChange: (patch: { backgroundColor: string; backgroundGradient: string }) => void;
}

const PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Ocean', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Sunset', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: 'Forest', value: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { label: 'Dark', value: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 100%)' },
  { label: 'Warm', value: 'linear-gradient(135deg, #f8b500 0%, #fceabb 100%)' },
  { label: 'Vivid', value: 'linear-gradient(90deg, #ff6b6b 0%, #feca57 50%, #48dbfb 100%)' },
  { label: 'Aurora', value: 'linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%)' },
  { label: 'Slate', value: 'linear-gradient(135deg, #004D80 0%, #0099D4 100%)' },
];

const DEFAULT_STATE: BuilderState = {
  type: 'linear',
  angle: 135,
  radialShape: 'ellipse',
  radialPosition: 'center',
  stops: [],
};

/** Parse a CSS gradient string into structured state. Returns null if unparseable. */
function parseGradient(css: string): BuilderState | null {
  if (!css) return null;
  const trimmed = css.trim();
  const typeMatch = trimmed.match(/^(linear|radial|conic)-gradient\s*\(([\s\S]*)\)\s*$/i);
  if (!typeMatch) return null;
  const type = typeMatch[1].toLowerCase() as GradientType;
  const inner = typeMatch[2].trim();

  // Split top-level commas (not inside parens like rgba())
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  if (parts.length < 2) return null;

  const state: BuilderState = { ...DEFAULT_STATE, type, stops: [] };

  let stopParts = parts;
  const first = parts[0];
  if (type === 'linear') {
    const angleMatch = first.match(/^(-?\d+(?:\.\d+)?)deg$/);
    if (angleMatch) {
      state.angle = parseFloat(angleMatch[1]);
      stopParts = parts.slice(1);
    } else if (/^to\s+/i.test(first)) {
      const dirMap: Record<string, number> = {
        'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270,
        'to top right': 45, 'to bottom right': 135, 'to bottom left': 225, 'to top left': 315,
      };
      state.angle = dirMap[first.toLowerCase()] ?? 180;
      stopParts = parts.slice(1);
    }
  } else if (type === 'radial') {
    if (/^(circle|ellipse)/i.test(first)) {
      state.radialShape = first.toLowerCase().startsWith('circle') ? 'circle' : 'ellipse';
      const posMatch = first.match(/at\s+(.+)$/i);
      if (posMatch) state.radialPosition = posMatch[1].trim();
      stopParts = parts.slice(1);
    }
  } else if (type === 'conic') {
    const fromMatch = first.match(/from\s+(-?\d+(?:\.\d+)?)deg/i);
    if (fromMatch) {
      state.angle = parseFloat(fromMatch[1]);
      stopParts = parts.slice(1);
    }
  }

  state.stops = stopParts
    .map((part, i) => {
      const stopMatch = part.match(/^(.+?)(?:\s+(-?\d+(?:\.\d+)?%?))?$/);
      if (!stopMatch) return null;
      const color = stopMatch[1].trim();
      const posStr = stopMatch[2];
      const position = posStr
        ? parseFloat(posStr.replace('%', ''))
        : (i / Math.max(stopParts.length - 1, 1)) * 100;
      return { id: `s-${Date.now()}-${i}`, color, position };
    })
    .filter((s): s is ColorStop => !!s);

  if (state.stops.length < 2) return null;
  return state;
}

/**
 * Build a CSS gradient string. Assumes state.stops.length >= 2.
 * Stops are sorted by position and emitted with their percentages so there are
 * no implicit blends — if a user wants an even 2-color gradient, positions stay
 * at 0/100 and CSS interpolates smoothly with no gaps.
 */
function buildGradient(state: BuilderState): string {
  const stops = [...state.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${Math.round(s.position * 100) / 100}%`)
    .join(', ');

  switch (state.type) {
    case 'linear':
      return `linear-gradient(${state.angle}deg, ${stops})`;
    case 'radial':
      return `radial-gradient(${state.radialShape} at ${state.radialPosition}, ${stops})`;
    case 'conic':
      return `conic-gradient(from ${state.angle}deg, ${stops})`;
  }
}

/**
 * Produce state from the incoming bgColor + bgGradient pair.
 * Precedence: valid gradient (2+ stops) wins over bgColor.
 */
function stateFromProps(bgColor: string, bgGradient: string): BuilderState {
  const parsed = parseGradient(bgGradient);
  if (parsed) return parsed;
  if (bgColor) {
    return { ...DEFAULT_STATE, stops: [{ id: 'solid', color: bgColor, position: 0 }] };
  }
  return { ...DEFAULT_STATE, stops: [] };
}

/** Auto-distribute positions evenly from 0 → 100 across the stop array. */
function distributeEvenly(stops: ColorStop[]): ColorStop[] {
  if (stops.length === 0) return stops;
  if (stops.length === 1) return [{ ...stops[0], position: 0 }];
  return stops.map((s, i) => ({ ...s, position: Math.round((i / (stops.length - 1)) * 100) }));
}

export function GradientBuilder({ backgroundColor, backgroundGradient, onChange }: BackgroundColorsControlProps) {
  const initial = useMemo(() => stateFromProps(backgroundColor, backgroundGradient), [backgroundColor, backgroundGradient]);
  const [state, setState] = useState<BuilderState>(initial);
  const [rawMode, setRawMode] = useState(false);
  const [rawValue, setRawValue] = useState(backgroundGradient || '');

  useEffect(() => {
    setState(stateFromProps(backgroundColor, backgroundGradient));
    setRawValue(backgroundGradient || '');
  }, [backgroundColor, backgroundGradient]);

  /** Commit state to props with the correct single-vs-gradient split. */
  const emit = (next: BuilderState) => {
    setState(next);
    if (next.stops.length === 0) {
      onChange({ backgroundColor: '', backgroundGradient: '' });
    } else if (next.stops.length === 1) {
      // Solid background — clear any lingering gradient so nothing bleeds through
      onChange({ backgroundColor: next.stops[0].color, backgroundGradient: '' });
    } else {
      // Gradient — clear bgColor so it can't show through transparent regions
      onChange({ backgroundColor: '', backgroundGradient: buildGradient(next) });
    }
  };

  const isGradient = state.stops.length >= 2;

  const updateStop = (id: string, patch: Partial<ColorStop>) => {
    emit({ ...state, stops: state.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  };

  const addStop = () => {
    if (state.stops.length === 0) {
      emit({ ...state, stops: [{ id: `s-${Date.now()}`, color: '#ffffff', position: 0 }] });
      return;
    }
    if (state.stops.length === 1) {
      // Transitioning solid → gradient: second color defaults to a shade of the first
      const first = state.stops[0];
      emit({
        ...state,
        stops: distributeEvenly([
          { ...first, position: 0 },
          { id: `s-${Date.now()}`, color: '#ffffff', position: 100 },
        ]),
      });
      return;
    }
    // Insert a new stop between the last two, at their midpoint
    const sorted = [...state.stops].sort((a, b) => a.position - b.position);
    const last = sorted[sorted.length - 1];
    const secondLast = sorted[sorted.length - 2];
    const newPos = Math.round((last.position + secondLast.position) / 2);
    emit({
      ...state,
      stops: [...state.stops, { id: `s-${Date.now()}`, color: last.color, position: newPos }],
    });
  };

  const removeStop = (id: string) => {
    const nextStops = state.stops.filter((s) => s.id !== id);
    // If we drop to a single stop, renormalize its position to 0 so the solid
    // bg is unambiguous when it round-trips back into the builder.
    if (nextStops.length === 1) nextStops[0] = { ...nextStops[0], position: 0 };
    emit({ ...state, stops: nextStops });
  };

  // Preview CSS — either the solid color or the gradient
  const previewCss = state.stops.length === 0
    ? ''
    : state.stops.length === 1
    ? state.stops[0].color
    : buildGradient(state);

  return (
    <div className="space-y-2.5">
      {/* Preview */}
      <div className="flex items-stretch gap-2">
        <div
          className="flex-1 h-10 rounded border border-border"
          style={{
            background: previewCss || 'repeating-conic-gradient(#e5e7eb 0 25%, transparent 0 50%) 50% / 12px 12px',
          }}
        />
        {state.stops.length > 0 && (
          <button
            type="button"
            onClick={() => emit({ ...state, stops: [] })}
            className="px-2 text-muted-foreground hover:text-destructive"
            title="Clear background"
          >
            <span className="material-icons text-sm">close</span>
          </button>
        )}
      </div>

      {/* Mode tabs — CSS mode lets user paste/edit the raw gradient string */}
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
            // Parse the pasted CSS; if valid, emit as gradient (clearing bgColor).
            const parsed = parseGradient(rawValue);
            if (parsed) {
              emit(parsed);
            } else if (!rawValue.trim()) {
              emit({ ...state, stops: [] });
            } else {
              // Not parseable — treat as opaque raw value, push directly.
              onChange({ backgroundColor: '', backgroundGradient: rawValue });
            }
          }}
          placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background font-mono min-h-[60px] resize-y"
          spellCheck={false}
        />
      ) : (
        <>
          {/* Gradient-only controls — hidden when 0 or 1 color */}
          {isGradient && (
            <>
              {/* Type */}
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Type</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['linear', 'radial', 'conic'] as GradientType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => emit({ ...state, type: t })}
                      className={`px-2 py-1 text-[11px] font-medium rounded border ${state.type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Angle (linear/conic) */}
              {(state.type === 'linear' || state.type === 'conic') && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {state.type === 'linear' ? 'Angle' : 'From Angle'}
                    </label>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{state.angle}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={state.angle}
                    onChange={(e) => emit({ ...state, angle: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                  <div className="grid grid-cols-4 gap-1 mt-1">
                    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => emit({ ...state, angle: a })}
                        className={`px-1 py-0.5 text-[10px] rounded border ${state.angle === a ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      >
                        {a}°
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Radial shape/position */}
              {state.type === 'radial' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Shape</label>
                    <select
                      value={state.radialShape}
                      onChange={(e) => emit({ ...state, radialShape: e.target.value as 'circle' | 'ellipse' })}
                      className="w-full px-2 py-1 text-xs border border-border rounded bg-background"
                    >
                      <option value="ellipse">Ellipse</option>
                      <option value="circle">Circle</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Position</label>
                    <select
                      value={state.radialPosition}
                      onChange={(e) => emit({ ...state, radialPosition: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-border rounded bg-background"
                    >
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="top left">Top Left</option>
                      <option value="top right">Top Right</option>
                      <option value="bottom left">Bottom Left</option>
                      <option value="bottom right">Bottom Right</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end -mb-1">
                <button
                  type="button"
                  onClick={() => emit({ ...state, stops: distributeEvenly(state.stops) })}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  title="Space stops evenly between 0% and 100%"
                >
                  distribute evenly
                </button>
              </div>
            </>
          )}

          {/* Colors list — always shown. Position slider only appears when ≥2 colors. */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {isGradient ? `Colors (${state.stops.length})` : 'Background Color'}
              </label>
              <button
                type="button"
                onClick={addStop}
                className="text-[11px] text-primary hover:text-primary/80 font-medium"
              >
                {state.stops.length === 0 ? '+ Set color' : '+ Add color'}
              </button>
            </div>
            <div className="space-y-1.5">
              {[...state.stops]
                .sort((a, b) => a.position - b.position)
                .map((stop) => (
                  <div key={stop.id} className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(stop.color) ? stop.color : '#ffffff'}
                      onChange={(e) => updateStop(stop.id, { color: e.target.value })}
                      className="h-7 w-9 rounded border border-border cursor-pointer bg-transparent shrink-0"
                      title="Pick color"
                    />
                    <input
                      type="text"
                      value={stop.color}
                      onChange={(e) => updateStop(stop.id, { color: e.target.value })}
                      className={`${isGradient ? 'w-24' : 'flex-1'} px-2 py-1 text-xs border border-border rounded bg-background font-mono`}
                      spellCheck={false}
                    />
                    {isGradient && (
                      <>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={stop.position}
                          onChange={(e) => updateStop(stop.id, { position: Number(e.target.value) })}
                          className="flex-1 accent-primary"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(stop.position)}
                          onChange={(e) => updateStop(stop.id, { position: Number(e.target.value) })}
                          className="w-12 px-1 py-1 text-xs border border-border rounded bg-background tabular-nums"
                        />
                        <span className="text-[10px] text-muted-foreground">%</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => removeStop(stop.id)}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                      title={isGradient ? 'Remove color' : 'Remove background'}
                    >
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {/* Presets — always available; clicking one commits as a gradient */}
      <div>
        <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Presets</label>
        <div className="grid grid-cols-4 gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const parsed = parseGradient(p.value);
                if (parsed) emit(parsed);
              }}
              className="h-7 rounded border border-border hover:ring-1 hover:ring-primary transition-all"
              style={{ background: p.value }}
              title={p.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
