import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { readFileSync } from 'fs';
import { resolve } from 'path';

function uid() {
  return crypto.randomUUID();
}

// Image paths — resolved at seed time, uploaded to S3
const PALIZZI_IMAGES_DIR = resolve(__dirname, '../public/uploads/palizzi');

// Placeholder — populated by uploadImages() before block data is built
const IMG: Record<string, string> = {
  crest: '',
  neon: '',
  header: '',
  marquee: '',
  book: '',
};

const IMAGE_FILES: Record<string, { file: string; alt: string; mime: string }> = {
  crest: { file: 'nav-header.png', alt: 'Palizzi Social Club crest', mime: 'image/png' },
  neon: { file: 'neon-red.png', alt: 'Filippo Palizzi Club neon sign', mime: 'image/png' },
  header: { file: 'palizziclub-header.jpg', alt: 'Palizzi Social Club vintage photo', mime: 'image/jpeg' },
  marquee: { file: 'palizziclub-marquee.png', alt: 'Palizzi marquee decoration', mime: 'image/png' },
  book: { file: 'dinner-at-the-club.jpg', alt: 'Dinner at the Club book cover', mime: 'image/jpeg' },
};

async function uploadImages(websiteId: number, uploadedBy: number) {
  const { uploadToS3 } = await import('../lib/s3/upload');
  const { db } = await import('../lib/db');
  const { media } = await import('../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  for (const [key, info] of Object.entries(IMAGE_FILES)) {
    // Check if already uploaded (by filename + websiteId)
    const [existing] = await db
      .select()
      .from(media)
      .where(and(eq(media.filename, info.file), eq(media.websiteId, websiteId)))
      .limit(1);

    if (existing) {
      IMG[key] = existing.url;
      console.log(`  Image ${info.file}: already uploaded (${existing.url})`);
      continue;
    }

    const filePath = resolve(PALIZZI_IMAGES_DIR, info.file);
    const buffer = readFileSync(filePath);
    const result = await uploadToS3(buffer, info.file, info.mime);

    await db.insert(media).values({
      filename: info.file,
      storedFilename: result.storedFilename,
      mimeType: result.mimeType,
      fileSize: result.fileSize,
      url: result.url,
      alt: info.alt,
      uploadedBy,
      websiteId,
    });

    IMG[key] = result.url;
    console.log(`  Image ${info.file}: uploaded -> ${result.url}`);
  }
}

const pageSettings = {
  backgroundColor: '#0d0d0d',
  color: '#f5e6d3',
  fontFamily: 'Inter',
  maxWidth: '100%',
  paddingTop: '0',
  paddingBottom: '0',
  paddingLeft: '0',
  paddingRight: '0',
};

function buildHomeBlocks() { return [
  // ── Navigation ──
  {
    id: uid(),
    type: 'palizzi-nav',
    order: 0,
    logoUrl: IMG.crest,
    brandName: 'Palizzi',
    links: [
      { label: 'History', href: '#history' },
      { label: 'Menu', href: '#menu' },
      { label: 'House Rules', href: '#rules' },
      { label: 'Membership', href: '#membership' },
    ],
  },

  // ── Hero ──
  {
    id: uid(),
    type: 'palizzi-hero',
    order: 1,
    address: '1408 South 12th Street \u00b7 Philadelphia',
    crestUrl: IMG.crest,
    neonUrl: IMG.neon,
    tagline: "if the neon is on, we\u2019re open",
    established: 'Est. 1918',
    scrollTarget: '#welcome',
  },

  // ── Welcome ──
  {
    id: uid(),
    type: 'palizzi-welcome',
    order: 2,
    overline: 'Benvenuti',
    title: 'Welcome to',
    titleAccent: 'Palizzi Social Club',
    paragraphs: [
      'Since opening our doors in 1918, we have been a place for members to relax over a cocktail and delicious Italian food among friends, nestled in a typical South Philly rowhome.',
      "Today, third-generation owner and president Joey Baldino is proud to carry on his family\u2019s legacy.",
    ],
    bookImage: IMG.book,
    bookLabel: 'Now Available',
    bookTitle: 'Dinner at the Club',
    bookSubtitle: "100 Years of Stories and Recipes from South Philly\u2019s Palizzi Social Club",
    bookAuthors: 'By Joey Baldino & Adam Erace',
  },

  // ── History ──
  {
    id: uid(),
    type: 'palizzi-history',
    order: 3,
    overline: 'Since 1918',
    title: 'History of',
    titleAccent: 'Palizzi',
    backgroundImage: IMG.header,
    marqueeImage: IMG.marquee,
    paragraphs: [
      'A century ago, South Philly was home to a host of Italian social clubs, many limited to members of Italian descent, and some so exclusive that Italians from only one region of the \u201cOld Country\u201d could join. Social clubs were where everything happened: from anniversaries to funerals and business deals to celebrations.',
      'When it was founded in 1918, membership at Palizzi Social Club was limited to expats from the town of Vasto, and the club took its name from the town\u2019s most famous resident, painter <span style="color:rgba(201,169,110,0.9);font-style:italic">Filippo Palizzi</span>.',
      'Over the years, Palizzi expanded its membership to include owner Joey Baldino\u2019s family, who were related to the original owners. A lifelong South Philly resident, Joey earned national acclaim for his enduringly popular Sicilian-inspired Collingswood, NJ BYOB, Zeppoli, and is proud to make his homecoming as president of Palizzi Social Club, a tradition he hopes to keep in his family.',
    ],
  },

  // ── Menu ──
  {
    id: uid(),
    type: 'palizzi-menu',
    order: 4,
    overline: 'Our Offerings',
    title: 'Food & <span style="color:#c9a96e;font-style:italic">Cocktails</span>',
    subtitle: "Shareable plates and more substantial fare, all prepared from Joey\u2019s own recipes, passed down by his family and perfected in his kitchen.",
    foodSections: [
      {
        title: 'Starters',
        items: [
          { name: 'Classic Caesar', desc: 'romaine, shaved parmaggiano, imported anchovy' },
          { name: 'Capasante', desc: 'baked sea scallop, wild mushrooms, italian bread crumb' },
          { name: 'Escarole & Beans', desc: 'escarole, canellini, extra virgin olive oil, garlic' },
          { name: 'Stromboli', desc: 'imported pepperoni, mozzarella, oregano' },
        ],
      },
      {
        title: 'From the Grill',
        items: [
          { name: 'Spiedini', desc: 'swordfish, or chicken' },
          { name: 'Lamb Chops', desc: 'marinated, garlic, parsley' },
          { name: 'Octopus', desc: 'rock octopus, salsa verde, lemon' },
          { name: 'Sausage', desc: 'fennel, broccoli rabbe, calabrese chili' },
        ],
      },
      {
        title: 'Pasta',
        items: [
          { name: 'Spaghetti with Crabs', desc: 'spaghetti, blue crab, san marzano' },
          { name: 'Gnocchetti', desc: "semolina dumpling, nero d'avola, beef ragu" },
          { name: 'Raviolo Vasto', desc: 'spinach, ricotta, egg yolk' },
          { name: 'Calamari & Peas', desc: 'squid, sweet peas, mini shells, pecorino' },
        ],
      },
      {
        title: 'House Specialties',
        items: [
          { name: 'Tripe', desc: 'tomato, eggplant, cinnamon, caciocavallo' },
          { name: 'Fritto Misto', desc: 'baccala & gianchetti, roasted garlic aioli' },
          { name: 'Brasciole', desc: 'bread crumb, tomato, boiled egg' },
          { name: 'Stuffed Artichokes', desc: 'baby artichoke, locatelli, lemon, parsley' },
        ],
      },
      {
        title: 'Desserts',
        items: [
          { name: 'Spumoni', desc: 'pistachio, vanilla, strawberry' },
          { name: "Mom's Ricotta Cheese Pie", desc: 'almond crust, amarena cherry' },
          { name: 'Sfingi', desc: 'fried dough, anise sugar' },
        ],
      },
    ],
    cocktails: [
      { name: 'The Laverghetta', desc: 'fresh basil, ruby grapefruit, prosecco' },
      { name: 'The DiCicco', desc: 'ketel one, ursini extra virgin, vermouth' },
      { name: 'The Smagiassis', desc: 'grappa, orange curacao, lime & cranberry' },
      { name: 'The Ditoro', desc: 'prosecco, sugar cube, aromatics, lemon' },
      { name: 'The Mezzaroba', desc: 'fernet, 12yr rum, house ginger cordial, soda' },
      { name: 'The Molino', desc: 'over proof rye, luxardo amaretto, lemon, e.w.' },
      { name: 'The Bozzelli', desc: 'dry gin, cocchi americano, galliano, lime, chili' },
      { name: "The D'Amo", desc: 'brown butter washed mari, espresso, clotted cream' },
    ],
  },

  // ── House Rules ──
  {
    id: uid(),
    type: 'palizzi-rules',
    order: 5,
    overline: 'Please Observe',
    title: 'House',
    titleAccent: 'Rules',
    hoursTitle: 'Thursday through Sunday',
    hoursSubtitle: '6 p.m. until late night',
    badges: ['Members Only', 'Cash Only'],
    rules: [
      'No loud obnoxious behavior.',
      'Proper attire required. Gentlemen must remove hats, and no flip-flops or sweatpants are allowed.',
      'Do not linger outside the front stoop. Smokers can use the backyard.',
      'What happens at Palizzi stays at Palizzi. No pictures or excessive cell phone use. No blogging, reviewing, or tagging on social media.',
      "Each member may bring three (3) non-members. If you wouldn\u2019t bring them to your mom\u2019s house, don\u2019t bring them here.",
      'A membership does not guarantee entry. Please have patience when we are at capacity.',
      'Exit briskly and silently. Our neighbors are sleeping next door.',
      'Eat a lot, drink more, and mostly: be social.',
    ],
    disclaimer: 'Our rules exist for the benefit of all our members; we reserve the right to deny or revoke membership for refusal to comply with any of the above.',
  },

  // ── Membership ──
  {
    id: uid(),
    type: 'palizzi-membership',
    order: 6,
    overline: 'Join Us',
    title: 'Become a',
    titleAccent: 'Member',
    paragraphs: [
      'The Palizzi Social Club is honored by the abundance of interest we have recently received. However, in order to preserve and maintain the consistency, quality and the overall enjoyment for our current social and active members, we have voted on and approved a measure to temporarily cease all applications.',
    ],
    highlight: 'No new memberships are available at this time.',
    closingNote: 'With the small intimate nature of our space and limited hours, we take our commitment to our members seriously, and strive to always offer them a comfortable, welcoming experience.',
    signature: '\u2014 The Assembly',
    footnote: 'Note: For those who have previously purchased membership cards via PayPal, they can pick up their card at the door during normal business hours with proof of purchase receipt.',
  },

  // ── Footer ──
  {
    id: uid(),
    type: 'palizzi-footer',
    order: 7,
    marqueeImage: IMG.marquee,
    columns: [
      {
        label: 'Location',
        content: '1408 South 12th Street<br/>Philadelphia, PA',
      },
      {
        label: 'Hours',
        content: 'Thursday \u2013 Sunday<br/>6 p.m. until late',
      },
      {
        label: 'Navigate',
        links: [
          { label: 'History', href: '#history' },
          { label: 'Menu', href: '#menu' },
          { label: 'House Rules', href: '#rules' },
          { label: 'Membership', href: '#membership' },
        ],
      },
    ],
    bottomText: 'Palizzi Social Club \u00b7 Est. 1918',
  },
]; }

// ============================================================================
// SEED FUNCTION
// ============================================================================
async function seedPalizzi() {
  try {
    const { db } = await import('../lib/db');
    const { users, clients, clientWebsites, posts } = await import('../lib/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // 1. Create or find client user
    let [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'palizzi@simplerdevelopment.com'))
      .limit(1);

    let userId: number;
    if (existingUser) {
      userId = existingUser.id;
      console.log(`Found existing user: ${existingUser.email} (id=${userId})`);
    } else {
      // Hash a placeholder password — client logs in via portal invite, not this password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash('palizzi-temp-2024', 10);
      const [newUser] = await db
        .insert(users)
        .values({
          name: 'Palizzi Social Club',
          email: 'palizzi@simplerdevelopment.com',
          password: hashedPassword,
          role: 'client',
        })
        .returning();
      userId = newUser.id;
      console.log(`Created user: ${newUser.email} (id=${userId})`);
    }

    // 2. Create or find client profile
    let [existingClient] = await db
      .select()
      .from(clients)
      .where(eq(clients.userId, userId))
      .limit(1);

    let clientId: number;
    if (existingClient) {
      clientId = existingClient.id;
      console.log(`Found existing client profile (id=${clientId})`);
    } else {
      const [newClient] = await db
        .insert(clients)
        .values({
          userId,
          company: 'Palizzi Social Club',
          phone: '',
          website: 'palizzi.simplerdevelopment.com',
          address: '1408 South 12th Street, Philadelphia, PA',
        })
        .returning();
      clientId = newClient.id;
      console.log(`Created client profile (id=${clientId})`);
    }

    // 3. Create or find website
    let [existingWebsite] = await db
      .select()
      .from(clientWebsites)
      .where(eq(clientWebsites.subdomain, 'palizzi'))
      .limit(1);

    let websiteId: number;
    if (existingWebsite) {
      websiteId = existingWebsite.id;
      // Update to ensure customLayout is set
      await db
        .update(clientWebsites)
        .set({
          customLayout: true,
          domain: 'palizzi',
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(clientWebsites.id, websiteId));
      console.log(`Updated existing website (id=${websiteId})`);
    } else {
      const [newWebsite] = await db
        .insert(clientWebsites)
        .values({
          clientId,
          name: 'Palizzi Social Club',
          domain: 'palizzi',
          subdomain: 'palizzi',
          description: 'Since opening our doors in 1918, we have been a place for members to relax over a cocktail and delicious Italian food among friends.',
          active: true,
          customLayout: true,
          deploymentStatus: 'active',
          githubRepoName: 'simplerdevelopment/palizzi-redesign',
        })
        .returning();
      websiteId = newWebsite.id;
      console.log(`Created website (id=${websiteId})`);
    }

    // 4. Upload images to S3 media manager
    console.log('\nUploading images to CMS media manager...');
    await uploadImages(websiteId, userId);

    // 5. Create or update home page (images now have proxy URLs)
    const homeBlocks = buildHomeBlocks();
    const content = JSON.stringify({
      blocks: homeBlocks,
      pageSettings,
      version: '1.0',
    });

    const [existingPage] = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.websiteId, websiteId),
          eq(posts.slug, 'home'),
          eq(posts.postType, 'page'),
        )
      )
      .limit(1);

    if (existingPage) {
      await db
        .update(posts)
        .set({
          title: 'Palizzi Social Club | Est. 1918 | South Philadelphia',
          content,
          published: true,
          publishedAt: new Date(),
          updatedAt: new Date(),
          seoTitle: 'Palizzi Social Club | Est. 1918 | South Philadelphia',
          seoDescription: 'Since opening our doors in 1918, we have been a place for members to relax over a cocktail and delicious Italian food among friends, nestled in a typical South Philly rowhome.',
        })
        .where(eq(posts.id, existingPage.id));
      console.log('Updated home page');
    } else {
      await db.insert(posts).values({
        title: 'Palizzi Social Club | Est. 1918 | South Philadelphia',
        slug: 'home',
        postType: 'page',
        content,
        published: true,
        publishedAt: new Date(),
        websiteId,
        seoTitle: 'Palizzi Social Club | Est. 1918 | South Philadelphia',
        seoDescription: 'Since opening our doors in 1918, we have been a place for members to relax over a cocktail and delicious Italian food among friends, nestled in a typical South Philly rowhome.',
      });
      console.log('Created home page');
    }

    console.log('\nPalizzi Social Club seeded successfully!');
    console.log('Domain: palizzi (resolves via middleware as palizzi.simplerdevelopment.com)');
    console.log('Test locally: http://localhost:3000/sites/palizzi');
  } catch (error) {
    console.error('Error seeding Palizzi:', error);
  }

  process.exit(0);
}

seedPalizzi();
