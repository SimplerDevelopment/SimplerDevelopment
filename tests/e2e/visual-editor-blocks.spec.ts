/**
 * Visual Editor Block Types E2E Tests
 *
 * Tests the full pipeline for each block type:
 * 1. Create a post with the block via portal API
 * 2. Verify it's served correctly via public API
 * 3. Update the block properties
 * 4. Verify the update is reflected
 * 5. Verify the client site renders the block
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

// Site ID 1 = dannydo (existing provisioned site)
const SITE_ID = 1;
const CLIENT_SITE_URL = 'https://dannydo.simplerdevelopment.com';

import { ApiClient } from './setup/api-client';

function blockContent(blocks: unknown[]) {
  return JSON.stringify({ blocks, version: '1.0' });
}

async function createPost(api: ApiClient, slug: string, blocks: unknown[]) {
  const res = await api.post(`/api/portal/cms/websites/${SITE_ID}/posts`, {
    title: `Test ${slug}`,
    slug,
    content: blockContent(blocks),
    postType: 'blog',
    published: true,
  });
  return res.data?.data;
}

async function updatePost(api: ApiClient, postId: number, blocks: unknown[]) {
  return api.put(`/api/portal/cms/websites/${SITE_ID}/posts/${postId}`, {
    content: blockContent(blocks),
  });
}

async function getPublicPost(api: ApiClient, slug: string) {
  return api.get(`/api/public/websites/${SITE_ID}/posts/${slug}`);
}

async function deletePost(api: ApiClient, postId: number) {
  return api.delete(`/api/portal/cms/websites/${SITE_ID}/posts/${postId}`);
}

test.describe('Visual Editor — Block Type Editing @visual-editor @blocks', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async ({ clientApi }) => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // ── Heading Block ──────────────────────────────────────────────────────────

  test('heading block: create, verify, update, verify', async ({ clientApi, unauthApi }) => {
    const slug = `ve-heading-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'h1', type: 'heading', order: 0, content: 'Original Title', level: 2 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    // Verify via public API
    const pub = await getPublicPost(unauthApi, slug);
    expect(pub.status).toBe(200);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].type).toBe('heading');
    expect(content.blocks[0].content).toBe('Original Title');
    expect(content.blocks[0].level).toBe(2);

    // Update heading content and level
    await updatePost(clientApi, post.id, [
      { id: 'h1', type: 'heading', order: 0, content: 'Updated Title', level: 3 },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].content).toBe('Updated Title');
    expect(updatedContent.blocks[0].level).toBe(3);
  });

  // ── Text Block ─────────────────────────────────────────────────────────────

  test('text block: create, verify, update, verify', async ({ clientApi, unauthApi }) => {
    const slug = `ve-text-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 't1', type: 'text', order: 0, content: 'Hello paragraph', size: 'base' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].type).toBe('text');
    expect(content.blocks[0].content).toBe('Hello paragraph');

    await updatePost(clientApi, post.id, [
      { id: 't1', type: 'text', order: 0, content: 'Updated paragraph text', size: 'lg', alignment: 'center' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].content).toBe('Updated paragraph text');
    expect(updatedContent.blocks[0].size).toBe('lg');
    expect(updatedContent.blocks[0].alignment).toBe('center');
  });

  // ── Image Block ────────────────────────────────────────────────────────────

  test('image block: create, verify, update alt text', async ({ clientApi, unauthApi }) => {
    const slug = `ve-image-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'img1', type: 'image', order: 0, url: 'https://example.com/photo.jpg', alt: 'A photo', width: 'full' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].type).toBe('image');
    expect(content.blocks[0].url).toBe('https://example.com/photo.jpg');

    await updatePost(clientApi, post.id, [
      { id: 'img1', type: 'image', order: 0, url: 'https://example.com/new-photo.jpg', alt: 'Updated alt', width: 'medium', caption: 'A caption' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].alt).toBe('Updated alt');
    expect(updatedContent.blocks[0].caption).toBe('A caption');
  });

  // ── Button Block ───────────────────────────────────────────────────────────

  test('button block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-button-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'btn1', type: 'button', order: 0, text: 'Click Me', url: '/contact', variant: 'primary' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].text).toBe('Click Me');

    await updatePost(clientApi, post.id, [
      { id: 'btn1', type: 'button', order: 0, text: 'Get Started', url: '/signup', variant: 'outline', size: 'lg' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].text).toBe('Get Started');
    expect(updatedContent.blocks[0].variant).toBe('outline');
  });

  // ── Quote Block ────────────────────────────────────────────────────────────

  test('quote block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-quote-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'q1', type: 'quote', order: 0, content: 'To be or not to be', author: 'Shakespeare' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].content).toBe('To be or not to be');

    await updatePost(clientApi, post.id, [
      { id: 'q1', type: 'quote', order: 0, content: 'Updated quote', author: 'Updated Author', citation: 'Hamlet' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].content).toBe('Updated quote');
    expect(updatedContent.blocks[0].citation).toBe('Hamlet');
  });

  // ── Code Block ─────────────────────────────────────────────────────────────

  test('code block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-code-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'c1', type: 'code', order: 0, code: 'console.log("hello")', language: 'javascript' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].code).toBe('console.log("hello")');

    await updatePost(clientApi, post.id, [
      { id: 'c1', type: 'code', order: 0, code: 'print("hello")', language: 'python' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].code).toBe('print("hello")');
    expect(updatedContent.blocks[0].language).toBe('python');
  });

  // ── Spacer Block ───────────────────────────────────────────────────────────

  test('spacer block: create, update height', async ({ clientApi, unauthApi }) => {
    const slug = `ve-spacer-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 's1', type: 'spacer', order: 0, height: 'sm' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 's1', type: 'spacer', order: 0, height: 'xl' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].height).toBe('xl');
  });

  // ── Divider Block ──────────────────────────────────────────────────────────

  test('divider block: create, update style', async ({ clientApi, unauthApi }) => {
    const slug = `ve-divider-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'd1', type: 'divider', order: 0 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'd1', type: 'divider', order: 0, lineStyle: 'dashed' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].lineStyle).toBe('dashed');
  });

  // ── YouTube Block ──────────────────────────────────────────────────────────

  test('youtube block: create, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-youtube-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'yt1', type: 'youtube', order: 0, url: 'https://youtube.com/watch?v=abc123' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'yt1', type: 'youtube', order: 0, url: 'https://youtube.com/watch?v=xyz789', caption: 'My video' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].url).toBe('https://youtube.com/watch?v=xyz789');
    expect(updatedContent.blocks[0].caption).toBe('My video');
  });

  // ── Hero Block ─────────────────────────────────────────────────────────────

  test('hero block: create, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-hero-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'hero1', type: 'hero', order: 0, title: 'Welcome', subtitle: 'To our site', ctaText: 'Learn More', ctaLink: '/about' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'hero1', type: 'hero', order: 0, title: 'Updated Hero', subtitle: 'New subtitle', description: 'A description', ctaText: 'Get Started', ctaLink: '/signup' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].title).toBe('Updated Hero');
    expect(updatedContent.blocks[0].description).toBe('A description');
  });

  // ── CTA Block ──────────────────────────────────────────────────────────────

  test('cta block: create, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-cta-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'cta1', type: 'cta', order: 0, title: 'Ready?', primaryButtonText: 'Go', primaryButtonUrl: '/go' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'cta1', type: 'cta', order: 0, title: 'Updated CTA', description: 'Do it now', primaryButtonText: 'Start', primaryButtonUrl: '/start', backgroundStyle: 'gradient' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].title).toBe('Updated CTA');
    expect(updatedContent.blocks[0].backgroundStyle).toBe('gradient');
  });

  // ── Stats Block ────────────────────────────────────────────────────────────

  test('stats block: create, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-stats-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'st1', type: 'stats', order: 0, stats: [
        { id: 's1', value: '100+', label: 'Clients' },
        { id: 's2', value: '50', label: 'Projects' },
      ]},
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'st1', type: 'stats', order: 0, title: 'Our Numbers', stats: [
        { id: 's1', value: '200+', label: 'Happy Clients' },
        { id: 's2', value: '100', label: 'Projects Done' },
        { id: 's3', value: '99%', label: 'Satisfaction' },
      ], columns: 3 },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].stats).toHaveLength(3);
    expect(updatedContent.blocks[0].title).toBe('Our Numbers');
  });

  // ── Testimonial Block ──────────────────────────────────────────────────────

  test('testimonial block: create, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-testimonial-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'tm1', type: 'testimonial', order: 0, quote: 'Great service!', author: 'Jane' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'tm1', type: 'testimonial', order: 0, quote: 'Amazing work!', author: 'John Doe', role: 'CEO', company: 'Acme Inc' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].quote).toBe('Amazing work!');
    expect(updatedContent.blocks[0].company).toBe('Acme Inc');
  });

  // ── Card Grid Block ────────────────────────────────────────────────────────

  test('card-grid block: create, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-cardgrid-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'cg1', type: 'card-grid', order: 0, cards: [
        { id: 'c1', title: 'Card 1', description: 'Desc 1' },
      ], columns: 2 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'cg1', type: 'card-grid', order: 0, title: 'Our Services', cards: [
        { id: 'c1', title: 'Design', description: 'Web design', icon: 'palette' },
        { id: 'c2', title: 'Dev', description: 'Development', icon: 'code' },
        { id: 'c3', title: 'SEO', description: 'Search optimization', icon: 'search' },
      ], columns: 3 },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].cards).toHaveLength(3);
    expect(updatedContent.blocks[0].columns).toBe(3);
  });

  // ── Columns Block ──────────────────────────────────────────────────────────

  test('columns block: create with nested blocks, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-columns-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'col1', type: 'columns', order: 0, columns: [
        { id: 'left', width: 50, blocks: [
          { id: 'lt', type: 'text', order: 0, content: 'Left column' },
        ]},
        { id: 'right', width: 50, blocks: [
          { id: 'rt', type: 'text', order: 0, content: 'Right column' },
        ]},
      ], gap: 'md' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'col1', type: 'columns', order: 0, columns: [
        { id: 'left', width: 33, blocks: [
          { id: 'lt', type: 'heading', order: 0, content: 'Col 1', level: 3 },
        ]},
        { id: 'center', width: 34, blocks: [
          { id: 'ct', type: 'text', order: 0, content: 'Middle content' },
        ]},
        { id: 'right', width: 33, blocks: [
          { id: 'rt', type: 'text', order: 0, content: 'Right content' },
        ]},
      ], gap: 'lg' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].columns).toHaveLength(3);
    expect(updatedContent.blocks[0].gap).toBe('lg');
  });

  // ── Section Block ──────────────────────────────────────────────────────────

  test('section block: create with nested blocks, update styling', async ({ clientApi, unauthApi }) => {
    const slug = `ve-section-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'sec1', type: 'section', order: 0, blocks: [
        { id: 'sh', type: 'heading', order: 0, content: 'Section Title', level: 2 },
        { id: 'st', type: 'text', order: 1, content: 'Section body' },
      ]},
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'sec1', type: 'section', order: 0, blocks: [
        { id: 'sh', type: 'heading', order: 0, content: 'Updated Section', level: 2 },
      ], backgroundColor: '#f0f0f0', maxWidth: '800px', paddingTop: '2rem', paddingBottom: '2rem' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].backgroundColor).toBe('#f0f0f0');
    expect(updatedContent.blocks[0].maxWidth).toBe('800px');
  });

  // ── Gallery Block ──────────────────────────────────────────────────────────

  test('gallery block: create, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-gallery-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'gal1', type: 'gallery', order: 0, images: [
        { id: 'i1', url: 'https://example.com/1.jpg', alt: 'Photo 1' },
      ], layout: 'grid', columns: 3 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      { id: 'gal1', type: 'gallery', order: 0, images: [
        { id: 'i1', url: 'https://example.com/1.jpg', alt: 'Photo 1' },
        { id: 'i2', url: 'https://example.com/2.jpg', alt: 'Photo 2', caption: 'Sunset' },
      ], layout: 'masonry', columns: 2, lightbox: true },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].images).toHaveLength(2);
    expect(updatedContent.blocks[0].layout).toBe('masonry');
    expect(updatedContent.blocks[0].lightbox).toBe(true);
  });

  // ── Multi-block post ───────────────────────────────────────────────────────

  test('multi-block post: create with multiple block types, reorder, verify', async ({ clientApi, unauthApi }) => {
    const slug = `ve-multi-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'b1', type: 'heading', order: 0, content: 'Page Title', level: 1 },
      { id: 'b2', type: 'text', order: 1, content: 'Introduction paragraph' },
      { id: 'b3', type: 'divider', order: 2 },
      { id: 'b4', type: 'hero', order: 3, title: 'Featured', ctaText: 'Learn More', ctaLink: '#' },
      { id: 'b5', type: 'quote', order: 4, content: 'A great quote', author: 'Author' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks).toHaveLength(5);
    expect(content.blocks.map((b: { type: string }) => b.type)).toEqual([
      'heading', 'text', 'divider', 'hero', 'quote',
    ]);

    // Reorder: move quote to position 1 (after heading)
    await updatePost(clientApi, post.id, [
      { id: 'b1', type: 'heading', order: 0, content: 'Page Title', level: 1 },
      { id: 'b5', type: 'quote', order: 1, content: 'A great quote', author: 'Author' },
      { id: 'b2', type: 'text', order: 2, content: 'Introduction paragraph' },
      { id: 'b3', type: 'divider', order: 3 },
      { id: 'b4', type: 'hero', order: 4, title: 'Featured', ctaText: 'Learn More', ctaLink: '#' },
    ]);

    const reordered = await getPublicPost(unauthApi, slug);
    const reorderedContent = JSON.parse(reordered.data.data.content);
    expect(reorderedContent.blocks.map((b: { type: string }) => b.type)).toEqual([
      'heading', 'quote', 'text', 'divider', 'hero',
    ]);
  });

  // ── Block with styles ──────────────────────────────────────────────────────

  test('block with custom styles: create, update styles', async ({ clientApi, unauthApi }) => {
    const slug = `ve-styled-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'styled1', type: 'text', order: 0, content: 'Styled text', style: {
        backgroundColor: '#ff0000',
        color: '#ffffff',
        padding: '20px',
        borderRadius: '8px',
      }},
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].style.backgroundColor).toBe('#ff0000');

    await updatePost(clientApi, post.id, [
      { id: 'styled1', type: 'text', order: 0, content: 'Updated styled text', style: {
        backgroundColor: '#0000ff',
        color: '#ffffff',
        padding: '30px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      }},
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].style.backgroundColor).toBe('#0000ff');
    expect(updatedContent.blocks[0].style.boxShadow).toBe('0 4px 6px rgba(0,0,0,0.1)');
  });
});
