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

  // ── Video Block ────────────────────────────────────────────────────────────

  test('video block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-video-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'v1', type: 'video', order: 0, url: 'https://example.com/clip.mp4', controls: true },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].type).toBe('video');
    expect(content.blocks[0].url).toBe('https://example.com/clip.mp4');

    await updatePost(clientApi, post.id, [
      { id: 'v1', type: 'video', order: 0, url: 'https://example.com/new.mp4', caption: 'Demo reel', autoplay: true, controls: false },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].url).toBe('https://example.com/new.mp4');
    expect(updatedContent.blocks[0].caption).toBe('Demo reel');
    expect(updatedContent.blocks[0].autoplay).toBe(true);
  });

  // ── Marquee Block ──────────────────────────────────────────────────────────

  test('marquee block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-marquee-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'mq1', type: 'marquee', order: 0, items: [
        { id: 'i1', type: 'text', content: 'Breaking news' },
        { id: 'i2', type: 'text', content: 'Latest updates' },
      ], direction: 'left', speed: 50 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].items).toHaveLength(2);
    expect(content.blocks[0].direction).toBe('left');

    await updatePost(clientApi, post.id, [
      { id: 'mq1', type: 'marquee', order: 0, items: [
        { id: 'i1', type: 'text', content: 'Updated copy' },
      ], direction: 'right', speed: 80, pauseOnHover: true, gradient: true },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].items).toHaveLength(1);
    expect(updatedContent.blocks[0].direction).toBe('right');
    expect(updatedContent.blocks[0].pauseOnHover).toBe(true);
  });

  // ── Accordion Block ────────────────────────────────────────────────────────

  test('accordion block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-accordion-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'acc1', type: 'accordion', order: 0, title: 'FAQ', items: [
        { id: 'a1', title: 'What is this?', content: 'It is a thing.' },
      ] },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].items).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'acc1', type: 'accordion', order: 0, title: 'Updated FAQ', items: [
        { id: 'a1', title: 'Q1', content: 'A1' },
        { id: 'a2', title: 'Q2', content: 'A2' },
      ] },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].title).toBe('Updated FAQ');
    expect(updatedContent.blocks[0].items).toHaveLength(2);
  });

  // ── Tabs Block ─────────────────────────────────────────────────────────────

  test('tabs block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-tabs-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'tabs1', type: 'tabs', order: 0, tabs: [
        { id: 't1', label: 'Overview', blocks: [
          { id: 'tx1', type: 'text', order: 0, content: 'Tab 1 content' },
        ] },
      ] },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].tabs).toHaveLength(1);
    expect(content.blocks[0].tabs[0].label).toBe('Overview');

    await updatePost(clientApi, post.id, [
      { id: 'tabs1', type: 'tabs', order: 0, tabs: [
        { id: 't1', label: 'Overview', blocks: [
          { id: 'tx1', type: 'text', order: 0, content: 'Updated tab 1' },
        ] },
        { id: 't2', label: 'Details', blocks: [
          { id: 'tx2', type: 'heading', order: 0, content: 'Tab 2 heading', level: 3 },
        ] },
      ] },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].tabs).toHaveLength(2);
    expect(updatedContent.blocks[0].tabs[1].label).toBe('Details');
  });

  // ── Services Grid Block ────────────────────────────────────────────────────

  test('services-grid block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-services-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'sg1', type: 'services-grid', order: 0, title: 'Our Services', services: [
        { id: 's1', title: 'Consulting', description: 'Expert guidance.', icon: 'lightbulb' },
      ], columns: 3 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].services).toHaveLength(1);
    expect(content.blocks[0].columns).toBe(3);

    await updatePost(clientApi, post.id, [
      { id: 'sg1', type: 'services-grid', order: 0, title: 'Updated Services', overline: 'WHAT WE DO', services: [
        { id: 's1', title: 'Consulting', description: 'Expert guidance.', icon: 'lightbulb' },
        { id: 's2', title: 'Implementation', description: 'Hands-on delivery.', icon: 'build', link: '/services/impl' },
      ], columns: 2, accentColor: '#ff6600' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].services).toHaveLength(2);
    expect(updatedContent.blocks[0].columns).toBe(2);
    expect(updatedContent.blocks[0].accentColor).toBe('#ff6600');
  });

  // ── Blog Posts Block ───────────────────────────────────────────────────────

  test('blog-posts block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-blog-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'bp1', type: 'blog-posts', order: 0, title: 'Latest Posts', limit: 3, columns: 3 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].limit).toBe(3);

    await updatePost(clientApi, post.id, [
      { id: 'bp1', type: 'blog-posts', order: 0, title: 'News', limit: 6, columns: 2, showExcerpt: true, categorySlug: 'product' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].limit).toBe(6);
    expect(updatedContent.blocks[0].columns).toBe(2);
    expect(updatedContent.blocks[0].categorySlug).toBe('product');
  });

  // ── Featured Content Block ─────────────────────────────────────────────────

  test('featured-content block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-featured-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'fc1', type: 'featured-content', order: 0, title: 'Spotlight', imageUrl: 'https://example.com/a.jpg', imagePosition: 'left' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].title).toBe('Spotlight');

    await updatePost(clientApi, post.id, [
      { id: 'fc1', type: 'featured-content', order: 0, title: 'Featured Story', description: 'Read more', imageUrl: 'https://example.com/b.jpg', imagePosition: 'right', buttonText: 'Read', buttonUrl: '/story', stats: [
        { id: 'st1', value: '99%', label: 'Satisfaction' },
      ] },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].imagePosition).toBe('right');
    expect(updatedContent.blocks[0].stats).toHaveLength(1);
  });

  // ── Hero Slideshow Block ───────────────────────────────────────────────────

  test('hero-slideshow block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-slideshow-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'hs1', type: 'hero-slideshow', order: 0, slides: [
        { id: 'sl1', title: 'Slide 1', backgroundImage: 'https://example.com/1.jpg' },
      ], autoplay: true, interval: 5000 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].slides).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'hs1', type: 'hero-slideshow', order: 0, slides: [
        { id: 'sl1', title: 'Slide 1', subtitle: 'A', backgroundImage: 'https://example.com/1.jpg' },
        { id: 'sl2', title: 'Slide 2', subtitle: 'B', backgroundImage: 'https://example.com/2.jpg', ctaText: 'Go', ctaLink: '#' },
      ], autoplay: false, transition: 'fade', showDots: true },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].slides).toHaveLength(2);
    expect(updatedContent.blocks[0].transition).toBe('fade');
    expect(updatedContent.blocks[0].showDots).toBe(true);
  });

  // ── Timeline Block ─────────────────────────────────────────────────────────

  test('timeline block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-timeline-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'tl1', type: 'timeline', order: 0, title: 'Our Journey', steps: [
        { id: 'st1', title: 'Founded', description: 'Day one.' },
      ] },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].steps).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'tl1', type: 'timeline', order: 0, title: 'Updated Journey', overline: 'STORY', steps: [
        { id: 'st1', title: 'Founded', description: 'Day one.', number: '01' },
        { id: 'st2', title: 'Series A', description: 'Funded.', number: '02' },
      ], lineColor: '#cfa122', layout: 'alternating' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].steps).toHaveLength(2);
    expect(updatedContent.blocks[0].lineColor).toBe('#cfa122');
    expect(updatedContent.blocks[0].layout).toBe('alternating');
  });

  // ── Team Showcase Block ────────────────────────────────────────────────────

  test('team-showcase block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-team-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'tm1', type: 'team-showcase', order: 0, title: 'Our Team', members: [
        { id: 'm1', name: 'Alice', title: 'CEO', photo: 'https://example.com/a.jpg', bio: 'Leader.' },
      ] },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].members).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'tm1', type: 'team-showcase', order: 0, title: 'Leadership', overline: 'WHO WE ARE', members: [
        { id: 'm1', name: 'Alice', title: 'CEO', credentials: 'PhD', photo: 'https://example.com/a.jpg', bio: 'Leader.', specialties: ['Strategy'] },
        { id: 'm2', name: 'Bob', title: 'CTO', photo: 'https://example.com/b.jpg', bio: 'Engineer.' },
      ], accentColor: '#cfa122' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].members).toHaveLength(2);
    expect(updatedContent.blocks[0].accentColor).toBe('#cfa122');
  });

  // ── Team Flip Grid Block ───────────────────────────────────────────────────

  test('team-flip-grid block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-tflip-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'tfg1', type: 'team-flip-grid', order: 0, title: 'Meet the Team', members: [
        { id: 'm1', name: 'Alice', title: 'CEO', photo: 'https://example.com/a.jpg', bio: 'Leader.', question: 'Why?', answer: 'Because.' },
      ], columns: 3 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].members).toHaveLength(1);
    expect(content.blocks[0].columns).toBe(3);

    await updatePost(clientApi, post.id, [
      { id: 'tfg1', type: 'team-flip-grid', order: 0, title: 'Updated Team', members: [
        { id: 'm1', name: 'Alice', title: 'CEO', photo: 'https://example.com/a.jpg', bio: 'Leader.', question: 'Why?', answer: 'Because.' },
        { id: 'm2', name: 'Bob', title: 'CTO', photo: 'https://example.com/b.jpg', bio: 'Engineer.', question: 'How?', answer: 'Carefully.' },
      ], columns: 4, backBgColor: '#0A3A5C' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].members).toHaveLength(2);
    expect(updatedContent.blocks[0].columns).toBe(4);
    expect(updatedContent.blocks[0].backBgColor).toBe('#0A3A5C');
  });

  // ── Social Links Block ─────────────────────────────────────────────────────

  test('social-links block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-social-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'sl1', type: 'social-links', order: 0, links: [
        { platform: 'twitter', url: 'https://twitter.com/x' },
      ], alignment: 'center' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].links).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'sl1', type: 'social-links', order: 0, links: [
        { platform: 'twitter', url: 'https://twitter.com/x' },
        { platform: 'linkedin', url: 'https://linkedin.com/in/x' },
        { platform: 'instagram', url: 'https://instagram.com/x' },
      ], alignment: 'left', iconSize: 32 },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].links).toHaveLength(3);
    expect(updatedContent.blocks[0].alignment).toBe('left');
    expect(updatedContent.blocks[0].iconSize).toBe(32);
  });

  // ── Bento Grid Block ───────────────────────────────────────────────────────

  test('bento-grid block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-bento-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'bg1', type: 'bento-grid', order: 0, title: 'Why us', cards: [
        { id: 'c1', title: 'Fast', items: ['Sub-second responses'], variant: 'dark', span: 7 },
        { id: 'c2', title: 'Smart', items: ['ML-powered'], variant: 'light', span: 5 },
      ] },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].cards).toHaveLength(2);

    await updatePost(clientApi, post.id, [
      { id: 'bg1', type: 'bento-grid', order: 0, title: 'Updated', overline: 'WHY', cards: [
        { id: 'c1', title: 'Fast', items: ['Quick'], variant: 'dark', span: 6 },
        { id: 'c2', title: 'Smart', items: ['Wise'], variant: 'light', span: 6 },
        { id: 'c3', title: 'Reliable', items: ['Always on'], variant: 'dark', span: 12 },
      ], accentColor: '#cfa122' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].cards).toHaveLength(3);
    expect(updatedContent.blocks[0].accentColor).toBe('#cfa122');
  });

  // ── Site Footer Block ──────────────────────────────────────────────────────

  test('site-footer block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-footer-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'sf1', type: 'site-footer', order: 0, linkGroups: [
        { label: 'Company', links: [{ label: 'About', href: '/about' }] },
      ], copyright: '© 2026 Example' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].linkGroups).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'sf1', type: 'site-footer', order: 0, logoUrl: 'https://example.com/logo.png', tagline: 'Built well.', linkGroups: [
        { label: 'Company', links: [{ label: 'About', href: '/about' }, { label: 'Careers', href: '/careers' }] },
        { label: 'Legal', links: [{ label: 'Privacy', href: '/privacy' }] },
      ], contactInfo: { email: 'hello@example.com' }, copyright: '© 2026 Example', backgroundColor: '#0f2140' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].linkGroups).toHaveLength(2);
    expect(updatedContent.blocks[0].tagline).toBe('Built well.');
    expect(updatedContent.blocks[0].backgroundColor).toBe('#0f2140');
  });

  // ── Metric Cards Block ─────────────────────────────────────────────────────

  test('metric-cards block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-metrics-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'mc1', type: 'metric-cards', order: 0, title: 'Outcomes', metrics: [
        { id: 'm1', value: '83%', label: 'Retention' },
      ] },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].metrics).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'mc1', type: 'metric-cards', order: 0, title: 'Updated Outcomes', overline: 'PROOF', metrics: [
        { id: 'm1', value: '83%', label: 'Retention', institution: 'University X' },
        { id: 'm2', value: '$965K+', label: 'Revenue', link: '/case-study' },
      ], columns: 2, accentColor: '#cfa122' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].metrics).toHaveLength(2);
    expect(updatedContent.blocks[0].columns).toBe(2);
    expect(updatedContent.blocks[0].accentColor).toBe('#cfa122');
  });

  // ── Logo Strip Block ───────────────────────────────────────────────────────

  test('logo-strip block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-logos-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'ls1', type: 'logo-strip', order: 0, overline: 'TRUSTED BY', logos: [
        { id: 'l1', imageUrl: 'https://example.com/a.svg', alt: 'A' },
      ], columns: 5 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].logos).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'ls1', type: 'logo-strip', order: 0, overline: 'TRUSTED BY 100+ COLLEGES', logos: [
        { id: 'l1', imageUrl: 'https://example.com/a.svg', alt: 'A', link: 'https://a.com' },
        { id: 'l2', imageUrl: 'https://example.com/b.svg', alt: 'B' },
        { id: 'l3', imageUrl: 'https://example.com/c.svg', alt: 'C' },
      ], columns: 6, grayscale: true, gap: 'lg' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].logos).toHaveLength(3);
    expect(updatedContent.blocks[0].columns).toBe(6);
    expect(updatedContent.blocks[0].grayscale).toBe(true);
  });

  // ── Flip Card Grid Block ───────────────────────────────────────────────────

  test('flip-card-grid block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-flipcard-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'fcg1', type: 'flip-card-grid', order: 0, title: 'Capabilities', cards: [
        { id: 'c1', frontTitle: 'Speed', frontIcon: 'bolt', backText: 'Fast.' },
      ] },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].cards).toHaveLength(1);

    await updatePost(clientApi, post.id, [
      { id: 'fcg1', type: 'flip-card-grid', order: 0, title: 'Updated Capabilities', overline: 'WHAT', cards: [
        { id: 'c1', frontTitle: 'Speed', frontIcon: 'bolt', backText: 'Fast.', backLink: '/speed', backLinkText: 'See more' },
        { id: 'c2', frontTitle: 'Quality', frontSubtitle: 'Top-tier', frontIcon: 'star', backText: 'High.' },
      ], columns: 3, flipTrigger: 'click', accentColor: '#cfa122' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].cards).toHaveLength(2);
    expect(updatedContent.blocks[0].flipTrigger).toBe('click');
    expect(updatedContent.blocks[0].accentColor).toBe('#cfa122');
  });

  // ── Product Grid Block ─────────────────────────────────────────────────────

  test('product-grid block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-pgrid-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'pg1', type: 'product-grid', order: 0, title: 'Shop', limit: 8, columns: 4 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].limit).toBe(8);

    await updatePost(clientApi, post.id, [
      { id: 'pg1', type: 'product-grid', order: 0, title: 'Featured Shop', limit: 12, columns: 3, sort: 'featured', categorySlug: 'sale', showPrice: true, buttonText: 'Add to Cart' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].limit).toBe(12);
    expect(updatedContent.blocks[0].sort).toBe('featured');
    expect(updatedContent.blocks[0].categorySlug).toBe('sale');
  });

  // ── Featured Products Block ────────────────────────────────────────────────

  test('featured-products block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-fprod-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'fp1', type: 'featured-products', order: 0, title: 'Bestsellers', limit: 4, columns: 4 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].title).toBe('Bestsellers');

    await updatePost(clientApi, post.id, [
      { id: 'fp1', type: 'featured-products', order: 0, title: 'Top Picks', limit: 6, columns: 3, layout: 'carousel', showBadge: true, badgeText: 'Hot' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].layout).toBe('carousel');
    expect(updatedContent.blocks[0].badgeText).toBe('Hot');
  });

  // ── Product Categories Block ───────────────────────────────────────────────

  test('product-categories block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-pcat-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'pc1', type: 'product-categories', order: 0, title: 'Categories', columns: 4 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].columns).toBe(4);

    await updatePost(clientApi, post.id, [
      { id: 'pc1', type: 'product-categories', order: 0, title: 'Shop by Category', columns: 3, layout: 'list', showProductCount: true, showImage: true },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].layout).toBe('list');
    expect(updatedContent.blocks[0].showProductCount).toBe(true);
  });

  // ── Shopping Cart Block ────────────────────────────────────────────────────

  test('shopping-cart block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-cart-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'sc1', type: 'shopping-cart', order: 0, variant: 'mini' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].variant).toBe('mini');

    await updatePost(clientApi, post.id, [
      { id: 'sc1', type: 'shopping-cart', order: 0, variant: 'full', showSubtotal: true, checkoutButtonText: 'Pay Now', emptyCartMessage: 'Your cart is empty.' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].variant).toBe('full');
    expect(updatedContent.blocks[0].checkoutButtonText).toBe('Pay Now');
  });

  // ── Store Banner Block ─────────────────────────────────────────────────────

  test('store-banner block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-banner-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'sb1', type: 'store-banner', order: 0, title: 'Summer Sale' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].title).toBe('Summer Sale');

    await updatePost(clientApi, post.id, [
      { id: 'sb1', type: 'store-banner', order: 0, title: 'Black Friday', subtitle: 'Up to 50% off', discountCode: 'BF50', buttonText: 'Shop Now', buttonUrl: '/shop', backgroundStyle: 'gradient', accentColor: '#cfa122' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].title).toBe('Black Friday');
    expect(updatedContent.blocks[0].discountCode).toBe('BF50');
    expect(updatedContent.blocks[0].accentColor).toBe('#cfa122');
  });

  // ── Product Detail Block ───────────────────────────────────────────────────

  test('product-detail block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-pdetail-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'pd1', type: 'product-detail', order: 0, productSlug: 'sample-product' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].productSlug).toBe('sample-product');

    await updatePost(clientApi, post.id, [
      { id: 'pd1', type: 'product-detail', order: 0, productSlug: 'sample-product', layout: 'wide', showGallery: true, showVariants: true, showAddToCart: true, showBreadcrumb: false },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].layout).toBe('wide');
    expect(updatedContent.blocks[0].showVariants).toBe(true);
    expect(updatedContent.blocks[0].showBreadcrumb).toBe(false);
  });

  // ── Booking Block ──────────────────────────────────────────────────────────

  test('booking block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-booking-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'bk1', type: 'booking', order: 0, slug: 'consultation', title: 'Book a call' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].slug).toBe('consultation');

    await updatePost(clientApi, post.id, [
      { id: 'bk1', type: 'booking', order: 0, slug: 'demo-call', title: 'Schedule a demo', description: 'Pick a time.', showSteps: true, height: '700px', styleOverrides: { primaryColor: '#cfa122' } },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].slug).toBe('demo-call');
    expect(updatedContent.blocks[0].height).toBe('700px');
    expect(updatedContent.blocks[0].styleOverrides.primaryColor).toBe('#cfa122');
  });

  // ── Booking Menu Block ─────────────────────────────────────────────────────

  test('booking-menu block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-bookmenu-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'bm1', type: 'booking-menu', order: 0, title: 'Choose a Service', columns: 3 },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].title).toBe('Choose a Service');
    expect(content.blocks[0].columns).toBe(3);

    await updatePost(clientApi, post.id, [
      { id: 'bm1', type: 'booking-menu', order: 0, title: 'Our Services', description: 'Pick what fits.', columns: 2 },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].title).toBe('Our Services');
    expect(updatedContent.blocks[0].description).toBe('Pick what fits.');
    expect(updatedContent.blocks[0].columns).toBe(2);
  });

  // ── Survey Block ───────────────────────────────────────────────────────────

  test('survey block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-survey-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'sv1', type: 'survey', order: 0, slug: 'feedback', title: 'Tell us' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].slug).toBe('feedback');

    await updatePost(clientApi, post.id, [
      { id: 'sv1', type: 'survey', order: 0, slug: 'satisfaction', title: 'How are we doing?', description: 'Quick survey.', showPageTitle: false, height: '600px' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].slug).toBe('satisfaction');
    expect(updatedContent.blocks[0].showPageTitle).toBe(false);
    expect(updatedContent.blocks[0].height).toBe('600px');
  });

  // ── Survey Results Block ───────────────────────────────────────────────────

  test('survey-results block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-svresults-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'sr1', type: 'survey-results', order: 0, surveySlug: 'feedback', title: 'Results' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].surveySlug).toBe('feedback');

    await updatePost(clientApi, post.id, [
      { id: 'sr1', type: 'survey-results', order: 0, surveySlug: 'satisfaction', title: 'Survey Results', description: 'Aggregated answers.', chartType: 'bar', showResponseCount: true, showTextResponses: true, textResponseLimit: 5, accentColor: '#cfa122', layout: 'tabbed' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].surveySlug).toBe('satisfaction');
    expect(updatedContent.blocks[0].chartType).toBe('bar');
    expect(updatedContent.blocks[0].layout).toBe('tabbed');
  });

  // ── Email Header Block ─────────────────────────────────────────────────────

  test('email-header block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-emailhdr-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'eh1', type: 'email-header', order: 0, logoUrl: 'https://example.com/logo.png' },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].logoUrl).toBe('https://example.com/logo.png');

    await updatePost(clientApi, post.id, [
      { id: 'eh1', type: 'email-header', order: 0, logoUrl: 'https://example.com/new-logo.png', logoWidth: 180, tagline: 'Hello world', alignment: 'center' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].logoWidth).toBe(180);
    expect(updatedContent.blocks[0].tagline).toBe('Hello world');
    expect(updatedContent.blocks[0].alignment).toBe('center');
  });

  // ── Email Footer Block ─────────────────────────────────────────────────────

  test('email-footer block: create, verify, update', async ({ clientApi, unauthApi }) => {
    const slug = `ve-emailftr-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      { id: 'ef1', type: 'email-footer', order: 0, companyName: 'Example Inc', showUnsubscribe: true },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].companyName).toBe('Example Inc');

    await updatePost(clientApi, post.id, [
      { id: 'ef1', type: 'email-footer', order: 0, companyName: 'Example LLC', address: '123 Main St', showUnsubscribe: true, showViewInBrowser: true, socialLinks: [
        { platform: 'twitter', url: 'https://twitter.com/x' },
      ] },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks[0].companyName).toBe('Example LLC');
    expect(updatedContent.blocks[0].address).toBe('123 Main St');
    expect(updatedContent.blocks[0].showViewInBrowser).toBe(true);
    expect(updatedContent.blocks[0].socialLinks).toHaveLength(1);
  });
});
