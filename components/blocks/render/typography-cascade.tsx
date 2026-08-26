'use client';

/**
 * VEQA-032 step 1 — typography cascade context + resolver hook.
 *
 * Problem this exists to fix: leaf renderers (HeadingBlockRender,
 * QuoteBlockRender, TestimonialBlockRender, …) guard their theme-fallback
 * classes ONLY on their own `block.style`:
 *
 *   `${block.style?.color ? '' : 'text-foreground'}`
 *
 * `text-foreground` is an explicit CSS `color`, so it always beats inherited
 * CSS color — a parent section/column's typography never reaches a child
 * leaf unless the leaf sets its own style. This module provides a render-time
 * cascade so a container can pass typography down through React context, and
 * leaves can resolve "what color/size/etc should I actually use" against
 * their own value, their `elementStyles` slot, and the nearest ancestor,
 * before falling back to the theme default class.
 *
 * NOTE: this unit (VEQA-032 step 1) only adds the context + hook + pure
 * resolver. No provider is mounted by any container yet (that's step 2) and
 * no leaf reads `useResolvedTypography` yet (that's step 3, the leaf sweep).
 * `TypographyCascadeContext`'s default value is `{}`, so until step 2 wires a
 * provider, every consumer sees "no ancestor typography" — zero behavior
 * change today.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** The typography-only slice of `BlockStyle` (types/blocks/base.ts). All
 *  values are the literal CSS strings the style panel writes — this module
 *  does no parsing/coercion, only precedence resolution. */
export interface TypographyValues {
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
}

/** The typography properties this module knows about, in a stable order —
 *  shared by the resolver loop and by tests that want to assert "every
 *  property". */
export const TYPOGRAPHY_PROPERTIES = [
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
] as const satisfies readonly (keyof TypographyValues)[];

/** Where a resolved value came from, in precedence order (highest first):
 *  - `own`          — the leaf's own `block.style` (e.g. `block.style.color`)
 *  - `elementStyles` — the leaf's own `block.elementStyles[elementKey]`
 *                       (per-sub-element overrides — see `getElementCSS`)
 *  - `ancestor`      — inherited from the nearest `TypographyCascadeProvider`
 *  - `none`          — nothing set anywhere; the leaf's theme fallback class
 *                       (`text-foreground`, `text-xl`, …) applies as-is */
export type TypographySource = 'own' | 'elementStyles' | 'ancestor' | 'none';

export interface ResolvedTypographyProperty {
  value?: string;
  source: TypographySource;
}

/** Per-property resolution result. Consumers (the future leaf sweep) read
 *  `resolved.color.value` to get an inline-style value, and can check
 *  `resolved.color.source === 'none'` to decide whether to keep applying a
 *  theme fallback class — mirroring today's `block.style?.color ? '' :
 *  'text-foreground'` guard but against the resolved value instead of only
 *  the leaf's own style. */
export type ResolvedTypography = Record<keyof TypographyValues, ResolvedTypographyProperty>;

/**
 * Pure resolution function — no React — so the precedence order is testable
 * directly. Per property: own explicit value beats the leaf's own
 * `elementStyles` slot beats the nearest ancestor context value beats
 * undefined ("none" — the caller's theme fallback wins).
 *
 * `undefined` in any input means "not set here", not "explicitly cleared" —
 * matches the data-model rule in the spec: absence of key = inherit, any
 * explicit value (including falsy-looking strings like '0') = owned.
 */
export function resolveTypography(
  own: TypographyValues | undefined,
  elementStyles: TypographyValues | undefined,
  inherited: TypographyValues | undefined
): ResolvedTypography {
  const result = {} as ResolvedTypography;

  for (const prop of TYPOGRAPHY_PROPERTIES) {
    const ownValue = own?.[prop];
    const elementValue = elementStyles?.[prop];
    const inheritedValue = inherited?.[prop];

    if (ownValue !== undefined) {
      result[prop] = { value: ownValue, source: 'own' };
    } else if (elementValue !== undefined) {
      result[prop] = { value: elementValue, source: 'elementStyles' };
    } else if (inheritedValue !== undefined) {
      result[prop] = { value: inheritedValue, source: 'ancestor' };
    } else {
      result[prop] = { value: undefined, source: 'none' };
    }
  }

  return result;
}

/** React context carrying the typography inherited from the nearest ancestor
 *  container (section, columns/column, …) that has any typography set.
 *  Default `{}` — an unwrapped consumer sees "nothing inherited", which is
 *  today's behavior (no cascade). */
export const TypographyCascadeContext = createContext<TypographyValues>({});

export interface TypographyCascadeProviderProps {
  /** The container block's own typography values (e.g. a section's
   *  `block.style` typography fields). Only the defined keys are merged over
   *  the inherited context — an explicitly-`undefined` key never clobbers an
   *  ancestor value, matching `{...inherited, ...own}` semantics minus the
   *  naive-spread footgun (a plain spread WOULD overwrite with `undefined`
   *  for any key present-but-unset on `own`). */
  own?: TypographyValues;
  children: ReactNode;
}

/**
 * Merges `own` over whatever was inherited from an outer
 * `TypographyCascadeProvider` (or the `{}` default if there is none) and
 * provides the result. Nesting composes naturally: section → column → leaf
 * each layer only needs to know its own values, not the whole ancestor
 * chain.
 *
 * Memoized on the inherited context value and each individual `own` field
 * (not the `own` object identity, which callers may recreate every render)
 * so nested providers don't force a re-render storm through every consumer
 * on unrelated parent re-renders.
 */
export function TypographyCascadeProvider({ own, children }: TypographyCascadeProviderProps) {
  const inherited = useContext(TypographyCascadeContext);

  const merged = useMemo<TypographyValues>(() => {
    if (!own) return inherited;

    let changed = false;
    const next: TypographyValues = { ...inherited };
    for (const prop of TYPOGRAPHY_PROPERTIES) {
      const value = own[prop];
      if (value !== undefined && value !== next[prop]) {
        next[prop] = value;
        changed = true;
      }
    }
    // No own value actually changed anything relative to what was already
    // inherited → hand back the SAME inherited reference instead of a new
    // object, so a container with no typography of its own (or values
    // identical to its ancestor's) doesn't fan out a new context identity to
    // every descendant.
    return changed ? next : inherited;
    // Depends on each primitive own[prop], not the (possibly fresh-each-render)
    // own object — that's the whole point of the memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inherited, own?.color, own?.fontFamily, own?.fontSize, own?.fontWeight, own?.lineHeight, own?.letterSpacing]);

  return (
    <TypographyCascadeContext.Provider value={merged}>
      {children}
    </TypographyCascadeContext.Provider>
  );
}

/** Minimal shape `useResolvedTypography` needs from a block — real block
 *  types (`types/blocks/base.ts` `BaseBlock`) are a structural superset of
 *  this (`style?: BlockStyle`, `elementStyles?: Record<string,
 *  Partial<BlockStyle>>`), so any real block satisfies it without a cast. */
export interface TypographyStyleSource {
  style?: TypographyValues;
  elementStyles?: Record<string, TypographyValues>;
}

/** True when `v` has at least one typography property explicitly set —
 *  the gate `ContainerTypography` uses to decide whether to mount a
 *  provider at all (see below). */
export function hasTypographyValues(v: TypographyValues | undefined): boolean {
  return !!v && TYPOGRAPHY_PROPERTIES.some((prop) => v[prop] !== undefined);
}

/**
 * VEQA-032 step 2 — one-line container wrapper for the four call sites
 * (production SectionBlockRender/ColumnsBlockRender + their editor-canvas
 * mirrors in EditableBlockRenderer.tsx's `ContainerBlockRenderer`).
 *
 * Mounts `TypographyCascadeProvider` with `own` = `block.style` ONLY when
 * the block has at least one typography value set. When it doesn't, renders
 * `children` unwrapped — no provider is mounted at all, so a page with no
 * container typography produces byte-identical output to before this unit
 * (required: this unit must be a zero-visual-change no-op; leaves don't
 * consume the context until VEQA-032 step 3).
 */
export function ContainerTypography({ block, children }: { block: TypographyStyleSource; children: ReactNode }) {
  return hasTypographyValues(block.style) ? <TypographyCascadeProvider own={block.style}>{children}</TypographyCascadeProvider> : children;
}

/**
 * Resolve a leaf's effective typography: its own `block.style`, its own
 * `block.elementStyles[elementKey]` (pass `elementKey` when the leaf renders
 * a named sub-element, e.g. QuoteBlockRender's `'quoteText'` / `'author'` /
 * `'citation'` — omit it for a leaf with a single unnamed text node), and
 * whatever the nearest `TypographyCascadeProvider` ancestor supplied.
 *
 * Returned shape: `ResolvedTypography` — one `{ value, source }` per
 * property in `TYPOGRAPHY_PROPERTIES`. A leaf's fallback-class guard becomes
 * `resolved.color.source === 'none' ? 'text-foreground' : ''`, and
 * `resolved.color.value` is applied as inline style when `source !==
 * 'own'` (an explicit `block.style.color` is already handled by the leaf's
 * existing style spread — inline-styling it again from here would be
 * redundant, not wrong, but the leaf sweep decides that per call site).
 */
export function useResolvedTypography(
  block: TypographyStyleSource,
  elementKey?: string
): ResolvedTypography {
  const inherited = useContext(TypographyCascadeContext);
  const own = block.style;
  const elementStyles = elementKey ? block.elementStyles?.[elementKey] : undefined;

  return useMemo(
    () => resolveTypography(own, elementStyles, inherited),
    // own/elementStyles are plain data objects the caller may recreate each
    // render; depend on their primitive fields instead of object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      inherited,
      own?.color,
      own?.fontFamily,
      own?.fontSize,
      own?.fontWeight,
      own?.lineHeight,
      own?.letterSpacing,
      elementStyles?.color,
      elementStyles?.fontFamily,
      elementStyles?.fontSize,
      elementStyles?.fontWeight,
      elementStyles?.lineHeight,
      elementStyles?.letterSpacing,
    ]
  );
}

/**
 * VEQA-032 step 3a — leaf-sweep helper. Own values and elementStyles values
 * are already applied by each leaf's existing code paths (own via
 * BlockStyleWrapper's inline style on the block's outer wrapper, which
 * cascades through ordinary CSS inheritance unless a fallback class blocks
 * it; elementStyles via the leaf's own `getElementCSS` call). Only an
 * `ancestor`-sourced value has nowhere else to land, since the section/column
 * that owns it is a React-context ancestor, not necessarily a styled DOM
 * ancestor of this leaf's content node — so it must be applied directly.
 *
 * Returns a `React.CSSProperties`-shaped object containing only the
 * properties whose resolved `source === 'ancestor'`, ready to spread into a
 * content node's `style` prop (e.g. `style={{ ...ancestorStyle(resolved),
 * ...getElementCSS(...) }}`).
 */
export function ancestorStyle(resolved: ResolvedTypography): Partial<TypographyValues> {
  const out: Partial<TypographyValues> = {};
  for (const prop of TYPOGRAPHY_PROPERTIES) {
    const entry = resolved[prop];
    if (entry.source === 'ancestor' && entry.value !== undefined) {
      out[prop] = entry.value;
    }
  }
  return out;
}
