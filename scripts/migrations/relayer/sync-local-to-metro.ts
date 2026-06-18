/**
 * One-shot sync of the Relayer site content from the LOCAL dryrun DB onto METRO
 * production, so production matches what was refined locally.
 *
 *   - booking page `relayer-demo` (created on metro if missing; referenced by
 *     slug in the page content, so no id remap is needed)
 *   - all 9 page/blog post bodies (content + customCss/customJs + title + SEO)
 *   - site navigation (replace)
 *
 * Does NOT touch metro-only production settings: publicAccess, preview_code,
 * domain/subdomain, owners, deploymentStatus, or the re-hosted SVG logo.
 *
 *   ALLOW_PROD=1 METRO_URL='postgres://…metro…' npx tsx scripts/migrations/relayer/sync-local-to-metro.ts
 */
import postgres from 'postgres';

const LOCAL_URL = process.env.LOCAL_URL || 'postgresql://127.0.0.1/simplerdev_realprod_dryrun';
const METRO_URL = process.env.METRO_URL || '';
if (!METRO_URL) { console.error('METRO_URL is required'); process.exit(1); }
if (!METRO_URL.includes('metro.proxy.rlwy.net')) { console.error('METRO_URL does not look like metro'); process.exit(1); }
if (process.env.ALLOW_PROD !== '1') { console.error('Refusing: set ALLOW_PROD=1 to write to metro'); process.exit(1); }

const LOCAL_WEB = 447, METRO_WEB = 408;
const METRO_CLIENT = 148, METRO_BRANDING = 39, METRO_USER = 335;

const local = postgres(LOCAL_URL, { max: 2 });
const metro = postgres(METRO_URL, { max: 2 });

async function main() {
  // ── 1. Booking page (upsert by slug) ───────────────────────────────────────
  const [bp] = await local`select * from booking_pages where id = 8`;
  if (!bp) throw new Error('local booking_pages id=8 not found');
  const data: Record<string, unknown> = { ...bp };
  delete data.id; delete data.created_at; delete data.updated_at;
  data.client_id = METRO_CLIENT;
  data.website_id = METRO_WEB;
  data.branding_profile_id = METRO_BRANDING;
  data.created_by = METRO_USER;

  const existing = await metro`select id from booking_pages where website_id = ${METRO_WEB} and slug = ${bp.slug as string}`;
  let bookingId: number;
  if (existing.length) {
    bookingId = existing[0].id;
    await metro`update booking_pages set ${metro(data)}, updated_at = now() where id = ${bookingId}`;
    console.log(`[booking] updated id=${bookingId} slug=${bp.slug} active=${data.active}`);
  } else {
    const [ins] = await metro`insert into booking_pages ${metro(data)} returning id`;
    bookingId = ins.id;
    console.log(`[booking] created id=${bookingId} slug=${bp.slug} active=${data.active}`);
  }

  // ── 2. Post bodies (update metro by slug) ──────────────────────────────────
  const posts = await local`
    select slug, content, custom_css, custom_js, title, seo_title, seo_description, og_image
    from posts where website_id = ${LOCAL_WEB}`;
  let changed = 0;
  for (const p of posts) {
    const [m] = await metro`select id, length(content) clen from posts where website_id = ${METRO_WEB} and slug = ${p.slug as string}`;
    if (!m) { console.log(`[post] WARN: no metro post for slug=${p.slug}`); continue; }
    const before = Number(m.clen);
    await metro`
      update posts set
        content = ${p.content as string},
        custom_css = ${(p.custom_css as string) ?? null},
        custom_js = ${(p.custom_js as string) ?? null},
        title = ${p.title as string},
        seo_title = ${(p.seo_title as string) ?? null},
        seo_description = ${(p.seo_description as string) ?? null},
        og_image = ${(p.og_image as string) ?? null},
        updated_at = now()
      where id = ${m.id}`;
    const after = (p.content as string).length;
    if (before !== after) { changed++; console.log(`[post] ${p.slug}: ${before} -> ${after} bytes`); }
  }
  console.log(`[posts] synced ${posts.length}, content-changed ${changed}`);

  // ── 3. Navigation (replace) ────────────────────────────────────────────────
  const nav = await local`
    select label, href, sort_order, open_in_new_tab, is_button, description, icon, featured_image, column_group, draft
    from site_navigation where website_id = ${LOCAL_WEB} order by sort_order`;
  await metro`delete from site_navigation where website_id = ${METRO_WEB}`;
  for (const n of nav) {
    await metro`insert into site_navigation ${metro({
      website_id: METRO_WEB,
      label: n.label, href: n.href, sort_order: n.sort_order,
      open_in_new_tab: n.open_in_new_tab, is_button: n.is_button,
      description: n.description, icon: n.icon, featured_image: n.featured_image,
      column_group: n.column_group, draft: n.draft,
    })}`;
  }
  console.log(`[nav] replaced with ${nav.length} items`);

  console.log('\n✅ Sync complete. Booking id on metro:', bookingId);
}

main()
  .then(async () => { await local.end(); await metro.end(); process.exit(0); })
  .catch(async (e) => { console.error('FATAL', e); await local.end().catch(() => {}); await metro.end().catch(() => {}); process.exit(1); });
