import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function main() {
  const { db } = await import('../lib/db');
  const { storeSettings, products, productImages, productCategories } = await import('../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Find the Palizzi website
  const { clientWebsites } = await import('../lib/db/schema');
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'palizzi')).limit(1);

  if (!site) {
    console.error('Palizzi website not found!');
    process.exit(1);
  }

  console.log(`Found Palizzi website: id=${site.id}`);

  // Enable store if not already
  const [store] = await db.select().from(storeSettings).where(eq(storeSettings.websiteId, site.id)).limit(1);

  if (!store) {
    await db.insert(storeSettings).values({
      websiteId: site.id,
      enabled: true,
      storeName: 'Palizzi Social Club Shop',
      currency: 'USD',
      taxRate: 0,
      taxInclusive: false,
    });
    console.log('Created store settings');
  } else if (!store.enabled) {
    await db.update(storeSettings).set({ enabled: true }).where(eq(storeSettings.id, store.id));
    console.log('Enabled store');
  } else {
    console.log('Store already enabled');
  }

  // Create a "Books" category
  let [category] = await db.select().from(productCategories)
    .where(and(eq(productCategories.websiteId, site.id), eq(productCategories.slug, 'books')))
    .limit(1);

  if (!category) {
    [category] = await db.insert(productCategories).values({
      websiteId: site.id,
      name: 'Books',
      slug: 'books',
      description: 'Books from Palizzi Social Club',
      active: true,
      order: 1,
    }).returning();
    console.log('Created "Books" category');
  } else {
    console.log('Books category already exists');
  }

  // Check if product already exists
  const [existing] = await db.select().from(products)
    .where(and(eq(products.websiteId, site.id), eq(products.slug, 'dinner-at-the-club')))
    .limit(1);

  if (existing) {
    console.log('Product "Dinner at the Club" already exists (id=' + existing.id + ')');
    process.exit(0);
  }

  // Create the product
  const [product] = await db.insert(products).values({
    websiteId: site.id,
    name: 'Dinner at the Club: 100 Years of Stories and Recipes from South Philly\'s Palizzi Social Club',
    slug: 'dinner-at-the-club',
    shortDescription: 'By Joey Baldino & Adam Erace. A beautiful cookbook celebrating 100 years of Palizzi Social Club — featuring family recipes, rare photographs, and stories from South Philadelphia\'s most storied private club.',
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
  <li><strong>Hardcover:</strong> 304 pages</li>
  <li><strong>ISBN-10:</strong> 0762493860</li>
  <li><strong>ISBN-13:</strong> 978-0762493869</li>
  <li><strong>Dimensions:</strong> 8.25 x 1.15 x 10.31 inches</li>
</ul>
</div>`,
    price: 3500, // $35.00 in cents
    compareAtPrice: 4000, // $40.00 list price
    sku: 'PALIZZI-BOOK-001',
    barcode: '9780762493869',
    status: 'active',
    featured: true,
    trackInventory: true,
    quantity: 50,
    weight: 3,
    weightUnit: 'lb',
    categoryId: category.id,
    tags: ['cookbook', 'italian', 'philadelphia', 'palizzi', 'recipes', 'south-philly'],
    seoTitle: 'Dinner at the Club — Palizzi Social Club Cookbook | Buy Now',
    seoDescription: 'Get the official Palizzi Social Club cookbook. 100+ Italian-American recipes, family stories, and rare photographs from South Philly\'s most storied private club.',
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

  console.log(`Created product: "${product.name}" (id=${product.id})`);

  // Add product images
  // Use the book image from the seed if it exists, plus the Amazon cover
  const bookImageUrl = '/api/media/proxy/media/348b4f28-9dba-4cdf-8394-2a8e0f4f5880.jpg'; // dinner-at-the-club.jpg from seed

  await db.insert(productImages).values([
    {
      productId: product.id,
      url: bookImageUrl,
      alt: 'Dinner at the Club — Palizzi Social Club Cookbook Cover',
      order: 0,
    },
  ]);

  console.log('Added product image');
  console.log('\nDone! Product available at: /shop/dinner-at-the-club');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
