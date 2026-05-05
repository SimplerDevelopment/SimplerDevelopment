import type { BaseBlock } from './base';

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  alignment?: 'left' | 'center' | 'right';
  size?: 'sm' | 'base' | 'lg' | 'xl';
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  content: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  alignment?: 'left' | 'center' | 'right';
}

export interface QuoteBlock extends BaseBlock {
  type: 'quote';
  content: string;
  author?: string;
  citation?: string;
}

export interface CodeBlock extends BaseBlock {
  type: 'code';
  code: string;
  language?: string;
}

export interface HtmlRenderBlock extends BaseBlock {
  type: 'html-render';
  /** Raw HTML markup; rendered directly into the parent DOM (no iframe). May
   *  contain `{{name}}` placeholders (substituted into attributes/text) and
   *  `data-field="name"` elements (whose innerHTML is replaced from values). */
  html: string;
  /** 'full' = span container width, 'contained' = max-width 1024px centered */
  width?: 'full' | 'contained';
  /** Field declarations — define editable variables exposed in the right panel
   *  and (for `data-field` elements) inline in the visual-editor iframe. */
  fields?: HtmlRenderField[];
  /** Current per-field values keyed by field name.
   *   - Scalar fields (text, richtext, url, image, color, select, number,
   *     textarea, boolean) hold a string. Booleans serialize as 'true'/'false'.
   *   - `array` fields hold `Array<Record<string, string>>`.
   *   - `group` fields hold `Record<string, string>` (single nested object).
   *  The renderer falls back to the field's `default` (or empty) when missing. */
  values?: Record<string, string | Array<Record<string, string>> | Record<string, string>>;
  /** Optional dynamic-content source. When set, every element in the
   *  template marked `data-loop="posts"` is repeated once per matching post.
   *  Inside the loop, `{{post.X}}` placeholders resolve to the current item. */
  loop?: HtmlRenderLoop;
}

export interface HtmlRenderLoop {
  /** Where items come from. Only `posts` is supported today; future sources
   *  (events, products, etc.) plug in via this discriminator. */
  source: 'posts';
  /** Slug of the post type to pull from (`case-study`, `blog`, `service`, …). */
  postType: string;
  /** Max items rendered. Default 3. */
  limit?: number;
  /** Sort order: `recent` (publishedAt DESC), `oldest`, `title` (A→Z). Default `recent`. */
  orderBy?: 'recent' | 'oldest' | 'title';
  /** Exclude these post IDs (typically the current post). */
  exclude?: number[];
}

export interface HtmlRenderField {
  /** Variable name — must match the `{{name}}` placeholder or the
   *  `data-field="name"` attribute in the template. For `tab` fields the
   *  name is purely a stable key (the tab carries no value). */
  name: string;
  /** Human-readable label shown in the right panel form. Defaults to a
   *  title-cased version of `name`. */
  label?: string;
  /** Editor input shape:
   *   - `text` / `textarea` / `number` — plain inputs
   *   - `richtext` — contentEditable + toolbar (panel) and inline edit (iframe)
   *   - `boolean` — checkbox/toggle
   *   - `url` — single text input intended for a URL
   *   - `image` — MediaPicker
   *   - `color` — color picker
   *   - `select` — dropdown of `options`
   *   - `array` — list-of-records, each entry has its own `itemFields`
   *   - `group` — single nested object with `itemFields` (like an array of length 1)
   *   - `tab` — pure organizer, no value, splits the panel into tabs */
  type:
    | 'text' | 'textarea' | 'number' | 'richtext' | 'boolean'
    | 'url' | 'image' | 'color' | 'select' | 'radio'
    | 'date' | 'datetime' | 'link' | 'post'
    | 'array' | 'group' | 'tab';
  /** For `post` — restrict the picker to a single post-type slug (e.g. only
   *  `case-study` posts). When unset, the picker shows all post types on
   *  this site. */
  postType?: string;
  /** For `select` — the choices presented as a dropdown. */
  options?: string[];
  /** Fallback value when nothing's been authored yet. */
  default?: string;
  /** Help / instruction text shown under the label in the right panel. */
  help?: string;
  /** For `array` and `group` — schema of nested sub-fields. */
  itemFields?: HtmlRenderField[];
  /** For `number` — input constraints. */
  min?: number;
  max?: number;
  step?: number;
  /** Validation — `required` enforces non-empty; `minLength`/`maxLength` apply
   *  to text-shaped values (text/textarea/richtext); `pattern` is a JS-regex
   *  source string evaluated case-sensitively. Errors surface inline in the
   *  right panel; saving is not blocked (validation is informational at this
   *  layer — server-side enforcement can be layered on later). */
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** Custom message shown when any validation fails. Falls back to a generic
   *  per-rule message if unset. */
  errorMessage?: string;
  /** Conditional show/hide — when set, this field is only rendered in the
   *  right panel form when the condition evaluates true against the block's
   *  current `values`. Doesn't affect template rendering (the placeholder
   *  still resolves) — purely an authoring-UX toggle. */
  conditional?: HtmlRenderConditional;
}

export interface HtmlRenderConditional {
  /** Other field's name to test against. */
  field: string;
  /** Comparison operator. `truthy`/`falsy` ignore `value` and just look at
   *  whether the other field is non-empty. `in`/`notIn` expect `value` to be
   *  a `|`-delimited string of options. */
  operator: 'eq' | 'neq' | 'in' | 'notIn' | 'truthy' | 'falsy';
  /** Comparison value. Optional for truthy/falsy. */
  value?: string;
}
