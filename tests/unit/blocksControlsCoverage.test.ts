/**
 * Audit harness — block-by-block field/style/test coverage.
 *
 * Companion to blocksRegistryCompleteness.test.ts (drift detection). That
 * test catches "registry forgets a block"; this one catches "block exists
 * but its inputs/outputs aren't fully wired through the editor + tests."
 *
 * For every user-pickable block type, this harness measures:
 *
 *   1. Settings field coverage — every property on the TS interface should
 *      have a settings input in BOTH BlockSettings.tsx panels (the per-
 *      category panels under block-settings/panels/) AND BlockContentEditor
 *      (the iframe-mode parallel editor under portal/visual-editor/).
 *
 *   2. ELEMENT_DEFINITIONS sanity — every key listed in
 *      element-definitions.ts must be consumed by the matching renderer
 *      via getElementCSS(block.elementStyles, '<key>'). Dead keys mean a
 *      user-visible style control that silently does nothing.
 *
 *   3. E2E lifecycle — each block has a `<type> block:` test in
 *      tests/e2e/visual-editor-blocks.spec.ts.
 *
 * Output: writes .planning/audits/blocks-controls-coverage.json with the
 * per-block report. Asserts each block's gap counts are <= a baseline in
 * blocks-controls-coverage.baseline.json so future regressions fail CI.
 *
 * The harness is intentionally text-based (regex over source files) rather
 * than runtime-based — it catches the "wired in code, untyped at runtime"
 * gaps that a render-tree walker can miss, and it runs in <100ms with no
 * jsdom dependencies.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { BLOCK_ICONS } from '@/lib/utils/blockIcons';
import type { BlockType } from '@/types/blocks';

const REPO_ROOT = join(__dirname, '..', '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf-8');
}

// Block types intentionally excluded from the website block picker. Mirrors
// blocksRegistryCompleteness.test.ts so the two harnesses stay in sync.
const NOT_USER_PICKABLE: ReadonlySet<BlockType> = new Set<BlockType>([
  // Email-editor-only — different audience, different controls
  'email-header',
  'email-footer',
  // Pitch-deck-only
  'survey-input',
  'deck-next-slide',
  'deck-jump-to',
  // Template-only placeholder (only surfaced via extraBlockTypes when
  // editing post-type templates; not part of the universal picker).
  'post-content',
  // Site-specific (Palizzi tenant only)
  'palizzi-nav',
  'palizzi-hero',
  'palizzi-welcome',
  'palizzi-history',
  'palizzi-menu',
  'palizzi-rules',
  'palizzi-membership',
  'palizzi-footer',
]);

const ALL_BLOCK_TYPES = Object.keys(BLOCK_ICONS) as BlockType[];
const USER_PICKABLE = ALL_BLOCK_TYPES.filter(t => !NOT_USER_PICKABLE.has(t));

// Block "type" string -> the TS interface name in types/blocks/*.ts. Most
// follow `type-name` -> `TypeNameBlock`, with the exceptions below for
// kebab cases where simple cap-casing wouldn't match.
const TYPE_TO_INTERFACE: Record<string, string> = {
  'text': 'TextBlock',
  'heading': 'HeadingBlock',
  'image': 'ImageBlock',
  'button': 'ButtonBlock',
  'spacer': 'SpacerBlock',
  'divider': 'DividerBlock',
  'columns': 'ColumnsBlock',
  'code': 'CodeBlock',
  'html-render': 'HtmlRenderBlock',
  'html-embed': 'HtmlEmbedBlock',
  'quote': 'QuoteBlock',
  'video': 'VideoBlock',
  'youtube': 'YoutubeBlock',
  'hero': 'HeroBlock',
  'hero-slideshow': 'HeroSlideshowBlock',
  'marquee': 'MarqueeBlock',
  'services-grid': 'ServicesGridBlock',
  'cta': 'CtaBlock',
  'testimonial': 'TestimonialBlock',
  'stats': 'StatsBlock',
  'blog-posts': 'BlogPostsBlock',
  'featured-content': 'FeaturedContentBlock',
  'accordion': 'AccordionBlock',
  'tabs': 'TabsBlock',
  'card-grid': 'CardGridBlock',
  'section': 'SectionBlock',
  'gallery': 'GalleryBlock',
  'product-grid': 'ProductGridBlock',
  'featured-products': 'FeaturedProductsBlock',
  'product-categories': 'ProductCategoriesBlock',
  'shopping-cart': 'ShoppingCartBlock',
  'store-banner': 'StoreBannerBlock',
  'product-detail': 'ProductDetailBlock',
  'booking': 'BookingBlock',
  'booking-menu': 'BookingMenuBlock',
  'survey': 'SurveyBlock',
  'survey-results': 'SurveyResultsBlock',
  'social-links': 'SocialLinksBlock',
  'timeline': 'TimelineBlock',
  'team-showcase': 'TeamShowcaseBlock',
  'team-flip-grid': 'TeamFlipGridBlock',
  'bento-grid': 'BentoGridBlock',
  'flip-card-grid': 'FlipCardGridBlock',
  'metric-cards': 'MetricCardsBlock',
  'logo-strip': 'LogoStripBlock',
  'site-footer': 'SiteFooterBlock',
  'sticky-scroll-tabs': 'StickyScrollTabsBlock',
};

// Type -> renderer file path (relative to repo root).
const TYPE_TO_RENDERER: Record<string, string> = {
  'text': 'components/blocks/render/TextBlockRender.tsx',
  'heading': 'components/blocks/render/HeadingBlockRender.tsx',
  'image': 'components/blocks/render/ImageBlockRender.tsx',
  'button': 'components/blocks/render/ButtonBlockRender.tsx',
  'spacer': 'components/blocks/render/SpacerBlockRender.tsx',
  'divider': 'components/blocks/render/DividerBlockRender.tsx',
  'columns': 'components/blocks/render/ColumnsBlockRender.tsx',
  'code': 'components/blocks/render/CodeBlockRender.tsx',
  'html-render': 'components/blocks/render/HtmlRenderBlockRender.tsx',
  'html-embed': 'components/blocks/render/HtmlEmbedBlockRender.tsx',
  'quote': 'components/blocks/render/QuoteBlockRender.tsx',
  'video': 'components/blocks/render/VideoBlockRender.tsx',
  'youtube': 'components/blocks/render/YoutubeBlockRender.tsx',
  'hero': 'components/blocks/render/HeroBlockRender.tsx',
  'hero-slideshow': 'components/blocks/render/HeroSlideshowBlockRender.tsx',
  'marquee': 'components/blocks/render/MarqueeBlockRender.tsx',
  'services-grid': 'components/blocks/render/ServicesGridBlockRender.tsx',
  'cta': 'components/blocks/render/CtaBlockRender.tsx',
  'testimonial': 'components/blocks/render/TestimonialBlockRender.tsx',
  'stats': 'components/blocks/render/StatsBlockRender.tsx',
  'blog-posts': 'components/blocks/render/BlogPostsBlockRender.tsx',
  'featured-content': 'components/blocks/render/FeaturedContentBlockRender.tsx',
  'accordion': 'components/blocks/render/AccordionBlockRender.tsx',
  'tabs': 'components/blocks/render/TabsBlockRender.tsx',
  'card-grid': 'components/blocks/render/CardGridBlockRender.tsx',
  'section': 'components/blocks/render/SectionBlockRender.tsx',
  'gallery': 'components/blocks/render/GalleryBlockRender.tsx',
  'product-grid': 'components/blocks/render/ProductGridBlockRender.tsx',
  'featured-products': 'components/blocks/render/FeaturedProductsBlockRender.tsx',
  'product-categories': 'components/blocks/render/ProductCategoriesBlockRender.tsx',
  'shopping-cart': 'components/blocks/render/ShoppingCartBlockRender.tsx',
  'store-banner': 'components/blocks/render/StoreBannerBlockRender.tsx',
  'product-detail': 'components/blocks/render/ProductDetailBlockRender.tsx',
  'booking': 'components/blocks/render/BookingBlockRender.tsx',
  'booking-menu': 'components/blocks/render/BookingMenuBlockRender.tsx',
  'survey': 'components/blocks/render/SurveyBlockRender.tsx',
  'survey-results': 'components/blocks/render/SurveyResultsBlockRender.tsx',
  'social-links': 'components/blocks/render/SocialLinksBlockRender.tsx',
  'timeline': 'components/blocks/render/TimelineBlockRender.tsx',
  'team-showcase': 'components/blocks/render/TeamShowcaseBlockRender.tsx',
  'team-flip-grid': 'components/blocks/render/TeamFlipGridBlockRender.tsx',
  'bento-grid': 'components/blocks/render/BentoGridBlockRender.tsx',
  'flip-card-grid': 'components/blocks/render/FlipCardGridBlockRender.tsx',
  'metric-cards': 'components/blocks/render/MetricCardsBlockRender.tsx',
  'logo-strip': 'components/blocks/render/LogoStripBlockRender.tsx',
  'site-footer': 'components/blocks/render/SiteFooterBlockRender.tsx',
  'sticky-scroll-tabs': 'components/blocks/render/StickyScrollTabsBlockRender.tsx',
};

// Fields that come from BaseBlock or are auto-derived (id, type, style,
// responsive, elementStyles, cssClass) — settings panels surface these
// through StyleSettings / class-name fields, not the per-block UI.
const BASE_FIELDS = new Set([
  'id',
  'type',
  'style',
  'responsive',
  'elementStyles',
  'cssClass',
  'children',
  // Editor-only flags carried on most blocks
  'fixed',
  'locked',
  'hidden',
  // common pitch-deck/site-specific bookkeeping
  'slot',
  'overrides',
]);

// Fields that are intentionally inline-edited in the canvas (RichTextEditable
// in the preview component) rather than via the side panel. These don't
// count as "missing" if absent from the panels.
const INLINE_EDITED_FIELDS: Record<string, ReadonlySet<string>> = {
  'text': new Set(['content']),
  'heading': new Set(['content']),
  'quote': new Set(['content']),
  'code': new Set(['code']),
  'card-grid': new Set(['cards']),
  'section': new Set(['blocks']),
  'columns': new Set(['columns']),
  'tabs': new Set(['tabs']),
  'accordion': new Set(['items']),
  'hero': new Set(['blocks']),
};

// Fields that are computed/auto-derived at render time and don't need
// editor UI. These are intentionally outside the settings panel because
// they're either server-injected or edited through a non-`onChange`/
// `onUpdate` flow (e.g. a custom inline editor / file upload picker).
const NON_EDITOR_FIELDS: Record<string, ReadonlySet<string>> = {
  // Server-injected at render time by lib/blocks/prefetch-embeds. Never
  // persisted; never user-editable. See HtmlEmbedBlock.inlineHtml jsdoc.
  'html-embed': new Set(['inlineHtml']),
  // `fields` and `values` are managed by the dedicated html-render skill
  // editor (a per-field declarative form), not via the generic block
  // settings panel's onChange flow. The block.html template is the
  // primary user-facing input handled by the panel.
  'html-render': new Set(['fields', 'values']),
};

// Renderers that legitimately don't use getElementCSS by design
// (text/heading/spacer/divider have no sub-elements).
const NO_ELEMENT_STYLES_BY_DESIGN = new Set([
  'text', 'heading', 'spacer', 'divider',
  'video', 'youtube', 'html-render', 'html-embed',
  'columns', 'section',
]);

interface BlockReport {
  type: string;
  interfaceFields: string[];
  fieldsInPanels: string[];
  fieldsInContentEditor: string[];
  fieldsMissingFromPanels: string[];
  fieldsMissingFromContentEditor: string[];
  fieldsMissingFromBoth: string[];
  elementDefinitionKeys: string[];
  elementKeysWithRendererCallSite: string[];
  deadElementKeys: string[];
  hasE2E: boolean;
  rendererExists: boolean;
}

interface CoverageBaseline {
  // Per-block max gap counts that the harness enforces. A block's measured
  // gap count must be <= the baseline; baseline updates require an explicit
  // edit (forces a code-review checkpoint when a regression is intentional).
  blocks: Record<string, {
    fieldsMissingFromBoth: number;
    deadElementKeys: number;
    hasE2E: boolean;
  }>;
}

// ─── Field extraction ────────────────────────────────────────────────────────

function extractInterfaceFields(typesSource: string, interfaceName: string): string[] {
  // Find `export interface <Name> extends BaseBlock { ... }`. Greedy match
  // up to the matching closing brace at column 0 (interfaces in this file
  // are always top-level).
  const start = typesSource.indexOf(`export interface ${interfaceName} extends BaseBlock {`);
  if (start === -1) {
    // Try without `extends BaseBlock`
    const altStart = typesSource.indexOf(`export interface ${interfaceName} {`);
    if (altStart === -1) return [];
    return parseFields(typesSource, altStart);
  }
  return parseFields(typesSource, start);
}

function parseFields(source: string, start: number): string[] {
  // Find the opening brace
  const braceIdx = source.indexOf('{', start);
  if (braceIdx === -1) return [];

  // Walk to the matching close brace (depth-balanced).
  let depth = 1;
  let i = braceIdx + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  const body = source.slice(braceIdx + 1, i);

  // Match `fieldName?: ...;` or `fieldName: ...;` lines whose declaration
  // STARTS at depth 0 within the interface body. We need to track depth
  // BEFORE the line's contents so multi-line field declarations like
  // `tabs: Array<{ id: string; ... }>;` still register `tabs` (the `{`
  // bumps depth mid-line, but the field declaration itself begins at
  // depth 0).
  const fields: string[] = [];
  let depthAtLineStart = 0;
  let runningDepth = 0;
  let lineStart = 0;
  for (let j = 0; j <= body.length; j++) {
    const c = j < body.length ? body[j] : '\n';
    if (c === '\n' || j === body.length) {
      if (depthAtLineStart === 0) {
        const line = body.slice(lineStart, j).trim();
        if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*')) {
          const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\??:/);
          if (m && m[1] !== 'type') fields.push(m[1]);
        }
      }
      lineStart = j + 1;
      depthAtLineStart = runningDepth;
    } else if (c === '{') {
      runningDepth++;
    } else if (c === '}') {
      runningDepth--;
    }
  }
  return fields;
}

function getInterfaceFieldsForType(blockType: string): string[] {
  const interfaceName = TYPE_TO_INTERFACE[blockType];
  if (!interfaceName) return [];
  // Aggregate every types/blocks/*.ts file (we don't know which one the
  // interface lives in without a registry).
  const typeFiles = [
    'types/blocks/base.ts',
    'types/blocks/layout.ts',
    'types/blocks/content.ts',
    'types/blocks/media.ts',
    'types/blocks/form.ts',
    'types/blocks/commerce.ts',
    'types/blocks/components.ts',
    'types/blocks/dynamic.ts',
  ];
  for (const file of typeFiles) {
    try {
      const src = readRepoFile(file);
      const fields = extractInterfaceFields(src, interfaceName);
      if (fields.length > 0) {
        return fields.filter(f => !BASE_FIELDS.has(f));
      }
    } catch {
      // file may not exist in some refactors; ignore
    }
  }
  return [];
}

// ─── Settings UI scanning ────────────────────────────────────────────────────

const PANEL_FILES = [
  'components/blocks/visual/block-settings/panels/LayoutPanel.tsx',
  'components/blocks/visual/block-settings/panels/ContentPanel.tsx',
  'components/blocks/visual/block-settings/panels/FormPanel.tsx',
  'components/blocks/visual/block-settings/panels/MediaPanel.tsx',
  'components/blocks/visual/block-settings/panels/DynamicPanel.tsx',
  'components/blocks/visual/block-settings/panels/SectionsPanel.tsx',
  'components/blocks/visual/block-settings/panels/HeroSettings.tsx',
  'components/blocks/visual/block-settings/panels/HeroSlideshowSettings.tsx',
  'components/blocks/visual/block-settings/panels/SiteFooterSettings.tsx',
  'components/blocks/visual/block-settings/panels/MarqueeSettings.tsx',
  'components/blocks/visual/block-settings/panels/BookingSettings.tsx',
  'components/blocks/visual/block-settings/panels/SurveyResultsSettings.tsx',
  'components/blocks/visual/block-settings/panels/ColumnsSettings.tsx',
  'components/blocks/visual/block-settings/panels/HtmlEmbedSettings.tsx',
];

let _panelsCache: string | null = null;
function getCombinedPanelsSource(): string {
  if (_panelsCache !== null) return _panelsCache;
  const parts: string[] = [];
  for (const file of PANEL_FILES) {
    try {
      parts.push(`/* === ${file} === */\n` + readRepoFile(file));
    } catch {
      // skip missing files
    }
  }
  _panelsCache = parts.join('\n');
  return _panelsCache;
}

let _contentEditorCache: string | null = null;
function getContentEditorSource(): string {
  if (_contentEditorCache !== null) return _contentEditorCache;
  _contentEditorCache = readRepoFile('components/portal/visual-editor/BlockContentEditor.tsx');
  return _contentEditorCache;
}

// Section in BlockContentEditor for a given block.type. Returns the slice
// of source enclosed in the `{block.type === 'X' && (...)}` JSX expression.
function extractContentEditorSectionFor(type: string): string {
  const src = getContentEditorSource();
  const startToken = `block.type === '${type}'`;
  const startIdx = src.indexOf(startToken);
  if (startIdx === -1) return '';
  // Walk forward to the next `block.type === '` or end of file. The
  // BlockContentEditor file enumerates blocks in a single switch-like flat
  // chain so this is a safe slice.
  const nextIdx = src.indexOf("block.type === '", startIdx + startToken.length);
  return nextIdx === -1 ? src.slice(startIdx) : src.slice(startIdx, nextIdx);
}

// Return the set of fields written to by `onChange({ FIELD: ... })`
// anywhere in the panel files corpus. The harness doesn't try to verify
// the *right* block panel writes the *right* field — its goal is to
// flag fields that have NO settings input anywhere. Cross-block field
// names (e.g. both Hero and HeroSlideshow handling `title`) coexisting
// is fine and is in fact desirable: a field exposed in any user-reachable
// editor counts as "covered" for that field name.
//
// Caveat: if two blocks share a field name and only one has the input,
// the other will appear "covered" too. This is acceptable because the
// harness's purpose is regression detection (compared against a baseline)
// rather than absolute correctness — when a developer adds a new field
// name, the baseline catches blocks where that name is first introduced.
let _allPanelFieldsCache: Set<string> | null = null;
function getAllPanelFields(): Set<string> {
  if (_allPanelFieldsCache !== null) return _allPanelFieldsCache;
  _allPanelFieldsCache = extractOnChangeFields(getCombinedPanelsSource());
  return _allPanelFieldsCache;
}

let _allContentEditorFieldsCache: Set<string> | null = null;
function getAllContentEditorFields(): Set<string> {
  if (_allContentEditorFieldsCache !== null) return _allContentEditorFieldsCache;
  // BlockContentEditor.tsx delegates several blocks to sub-components
  // defined further down the same file (e.g. MarqueeEditor, ColumnsEditor,
  // HeroSlideshowEditor). Scanning the whole file is the simple way to
  // capture fields written through those sub-components.
  _allContentEditorFieldsCache = extractOnUpdateFields(getContentEditorSource());
  return _allContentEditorFieldsCache;
}

function fieldsInPanelsFor(_type: string): Set<string> {
  return getAllPanelFields();
}

function fieldsInContentEditorFor(_type: string): Set<string> {
  return getAllContentEditorFields();
}

function extractOnChangeFields(source: string): Set<string> {
  const fields = new Set<string>();
  // onChange({ field: ... }) — the panels-style update call
  const re = /onChange\(\s*\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    fields.add(m[1]);
  }
  // Also handle multi-field updates: onChange({ a: ..., b: ... }) — we
  // already match the first; for multi we additionally scan the inner
  // object for `, field:` occurrences. Conservatively add identifiers
  // that appear on a line beginning with a comma.
  const re2 = /onChange\(\s*\{([^}]*)\}/g;
  while ((m = re2.exec(source)) !== null) {
    const inner = m[1];
    const fieldRe = /[,\s]([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(inner)) !== null) {
      fields.add(f[1]);
    }
  }
  return fields;
}

function extractOnUpdateFields(source: string): Set<string> {
  const fields = new Set<string>();
  const re = /onUpdate\(\s*\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    fields.add(m[1]);
  }
  const re2 = /onUpdate\(\s*\{([^}]*)\}/g;
  while ((m = re2.exec(source)) !== null) {
    const inner = m[1];
    const fieldRe = /[,\s]([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(inner)) !== null) {
      fields.add(f[1]);
    }
  }
  return fields;
}

// ─── ELEMENT_DEFINITIONS scanning ────────────────────────────────────────────

let _elementDefinitionsCache: Record<string, string[]> | null = null;
function getElementDefinitions(): Record<string, string[]> {
  if (_elementDefinitionsCache !== null) return _elementDefinitionsCache;
  const src = readRepoFile('components/blocks/visual/block-settings/element-definitions.ts');
  // Parse `'<type>': [ { key: 'k1', label: ... }, { key: 'k2', label: ... } ],`
  const result: Record<string, string[]> = {};
  // Find each top-level block-type entry: `'type-name': [ ... ],` (closing
  // bracket at depth 0). Walk by `'<type>': [` positions.
  const blockRe = /'([a-z][a-z0-9-]*)':\s*\[/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    const type = m[1];
    const arrStart = m.index + m[0].length - 1; // position of `[`
    let depth = 1;
    let i = arrStart + 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') depth--;
      if (depth === 0) break;
      i++;
    }
    const body = src.slice(arrStart + 1, i);
    const keys: string[] = [];
    const keyRe = /key:\s*'([^']+)'/g;
    let k: RegExpExecArray | null;
    while ((k = keyRe.exec(body)) !== null) {
      keys.push(k[1]);
    }
    result[type] = keys;
  }
  _elementDefinitionsCache = result;
  return result;
}

function rendererCallSitesForKeys(blockType: string, keys: string[]): Set<string> {
  const path = TYPE_TO_RENDERER[blockType];
  if (!path) return new Set();
  let src = '';
  try {
    src = readRepoFile(path);
  } catch {
    return new Set();
  }
  const used = new Set<string>();
  // We accept any of:
  //   getElementCSS(*, '<key>')                       — direct literal
  //   getElementCSS(*, isFoo ? '<keyA>' : '<keyB>')   — ternary literals
  //   getElementCSS(*, expr)  + the literal '<key>' appears elsewhere in
  //                              the renderer (best-effort match)
  // Strategy: a key is "consumed" if BOTH conditions hold:
  //   1. The renderer calls getElementCSS at all (i.e. wires the system)
  //   2. The string literal '<key>' appears in the renderer source
  // This catches ternary cases without needing a TS AST. False positives
  // (a string literal that happens to share a key name but isn't an
  // element key) are rare in renderer files and acceptable for the
  // baseline-vs-current regression check.
  const callsGetElementCSS = /getElementCSS\s*\(/.test(src);
  if (!callsGetElementCSS) return new Set();
  for (const key of keys) {
    const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(`'${escaped}'`, 'g');
    if (re.test(src)) {
      used.add(key);
    }
  }
  return used;
}

function rendererExistsFor(blockType: string): boolean {
  const path = TYPE_TO_RENDERER[blockType];
  if (!path) return false;
  return existsSync(join(REPO_ROOT, path));
}

// ─── E2E lifecycle scanning ──────────────────────────────────────────────────

let _e2eCache: string | null = null;
function getE2ESource(): string {
  if (_e2eCache !== null) return _e2eCache;
  _e2eCache = readRepoFile('tests/e2e/visual-editor-blocks.spec.ts');
  return _e2eCache;
}

function hasE2EFor(blockType: string): boolean {
  const src = getE2ESource();
  // Look for `test('<type> block:` — the convention used throughout the file.
  const escaped = blockType.replace(/[-]/g, '-');
  return src.includes(`test('${escaped} block:`);
}

// ─── Build the per-block report ──────────────────────────────────────────────

function buildReport(): BlockReport[] {
  return USER_PICKABLE.map((type) => {
    const interfaceFields = getInterfaceFieldsForType(type);
    const inlineFields = INLINE_EDITED_FIELDS[type] || new Set();
    const nonEditorFields = NON_EDITOR_FIELDS[type] || new Set();
    const editableFields = interfaceFields.filter(
      f => !inlineFields.has(f) && !nonEditorFields.has(f),
    );

    const panelSet = fieldsInPanelsFor(type);
    const ceSet = fieldsInContentEditorFor(type);

    const fieldsInPanels = editableFields.filter(f => panelSet.has(f));
    const fieldsInContentEditor = editableFields.filter(f => ceSet.has(f));
    const fieldsMissingFromPanels = editableFields.filter(f => !panelSet.has(f));
    const fieldsMissingFromContentEditor = editableFields.filter(f => !ceSet.has(f));
    const fieldsMissingFromBoth = editableFields.filter(
      f => !panelSet.has(f) && !ceSet.has(f),
    );

    const elementKeys = getElementDefinitions()[type] || [];
    const usedKeys = rendererCallSitesForKeys(type, elementKeys);
    const elementKeysWithRendererCallSite = elementKeys.filter(k => usedKeys.has(k));
    const deadElementKeys = elementKeys.filter(k => !usedKeys.has(k));

    return {
      type,
      interfaceFields,
      fieldsInPanels,
      fieldsInContentEditor,
      fieldsMissingFromPanels,
      fieldsMissingFromContentEditor,
      fieldsMissingFromBoth,
      elementDefinitionKeys: elementKeys,
      elementKeysWithRendererCallSite,
      deadElementKeys,
      hasE2E: hasE2EFor(type),
      rendererExists: rendererExistsFor(type),
    };
  });
}

// ─── Baseline ────────────────────────────────────────────────────────────────

const BASELINE_PATH = '.planning/audits/blocks-controls-coverage.baseline.json';
const REPORT_PATH = '.planning/audits/blocks-controls-coverage.json';

function loadBaseline(): CoverageBaseline | null {
  const full = join(REPO_ROOT, BASELINE_PATH);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf-8'));
  } catch {
    return null;
  }
}

function writeReport(reports: BlockReport[]): void {
  const summary = {
    generatedAt: new Date().toISOString(),
    totalBlocks: reports.length,
    blocksWithMissingFields: reports.filter(r => r.fieldsMissingFromBoth.length > 0).length,
    blocksWithDeadElementKeys: reports.filter(r => r.deadElementKeys.length > 0).length,
    blocksWithoutE2E: reports.filter(r => !r.hasE2E).length,
    totals: {
      missingFieldsFromBoth: reports.reduce((n, r) => n + r.fieldsMissingFromBoth.length, 0),
      missingFieldsFromPanelsOnly: reports.reduce(
        (n, r) => n + r.fieldsMissingFromPanels.filter(f => r.fieldsInContentEditor.includes(f)).length,
        0,
      ),
      missingFieldsFromContentEditorOnly: reports.reduce(
        (n, r) => n + r.fieldsMissingFromContentEditor.filter(f => r.fieldsInPanels.includes(f)).length,
        0,
      ),
      deadElementKeys: reports.reduce((n, r) => n + r.deadElementKeys.length, 0),
    },
    reports,
  };
  writeFileSync(join(REPO_ROOT, REPORT_PATH), JSON.stringify(summary, null, 2) + '\n');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Block controls coverage harness', () => {
  const reports = buildReport();
  writeReport(reports);

  it('every user-pickable block has a renderer file on disk', () => {
    const missing = reports.filter(r => !r.rendererExists).map(r => r.type);
    expect(missing, `Missing renderer files: ${missing.join(', ')}`).toEqual([]);
  });

  it('every user-pickable block resolves to a known TS interface', () => {
    const orphans = reports.filter(r => r.interfaceFields.length === 0).map(r => r.type);
    expect(orphans, `Could not parse interface fields for: ${orphans.join(', ')}. Check TYPE_TO_INTERFACE map.`).toEqual([]);
  });

  it('every block has a lifecycle E2E test', () => {
    const baseline = loadBaseline();
    const missing = reports.filter(r => !r.hasE2E).map(r => r.type);
    if (baseline) {
      // Fail only on blocks that the baseline expects to have an E2E test
      // but no longer do (regression). New gaps go into the baseline.
      const regressions = missing.filter(t => baseline.blocks[t]?.hasE2E === true);
      expect(regressions, `E2E regression — these blocks lost their lifecycle test: ${regressions.join(', ')}`).toEqual([]);
    } else {
      // If no baseline, just report rather than fail (initial run).
      console.warn(`[blocksControlsCoverage] ${missing.length} blocks missing E2E lifecycle: ${missing.join(', ')}`);
    }
  });

  it('every ELEMENT_DEFINITIONS key is consumed by its renderer (no dead keys vs baseline)', () => {
    const baseline = loadBaseline();
    if (!baseline) {
      // Initial run — emit warning, don't fail
      const total = reports.reduce((n, r) => n + r.deadElementKeys.length, 0);
      if (total > 0) {
        console.warn(`[blocksControlsCoverage] Found ${total} dead ELEMENT_DEFINITIONS keys (no baseline yet).`);
      }
      return;
    }
    const regressions: string[] = [];
    for (const r of reports) {
      const baselineCount = baseline.blocks[r.type]?.deadElementKeys ?? 0;
      if (r.deadElementKeys.length > baselineCount) {
        regressions.push(`${r.type}: ${r.deadElementKeys.length} dead keys (baseline: ${baselineCount}) — ${r.deadElementKeys.join(', ')}`);
      }
    }
    expect(regressions, `Dead ELEMENT_DEFINITIONS regressions:\n  ${regressions.join('\n  ')}`).toEqual([]);
  });

  it('every TS field has a settings input in at least one editor (no regressions vs baseline)', () => {
    const baseline = loadBaseline();
    if (!baseline) {
      const total = reports.reduce((n, r) => n + r.fieldsMissingFromBoth.length, 0);
      if (total > 0) {
        console.warn(`[blocksControlsCoverage] Found ${total} TS fields with no settings input in either editor (no baseline yet).`);
      }
      return;
    }
    const regressions: string[] = [];
    for (const r of reports) {
      const baselineCount = baseline.blocks[r.type]?.fieldsMissingFromBoth ?? 0;
      if (r.fieldsMissingFromBoth.length > baselineCount) {
        regressions.push(`${r.type}: ${r.fieldsMissingFromBoth.length} fields missing (baseline: ${baselineCount}) — ${r.fieldsMissingFromBoth.join(', ')}`);
      }
    }
    expect(regressions, `Settings-coverage regressions:\n  ${regressions.join('\n  ')}`).toEqual([]);
  });
});
