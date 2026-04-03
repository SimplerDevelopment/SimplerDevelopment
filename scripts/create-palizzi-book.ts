import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function main() {
  const { db } = await import('../lib/db');
  const { storeSettings, products, productImages, productCategories } = await import('../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const websiteId = 89;

  // Ensure store is enabled
  const [store] = await db.select().from(storeSettings).where(eq(storeSettings.websiteId, websiteId)).limit(1);
  if (!store) {
    await db.insert(storeSettings).values({
      websiteId,
      enabled: true,
      storeName: 'Palizzi Social Club Shop',
      currency: 'USD',
      taxRate: '0',
      taxInclusive: false,
    });
    console.log('Created store settings');
  } else if (!store.enabled) {
    await db.update(storeSettings).set({ enabled: true }).where(eq(storeSettings.id, store.id));
    console.log('Enabled store');
  } else {
    console.log('Store already enabled');
  }

  // Ensure Books category
  let [category] = await db.select().from(productCategories)
    .where(and(eq(productCategories.websiteId, websiteId), eq(productCategories.slug, 'books')))
    .limit(1);

  if (!category) {
    [category] = await db.insert(productCategories).values({
      websiteId,
      name: 'Books',
      slug: 'books',
      description: 'Books from Palizzi Social Club',
      active: true,
      order: 1,
    }).returning();
    console.log('Created Books category');
  }

  // Delete existing if any
  const [existing] = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.websiteId, websiteId), eq(products.slug, 'dinner-at-the-club')))
    .limit(1);

  if (existing) {
    await db.delete(productImages).where(eq(productImages.productId, existing.id));
    await db.delete(products).where(eq(products.id, existing.id));
    console.log('Deleted existing product id=' + existing.id);
  }

  // Create product
  const [product] = await db.insert(products).values({
    websiteId,
    name: "Dinner at the Club: 100 Years of Stories and Recipes from South Philly's Palizzi Social Club",
    slug: 'dinner-at-the-club',
    shortDescription: "By Joey Baldino & Adam Erace. A gorgeous hardcover cookbook celebrating 100 years of Palizzi Social Club — featuring family recipes, rare photographs, and stories from South Philadelphia's most storied private club.",
    description: `<div>
<p><strong>Dinner at the Club</strong> is a gorgeous celebration of one of America's most beloved private clubs. Written by Palizzi Social Club president <strong>Joey Baldino</strong> and food writer <strong>Adam Erace</strong>, this book captures a century of Italian-American tradition, family, and food in South Philadelphia.</p>

<p>Inside you'll find over 100 recipes passed down through generations — from Sunday gravy and handmade pasta to cocktails and desserts that have graced the club's tables since 1918. Alongside the recipes are never-before-seen photographs, family stories, and a portrait of what makes Palizzi one of the most special places in Philadelphia.</p>

<h3>What's Inside</h3>
<ul>
  <li>100+ authentic Italian-American recipes from the club's kitchen</li>
  <li>Rare archival photographs and family memorabilia</li>
  <li>Stories spanning three generations of the Baldino family</li>
  <li>Cocktail recipes from the club's celebrated bar program</li>
  <li>A foreword celebrating the club's legacy in South Philadelphia</li>
</ul>

<h3>Product Details</h3>
<ul>
  <li><strong>Publisher:</strong> Running Press (October 15, 2024)</li>
  <li><strong>Format:</strong> Hardcover, 304 pages</li>
  <li><strong>ISBN-10:</strong> 0762493860</li>
  <li><strong>ISBN-13:</strong> 978-0762493869</li>
  <li><strong>Dimensions:</strong> 8.25 x 1.15 x 10.31 inches</li>
</ul>
</div>`,
    price: 3500,
    compareAtPrice: 4000,
    sku: 'PALIZZI-BOOK-001',
    barcode: '9780762493869',
    status: 'active',
    featured: true,
    trackInventory: true,
    quantity: 50,
    weight: 3,
    weightUnit: 'lb',
    categoryId: category.id,
    tags: ['cookbook', 'italian', 'philadelphia', 'palizzi', 'recipes', 'south-philly', 'hardcover'],
    seoTitle: "Dinner at the Club — Palizzi Social Club Cookbook | Buy Now",
    seoDescription: "Get the official Palizzi Social Club cookbook. 100+ Italian-American recipes, family stories, and rare photographs from South Philly's most storied private club.",
    metadata: {
      isbn10: '0762493860',
      isbn13: '978-0762493869',
      authors: 'Joey Baldino, Adam Erace',
      publisher: 'Running Press',
      publicationDate: '2024-10-15',
      pages: '304',
      format: 'Hardcover',
    },
  }).returning();

  console.log('Created product: id=' + product.id + ' "' + product.name + '"');

  // Add product image (the book cover from the seed)
  await db.insert(productImages).values({
    productId: product.id,
    url: '/api/media/proxy/media/348b4f28-9dba-4cdf-8394-2a8e0f4f5880.jpg',
    alt: "Dinner at the Club — Palizzi Social Club Cookbook Cover",
    order: 0,
  });

  console.log('Added product image');
  console.log('Done! View at: /shop/dinner-at-the-club');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
