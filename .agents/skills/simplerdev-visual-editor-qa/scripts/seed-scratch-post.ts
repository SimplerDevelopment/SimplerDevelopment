/**
 * VEQA scratch post seeder — temporary QA fixture for the Visual Editor QA Board.
 * Inserts ONE published page on site 2 (simplerdevelopment) seeded with one of each
 * block type the Validating cards touch. Delete the row + this file when QA is done.
 *
 *   npx tsx scripts/seed-scratch-post.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// Parameterize so the skill can target any client site on the local copy.
//   WEBSITE_ID=241 SLUG=veqa-scratch DATABASE_URL=postgresql://postgres@localhost:5544/railway npx tsx <this>
const WEBSITE_ID = Number(process.env.WEBSITE_ID ?? 241); // default: simplerdevelopment.com (client 104) on the local metro copy
const SLUG = process.env.SLUG ?? 'veqa-scratch';

const blocks = [
  { id: 'sec1', type: 'section', order: 0, blocks: [
    { id: 'h1', type: 'heading', order: 0, content: 'VEQA Scratch — do not publish', level: 1 },
    { id: 't1', type: 'text', order: 1, content: 'Every block type under QA lives on this page.' },
  ] },
  { id: 'cols1', type: 'columns', order: 1, columns: [
    { id: 'c1', width: '50%', blocks: [ { id: 'ct1', type: 'text', order: 0, content: 'Left column' } ] },
    { id: 'c2', width: '50%', blocks: [ { id: 'ct2', type: 'text', order: 0, content: 'Right column' } ] },
  ] },
  { id: 'btn1', type: 'button', order: 2, text: 'Click Me', url: '/contact', variant: 'primary' },
  { id: 'img1', type: 'image', order: 3, url: 'https://picsum.photos/id/1015/800/450', alt: 'sample landscape' },
  { id: 'gal1', type: 'gallery', order: 4, columns: 3, images: [
    { id: 'g1', url: 'https://picsum.photos/id/1016/600', alt: 'a' },
    { id: 'g2', url: 'https://picsum.photos/id/1024/600', alt: 'b' },
  ] },
  { id: 'q1', type: 'quote', order: 5, content: 'This platform ships fast.', author: 'A. Client', citation: 'CEO, Example Co' },
  { id: 'cg1', type: 'card-grid', order: 6, columns: 3, cards: [
    { id: 'cgc1', title: 'Card 1', description: 'First card', icon: 'star' },
    { id: 'cgc2', title: 'Card 2', description: 'Second card', icon: 'bolt' },
  ] },
  { id: 'mq1', type: 'marquee', order: 7, items: [
    { id: 'mi1', type: 'text', content: 'Scrolling headline' },
    { id: 'mi2', type: 'icon', icon: 'star' },
  ] },
  { id: 'code1', type: 'code', order: 8, language: 'javascript', code: "console.log('hello VEQA')" },
  { id: 'acc1', type: 'accordion', order: 9, items: [
    { id: 'ai1', title: 'Question one', content: 'Answer one' },
    { id: 'ai2', title: 'Question two', content: 'Answer two' },
  ] },
  { id: 'flip1', type: 'flip-card-grid', order: 10, columns: 3, cards: [
    { id: 'fc1', frontTitle: 'Front A', backText: 'Back A' },
    { id: 'fc2', frontTitle: 'Front B', backText: 'Back B' },
  ] },
  { id: 'vid1', type: 'video', order: 11, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: 'Demo video' },
  { id: 'div1', type: 'divider', order: 12, lineStyle: 'solid' },
  { id: 'cta1', type: 'cta', order: 13, title: 'Ready to start?', description: 'Book a call today.', primaryButtonText: 'Get started', primaryButtonUrl: '/start' },
  { id: 'met1', type: 'metric-cards', order: 14, columns: 3, metrics: [
    { id: 'm1', value: '83%', label: 'Retention' },
    { id: 'm2', value: '2.4x', label: 'ROI' },
  ] },
  { id: 'tabs1', type: 'tabs', order: 15, tabs: [
    { id: 'tab1', label: 'Tab One', blocks: [ { id: 'tb1', type: 'text', order: 0, content: 'Tab one body' } ] },
    { id: 'tab2', label: 'Tab Two', blocks: [ { id: 'tb2', type: 'text', order: 0, content: 'Tab two body' } ] },
  ] },
];

async function main() {
  const URL_STR = process.env.DATABASE_URL;
  if (!URL_STR) throw new Error('DATABASE_URL not set');
  // Raw client + explicit column list — the dev DB is schema-drifted (missing
  // scheduled_publish_at), so Drizzle's all-column insert fails. List only real columns.
  const postgres = (await import('postgres')).default;
  const sql = postgres(URL_STR, { max: 1, onnotice: () => {} });

  const content = JSON.stringify({ blocks, version: '1.0' });

  const existing = await sql`SELECT id FROM posts WHERE website_id = ${WEBSITE_ID} AND slug = ${SLUG} LIMIT 1`;
  if (existing.length > 0) {
    await sql`UPDATE posts SET content = ${content}, published = true, published_at = now(), updated_at = now(), no_index = true WHERE id = ${existing[0].id}`;
    console.log('updated existing scratch post id', existing[0].id);
  } else {
    const rows = await sql`INSERT INTO posts (title, slug, post_type, content, published, published_at, no_index, website_id)
      VALUES ('VEQA Scratch — do not publish', ${SLUG}, 'page', ${content}, true, now(), true, ${WEBSITE_ID}) RETURNING id`;
    console.log('created scratch post id', rows[0].id);
  }
  await sql.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
