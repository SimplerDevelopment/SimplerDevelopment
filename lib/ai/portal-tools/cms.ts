/**
 * CMS / website AI tools — websites, pages/posts, categories, tags, media,
 * hosting, and the deeper page-content / block edit tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import {
  clientWebsites, posts, postRevisions, categories, tags, media, hostedSites,
} from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export const cmsTools: Anthropic.Tool[] = [
  {
    name: 'get_my_websites',
    description: 'Get all client websites with page counts and deployment status.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_website_pages',
    description: 'Get all pages/posts for a specific website.',
    input_schema: {
      type: 'object' as const,
      properties: { website_id: { type: 'number', description: 'The website ID' } },
      required: ['website_id'],
    },
  },
  {
    name: 'get_website_categories',
    description: 'Get all categories for a specific website.',
    input_schema: {
      type: 'object' as const,
      properties: { website_id: { type: 'number', description: 'The website ID' } },
      required: ['website_id'],
    },
  },
  {
    name: 'get_website_tags',
    description: 'Get all tags for a specific website.',
    input_schema: {
      type: 'object' as const,
      properties: { website_id: { type: 'number', description: 'The website ID' } },
      required: ['website_id'],
    },
  },
  {
    name: 'get_website_media',
    description: 'Get all media files for a specific website.',
    input_schema: {
      type: 'object' as const,
      properties: { website_id: { type: 'number', description: 'The website ID' } },
      required: ['website_id'],
    },
  },
  {
    name: 'get_my_hosted_sites',
    description: 'Get all hosted sites for this client with status, domain, plan, and DNS info.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_website_page',
    description: 'Create a new page/post on a client website with optional block content. Only call AFTER the client confirms the details. For blog posts, generate appropriate blocks (heading, text, image, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        website_id: { type: 'number', description: 'The website ID' },
        title: { type: 'string', description: 'Page title' },
        slug: { type: 'string', description: 'URL slug for the page' },
        post_type: { type: 'string', enum: ['page', 'blog', 'landing'], description: 'Type of page' },
        excerpt: { type: 'string', description: 'Short excerpt/summary (optional)' },
        published: { type: 'boolean', description: 'Whether to publish immediately' },
        blocks: { type: 'string', description: 'Optional JSON string of block content array. If omitted, page starts empty.' },
      },
      required: ['website_id', 'title', 'slug', 'post_type'],
    },
  },
  {
    name: 'publish_page',
    description: 'Publish or unpublish a page/post. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
        published: { type: 'boolean', description: 'true to publish, false to unpublish' },
      },
      required: ['post_id', 'published'],
    },
  },
  {
    name: 'create_website_category',
    description: 'Create a new category on a client website. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        website_id: { type: 'number', description: 'The website ID' },
        name: { type: 'string', description: 'Category name' },
        slug: { type: 'string', description: 'URL slug' },
        description: { type: 'string', description: 'Category description (optional)' },
      },
      required: ['website_id', 'name', 'slug'],
    },
  },
  {
    name: 'create_website_tag',
    description: 'Create a new tag on a client website. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        website_id: { type: 'number', description: 'The website ID' },
        name: { type: 'string', description: 'Tag name' },
        slug: { type: 'string', description: 'URL slug' },
      },
      required: ['website_id', 'name', 'slug'],
    },
  },
  {
    name: 'get_page_content',
    description: 'Get the full block content (JSON) for a specific page/post. Returns the block editor data including all blocks and page settings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
      },
      required: ['post_id'],
    },
  },
  {
    name: 'update_page_blocks',
    description: 'Replace the full block content for a page/post. Pass the entire blocks JSON array. A revision is saved automatically. Use get_page_content first to read the current blocks, modify what you need, and pass the full array back.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
        blocks: { type: 'string', description: 'The full blocks JSON array as a string' },
      },
      required: ['post_id', 'blocks'],
    },
  },
  {
    name: 'update_block_by_id',
    description: 'Update a single block within a page by its block ID. Pass only the fields you want to change — they will be merged into the existing block. For nested arrays like hero-slideshow slides, pass the full updated slides array. A revision is saved automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
        block_id: { type: 'string', description: 'The block ID within the page' },
        updates: { type: 'string', description: 'JSON string of fields to merge into the block (e.g. {"title": "New Title"} or {"slides": [...]})' },
      },
      required: ['post_id', 'block_id', 'updates'],
    },
  },
  {
    name: 'update_page_metadata',
    description: 'Update a page/post title, slug, excerpt, or post type. Only update fields the client explicitly asked to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
        title: { type: 'string', description: 'New page title' },
        slug: { type: 'string', description: 'New URL slug' },
        excerpt: { type: 'string', description: 'New excerpt/summary' },
        post_type: { type: 'string', enum: ['page', 'blog', 'landing'], description: 'New post type' },
      },
      required: ['post_id'],
    },
  },
];

export type CmsHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const cmsHandlers: Record<string, CmsHandler> = {
  get_my_websites: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: clientWebsites.id,
      name: clientWebsites.name,
      domain: clientWebsites.domain,
      subdomain: clientWebsites.subdomain,
      description: clientWebsites.description,
      deploymentStatus: clientWebsites.deploymentStatus,
      vercelDomain: clientWebsites.vercelDomain,
    }).from(clientWebsites).where(eq(clientWebsites.clientId, clientId));

    // Get page counts per website
    const result = [];
    for (const site of rows) {
      const [countRow] = await db.select({ count: sql<number>`count(*)` })
        .from(posts).where(eq(posts.websiteId, site.id));
      result.push({ ...site, pageCount: countRow?.count ?? 0 });
    }
    return result;
  },

  get_website_pages: async (input, clientId, _userId) => {
    const websiteId = input.website_id as number;
    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Website not found' };

    const rows = await db.select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      postType: posts.postType,
      published: posts.published,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    }).from(posts).where(eq(posts.websiteId, websiteId)).orderBy(desc(posts.updatedAt));

    return { website: site.name, pages: rows };
  },

  get_website_categories: async (input, clientId, _userId) => {
    const websiteId = input.website_id as number;
    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Website not found' };

    const rows = await db.select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
    }).from(categories).where(eq(categories.websiteId, websiteId));
    return rows;
  },

  get_website_tags: async (input, clientId, _userId) => {
    const websiteId = input.website_id as number;
    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Website not found' };

    const rows = await db.select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    }).from(tags).where(eq(tags.websiteId, websiteId));
    return rows;
  },

  get_website_media: async (input, clientId, _userId) => {
    const websiteId = input.website_id as number;
    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Website not found' };

    const rows = await db.select({
      id: media.id,
      filename: media.filename,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      url: media.url,
      alt: media.alt,
      createdAt: media.createdAt,
    }).from(media).where(eq(media.websiteId, websiteId)).orderBy(desc(media.createdAt));
    return rows;
  },

  get_my_hosted_sites: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: hostedSites.id,
      name: hostedSites.name,
      customDomain: hostedSites.customDomain,
      railwayDomain: hostedSites.railwayDomain,
      status: hostedSites.status,
      plan: hostedSites.plan,
      renewalDate: hostedSites.renewalDate,
      dnsInstructions: hostedSites.dnsInstructions,
    }).from(hostedSites).where(eq(hostedSites.clientId, clientId));
    return rows;
  },

  create_website_page: async (input, clientId, _userId) => {
    const websiteId = input.website_id as number;
    const title = input.title as string;
    const slug = input.slug as string;
    const postType = (input.post_type as string) || 'page';
    const excerpt = input.excerpt as string | undefined;
    const published = input.published as boolean | undefined;
    const blocksStr = input.blocks as string | undefined;

    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Website not found' };

    let content = '[]';
    if (blocksStr) {
      try {
        const parsed = JSON.parse(blocksStr);
        if (!Array.isArray(parsed)) return { error: 'blocks must be a JSON array' };
        content = JSON.stringify(parsed);
      } catch { return { error: 'Invalid JSON in blocks' }; }
    }

    const [post] = await db.insert(posts).values({
      title,
      slug,
      postType,
      excerpt: excerpt ?? null,
      content,
      published: published ?? false,
      publishedAt: published ? new Date() : null,
      websiteId,
    }).returning();

    return {
      success: true,
      postId: post.id,
      message: `Page "${title}" created${published ? ' and published' : ' as draft'}.`,
    };
  },

  publish_page: async (input, clientId, _userId) => {
    const postId = input.post_id as number;
    const published = input.published as boolean;

    // Verify the post belongs to a website owned by this client
    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post || !post.websiteId) return { error: 'Page not found' };

    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Page does not belong to your website' };

    await db.update(posts).set({
      published,
      publishedAt: published ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(posts.id, postId));

    return { success: true, message: `Page "${post.title}" ${published ? 'published' : 'unpublished'}.` };
  },

  create_website_category: async (input, clientId, _userId) => {
    const websiteId = input.website_id as number;
    const name = input.name as string;
    const slug = input.slug as string;
    const description = input.description as string | undefined;

    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Website not found' };

    const [cat] = await db.insert(categories).values({
      name,
      slug,
      description: description ?? null,
      websiteId,
    }).returning();

    return { success: true, categoryId: cat.id, message: `Category "${name}" created.` };
  },

  create_website_tag: async (input, clientId, _userId) => {
    const websiteId = input.website_id as number;
    const name = input.name as string;
    const slug = input.slug as string;

    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Website not found' };

    const [tag] = await db.insert(tags).values({
      name,
      slug,
      websiteId,
    }).returning();

    return { success: true, tagId: tag.id, message: `Tag "${name}" created.` };
  },

  get_page_content: async (input, clientId, _userId) => {
    const postId = input.post_id as number;
    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post || !post.websiteId) return { error: 'Page not found' };

    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Page does not belong to your website' };

    let blocks: unknown = [];
    try {
      blocks = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
    } catch {
      blocks = [];
    }

    return {
      postId: post.id,
      title: post.title,
      slug: post.slug,
      postType: post.postType,
      published: post.published,
      website: site.name,
      blocks,
    };
  },

  update_page_blocks: async (input, clientId, userId) => {
    const postId = input.post_id as number;
    const blocksStr = input.blocks as string;

    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post || !post.websiteId) return { error: 'Page not found' };

    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Page does not belong to your website' };

    // Validate JSON
    let parsed: unknown;
    try { parsed = JSON.parse(blocksStr); } catch { return { error: 'Invalid JSON in blocks' }; }
    if (!Array.isArray(parsed)) return { error: 'blocks must be a JSON array' };

    const newContent = JSON.stringify(parsed);

    // Save revision
    await db.insert(postRevisions).values({
      postId,
      content: post.content,
      title: post.title,
      trigger: 'manual',
      createdBy: userId,
    });

    await db.update(posts).set({ content: newContent, updatedAt: new Date() })
      .where(eq(posts.id, postId));

    return { success: true, message: `Page "${post.title}" blocks updated. ${parsed.length} blocks saved.` };
  },

  update_block_by_id: async (input, clientId, userId) => {
    const postId = input.post_id as number;
    const blockId = input.block_id as string;
    const updatesStr = input.updates as string;

    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post || !post.websiteId) return { error: 'Page not found' };

    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Page does not belong to your website' };

    let updates: Record<string, unknown>;
    try { updates = JSON.parse(updatesStr); } catch { return { error: 'Invalid JSON in updates' }; }

    let blocks: Array<Record<string, unknown>>;
    try {
      blocks = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
    } catch {
      return { error: 'Could not parse existing page content' };
    }

    // Find block by ID — search top-level and inside sections/columns
    let found = false;
    function findAndUpdate(blockList: Array<Record<string, unknown>>): void {
      for (const block of blockList) {
        if (block.id === blockId) {
          Object.assign(block, updates);
          found = true;
          return;
        }
        // Search nested blocks in sections
        if (Array.isArray(block.blocks)) {
          findAndUpdate(block.blocks as Array<Record<string, unknown>>);
          if (found) return;
        }
        // Search nested blocks in columns
        if (Array.isArray(block.columns)) {
          for (const col of block.columns as Array<Record<string, unknown>>) {
            if (Array.isArray(col.blocks)) {
              findAndUpdate(col.blocks as Array<Record<string, unknown>>);
              if (found) return;
            }
          }
        }
        // Search nested blocks in tabs
        if (Array.isArray(block.tabs)) {
          for (const tab of block.tabs as Array<Record<string, unknown>>) {
            if (Array.isArray(tab.blocks)) {
              findAndUpdate(tab.blocks as Array<Record<string, unknown>>);
              if (found) return;
            }
          }
        }
      }
    }

    findAndUpdate(blocks);
    if (!found) return { error: `Block with ID "${blockId}" not found on this page` };

    // Save revision
    await db.insert(postRevisions).values({
      postId,
      content: post.content,
      title: post.title,
      trigger: 'manual',
      createdBy: userId,
    });

    await db.update(posts).set({ content: JSON.stringify(blocks), updatedAt: new Date() })
      .where(eq(posts.id, postId));

    return { success: true, message: `Block "${blockId}" updated on page "${post.title}".` };
  },

  update_page_metadata: async (input, clientId, _userId) => {
    const postId = input.post_id as number;
    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post || !post.websiteId) return { error: 'Page not found' };

    const [site] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    if (!site) return { error: 'Page does not belong to your website' };

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) update.title = input.title;
    if (input.slug !== undefined) update.slug = input.slug;
    if (input.excerpt !== undefined) update.excerpt = input.excerpt;
    if (input.post_type !== undefined) update.postType = input.post_type;

    await db.update(posts).set(update).where(eq(posts.id, postId));

    return { success: true, message: `Page metadata updated.` };
  },
};
