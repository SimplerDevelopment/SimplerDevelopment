/**
 * Bootstrap the "Magamommy" tenant from scratch.
 *
 * Magamommy is an autonomous merch shop — one new shirt drop per week.
 * This script provisions the foundational rows that every weekly drop job
 * later assumes exist:
 *
 *   1. users               magamommy@simplerdevelopment.com (role=client)
 *   2. clients             Magamommy (emailPrefix=magamommy)
 *   3. clientMembers       owner link (user -> client)
 *   4. clientWebsites      magamommy.simplerdevelopment.com (custom: magamommy.com)
 *   5. storeSettings       enabled, USD, no Stripe Connect yet (manual step)
 *   6. brandingProfiles    MAGA-adjacent palette + Oswald/Inter, isDefault
 *   7. productCategories   "Weekly Drops"
 *   8. products            "Heavyweight Tee (template)" — archived clone source
 *   9. productDesignSurfaces  Front + Back, 2400x3200 canvas, 600x900 print area
 *   10. productOptions + productOptionValues  Size {S,M,L,XL,XXL}, Color {White,Black,Heather Grey}
 *
 * Idempotence: every step does SELECT-first and either skips or updates.
 * Re-running 5x in a row produces all "skipping (already exists)" lines and
 * exits 0 with the same summary block.
 *
 * Safety: prints the target DATABASE_URL up front and refuses to run against
 * the known production proxies unless ALLOW_PROD=1 is set (mirrors
 * scripts/verify-db-target.ts).
 *
 * Usage:
 *   bun scripts/magamommy/bootstrap-tenant.ts
 *
 * The generated user's password is printed to stdout exactly once on initial
 * create — capture it. Re-runs do NOT rotate the password.
 *
 * Per-machine env: DATABASE_URL comes from .env / .env.local via lib/db.
 */

import * as dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const PROD_INDICATORS = [
  'tramway.proxy.rlwy.net:43167',
  'metro.proxy.rlwy.net:25565',
];

const MAGAMOMMY_USER_EMAIL = 'magamommy@simplerdevelopment.com';
const MAGAMOMMY_USER_NAME = 'Magamommy';
const MAGAMOMMY_COMPANY = 'Magamommy';
const MAGAMOMMY_DOMAIN = 'magamommy.com';
const MAGAMOMMY_DESIRED_SUBDOMAIN = 'magamommy';
const MAGAMOMMY_EMAIL_PREFIX = 'magamommy';
const BRAND_NAME = 'Magamommy';
const CATEGORY_NAME = 'Weekly Drops';
const CATEGORY_SLUG = 'weekly-drops';
const TEMPLATE_PRODUCT_SLUG = 'heavyweight-tee-template';
const TEMPLATE_PRODUCT_NAME = 'Heavyweight Tee (template)';

function verifyDbTarget(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    console.error('[bootstrap-magamommy] DATABASE_URL is not set.');
    process.exit(1);
  }
  const hitProd =
    PROD_INDICATORS.some((p) => url.includes(p)) ||
    process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
  const override = process.env.ALLOW_PROD === '1';
  const redacted = url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
  console.log(`[bootstrap-magamommy] DATABASE_URL → ${redacted}`);
  if (hitProd && !override) {
    console.error('');
    console.error('  REFUSING to run bootstrap against production.');
    console.error('  Re-run with ALLOW_PROD=1 if this is truly intentional.');
    console.error('');
    process.exit(1);
  }
  if (hitProd) {
    console.log('[bootstrap-magamommy] prod override active via ALLOW_PROD=1');
  }
}

async function main(): Promise<void> {
  verifyDbTarget();

  const { db } = await import('../../lib/db');
  const {
    users,
    clients,
    clientMembers,
    clientWebsites,
    brandingProfiles,
    storeSettings,
    productCategories,
    products,
    productDesignSurfaces,
    productOptions,
    productOptionValues,
  } = await import('../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const { hash } = await import('bcryptjs');
  const { generateUniqueSubdomain } = await import('../../lib/subdomain');

  // ── Step 1: user ─────────────────────────────────────────────────────────
  let generatedPassword: string | null = null;
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, MAGAMOMMY_USER_EMAIL))
    .limit(1);
  if (user) {
    console.log(`  user            skipping (already exists) id=${user.id}`);
  } else {
    generatedPassword = randomBytes(18).toString('base64url');
    const hashed = await hash(generatedPassword, 12);
    [user] = await db
      .insert(users)
      .values({
        name: MAGAMOMMY_USER_NAME,
        email: MAGAMOMMY_USER_EMAIL,
        password: hashed,
        role: 'client',
        active: true,
      })
      .returning();
    console.log(`  user            created id=${user.id}`);
  }

  // ── Step 2: client ───────────────────────────────────────────────────────
  let [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.userId, user.id))
    .limit(1);
  if (client) {
    console.log(`  client          skipping (already exists) id=${client.id}`);
  } else {
    [client] = await db
      .insert(clients)
      .values({
        userId: user.id,
        company: MAGAMOMMY_COMPANY,
        website: `https://${MAGAMOMMY_DOMAIN}`,
        emailPrefix: MAGAMOMMY_EMAIL_PREFIX,
      })
      .returning();
    console.log(`  client          created id=${client.id}`);
  }

  // ── Step 3: clientMembers (owner link) ───────────────────────────────────
  const [existingMember] = await db
    .select()
    .from(clientMembers)
    .where(
      and(
        eq(clientMembers.clientId, client.id),
        eq(clientMembers.userId, user.id),
      ),
    )
    .limit(1);
  if (existingMember) {
    console.log(`  clientMembers   skipping (already exists) id=${existingMember.id}`);
  } else {
    const [member] = await db
      .insert(clientMembers)
      .values({
        clientId: client.id,
        userId: user.id,
        role: 'owner',
      })
      .returning();
    console.log(`  clientMembers   created id=${member.id}`);
  }

  // ── Step 4: clientWebsites ───────────────────────────────────────────────
  let [website] = await db
    .select()
    .from(clientWebsites)
    .where(eq(clientWebsites.domain, MAGAMOMMY_DOMAIN))
    .limit(1);
  if (website) {
    console.log(`  clientWebsites  skipping (already exists) id=${website.id}`);
  } else {
    // Prefer the desired slug; fall back to a unique variant if taken.
    let subdomain = MAGAMOMMY_DESIRED_SUBDOMAIN;
    const [slugClash] = await db
      .select({ id: clientWebsites.id })
      .from(clientWebsites)
      .where(eq(clientWebsites.subdomain, subdomain))
      .limit(1);
    if (slugClash) {
      subdomain = await generateUniqueSubdomain(MAGAMOMMY_COMPANY, 'main');
    }
    [website] = await db
      .insert(clientWebsites)
      .values({
        clientId: client.id,
        name: BRAND_NAME,
        domain: MAGAMOMMY_DOMAIN,
        subdomain,
        vercelDomain: `${subdomain}.simplerdevelopment.com`,
        deploymentStatus: 'active',
        publicAccess: true,
        active: true,
      })
      .returning();
    console.log(`  clientWebsites  created id=${website.id} subdomain=${subdomain}`);
  }

  // ── Step 5: storeSettings ────────────────────────────────────────────────
  const [existingStore] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, website.id))
    .limit(1);
  if (existingStore) {
    console.log(`  storeSettings   skipping (already exists) id=${existingStore.id}`);
  } else {
    const [store] = await db
      .insert(storeSettings)
      .values({
        websiteId: website.id,
        enabled: true,
        storeName: BRAND_NAME,
        currency: 'USD',
        taxRate: '0',
        // stripeAccountId intentionally null — Connect onboarding is manual.
      })
      .returning();
    console.log(`  storeSettings   created id=${store.id}`);
  }

  // ── Step 6: brandingProfiles + link to website ───────────────────────────
  let [branding] = await db
    .select()
    .from(brandingProfiles)
    .where(
      and(
        eq(brandingProfiles.clientId, client.id),
        eq(brandingProfiles.name, BRAND_NAME),
      ),
    )
    .limit(1);
  if (branding) {
    console.log(`  brandingProfile skipping (already exists) id=${branding.id}`);
  } else {
    [branding] = await db
      .insert(brandingProfiles)
      .values({
        clientId: client.id,
        name: BRAND_NAME,
        isDefault: true,
        primaryColor: '#B22234',       // Old Glory red
        secondaryColor: '#3C3B6E',     // Old Glory blue
        backgroundColor: '#FFFFFF',
        headingFont: 'Oswald',
        bodyFont: 'Inter',
      })
      .returning();
    console.log(`  brandingProfile created id=${branding.id}`);
  }

  // Always reconcile the website -> branding FK (idempotent).
  if (website.brandingProfileId !== branding.id) {
    await db
      .update(clientWebsites)
      .set({ brandingProfileId: branding.id })
      .where(eq(clientWebsites.id, website.id));
    console.log(`  clientWebsites  linked brandingProfileId=${branding.id}`);
    website = { ...website, brandingProfileId: branding.id };
  }

  // ── Step 7: productCategories ────────────────────────────────────────────
  const [existingCategory] = await db
    .select()
    .from(productCategories)
    .where(
      and(
        eq(productCategories.websiteId, website.id),
        eq(productCategories.slug, CATEGORY_SLUG),
      ),
    )
    .limit(1);
  if (existingCategory) {
    console.log(`  category        skipping (already exists) id=${existingCategory.id}`);
  } else {
    const [cat] = await db
      .insert(productCategories)
      .values({
        websiteId: website.id,
        name: CATEGORY_NAME,
        slug: CATEGORY_SLUG,
        active: true,
        order: 0,
      })
      .returning();
    console.log(`  category        created id=${cat.id}`);
  }

  // ── Step 8: template product (archived clone source) ─────────────────────
  let [templateProduct] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.websiteId, website.id),
        eq(products.slug, TEMPLATE_PRODUCT_SLUG),
      ),
    )
    .limit(1);
  if (templateProduct) {
    console.log(`  template product skipping (already exists) id=${templateProduct.id}`);
  } else {
    [templateProduct] = await db
      .insert(products)
      .values({
        websiteId: website.id,
        categoryId: null,
        name: TEMPLATE_PRODUCT_NAME,
        slug: TEMPLATE_PRODUCT_SLUG,
        description: 'Base template for weekly drops. Not for sale.',
        price: 2900, // cents = $29
        status: 'archived',
        isDesignable: true,
        trackInventory: false,
        quantity: 0,
      })
      .returning();
    console.log(`  template product created id=${templateProduct.id}`);
  }

  // ── Step 9: productDesignSurfaces (Front + Back) ─────────────────────────
  // Canvas: 2400×3200 px @ 300 DPI ≈ an 8"×10.67" mockup.
  // Print area: 600×900 px centered on chest (eyeballed:
  //   x = (2400 - 600) / 2 = 900
  //   y ≈ 800 (top-of-chest)
  // Mockup PNGs are seeded by scripts/magamommy/generate-blank-mockups.ts
  // (placeholder SVG silhouettes; swap for hi-fi product photography when
  // available — the designer only needs the print bounds + a file at the URL).
  const surfaces = [
    {
      name: 'Front',
      slug: 'front',
      displayOrder: 0,
      mockupImage: '/assets/magamommy/blank-tee-white-front.png',
    },
    {
      name: 'Back',
      slug: 'back',
      displayOrder: 1,
      mockupImage: '/assets/magamommy/blank-tee-white-back.png',
    },
  ];
  for (const s of surfaces) {
    const [existingSurface] = await db
      .select()
      .from(productDesignSurfaces)
      .where(
        and(
          eq(productDesignSurfaces.productId, templateProduct.id),
          eq(productDesignSurfaces.slug, s.slug),
        ),
      )
      .limit(1);
    if (existingSurface) {
      console.log(`  surface ${s.slug.padEnd(5)}  skipping (already exists) id=${existingSurface.id}`);
      continue;
    }
    const [surf] = await db
      .insert(productDesignSurfaces)
      .values({
        productId: templateProduct.id,
        name: s.name,
        slug: s.slug,
        displayOrder: s.displayOrder,
        mockupImage: s.mockupImage,
        canvasWidth: 2400,
        canvasHeight: 3200,
        printAreaX: 900,
        printAreaY: 800,
        printAreaWidth: 600,
        printAreaHeight: 900,
        printDpi: 300,
        active: true,
      })
      .returning();
    console.log(`  surface ${s.slug.padEnd(5)}  created id=${surf.id}`);
  }

  // ── Step 10: productOptions + productOptionValues ────────────────────────
  const optionDefs: Array<{ name: string; order: number; values: string[] }> = [
    { name: 'Size', order: 0, values: ['S', 'M', 'L', 'XL', 'XXL'] },
    { name: 'Color', order: 1, values: ['White', 'Black', 'Heather Grey'] },
  ];
  for (const def of optionDefs) {
    let [opt] = await db
      .select()
      .from(productOptions)
      .where(
        and(
          eq(productOptions.productId, templateProduct.id),
          eq(productOptions.name, def.name),
        ),
      )
      .limit(1);
    if (opt) {
      console.log(`  option ${def.name.padEnd(5)}   skipping (already exists) id=${opt.id}`);
    } else {
      [opt] = await db
        .insert(productOptions)
        .values({
          productId: templateProduct.id,
          name: def.name,
          order: def.order,
        })
        .returning();
      console.log(`  option ${def.name.padEnd(5)}   created id=${opt.id}`);
    }

    for (let i = 0; i < def.values.length; i++) {
      const value = def.values[i];
      const [existingVal] = await db
        .select()
        .from(productOptionValues)
        .where(
          and(
            eq(productOptionValues.optionId, opt.id),
            eq(productOptionValues.value, value),
          ),
        )
        .limit(1);
      if (existingVal) {
        console.log(`    value ${value.padEnd(14)} skipping (already exists) id=${existingVal.id}`);
        continue;
      }
      const [val] = await db
        .insert(productOptionValues)
        .values({
          optionId: opt.id,
          value,
          label: value,
          order: i,
        })
        .returning();
      console.log(`    value ${value.padEnd(14)} created id=${val.id}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  console.log('Magamommy tenant bootstrap complete.');
  console.log(`  User:     #${user.id} ${user.email}`);
  console.log(`  Client:   #${client.id} ${client.company ?? ''}`);
  console.log(
    `  Website:  #${website.id} ${website.subdomain}.simplerdevelopment.com (custom: ${website.domain})`,
  );
  console.log(`  Branding: #${branding.id} ${branding.name}`);
  console.log(`  Template product: #${templateProduct.id} ${templateProduct.name}`);
  if (generatedPassword) {
    console.log('');
    console.log('  Generated password (printed ONCE — copy now):');
    console.log(`    ${generatedPassword}`);
  }
  console.log('');

  process.exit(0);
}

// Run when invoked directly (matches sibling scripts that use `bun scripts/...`).
declare const require: { main?: unknown } | undefined;
const isDirectRun =
  (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) ||
  // bun-specific: import.meta.main is true when the file is the entrypoint.
  // Cast through unknown to keep TS happy without pulling @types/bun.
  ((import.meta as unknown as { main?: boolean }).main === true);

if (isDirectRun) {
  main().catch((err) => {
    console.error('[bootstrap-magamommy] failed:', err);
    process.exit(1);
  });
}
