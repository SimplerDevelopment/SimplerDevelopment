// Match our product variants onto Printful catalog variants by colour + size.
//
// Why this exists: `printfulVariantId` is the join Printful fulfilment depends on
// (pod.ts refuses an order without it), and the portal only offers manual entry.
// That is fine for a five-variant product and unworkable for a real one — the
// Gildan Softstyle tee alone opts in with 303 variants (62 colourways x 9 sizes).
//
// The hard part is not the lookup, it is the names. Our colours come from the
// InkSoft catalog import and are heavily abbreviated — "Hthr Irish Grn",
// "Antqu Chry Red", "HtCardinal", "TrplBlue" — while Printful spells them out.
// A naive string compare matches almost nothing, so the comparison happens on a
// normalised form.
//
// Everything here is pure. The Printful catalog fetch lives in the provider; this
// module only decides what pairs with what, which is the part worth testing.

export interface LocalVariant {
  id: number;
  /** e.g. "S / Indigo Blue" — the shape lib/catalog/opt-in.ts produces. */
  name?: string | null;
  color?: string | null;
  size?: string | null;
}

export interface PrintfulCatalogVariant {
  id: number;
  color?: string | null;
  size?: string | null;
}

export interface MatchResult {
  matched: Array<{ variantId: number; printfulVariantId: number; color: string; size: string }>;
  unmatched: Array<{ variantId: number; color: string; size: string; reason: string }>;
}

/**
 * Abbreviations seen in the InkSoft-sourced catalog, longest-first so that
 * "sapph" is consumed before a shorter overlapping key could split it.
 *
 * Deliberately a lookup table rather than clever stemming: colour names are a
 * closed, human-authored vocabulary, and a wrong expansion here silently maps a
 * customer's garment to the wrong colour — far worse than failing to match.
 */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bhthr\b|\bhtr\b|\bht\b/g, 'heather'],
  [/\bantqu\b|\bantq\b/g, 'antique'],
  [/\bchry\b/g, 'cherry'],
  [/\bgrn\b/g, 'green'],
  [/\bmltry\b|\bmil\b/g, 'military'],
  [/\bblu\b|\bbl\b/g, 'blue'],
  [/\bsapph\b/g, 'sapphire'],
  [/\bgry\b|\bgrey\b/g, 'gray'],
  [/\bdk\b/g, 'dark'],
  [/\blt\b/g, 'light'],
  [/\btrpl\b/g, 'triple'],
  [/\bradorcd\b|\bradorchid\b/g, 'radiantorchid'],
  [/\bhelcona\b|\bhelicon\b/g, 'heliconia'],
  [/\bgalapag\b/g, 'galapagos'],
];

/**
 * Split a camel/run-together token so "IceGrey" and "TrplBlue" become separate
 * words the abbreviation table can see.
 */
function splitRuns(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * Normalise a colour name to a comparison key.
 *
 * Pure — exported for unit testing, which is where the abbreviation table earns
 * its keep.
 */
export function normalizeColor(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = splitRuns(String(raw)).toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  for (const [pattern, replacement] of ABBREVIATIONS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/\s+/g, '');
}

/**
 * Normalise a size to a comparison key. 2XL / XXL / 2X all mean the same
 * garment, and the two catalogs do not agree on which to use.
 *
 * Pure — exported for unit testing.
 */
export function normalizeSize(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  // XXL -> 2XL, XXXL -> 3XL, …
  const xs = s.match(/^(X{2,})L$/);
  if (xs) s = `${xs[1].length}XL`;
  // 2X -> 2XL
  s = s.replace(/^(\d)X$/, '$1XL');
  return s;
}

/**
 * Pull colour and size out of a variant, falling back to splitting the
 * "Size / Color" name that opt-in generates.
 *
 * Pure — exported for unit testing.
 */
export function variantColorSize(v: LocalVariant): { color: string; size: string } {
  if (v.color || v.size) return { color: v.color ?? '', size: v.size ?? '' };
  const parts = String(v.name ?? '').split('/').map((p) => p.trim());
  if (parts.length >= 2) return { size: parts[0], color: parts.slice(1).join('/') };
  return { color: '', size: '' };
}

/**
 * Pair our variants with Printful's by normalised colour + size.
 *
 * Unmatched variants are returned rather than guessed at. A wrong id prints the
 * wrong garment, so "no match" is always the safer answer than "closest match" —
 * there is deliberately no fuzzy fallback here.
 */
export function matchVariants(
  ours: LocalVariant[],
  printfuls: PrintfulCatalogVariant[],
): MatchResult {
  const index = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const p of printfuls) {
    const key = `${normalizeColor(p.color)}|${normalizeSize(p.size)}`;
    if (index.has(key) && index.get(key) !== p.id) {
      // Two Printful variants normalise to the same key — refuse both rather
      // than pick one arbitrarily.
      ambiguous.add(key);
      continue;
    }
    index.set(key, p.id);
  }

  const matched: MatchResult['matched'] = [];
  const unmatched: MatchResult['unmatched'] = [];

  for (const v of ours) {
    const { color, size } = variantColorSize(v);
    const key = `${normalizeColor(color)}|${normalizeSize(size)}`;

    if (!color || !size) {
      unmatched.push({ variantId: v.id, color, size, reason: 'variant has no colour/size' });
      continue;
    }
    if (ambiguous.has(key)) {
      unmatched.push({ variantId: v.id, color, size, reason: 'ambiguous — several Printful variants normalise alike' });
      continue;
    }
    const printfulVariantId = index.get(key);
    if (printfulVariantId === undefined) {
      unmatched.push({ variantId: v.id, color, size, reason: 'no Printful variant with this colour + size' });
      continue;
    }
    matched.push({ variantId: v.id, printfulVariantId, color, size });
  }

  return { matched, unmatched };
}
