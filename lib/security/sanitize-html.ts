import sanitize from 'sanitize-html';

// Pulled from DOMPurify's html profile minus the bits we explicitly forbid
// below. Listed in full because sanitize-html's `allowedTags: false` (allow
// all) leaks `<script>` and friends — we want an explicit allow-list.
const HTML_TAGS = [
  'a','abbr','acronym','address','area','article','aside','audio','b','bdi','bdo','big','blockquote','body','br',
  'button','canvas','caption','center','cite','code','col','colgroup','data','datalist','dd','del','details','dfn',
  'dialog','dir','div','dl','dt','em','fieldset','figcaption','figure','font','footer','h1','h2','h3','h4','h5','h6',
  'head','header','hgroup','hr','html','i','img','input','ins','kbd','label','legend','li','main','map','mark',
  'menu','menuitem','meter','nav','noscript','ol','optgroup','option','output','p','picture','pre','progress','q',
  'rp','rt','ruby','s','samp','section','select','small','source','span','strong','sub','summary','sup','table',
  'tbody','td','template','textarea','tfoot','th','thead','time','title','tr','track','u','ul','var','video','wbr',
];

// SVG support — keep parity with DOMPurify which allows svg under html profile.
const SVG_TAGS = [
  'svg','g','path','circle','ellipse','line','polyline','polygon','rect','text','tspan','defs','clippath',
  'lineargradient','radialgradient','stop','use','symbol','marker','filter','mask','pattern','title','desc',
];

const ALL_TAGS = [...HTML_TAGS, ...SVG_TAGS];

const FORBIDDEN_ATTRS = ['onerror','onload','onclick','onmouseover','onfocus','onblur','srcdoc'];

const STRICT_FORBID_TAGS = new Set(['style','iframe','form','object','embed','script']);
const RICH_FORBID_TAGS = new Set(['iframe','form','object','embed','script']);

const STRICT_SCHEMES = ['http','https','mailto','tel'];
const RICH_SCHEMES = ['http','https','mailto','tel','data'];

function buildOptions(opts: {
  forbidTags: Set<string>;
  schemes: string[];
  allowDataAttr: boolean;
  allowStyleAttr: boolean;
}): sanitize.IOptions {
  const allowedTags = ALL_TAGS.filter((t) => !opts.forbidTags.has(t));

  return {
    allowedTags,
    // Allow any attribute on any tag, then strip the dangerous ones via the
    // transformer below. This mirrors DOMPurify's allow-most/forbid-named model.
    allowedAttributes: { '*': ['*'] },
    allowedSchemes: opts.schemes,
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'action', 'longdesc', 'xlink:href'],
    allowProtocolRelative: true,
    // Don't tear inline styles apart — we want DOMPurify-style behavior where
    // the style attribute either survives intact or is dropped.
    parseStyleAttributes: false,
    transformTags: {
      '*': (tagName, attribs) => {
        const cleaned: Record<string, string> = {};
        for (const [name, value] of Object.entries(attribs)) {
          const lower = name.toLowerCase();
          if (FORBIDDEN_ATTRS.includes(lower)) continue;
          // Drop every on* event handler, not just the named ones.
          if (lower.startsWith('on')) continue;
          if (!opts.allowDataAttr && lower.startsWith('data-')) continue;
          if (!opts.allowStyleAttr && lower === 'style') continue;
          cleaned[name] = value;
        }
        return { tagName, attribs: cleaned };
      },
    },
    // sanitize-html drops these tags' content by default (intentional for
    // <script>/<style>); keep that behavior.
    nonTextTags: ['script', 'style', 'textarea', 'option'],
  };
}

const STRICT_OPTIONS = buildOptions({
  forbidTags: STRICT_FORBID_TAGS,
  schemes: STRICT_SCHEMES,
  allowDataAttr: false,
  allowStyleAttr: false,
});

const RICH_OPTIONS = buildOptions({
  forbidTags: RICH_FORBID_TAGS,
  schemes: RICH_SCHEMES,
  allowDataAttr: true,
  allowStyleAttr: true,
});

/** Strict server-safe sanitization for rendering tenant- or AI-authored HTML
 *  inside the portal/admin or in recipient-facing pages (proposals, contracts,
 *  campaign previews). */
export function sanitizeHtml(html: string): string {
  return sanitize(html ?? '', STRICT_OPTIONS);
}

/** Less-strict variant that keeps inline styles + class — for admin- or
 *  staff-authored content where the author is fully trusted. Still strips
 *  scripts and event-handler attributes. */
export function sanitizeRichHtml(html: string): string {
  return sanitize(html ?? '', RICH_OPTIONS);
}
