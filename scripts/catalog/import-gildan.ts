/**
 * Import the Gildan subset of the legacy InkSoft `catalog_db` into the shared
 * global POD catalog tables (lib/db/schema/catalog.ts) in the SimplerDevelopment
 * main DB.
 *
 * Source : catalog_db  (CATALOG_DATABASE_URL, default postgresql://127.0.0.1/catalog_db)
 * Dest   : main app DB (DATABASE_URL — same target as the app / drizzle)
 *
 * Idempotent: every row upserts on its unique source_id, so re-running refreshes
 * in place rather than duplicating. Image columns are left as cleaned source
 * paths (placeholders); the S3 photo-ingest phase backfills the real URLs +
 * pixel dimensions.
 *
 *   bun scripts/catalog/import-gildan.ts            # apply
 *   bun scripts/catalog/import-gildan.ts --dry-run  # report source counts only
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import postgres from 'postgres';

const CATALOG_URL =
  process.env.CATALOG_DATABASE_URL || 'postgresql://127.0.0.1/catalog_db';
const DEST_URL = process.env.DATABASE_URL;
if (!DEST_URL) throw new Error('DATABASE_URL is not set');

const DRY = process.argv.includes('--dry-run');

const cleanPath = (p: string | null): string | null =>
  p ? p.split('?')[0] : null;
const toCents = (x: unknown): number | null =>
  x == null ? null : Math.round(Number(x) * 100);
const normHex = (h: unknown): string | null => {
  if (!h) return null;
  const s = String(h).trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(s) ? '#' + s.toLowerCase() : null;
};

async function main() {
  const src = postgres(CATALOG_URL, { max: 1 });
  const dst = postgres(DEST_URL!, { max: 1 });

  try {
    // ── Read the Gildan subset from the source catalog ──────────────────────
    const products = await src`
      select p.*, s.name as supplier_name
      from products p
      left join suppliers s on s.id = p.supplier_id
      where p.name ilike '%gildan%' or p.slug ilike '%gildan%'
      order by p.id`;
    const productIds = products.map((p) => p.id);

    const styles = productIds.length
      ? await src`select * from styles where product_id in ${src(productIds)} order by id`
      : [];
    const styleIds = styles.map((s) => s.id);

    const sides = styleIds.length
      ? await src`select * from sides where style_id in ${src(styleIds)} order by id`
      : [];
    const sizes = styleIds.length
      ? await src`select * from sizes where style_id in ${src(styleIds)} order by id`
      : [];

    // Group children by parent for completeness checks + ordered inserts.
    const stylesByProduct = new Map<number, typeof styles>();
    for (const s of styles) {
      const arr = stylesByProduct.get(s.product_id) ?? [];
      arr.push(s);
      stylesByProduct.set(s.product_id, arr);
    }
    const sidesByStyle = new Map<number, typeof sides>();
    for (const sd of sides) {
      const arr = sidesByStyle.get(sd.style_id) ?? [];
      arr.push(sd);
      sidesByStyle.set(sd.style_id, arr);
    }
    const sizesByStyle = new Map<number, typeof sizes>();
    for (const sz of sizes) {
      const arr = sizesByStyle.get(sz.style_id) ?? [];
      arr.push(sz);
      sizesByStyle.set(sz.style_id, arr);
    }

    console.log(
      `Source (Gildan): ${products.length} products / ${styles.length} styles / ${sides.length} sides / ${sizes.length} sizes`
    );
    const incomplete = products.filter((p) => {
      const ss = stylesByProduct.get(p.id) ?? [];
      return !ss.some(
        (s) => (sidesByStyle.get(s.id)?.length ?? 0) > 0 && (sizesByStyle.get(s.id)?.length ?? 0) > 0
      );
    });
    if (incomplete.length) {
      console.log(
        `  flagged incomplete (no sides+sizes): ${incomplete.map((p) => `${p.id}:${p.name}`).join(', ')}`
      );
    }

    if (DRY) {
      console.log('--dry-run: no writes performed.');
      return;
    }

    let nP = 0, nS = 0, nSd = 0, nSz = 0;

    await dst.begin(async (tx) => {
      for (const p of products) {
        const pStyles = stylesByProduct.get(p.id) ?? [];
        const complete = pStyles.some(
          (s) => (sidesByStyle.get(s.id)?.length ?? 0) > 0 && (sizesByStyle.get(s.id)?.length ?? 0) > 0
        );

        const [cp] = await tx`
          insert into catalog_products (
            source_id, inksoft_id, brand, supplier_name, name, slug, long_description,
            can_print, can_digital_print, can_screen_print, can_embroider, active, complete,
            seo_title, seo_description, seo_keywords
          ) values (
            ${p.id}, ${p.inksoft_id ?? null}, 'Gildan', ${p.supplier_name ?? null}, ${p.name ?? ''}, ${p.slug ?? ''}, ${p.long_description ?? null},
            ${!!p.can_print}, ${!!p.can_digital_print}, ${!!p.can_screen_print}, ${!!p.can_embroider}, ${!!p.active}, ${complete},
            ${p.seo_title ?? null}, ${p.seo_description ?? null}, ${p.seo_keywords ?? null}
          )
          on conflict (source_id) do update set
            inksoft_id = excluded.inksoft_id, brand = excluded.brand, supplier_name = excluded.supplier_name,
            name = excluded.name, slug = excluded.slug, long_description = excluded.long_description,
            can_print = excluded.can_print, can_digital_print = excluded.can_digital_print,
            can_screen_print = excluded.can_screen_print, can_embroider = excluded.can_embroider,
            active = excluded.active, complete = excluded.complete,
            seo_title = excluded.seo_title, seo_description = excluded.seo_description,
            seo_keywords = excluded.seo_keywords, updated_at = now()
          returning id`;
        const catalogProductId = cp.id;
        nP++;

        for (const st of pStyles) {
          const [cs] = await tx`
            insert into catalog_styles (
              source_id, inksoft_id, catalog_product_id, name, color_hex_1, color_hex_2,
              is_default, is_light_color, is_dark_color, is_heathered, unit_price_cents,
              source_image_path_front
            ) values (
              ${st.id}, ${st.inksoft_id ?? null}, ${catalogProductId}, ${st.name ?? ''},
              ${normHex(st.html_color1)}, ${normHex(st.html_color2)},
              ${!!st.is_default}, ${!!st.is_light_color}, ${!!st.is_dark_color}, ${!!st.is_heathered},
              ${toCents(st.unit_price)}, ${cleanPath(st.image_file_path_front)}
            )
            on conflict (source_id) do update set
              inksoft_id = excluded.inksoft_id, catalog_product_id = excluded.catalog_product_id,
              name = excluded.name, color_hex_1 = excluded.color_hex_1, color_hex_2 = excluded.color_hex_2,
              is_default = excluded.is_default, is_light_color = excluded.is_light_color,
              is_dark_color = excluded.is_dark_color, is_heathered = excluded.is_heathered,
              unit_price_cents = excluded.unit_price_cents,
              source_image_path_front = excluded.source_image_path_front, updated_at = now()
            returning id`;
          const catalogStyleId = cs.id;
          nS++;

          for (const sd of sidesByStyle.get(st.id) ?? []) {
            await tx`
              insert into catalog_sides (
                source_id, inksoft_id, catalog_style_id, side, source_image_path, width, height
              ) values (
                ${sd.id}, ${sd.inksoft_id ?? null}, ${catalogStyleId}, ${sd.side ?? ''},
                ${cleanPath(sd.image_file_path)}, ${sd.width ?? null}, ${sd.height ?? null}
              )
              on conflict (source_id) do update set
                inksoft_id = excluded.inksoft_id, catalog_style_id = excluded.catalog_style_id,
                side = excluded.side, source_image_path = excluded.source_image_path,
                width = excluded.width, height = excluded.height, updated_at = now()`;
            nSd++;
          }

          for (const sz of sizesByStyle.get(st.id) ?? []) {
            await tx`
              insert into catalog_sizes (
                source_id, inksoft_id, catalog_style_id, name, long_name, unit_price_cents, weight, in_stock
              ) values (
                ${sz.id}, ${sz.inksoft_id ?? null}, ${catalogStyleId}, ${sz.name ?? null}, ${sz.long_name ?? null},
                ${toCents(sz.unit_price)}, ${sz.weight ?? null}, ${sz.in_stock ?? true}
              )
              on conflict (source_id) do update set
                inksoft_id = excluded.inksoft_id, catalog_style_id = excluded.catalog_style_id,
                name = excluded.name, long_name = excluded.long_name,
                unit_price_cents = excluded.unit_price_cents, weight = excluded.weight,
                in_stock = excluded.in_stock, updated_at = now()`;
            nSz++;
          }
        }
      }
    });

    console.log(`Imported: ${nP} products / ${nS} styles / ${nSd} sides / ${nSz} sizes`);
  } finally {
    await src.end({ timeout: 5 });
    await dst.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
