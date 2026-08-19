// Icon pack resolver — replaces dynamic require('react-icons/<pack>')
// from the original CRA build.
//
// Previously this eagerly did `import * as Md from "react-icons/md"` (and
// five sibling packs) and consumed the result via computed property access
// (`ICON_PACKS[pack][name]`, `Object.values(ICON_PACKS)`). A bundler cannot
// tree-shake a namespace object that's read dynamically like that — it has
// no way to know at build time which of the ~4,300 md exports are "used",
// so it keeps all of them. That is the exact unshakeable-by-construction
// pattern documented in next.config.ts's `optimizePackageImports` comment,
// and it's the same class of bug the `f7b5c515c` fix addressed in
// components/portal/IconPicker.tsx — that fix missed this file.
//
// Because this resolver is reachable — via Layer.tsx → ProductDesigner —
// from the storefront product-customization route
// (app/sites/[domain]/design/[productSlug]), the eagerly-materialized
// react-icons/md package became a single large "vendor" chunk in the
// production build. Turbopack's chunk-group manifest then listed that
// vendor chunk against every client-boundary module sharing a chunk group
// with it (SiteBlockRenderer, next/link, etc.), which is how the barrel
// ended up loading on unrelated pages such as blog posts — see the
// `perf/react-icons-barrel-round2` investigation for the manifest diff
// that confirms this.
//
// Fix: load each pack lazily, on first actual use, cached per pack so a
// design that reuses the same pack repeatedly only pays the network cost
// once. `resolveIcon` is now async — callers resolve a layer's icon in an
// effect (see Layer.tsx) rather than during render.
//
// Add another pack here if a layer ever stores `iconPack: 'xx'` for one
// that isn't loaded.

type IconModule = Record<string, React.ComponentType<any>>;

// `import()`'s inferred type is the module namespace object, which (under
// esModuleInterop) carries a synthetic `default` property typed as the
// namespace itself — that's not assignable to our `Record<string,
// ComponentType>` view, so the loaders return the raw unknown module and
// callers narrow it with `asIconModule`.
type RawModule = Record<string, unknown>;

function asIconModule(mod: RawModule): IconModule {
  return mod as unknown as IconModule;
}

const PACK_LOADERS: Record<string, () => Promise<RawModule>> = {
  fa6: () => import("react-icons/fa6"),
  bs: () => import("react-icons/bs"),
  ai: () => import("react-icons/ai"),
  io5: () => import("react-icons/io5"),
  // Alias for legacy layer data that stored `iconPack: 'io'`.
  io: () => import("react-icons/io5"),
  rx: () => import("react-icons/rx"),
  md: () => import("react-icons/md"),
};

// One in-flight/resolved promise per pack, shared across every call site and
// every layer — a design with 20 icon layers from the same pack triggers
// exactly one network fetch of that pack, not 20.
const packCache = new Map<string, Promise<RawModule>>();

function loadPack(pack: string): Promise<RawModule> | undefined {
  const loader = PACK_LOADERS[pack];
  if (!loader) return undefined;
  let cached = packCache.get(pack);
  if (!cached) {
    cached = loader();
    packCache.set(pack, cached);
  }
  return cached;
}

/**
 * Resolves an icon component for the given pack + name. Async — each pack
 * is fetched on first use instead of being bundled eagerly. Call this from
 * an effect (or other non-render context), not synchronously during render.
 */
export async function resolveIcon(
  pack: string | undefined,
  name: string | undefined,
): Promise<React.ComponentType<any> | null> {
  if (!name) return null;

  if (pack) {
    const raw = await loadPack(pack);
    const mod = raw && asIconModule(raw);
    if (mod?.[name]) return mod[name];
  }

  // Fallback: scan all packs for the name (preserves prior behaviour for
  // legacy layer data that doesn't carry an `iconPack`).
  const packs = await Promise.all(Object.keys(PACK_LOADERS).map((p) => loadPack(p)!));
  for (const raw of packs) {
    const mod = asIconModule(raw);
    if (mod[name]) return mod[name];
  }
  return null;
}
