/**
 * Style-surface descriptors per block type.
 *
 * A style-surface is the allow-list of CSS-ish keys (and value constraints) that
 * the AI Style Picker is permitted to produce for a given block type. It is the
 * single source of truth for both the prompt builder (so the model knows what
 * it may emit) and the output validator (so we can reject anything off-list).
 *
 * Pure: no DB, no network, no React. Safe to import anywhere.
 *
 * MVP: only hero is defined. Adding a new block type means adding one entry to
 * BLOCK_STYLE_SURFACES — no other code changes required.
 */
import type { BlockStyle } from '@/types/blocks';

/** A single key on BlockStyle, with allowed-value rules. */
export interface StyleKeySpec {
  /** Human description for the prompt — model sees this. */
  description?: string;
  /** When set, value must be one of these literals. Implies type='enum'. */
  enumValues?: ReadonlyArray<string>;
  /** Loose type hint emitted into the prompt: 'css-color', 'css-length', 'css-number', 'css-string'. */
  type?: 'css-color' | 'css-length' | 'css-number' | 'css-string' | 'enum' | 'css-shadow' | 'css-gradient';
  /**
   * When true, this key references brand-managed values (palette / typography).
   * The validator may reject deviations from brand here when exploreOutsideBrand=false.
   */
  brandManaged?: boolean;
}

export type StyleKeyMap = Partial<Record<keyof BlockStyle, StyleKeySpec>>;

export interface BlockStyleSurface {
  /** Block type this descriptor applies to. */
  blockType: string;
  /**
   * Wrapper-level styles (BaseBlock.style). Keys not listed here are forbidden
   * in propsDelta.style for this block type.
   */
  wrapperStyle: StyleKeyMap;
  /**
   * Per-element styles (BaseBlock.elementStyles[name]). Each named element gets
   * its own key map. Element names not listed are forbidden.
   */
  elementStyles: Record<string, StyleKeyMap>;
}

// ─── Reusable key sets ───────────────────────────────────────────────────────
//
// These are composed into per-block surfaces below. They are tuned for the
// specific element type, not just CSS — e.g. a "title" element should not get
// background colors, and a "cta button" element should not get text-decoration
// underlines unless someone really wants that.

const TYPOGRAPHY_KEYS: StyleKeyMap = {
  color: { type: 'css-color', brandManaged: true, description: 'Text color (hex). Brand-managed: prefer brand palette unless exploring outside brand.' },
  fontSize: { type: 'css-length', description: 'e.g. "3rem", "clamp(2rem, 5vw, 4rem)".' },
  fontFamily: { type: 'css-string', brandManaged: true, description: 'Brand-managed: prefer brand heading/body font unless exploring outside brand.' },
  fontWeight: { type: 'css-string', description: 'e.g. "400", "600", "800".' },
  lineHeight: { type: 'css-string', description: 'e.g. "1.1", "1.4".' },
  letterSpacing: { type: 'css-length', description: 'e.g. "0.02em", "-0.01em".' },
  textAlign: { type: 'enum', enumValues: ['left', 'center', 'right'] as const },
  textTransform: { type: 'enum', enumValues: ['none', 'uppercase', 'lowercase', 'capitalize'] as const },
  textDecoration: { type: 'enum', enumValues: ['none', 'underline'] as const },
  margin: { type: 'css-length', description: 'e.g. "0 0 1.5rem 0".' },
};

const BUTTON_KEYS: StyleKeyMap = {
  backgroundColor: { type: 'css-color', brandManaged: true },
  color: { type: 'css-color', brandManaged: true },
  borderRadius: { type: 'css-length', brandManaged: true, description: 'Brand-managed: prefer brand radius unless exploring outside brand.' },
  padding: { type: 'css-length' },
  fontWeight: { type: 'css-string' },
  fontSize: { type: 'css-length' },
  letterSpacing: { type: 'css-length' },
  textTransform: { type: 'enum', enumValues: ['none', 'uppercase', 'lowercase', 'capitalize'] as const },
  borderWidth: { type: 'css-length' },
  borderColor: { type: 'css-color', brandManaged: true },
  borderStyle: { type: 'enum', enumValues: ['none', 'solid', 'dashed', 'dotted'] as const },
  boxShadow: { type: 'css-shadow' },
};

// ─── Per-block surfaces ──────────────────────────────────────────────────────

export const HERO_STYLE_SURFACE: BlockStyleSurface = {
  blockType: 'hero',
  wrapperStyle: {
    backgroundColor: { type: 'css-color', brandManaged: true },
    color: { type: 'css-color', brandManaged: true, description: 'Default text color inside the hero.' },
    padding: { type: 'css-length', description: 'e.g. "8rem 2rem", "min(15vh, 8rem) 1.5rem".' },
    textAlign: { type: 'enum', enumValues: ['left', 'center', 'right'] as const },
    minHeight: { type: 'css-length', description: 'e.g. "70vh", "85vh", "600px". Hero must be substantial — avoid <50vh.' },
    backgroundSize: { type: 'enum', enumValues: ['cover', 'contain', 'auto'] as const },
    backgroundPosition: { type: 'css-string', description: 'e.g. "center", "center top", "30% 50%".' },
    backgroundBlendMode: { type: 'enum', enumValues: ['normal', 'multiply', 'overlay', 'screen', 'darken', 'lighten', 'soft-light'] as const, description: 'Blend background image with backgroundColor.' },
    backgroundGradient: { type: 'css-gradient', brandManaged: true, description: 'Linear/radial gradient. Use brand colors unless exploring outside brand.' },
    borderRadius: { type: 'css-length', brandManaged: true },
    display: { type: 'enum', enumValues: ['flex', 'block', 'grid'] as const },
    flexDirection: { type: 'enum', enumValues: ['row', 'column', 'row-reverse', 'column-reverse'] as const },
    justifyContent: { type: 'enum', enumValues: ['flex-start', 'center', 'flex-end', 'space-between'] as const },
    alignItems: { type: 'enum', enumValues: ['flex-start', 'center', 'flex-end', 'stretch'] as const },
    gap: { type: 'css-length' },
  },
  elementStyles: {
    title: TYPOGRAPHY_KEYS,
    subtitle: TYPOGRAPHY_KEYS,
    description: TYPOGRAPHY_KEYS,
    cta: BUTTON_KEYS,
    secondaryCta: BUTTON_KEYS,
  },
};

const SURFACES: ReadonlyArray<BlockStyleSurface> = [
  HERO_STYLE_SURFACE,
];

/** Look up the style surface for a block type. Returns null if unsupported. */
export function getStyleSurface(blockType: string): BlockStyleSurface | null {
  return SURFACES.find((s) => s.blockType === blockType) ?? null;
}

/** True if a block type has an AI Style Picker surface. UI uses this to decide whether to render the "Try other styles" button. */
export function hasStyleSurface(blockType: string): boolean {
  return SURFACES.some((s) => s.blockType === blockType);
}
