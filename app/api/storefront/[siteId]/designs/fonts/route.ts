import { NextRequest, NextResponse } from 'next/server';

// Static font catalog. v1 ships a curated list of common Google Fonts so the
// editor's font picker is functional without extra infra. v2 can swap this
// for a DB-driven per-site catalog (designAssets type=font) and/or proxy
// the live Google Fonts API.
//
// Shape returned: `{ family, files: { regular }, category }` — preserves the
// editor's existing call sites (FontSelector, fontLoader) which probe for
// `font.files?.regular || font.menu`.
//
// Wave 2I — Storefront refactor.
const FONT_CATALOG: Array<{ family: string; category: string; files: { regular: string } }> = [
  { family: 'Roboto',           category: 'sans-serif', files: { regular: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2' } },
  { family: 'Open Sans',        category: 'sans-serif', files: { regular: 'https://fonts.gstatic.com/s/opensans/v40/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B4gaVc.woff2' } },
  { family: 'Lato',             category: 'sans-serif', files: { regular: 'https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjxAwXiWtFCfQ7A.woff2' } },
  { family: 'Montserrat',       category: 'sans-serif', files: { regular: 'https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459W1hyzbi.woff2' } },
  { family: 'Poppins',          category: 'sans-serif', files: { regular: 'https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecg.woff2' } },
  { family: 'Inter',            category: 'sans-serif', files: { regular: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIw2boKoduKmMEVuLyfMZg.woff2' } },
  { family: 'Bebas Neue',       category: 'display',    files: { regular: 'https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WlhyyTh89Y.woff2' } },
  { family: 'Pacifico',         category: 'handwriting',files: { regular: 'https://fonts.gstatic.com/s/pacifico/v22/FwZY7-Qmy14u9lezJ-6H6MmBp0u-zK4.woff2' } },
  { family: 'Playfair Display', category: 'serif',      files: { regular: 'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvXDXbtY.woff2' } },
  { family: 'Lobster',          category: 'display',    files: { regular: 'https://fonts.gstatic.com/s/lobster/v30/neILzCirqoswsqX9zoKmM4MwWJU.woff2' } },
];

// GET /api/storefront/[siteId]/designs/fonts?search=&page=&limit=
//
// Public — no auth required. Filters the catalog client-side with naive
// substring matching so the editor's incremental search still works without
// pulling in a real font index.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId, 10);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }

  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));

  const filtered = search
    ? FONT_CATALOG.filter(f => f.family.toLowerCase().includes(search))
    : FONT_CATALOG;

  const start = (page - 1) * limit;
  const slice = filtered.slice(start, start + limit);

  return NextResponse.json({ success: true, data: slice });
}
