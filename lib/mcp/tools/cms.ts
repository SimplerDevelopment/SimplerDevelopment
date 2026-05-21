/**
 * MCP tools — cms.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor. The
 * registrar function below is invoked by buildMcpServer() and registers each
 * tool with its scope guard. Behavior is unchanged from the monolithic file.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, isNull, or, sql, gte, lte } from 'drizzle-orm';
import crypto from 'crypto';
import { hash as hashPassword } from 'bcryptjs';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  kanbanLabels,
  kanbanCardLabels,
  kanbanCardChecklistItems,
  kanbanCardAssignees,
  kanbanCardWatchers,
  kanbanCardDependencies,
  supportTickets,
  ticketMessages,
  crmContacts,
  crmCompanies,
  crmDeals,
  crmPipelines,
  crmPipelineStages,
  posts,
  media,
  clientWebsites,
  emailLists,
  emailCampaigns,
  pitchDecks,
  brandingProfiles,
  emailSubscribers,
  emailCampaignSends,
  surveys,
  surveyResponses,
  bookingPages,
  bookings,
  sprints,
  crmActivities,
  categories,
  tags,
  postCategories,
  postTags,
  automationRules,
  clientMembers,
  users,
  crmProposals,
  crmContracts,
  crmContractSigners,
  invoices,
  invoiceItems,
  serviceRequests,
  suggestedProjectRequests,
  suggestedProjects,
  services,
  aiConversations,
  aiMessages,
  kanbanCardComments,
  kanbanCardTimeLogs,
  kanbanCardFiles,
  kanbanCardArtifacts,
  crmDealArtifacts,
  siteNavigation,
  postRevisions,
  blockTemplates,
  blockTemplateUsages,
  emailTemplates,
  emailSegments,
  giftCertificates,
  crmCustomFields,
  crmCustomFieldValues,
  crmSavedViews,
  crmScoringRules,
  websiteDomains,
  websiteEnvironments,
  websiteEnvVars,
  clients,
  aiCreditBalances,
  aiCreditLedger,
  hostedSites,
  googleWorkspaceUserConnections,
} from '@/lib/db/schema';
import type { SurveyFieldDef, ProposalSection, ProposalLineItem, ProposalFee, ContractClause, PitchDeckSlideV2 } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { logCardActivity } from '@/lib/pm-activity';
import { uploadToS3, presignPut, generateMediaKey } from '@/lib/s3/upload';
import { getS3Client, getBucketName } from '@/lib/s3/client';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
import {
  unpackAndUploadZip,
  isHttpError as isZipHttpError,
  MAX_ZIP_TOTAL_BYTES,
} from '@/lib/html-zip-upload';
import { assertSafeUrl } from '@/lib/ssrf-guard';
import {
  renderBlocksToEmailHtml,
  resend,
  buildCampaignHtml,
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
} from '@/lib/email';
import { executeCampaignSend } from '@/lib/email/campaign-send';
import { revoke as revokeGoogleToken } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import { stageOrApply } from '../pending-changes';
import { mintLinkForResult, approvalEnvelope, createApprovalLink } from '../approval-links';
import { publishBlocksUpdate } from '@/lib/realtime/internal-publisher';
import { assertBlocksAllowedForUserId, BlockGateError } from '@/lib/security/block-allowlist';
import { BLOCKS_SCHEMA_REFERENCE, BLOCKS_SCHEMA_TLDR } from '../blocks-schema';
import {
  json,
  serializePostContent,
  denied,
  extractRows,
  dbErrorEnvelope,
  requireScope,
  serviceDenied,
  requireService,
  assignBlockIds,
  revalidateForWrite,
} from '../types';
import {
  postProjection,
  deckProjection,
  campaignProjection,
  SLIM_POST_COLUMNS,
} from '../projections';

export function registerCmsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── WEBSITES / POSTS ───────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'sites_list',
    {
      title: 'List websites',
      description: 'List all websites owned by the client.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const rows = await db.select().from(clientWebsites)
        .where(eq(clientWebsites.clientId, clientId))
        .orderBy(desc(clientWebsites.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'posts_list',
    {
      title: 'List posts',
      description:
        'List content posts for a website (or agency site if websiteId omitted). Returns a SLIM projection by default (no content blob). Pass `includeContent: true` only when you genuinely need the full body — for block-rich pages each post can be multi-MB. To inspect a single post in full, prefer `posts_get`.',
      inputSchema: {
        websiteId: z.number().optional(),
        postType: z.string().optional().describe('blog, page, etc.'),
        publishedOnly: z.boolean().optional(),
        limit: z.number().default(50).optional(),
        includeContent: z.boolean().default(false).optional().describe('Include the full content/customCss/customJs/SEO long-text fields. Default false — large pages can run multiple MB per row.'),
      },
    },
    async ({ websiteId, postType, publishedOnly, limit = 50, includeContent }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Site not found' });
      }
      const conds = [] as ReturnType<typeof eq>[];
      if (websiteId) conds.push(eq(posts.websiteId, websiteId));
      if (postType) conds.push(eq(posts.postType, postType));
      if (publishedOnly) conds.push(eq(posts.published, true));
      const rows = await db.select(postProjection(includeContent)).from(posts)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(posts.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'posts_get',
    {
      title: 'Get post',
      description:
        'Fetch a single post by id. Defaults to the slim projection (no content blob); pass `includeContent: true` to retrieve the full block payload. Use this — not posts_list — when you need a single page in full.',
      inputSchema: {
        id: z.number(),
        includeContent: z.boolean().default(false).optional().describe('Include the full content/customCss/customJs/SEO long-text fields. Default false.'),
      },
    },
    async ({ id, includeContent }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [row] = await db.select(postProjection(includeContent)).from(posts)
        .where(eq(posts.id, id)).limit(1);
      if (!row) return json({ error: 'Post not found' });
      if (row.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, row.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_create',
    {
      title: 'Create post',
      description:
        `Create a content post (blog entry or page) on a website. Returns the slim post projection by default (no content echo); pass \`includeContent: true\` only if you need the body in the response. ${BLOCKS_SCHEMA_TLDR}`,
      inputSchema: {
        websiteId: z.number(),
        title: z.string().min(1),
        slug: z.string().min(1),
        content: z.string().optional().describe('Plain text/HTML — wrapped in a single text block. Prefer `blocks` for structured pages.'),
        blocks: z.array(z.any()).optional().describe('Array of Block objects matching the visual editor schema (e.g. {id, type:"hero", order, title, ...}).'),
        excerpt: z.string().optional(),
        postType: z.string().default('blog').optional(),
        published: z.boolean().optional(),
        customCss: z.string().optional().describe('Per-post custom CSS injected at render time, scoped to the page.'),
        customJs: z.string().optional().describe('Per-post custom JS injected at render time, scoped to the page.'),
        includeContent: z.boolean().default(false).optional().describe('Echo back the full content/customCss/customJs/SEO long-text in the response. Default false — saves several MB per call for block-rich pages.'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, args.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      try {
        await assertBlocksAllowedForUserId(args.blocks, ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const { includeContent, ...createArgs } = args;
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'create',
        entityId: null,
        summary: `Create post "${createArgs.title}" on website ${createArgs.websiteId}`,
        payload: createArgs,
        apply: async () => {
          const [row] = await db.insert(posts).values({
            websiteId: createArgs.websiteId,
            title: createArgs.title,
            slug: createArgs.slug,
            content: serializePostContent({ blocks: createArgs.blocks, content: createArgs.content }),
            excerpt: createArgs.excerpt ?? null,
            postType: createArgs.postType ?? 'blog',
            published: createArgs.published ?? false,
            publishedAt: createArgs.published ? new Date() : null,
            customCss: createArgs.customCss ?? null,
            customJs: createArgs.customJs ?? null,
          }).returning(postProjection(includeContent));
          return row;
        },
      });
      const approval = approvalEnvelope(
        await mintLinkForResult({ ctx, entityType: 'post', summary: `Page "${createArgs.title}"`, result }),
      );
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending', approval });
      revalidateForWrite('posts');
      return json({ ...result.data, approval });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_update',
    {
      title: 'Update post',
      description:
        `Update a content post. Returns the slim post projection by default (no content echo); pass \`includeContent: true\` only if you need the body in the response. ${BLOCKS_SCHEMA_TLDR}`,
      inputSchema: {
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional().describe('Plain text/HTML — wrapped in a single text block. Prefer `blocks`.'),
        blocks: z.array(z.any()).optional().describe('Array of Block objects matching the visual editor schema.'),
        excerpt: z.string().optional(),
        published: z.boolean().optional(),
        customCss: z.string().nullable().optional().describe('Per-post custom CSS. Pass null to clear.'),
        customJs: z.string().nullable().optional().describe('Per-post custom JS. Pass null to clear.'),
        seoTitle: z.string().nullable().optional().describe('SEO <title> tag. Pass null to clear.'),
        seoDescription: z.string().nullable().optional().describe('SEO <meta name="description"> content. Pass null to clear.'),
        ogImage: z.string().nullable().optional().describe('Open Graph image URL. Pass null to clear.'),
        canonicalUrl: z.string().nullable().optional().describe('Canonical URL override. Pass null to clear.'),
        noIndex: z.boolean().optional().describe('Set true to emit <meta name="robots" content="noindex">.'),
        includeContent: z.boolean().default(false).optional().describe('Echo back the full content/customCss/customJs/SEO long-text in the response. Default false — saves several MB per call for block-rich pages.'),
      },
    },
    async ({ id, includeContent, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      try {
        await assertBlocksAllowedForUserId(rest.blocks, ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'update',
        entityId: id,
        summary: `Update post #${id}${rest.title ? ` → "${rest.title}"` : ''}${rest.published === true ? ' + publish' : ''}`,
        payload: { id, ...rest },
        originalSnapshot: { title: post.title, published: post.published, excerpt: post.excerpt, content: post.content, customCss: post.customCss, customJs: post.customJs, seoTitle: post.seoTitle, seoDescription: post.seoDescription, ogImage: post.ogImage, canonicalUrl: post.canonicalUrl, noIndex: post.noIndex },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          if (rest.title !== undefined) patch.title = rest.title;
          if (rest.blocks !== undefined || rest.content !== undefined) {
            patch.content = serializePostContent({ blocks: rest.blocks, content: rest.content });
          }
          if (rest.excerpt !== undefined) patch.excerpt = rest.excerpt;
          if (rest.published !== undefined) {
            patch.published = rest.published;
            if (rest.published) patch.publishedAt = new Date();
          }
          if (rest.customCss !== undefined) patch.customCss = rest.customCss;
          if (rest.customJs !== undefined) patch.customJs = rest.customJs;
          if (rest.seoTitle !== undefined) patch.seoTitle = rest.seoTitle;
          if (rest.seoDescription !== undefined) patch.seoDescription = rest.seoDescription;
          if (rest.ogImage !== undefined) patch.ogImage = rest.ogImage;
          if (rest.canonicalUrl !== undefined) patch.canonicalUrl = rest.canonicalUrl;
          if (rest.noIndex !== undefined) patch.noIndex = rest.noIndex;
          const [row] = await db.update(posts).set(patch).where(eq(posts.id, id)).returning(postProjection(includeContent));
          return row;
        },
      });
      const approval = approvalEnvelope(
        await mintLinkForResult({
          ctx,
          entityType: 'post',
          summary: `Page #${id}${rest.title ? ` → "${rest.title}"` : ''}`,
          result,
        }),
      );
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending', approval });
      revalidateForWrite('posts');
      return json({ ...result.data, approval });
    }
  );

  // ── posts_fork ──────────────────────────────────────────────────────
  // Lightweight clone. Duplicates the source post into a new draft row
  // pointing back via `parent_post_id`. Approve on the fork's link
  // publishes the fork (last-write-wins against the parent's live state).
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_fork',
    {
      title: 'Fork a post into a draft',
      description:
        'Duplicate a published post into a new draft row tied to the original via parent_post_id. Use when you want to revise a live page without taking it down — edit the fork, share its approval link for review, and the approver merges the fork back when it ships. Returns the new post id + an approval URL.',
      inputSchema: {
        id: z.number().describe('Source post id to fork.'),
        titleSuffix: z.string().default(' (fork)').optional().describe('Appended to the cloned title.'),
      },
    },
    async ({ id, titleSuffix = ' (fork)' }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [source] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      if (!source) return json({ error: 'Source post not found' });
      if (!source.websiteId) return json({ error: 'Permission denied — agency post' });
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, source.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Permission denied' });

      const forkSlug = `${source.slug}-fork-${Date.now().toString(36)}`;
      const [forkRow] = await db.insert(posts).values({
        websiteId: source.websiteId,
        title: `${source.title}${titleSuffix}`,
        slug: forkSlug,
        content: source.content,
        excerpt: source.excerpt,
        postType: source.postType,
        published: false,
        publishedAt: null,
        coverImage: source.coverImage,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        ogImage: source.ogImage,
        noIndex: source.noIndex,
        canonicalUrl: source.canonicalUrl,
        customCss: source.customCss,
        customJs: source.customJs,
        parentPostId: source.id,
      }).returning(postProjection(false));
      const link = await createApprovalLink({
        ctx,
        entityType: 'post',
        entityId: forkRow.id,
        summary: `Fork of post #${source.id} "${source.title}"`,
      });
      revalidateForWrite('portal');
      return json({ ...forkRow, parentPostId: source.id, approval: approvalEnvelope(link) });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_delete',
    {
      title: 'Delete post',
      description: 'Permanently delete a post. Revisions cascade. Only posts that belong to a website owned by this client can be deleted.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'delete',
        entityId: id,
        summary: `Delete post #${id} "${post.title}"`,
        payload: { id },
        originalSnapshot: { title: post.title, slug: post.slug, published: post.published, postType: post.postType },
        apply: async () => {
          await db.delete(posts).where(eq(posts.id, id));
          return { success: true, id };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  // Upload an HTML file as a draft `page` post wrapping a single html-embed
  // block. Mirrors POST /api/portal/cms/websites/[siteId]/posts/upload-html:
  // cleans the HTML, imports referenced assets to media, stores the file in
  // S3, and emits a draft post pointing at it. Body must be base64 — MCP
  // can't carry multipart.
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_upload_html',
    {
      title: 'Upload HTML as page',
      description: 'Upload an HTML/XHTML file (base64-encoded) as a draft `page` post wrapping a single html-embed block. The HTML is cleaned (nav/header stripped, head assets preserved), referenced assets are imported to media, and the file is stored in S3. Max 1 MB.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        filename: z.string().min(1).regex(/\.(html?|xhtml)$/i, 'File must be .html, .htm, or .xhtml'),
        contentBase64: z.string().min(1).describe('Base64-encoded HTML body. Decoded size must be ≤ 1 MB.'),
        sourceUrl: z.string().url().optional().describe('Original URL — used to resolve relative asset refs during import.'),
      },
    },
    async ({ websiteId, filename, contentBase64, sourceUrl }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      // Gate on author role: posts_upload_html always produces an html-embed
      // block, which the SEO prefetch path may inline into the parent DOM —
      // same XSS risk as html-render. Restrict to staff (admin/editor/employee).
      try {
        await assertBlocksAllowedForUserId([{ type: 'html-embed' }], ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });

      let rawBuffer: Buffer;
      try {
        rawBuffer = Buffer.from(contentBase64, 'base64');
      } catch {
        return json({ error: 'Invalid base64 content' });
      }
      const MAX_HTML_SIZE = 1_000_000;
      if (rawBuffer.byteLength === 0) return json({ error: 'Empty file' });
      if (rawBuffer.byteLength > MAX_HTML_SIZE) {
        return json({ error: `File exceeds ${MAX_HTML_SIZE} bytes` });
      }

      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'upload_html',
        entityId: null,
        summary: `Upload HTML "${filename}" as draft page on "${site.name}"`,
        payload: { websiteId, filename, contentBase64, sourceUrl },
        apply: async () => {
          const cleaned = cleanEmbedHtml(rawBuffer.toString('utf8'));
          const imported = await importHtmlAssets(cleaned, {
            websiteId: site.id,
            clientId,
            uploadedBy: ctx.userId,
            baseUrl: sourceUrl,
          });
          const buffer = Buffer.from(imported.html, 'utf8');
          const uploadResult = await uploadToS3(buffer, filename, 'text/html');

          await db.insert(media).values({
            filename,
            storedFilename: uploadResult.storedFilename,
            mimeType: 'text/html',
            fileSize: uploadResult.fileSize,
            url: uploadResult.url,
            uploadedBy: ctx.userId,
            clientId,
            websiteId: site.id,
          });

          // Find a free slug — append numeric suffix on collision (matches the
          // route's behavior so API + MCP yield identical post layouts).
          const baseSlug = (filename.trim().toLowerCase()
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 80)) || 'page';
          let slug = baseSlug;
          for (let i = 2; i < 100; i++) {
            const [collision] = await db.select({ id: posts.id }).from(posts)
              .where(and(eq(posts.slug, slug), eq(posts.websiteId, site.id))).limit(1);
            if (!collision) break;
            slug = `${baseSlug}-${i}`;
          }

          const filenameNoExt = filename.replace(/\.[^.]+$/, '');
          const ts = Date.now();
          const uploadedBlocks = [
            {
              id: `block-${ts}-html`,
              type: 'html-embed' as const,
              order: 1,
              url: uploadResult.url,
              filename,
              height: '100vh',
              width: 'full' as const,
              sandbox: 'scripts',
              iframeTitle: filenameNoExt,
            },
          ];
          const blockContent = JSON.stringify({ blocks: uploadedBlocks });

          const [post] = await db.insert(posts).values({
            title: filenameNoExt || 'Uploaded HTML',
            slug,
            postType: 'page',
            content: blockContent,
            published: false,
            websiteId: site.id,
          }).returning(SLIM_POST_COLUMNS);
          // Fan out to any editor that already opened this post id (rare for a
          // brand-new upload, but cheap insurance — same wire path as a
          // peer-typed edit). Fire-and-forget.
          void publishBlocksUpdate({
            entityType: 'post',
            entityId: post.id,
            blocks: uploadedBlocks as unknown as import('@/types/blocks').Block[],
          }).catch((err) => {
            console.warn('[mcp/posts_upload_html] realtime publish failed:', err);
          });
          return {
            ...post,
            importedAssets: imported.importedCount,
            skippedAssets: imported.skippedCount,
            url: uploadResult.url,
          };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );


  // Same as posts_upload_html but for a zipped multi-file bundle. The skill
  // `sd-build-html-embed` authors `index.html` + `style.css` + `script.js` +
  // `assets/` locally, then ships the whole tree through this tool. The zip
  // pipeline (lib/html-zip-upload.ts) is shared with the portal UI's REST
  // route — same validation (50 MB total / 200 files / 10 MB per file,
  // ext allowlist, traversal guards) — so block JSON is byte-identical to
  // what the portal upload button produces.
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_upload_html_zip',
    {
      title: 'Upload HTML bundle (zip) as page',
      description: 'Upload a zip archive (base64-encoded) containing index.html + supporting assets (css/js/images/fonts) as a draft `page` post wrapping a single html-embed block. Every file in the zip is uploaded to S3 under a shared media/<uuid>/ prefix; relative refs (./style.css, assets/img.png) resolve through the path-based media proxy. Limits: 50 MB uncompressed total, 200 files, 10 MB per file, ext allowlist (html/css/js/png/jpg/webp/svg/woff/woff2/ttf/json/...). The index entry priority is: root /index.html → first root .html → first .html anywhere.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        filename: z.string().min(1).regex(/\.zip$/i, 'File must be a .zip'),
        contentBase64: z.string().min(1).describe('Base64-encoded zip body. Decoded size must be ≤ 50 MB.'),
      },
    },
    async ({ websiteId, filename, contentBase64 }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      try {
        await assertBlocksAllowedForUserId([{ type: 'html-embed' }], ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });

      let zipBuffer: Buffer;
      try {
        zipBuffer = Buffer.from(contentBase64, 'base64');
      } catch {
        return json({ error: 'Invalid base64 content' });
      }
      if (zipBuffer.byteLength === 0) return json({ error: 'Empty zip' });
      if (zipBuffer.byteLength > MAX_ZIP_TOTAL_BYTES) {
        return json({ error: `Zip exceeds ${MAX_ZIP_TOTAL_BYTES} bytes` });
      }

      let unpacked;
      try {
        unpacked = await unpackAndUploadZip(zipBuffer);
      } catch (err) {
        if (isZipHttpError(err)) return json({ error: err.message });
        throw err;
      }

      // Insert one media row per uploaded file under the shared prefix.
      const mediaRows = unpacked.entries.map((entry) => ({
        filename: entry.relativePath,
        storedFilename: entry.upload.storedFilename,
        mimeType: entry.mimeType,
        fileSize: entry.upload.fileSize,
        url: entry.upload.url,
        uploadedBy: ctx.userId,
        clientId,
        websiteId: site.id,
      }));
      await db.insert(media).values(mediaRows);

      // Pick a free slug derived from the zip filename minus .zip.
      const baseSlug = (filename.trim().toLowerCase()
        .replace(/\.zip$/i, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 80)) || 'bundle';
      let slug = baseSlug;
      for (let i = 2; i < 100; i++) {
        const [collision] = await db.select({ id: posts.id }).from(posts)
          .where(and(eq(posts.slug, slug), eq(posts.websiteId, site.id))).limit(1);
        if (!collision) break;
        slug = `${baseSlug}-${i}`;
      }

      const ts = Date.now();
      const titleBase = baseSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Uploaded Bundle';
      const uploadedBlocks = [
        {
          id: `block-${ts}-html`,
          type: 'html-embed' as const,
          order: 1,
          url: unpacked.index.upload.url,
          filename: unpacked.index.relativePath,
          height: '100vh',
          width: 'full' as const,
          sandbox: 'scripts',
          iframeTitle: titleBase,
        },
      ];
      const blockContent = JSON.stringify({ blocks: uploadedBlocks });

      const [post] = await db.insert(posts).values({
        title: titleBase,
        slug,
        postType: 'page',
        content: blockContent,
        published: false,
        websiteId: site.id,
      }).returning(SLIM_POST_COLUMNS);

      const approval = approvalEnvelope(
        await createApprovalLink({
          ctx,
          entityType: 'post',
          entityId: post.id,
          summary: `Bundle "${filename}" → page "${titleBase}"`,
        }),
      );

      revalidateForWrite('posts');
      return json({
        ...post,
        bundleFileCount: unpacked.entries.length,
        bundlePrefix: unpacked.prefix,
        url: unpacked.index.upload.url,
        approval,
      });
    }
  );

  // ── MEDIA ──────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'media:read') && server.registerTool(
    'media_list',
    {
      title: 'List media assets',
      description: 'List uploaded media assets for the client.',
      inputSchema: { limit: z.number().default(50).optional() },
    },
    async ({ limit = 50 }) => {
      if (!requireScope(ctx, 'media:read')) return denied('media:read');
      const rows = await db.select().from(media)
        .where(eq(media.clientId, clientId))
        .orderBy(desc(media.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_upload_from_url',
    {
      title: 'Upload media from URL',
      description:
        'Download a remote image/file (http/https) and store it in the client\'s media library. Returns the media row including the internal `url` that can be used in posts, decks, and emails.',
      inputSchema: {
        url: z.string().url().describe('Public http(s) URL to fetch.'),
        filename: z.string().optional().describe('Override filename; otherwise derived from the URL path.'),
        alt: z.string().optional(),
        caption: z.string().optional(),
        websiteId: z.number().optional().describe('Scope the asset to a specific site.'),
        brandingProfileId: z.number().optional(),
      },
    },
    async ({ url, filename, alt, caption, websiteId, brandingProfileId }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      try {
        await assertSafeUrl(url);
      } catch (err) {
        return json({ error: `URL rejected: ${(err as Error).message}` });
      }
      let resp: Response;
      try {
        resp = await fetch(url, { redirect: 'manual' });
        if (resp.status >= 300 && resp.status < 400) {
          return json({ error: 'Refusing to follow redirects on remote upload (SSRF guard).' });
        }
      } catch (err) {
        return json({ error: `Fetch failed: ${(err as Error).message}` });
      }
      if (!resp.ok) return json({ error: `Fetch returned ${resp.status}` });
      const contentLength = Number(resp.headers.get('content-length') ?? 0);
      const MAX_BYTES = 25 * 1024 * 1024;
      if (contentLength && contentLength > MAX_BYTES) {
        return json({ error: `File too large (${contentLength} bytes; max ${MAX_BYTES}).` });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_BYTES) return json({ error: `File too large (${buf.length} bytes).` });
      const mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
      const derivedName = filename
        ?? decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'upload')
        ?? 'upload';
      const result = await uploadToS3(buf, derivedName, mimeType);
      const [row] = await db.insert(media).values({
        filename: derivedName,
        storedFilename: result.storedFilename,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
        url: result.url,
        alt: alt ?? null,
        caption: caption ?? null,
        uploadedBy: ctx.userId,
        clientId,
        websiteId: websiteId ?? null,
        brandingProfileId: brandingProfileId ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // Allow-list mirrors the SAFE_INLINE set in app/api/media/proxy/[...path]/route.ts
  // plus SVG (which the proxy serves under a restrictive CSP) and a few audio
  // codecs the proxy already lists. Any mimeType not in this set is rejected
  // up-front so we never even mint a presigned URL for, e.g., text/html.
  const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/svg+xml',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
  ]);
  const MAX_MEDIA_UPLOAD_BYTES = 25 * 1024 * 1024;

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_upload_presign',
    {
      title: 'Presign a direct-to-S3 media upload',
      description:
        'Mint a short-lived S3 PUT URL so the caller (e.g. Claude Code) can `curl --upload-file` a local file directly into our media bucket without piping bytes through the MCP conversation. After the PUT succeeds, call `media_register` with the returned `mediaKey` to create the media row. The presigned URL pins both Content-Type and Content-Length; size cap is 25 MB, mimeType must be in the allow-list (images, PDF, mp4/webm/quicktime, common audio).',
      inputSchema: {
        filename: z.string().min(1).describe('Original filename — used to derive the extension and stored as media.filename on register.'),
        mimeType: z.string().min(1).describe('Content-Type the caller will send on PUT. Must be in the allow-list.'),
        fileSize: z.number().int().positive().describe('Exact byte count the caller will send. Capped at 25 MB; signed into the URL so S3 rejects mismatches.'),
      },
    },
    async ({ filename, mimeType, fileSize }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      const normalizedMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(normalizedMime)) {
        return json({
          error: `mimeType "${mimeType}" is not allowed. Allowed: ${Array.from(ALLOWED_UPLOAD_MIME_TYPES).join(', ')}.`,
        });
      }
      if (fileSize <= 0) return json({ error: 'fileSize must be > 0' });
      if (fileSize > MAX_MEDIA_UPLOAD_BYTES) {
        return json({ error: `File too large (${fileSize} bytes; max ${MAX_MEDIA_UPLOAD_BYTES}).` });
      }
      const { storedFilename, key } = generateMediaKey(filename);
      try {
        const presigned = await presignPut({
          key,
          contentType: normalizedMime,
          contentLength: fileSize,
          expiresInSeconds: 300,
        });
        return json({
          mediaKey: key,
          storedFilename,
          uploadUrl: presigned.uploadUrl,
          requiredHeaders: presigned.requiredHeaders,
          expiresAt: presigned.expiresAt,
        });
      } catch (err) {
        return json({ error: `Failed to presign upload: ${(err as Error).message}` });
      }
    }
  );

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_register',
    {
      title: 'Register an uploaded media object',
      description:
        'Finalize a presigned-upload flow: HEAD the S3 object the caller PUT to (via `media_upload_presign`), verify the size cap, and insert a `media` row pointing at it. Returns the new media row. Pairs with `media_upload_presign`.',
      inputSchema: {
        mediaKey: z.string().min(1).describe('S3 key returned by media_upload_presign (e.g. "media/<uuid>.<ext>").'),
        originalFilename: z.string().min(1).describe('User-facing filename, stored as media.filename.'),
        mimeType: z.string().min(1).describe('Expected mimeType. The server re-reads the S3-reported Content-Type and trusts that, not this value, but the field is required for parity with the URL-host path and to fail fast on obviously-wrong inputs.'),
        alt: z.string().optional(),
        caption: z.string().optional(),
        websiteId: z.number().optional().describe('Scope the asset to a specific site.'),
        brandingProfileId: z.number().optional(),
      },
    },
    async ({ mediaKey, originalFilename, mimeType, alt, caption, websiteId, brandingProfileId }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      const normalizedDeclaredMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(normalizedDeclaredMime)) {
        return json({ error: `mimeType "${mimeType}" is not in the allow-list.` });
      }
      // S3 key must live under the media/ prefix the proxy serves, otherwise
      // the resulting media.url won't resolve. Block path traversal too.
      if (!mediaKey.startsWith('media/') || mediaKey.includes('..')) {
        return json({ error: 'mediaKey must start with "media/" and contain no path traversal.' });
      }
      const s3 = getS3Client();
      const bucket = getBucketName();
      let head;
      try {
        head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: mediaKey }));
      } catch (err) {
        const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
          return json({ error: 'Object not found — did the curl PUT succeed?' });
        }
        return json({ error: `HEAD failed: ${(err as Error).message}` });
      }
      const actualSize = Number(head.ContentLength ?? 0);
      if (!actualSize) return json({ error: 'S3 reported empty object.' });
      if (actualSize > MAX_MEDIA_UPLOAD_BYTES) {
        return json({
          error: `Uploaded object exceeds 25 MB cap (${actualSize} bytes). Refusing to register.`,
        });
      }
      const reportedMime = head.ContentType?.split(';')[0]?.trim().toLowerCase() || normalizedDeclaredMime;
      // S3-reported Content-Type is what the proxy will hand to the browser,
      // so re-check it against the allow-list rather than trusting the caller.
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(reportedMime)) {
        return json({ error: `S3-reported mimeType "${reportedMime}" is not in the allow-list.` });
      }
      const storedFilename = mediaKey.replace(/^media\//, '');
      const url = `/api/media/proxy/${mediaKey}`;
      const [row] = await db.insert(media).values({
        filename: originalFilename,
        storedFilename,
        mimeType: reportedMime,
        fileSize: actualSize,
        url,
        alt: alt ?? null,
        caption: caption ?? null,
        uploadedBy: ctx.userId,
        clientId,
        websiteId: websiteId ?? null,
        brandingProfileId: brandingProfileId ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_delete',
    {
      title: 'Delete media asset',
      description: 'Delete a media row from the client\'s library. NOTE: this removes the DB record; the S3 object itself is not purged.',
      inputSchema: {
        id: z.number(),
      },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      const [existing] = await db.select({ id: media.id }).from(media)
        .where(and(eq(media.id, id), eq(media.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Media not found' });
      await db.delete(media).where(eq(media.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );


  // ── CATEGORIES / TAGS ──────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'taxonomies_list',
    {
      title: 'List categories and tags',
      description: 'List categories and tags scoped to a website (the client must own it).',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const [cats, tgs] = await Promise.all([
        db.select().from(categories).where(eq(categories.websiteId, websiteId)).orderBy(categories.name),
        db.select().from(tags).where(eq(tags.websiteId, websiteId)).orderBy(tags.name),
      ]);
      return json({ categories: cats, tags: tgs });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'taxonomies_create_category',
    {
      title: 'Create post category',
      description: 'Create a category on a website. Slug must be unique per website.',
      inputSchema: {
        websiteId: z.number(),
        name: z.string().min(1),
        slug: z.string().min(1).optional().describe('Derived from name if omitted.'),
        description: z.string().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      },
    },
    async ({ websiteId, name, slug, description, color }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const finalSlug = (slug ?? name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const result = await stageOrApply({
        ctx,
        entityType: 'taxonomy',
        operation: 'create',
        entityId: null,
        summary: `Create category "${name.trim()}" on "${site.name}"`,
        payload: { kind: 'category', websiteId, name, slug: finalSlug, description, color },
        apply: async () => {
          try {
            const [row] = await db.insert(categories).values({
              websiteId,
              name: name.trim(),
              slug: finalSlug,
              description: description ?? null,
              color: color ?? null,
            }).returning();
            return row;
          } catch (err) {
            throw new Error(`Could not create category (likely duplicate slug): ${(err as Error).message}`);
          }
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'taxonomies_create_tag',
    {
      title: 'Create post tag',
      description: 'Create a tag on a website. Slug must be unique per website.',
      inputSchema: {
        websiteId: z.number(),
        name: z.string().min(1),
        slug: z.string().min(1).optional(),
      },
    },
    async ({ websiteId, name, slug }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const finalSlug = (slug ?? name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const result = await stageOrApply({
        ctx,
        entityType: 'taxonomy',
        operation: 'create',
        entityId: null,
        summary: `Create tag "${name.trim()}" on "${site.name}"`,
        payload: { kind: 'tag', websiteId, name, slug: finalSlug },
        apply: async () => {
          try {
            const [row] = await db.insert(tags).values({
              websiteId,
              name: name.trim(),
              slug: finalSlug,
            }).returning();
            return row;
          } catch (err) {
            throw new Error(`Could not create tag (likely duplicate slug): ${(err as Error).message}`);
          }
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_set_taxonomies',
    {
      title: 'Set post categories and tags',
      description:
        'Replace the categories and/or tags assigned to a post. Pass arrays of category/tag ids (not names) — call taxonomies_list first to look them up. Omitted arrays are left unchanged.',
      inputSchema: {
        postId: z.number(),
        categoryIds: z.array(z.number()).optional(),
        tagIds: z.array(z.number()).optional(),
      },
    },
    async ({ postId, categoryIds, tagIds }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [post] = await db.select({ websiteId: posts.websiteId, title: posts.title }).from(posts)
        .where(eq(posts.id, postId)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (!post.websiteId) return json({ error: 'Permission denied — agency post' });
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Permission denied' });
      const prevCats = await db.select({ categoryId: postCategories.categoryId })
        .from(postCategories).where(eq(postCategories.postId, postId));
      const prevTags = await db.select({ tagId: postTags.tagId })
        .from(postTags).where(eq(postTags.postId, postId));
      const result = await stageOrApply({
        ctx,
        entityType: 'post_taxonomy',
        operation: 'update',
        entityId: postId,
        summary: `Set taxonomies on post "${post.title}"`,
        payload: { postId, categoryIds, tagIds },
        originalSnapshot: {
          categoryIds: prevCats.map((r) => r.categoryId),
          tagIds: prevTags.map((r) => r.tagId),
        },
        apply: async () => {
          if (categoryIds !== undefined) {
            await db.delete(postCategories).where(eq(postCategories.postId, postId));
            if (categoryIds.length > 0) {
              await db.insert(postCategories).values(categoryIds.map(cid => ({ postId, categoryId: cid })));
            }
          }
          if (tagIds !== undefined) {
            await db.delete(postTags).where(eq(postTags.postId, postId));
            if (tagIds.length > 0) {
              await db.insert(postTags).values(tagIds.map(tid => ({ postId, tagId: tid })));
            }
          }
          const assignedCats = await db.select({ categoryId: postCategories.categoryId })
            .from(postCategories).where(eq(postCategories.postId, postId));
          const assignedTags = await db.select({ tagId: postTags.tagId })
            .from(postTags).where(eq(postTags.postId, postId));
          return {
            postId,
            categoryIds: assignedCats.map(r => r.categoryId),
            tagIds: assignedTags.map(r => r.tagId),
          };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );


  // ── SITES WRITE ────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'sites_update',
    {
      title: 'Update website settings',
      description:
        'Update metadata on a client website (name, domain, description, active flag, public access gating). DNS/Vercel provisioning is not triggered by this tool — changes are persisted to the portal only.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        domain: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        active: z.boolean().optional(),
        publicAccess: z.boolean().optional(),
        // Use `.int().positive()` to force a non-empty JSON-schema export.
        // Plain `z.number().nullable().optional()` collapses to `{}` in the
        // current zod-to-json-schema serializer the MCP transport uses,
        // which lets clients send `"104"` (string) past the front door —
        // server-side zod then rejects with the schema-says-number error.
        // The `.int().positive()` chain emits proper number constraints
        // that the transport coerces correctly.
        brandingProfileId: z.number().int().positive().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [existing] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Site not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site',
        operation: 'update',
        entityId: id,
        summary: `Update website "${existing.name}" settings`,
        payload: { id, ...rest },
        originalSnapshot: {
          name: existing.name,
          domain: existing.domain,
          description: existing.description,
          active: existing.active,
          publicAccess: existing.publicAccess,
          brandingProfileId: existing.brandingProfileId,
        },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
          const [row] = await db.update(clientWebsites).set(patch)
            .where(eq(clientWebsites.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );


  // ── SITE CUSTOM CODE ──────────────────────────────────────────────────
  // Site-wide custom CSS/JS — applied to every page on the website.
  // Cascade order: site code → CPT code → per-post code, so a page can
  // override a CPT-level rule which can override a site rule.
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'sites_get_custom_code',
    {
      title: 'Get site custom CSS/JS',
      description: 'Get the site-wide custom CSS and JS that injects on every page render. Cascades before CPT and per-post code.',
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [site] = await db.select({
        id: clientWebsites.id,
        customCss: clientWebsites.customCss,
        customJs: clientWebsites.customJs,
      }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId)))
        .limit(1);
      if (!site) return json({ error: 'Site not found' });
      return json({ customCss: site.customCss || '', customJs: site.customJs || '' });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'sites_update_custom_code',
    {
      title: 'Update site custom CSS/JS (draft)',
      description: 'Writes to the DRAFT site-wide custom CSS/JS — the public renderer keeps serving the previously-published live values until `sites_publish_custom_code` is called. Pass an empty string to stage a clear; omit to leave unchanged. Use `sites_get_custom_code` to inspect the currently-live values; this tool never touches them directly.',
      inputSchema: {
        id: z.number().int().positive(),
        customCss: z.string().optional().describe('Stages into draft_custom_css. Empty string = stage a clear.'),
        customJs: z.string().optional().describe('Stages into draft_custom_js. Empty string = stage a clear.'),
      },
    },
    async ({ id, customCss, customJs }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [existing] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId)))
        .limit(1);
      if (!existing) return json({ error: 'Site not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site',
        operation: 'update',
        entityId: id,
        summary: `Update site custom CSS/JS for "${existing.name}" (draft)`,
        payload: { id, customCss, customJs },
        originalSnapshot: {
          customCss: existing.customCss,
          customJs: existing.customJs,
          draftCustomCss: existing.draftCustomCss,
          draftCustomJs: existing.draftCustomJs,
        },
        apply: async () => {
          const patch: Record<string, unknown> = {
            updatedAt: new Date(),
            draftUpdatedAt: new Date(),
            draftUpdatedBy: ctx.userId,
          };
          if (customCss !== undefined) patch.draftCustomCss = customCss === '' ? null : customCss;
          if (customJs !== undefined) patch.draftCustomJs = customJs === '' ? null : customJs;
          const [row] = await db.update(clientWebsites).set(patch)
            .where(eq(clientWebsites.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json({
        draftCustomCss: result.data.draftCustomCss || '',
        draftCustomJs: result.data.draftCustomJs || '',
        liveCustomCss: result.data.customCss || '',
        liveCustomJs: result.data.customJs || '',
        draftUpdatedAt: result.data.draftUpdatedAt,
        note: 'Wrote to draft fields. Call sites_publish_custom_code to make changes live.',
      });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'sites_publish_custom_code',
    {
      title: 'Publish site custom CSS/JS draft',
      description: 'Promotes the draft site-wide custom CSS/JS to live: copies draft_custom_css → custom_css, draft_custom_js → custom_js, then clears the draft fields. Subject to the same approval gate as other CMS writes when the API key requires approval.',
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [existing] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId)))
        .limit(1);
      if (!existing) return json({ error: 'Site not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site',
        operation: 'publish',
        entityId: id,
        summary: `Publish custom CSS/JS draft for "${existing.name}"`,
        payload: { id },
        originalSnapshot: {
          customCss: existing.customCss,
          customJs: existing.customJs,
          draftCustomCss: existing.draftCustomCss,
          draftCustomJs: existing.draftCustomJs,
        },
        apply: async () => {
          const [row] = await db.update(clientWebsites).set({
            customCss: existing.draftCustomCss,
            customJs: existing.draftCustomJs,
            draftCustomCss: null,
            draftCustomJs: null,
            draftUpdatedAt: null,
            draftUpdatedBy: null,
            updatedAt: new Date(),
          }).where(eq(clientWebsites.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json({
        customCss: result.data.customCss || '',
        customJs: result.data.customJs || '',
      });
    }
  );


  // ── SITE NAVIGATION ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'nav_list',
    {
      title: 'List website navigation items',
      description: 'List nav items for a website, sorted by sortOrder. Hierarchical via parentId.',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const rows = await db.select().from(siteNavigation)
        .where(eq(siteNavigation.websiteId, websiteId))
        .orderBy(siteNavigation.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_create',
    {
      title: 'Create navigation item (draft)',
      description: 'Stages a new nav item as a draft (pendingCreate). The public renderer ignores draft-only nav rows — call `nav_publish` (or `nav_publish_all`) to make the item live. Use parentId for nested items.',
      inputSchema: {
        websiteId: z.number(),
        label: z.string().min(1),
        href: z.string().min(1),
        parentId: z.number().optional(),
        sortOrder: z.number().optional(),
        openInNewTab: z.boolean().optional(),
        isButton: z.boolean().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, args.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'create',
        entityId: null,
        summary: `Create nav item "${args.label}" on "${site.name}" (draft)`,
        payload: args,
        apply: async () => {
          const existing = await db.select({ id: siteNavigation.id }).from(siteNavigation)
            .where(eq(siteNavigation.websiteId, args.websiteId));
          const sortOrder = args.sortOrder ?? existing.length;
          // Persist a base row with neutral defaults; the renderer ignores
          // draft-only items via pendingCreate. nav_publish promotes the
          // draft fields into the live columns.
          const draft: import('@/lib/db/schema').SiteNavigationDraft = {
            pendingCreate: true,
            label: args.label,
            href: args.href,
            parentId: args.parentId ?? null,
            sortOrder,
            openInNewTab: args.openInNewTab ?? false,
            isButton: args.isButton ?? false,
            description: args.description ?? null,
            icon: args.icon ?? null,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          const [row] = await db.insert(siteNavigation).values({
            websiteId: args.websiteId,
            label: args.label,
            href: args.href,
            parentId: args.parentId ?? null,
            sortOrder,
            openInNewTab: args.openInNewTab ?? false,
            isButton: args.isButton ?? false,
            description: args.description ?? null,
            icon: args.icon ?? null,
            draft,
          }).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_update',
    {
      title: 'Update navigation item (draft)',
      description: 'Stage changes to a nav item into its draft jsonb overlay. Live columns are left untouched until `nav_publish` (or `nav_publish_all`) is called.',
      inputSchema: {
        id: z.number(),
        label: z.string().min(1).optional(),
        href: z.string().min(1).optional(),
        parentId: z.number().nullable().optional(),
        sortOrder: z.number().optional(),
        openInNewTab: z.boolean().optional(),
        isButton: z.boolean().optional(),
        description: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [nav] = await db
        .select({
          id: siteNavigation.id,
          websiteId: siteNavigation.websiteId,
          label: siteNavigation.label,
          href: siteNavigation.href,
          draft: siteNavigation.draft,
        })
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) return json({ error: 'Nav item not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'update',
        entityId: id,
        summary: `Update nav item "${nav.label}" → ${rest.label ?? nav.label} (draft)`,
        payload: { id, ...rest },
        originalSnapshot: { label: nav.label, href: nav.href, draft: nav.draft },
        apply: async () => {
          const prev: import('@/lib/db/schema').SiteNavigationDraft = nav.draft ?? {};
          const next: import('@/lib/db/schema').SiteNavigationDraft = {
            ...prev,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          for (const [k, v] of Object.entries(rest)) {
            if (v !== undefined) (next as Record<string, unknown>)[k] = v;
          }
          const [row] = await db.update(siteNavigation)
            .set({ draft: next, updatedAt: new Date() })
            .where(eq(siteNavigation.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_delete',
    {
      title: 'Delete navigation item (draft)',
      description: 'Stages a tombstone on the nav item (draft.pendingDelete). The row is not actually deleted until `nav_publish` runs — the live nav still shows the item until then. Child items (parentId) are not auto-handled.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [nav] = await db
        .select({
          id: siteNavigation.id,
          websiteId: siteNavigation.websiteId,
          label: siteNavigation.label,
          href: siteNavigation.href,
          draft: siteNavigation.draft,
        })
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) return json({ error: 'Nav item not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'delete',
        entityId: id,
        summary: `Delete nav item "${nav.label}" (draft tombstone)`,
        payload: { id },
        originalSnapshot: { label: nav.label, href: nav.href, draft: nav.draft },
        apply: async () => {
          const prev: import('@/lib/db/schema').SiteNavigationDraft = nav.draft ?? {};
          const next: import('@/lib/db/schema').SiteNavigationDraft = {
            ...prev,
            pendingDelete: true,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          await db.update(siteNavigation)
            .set({ draft: next, updatedAt: new Date() })
            .where(eq(siteNavigation.id, id));
          return { success: true, id, pendingDelete: true };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_publish',
    {
      title: 'Publish navigation item draft',
      description: 'Promotes a single nav item\'s draft to live. If draft.pendingDelete: the row is removed. If draft.pendingCreate: the draft flag is cleared (item becomes visible). Otherwise: draft fields are applied onto the live columns and draft is cleared. Subject to the same approval gate as other CMS writes.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [nav] = await db
        .select()
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) return json({ error: 'Nav item not found' });
      const navRow = nav.site_navigation;
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'publish',
        entityId: id,
        summary: `Publish nav item "${navRow.label}"`,
        payload: { id },
        originalSnapshot: { label: navRow.label, href: navRow.href, draft: navRow.draft },
        apply: async () => {
          const draft: import('@/lib/db/schema').SiteNavigationDraft | null = navRow.draft;
          if (!draft) return { success: true, id, noop: true };
          if (draft.pendingDelete) {
            await db.delete(siteNavigation).where(eq(siteNavigation.id, id));
            return { success: true, id, deleted: true };
          }
          // Either pendingCreate (clear draft to make visible) or an
          // ordinary update (apply draft fields → live, then clear draft).
          const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
          if (draft.label !== undefined) patch.label = draft.label;
          if (draft.href !== undefined) patch.href = draft.href;
          if (draft.parentId !== undefined) patch.parentId = draft.parentId;
          if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;
          if (draft.openInNewTab !== undefined) patch.openInNewTab = draft.openInNewTab;
          if (draft.isButton !== undefined) patch.isButton = draft.isButton;
          if (draft.description !== undefined) patch.description = draft.description;
          if (draft.icon !== undefined) patch.icon = draft.icon;
          if (draft.featuredImage !== undefined) patch.featuredImage = draft.featuredImage;
          if (draft.columnGroup !== undefined) patch.columnGroup = draft.columnGroup;
          const [row] = await db.update(siteNavigation).set(patch)
            .where(eq(siteNavigation.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_publish_all',
    {
      title: 'Publish all nav drafts for a website',
      description: 'Promote every nav row with a non-null draft on a website. Same per-row semantics as `nav_publish` (pendingDelete → delete; pendingCreate → clear draft; else apply draft → live).',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const drafts = await db.select().from(siteNavigation)
        .where(and(
          eq(siteNavigation.websiteId, websiteId),
          sql`${siteNavigation.draft} IS NOT NULL`,
        ));
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'publish_all',
        entityId: null,
        summary: `Publish all nav drafts for "${site.name}" (${drafts.length} item${drafts.length === 1 ? '' : 's'})`,
        payload: { websiteId },
        originalSnapshot: { count: drafts.length, ids: drafts.map((d) => d.id) },
        apply: async () => {
          const results: Array<{ id: number; deleted?: boolean; published?: boolean }> = [];
          for (const navRow of drafts) {
            const draft: import('@/lib/db/schema').SiteNavigationDraft | null = navRow.draft;
            if (!draft) continue;
            if (draft.pendingDelete) {
              await db.delete(siteNavigation).where(eq(siteNavigation.id, navRow.id));
              results.push({ id: navRow.id, deleted: true });
              continue;
            }
            const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
            if (draft.label !== undefined) patch.label = draft.label;
            if (draft.href !== undefined) patch.href = draft.href;
            if (draft.parentId !== undefined) patch.parentId = draft.parentId;
            if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;
            if (draft.openInNewTab !== undefined) patch.openInNewTab = draft.openInNewTab;
            if (draft.isButton !== undefined) patch.isButton = draft.isButton;
            if (draft.description !== undefined) patch.description = draft.description;
            if (draft.icon !== undefined) patch.icon = draft.icon;
            if (draft.featuredImage !== undefined) patch.featuredImage = draft.featuredImage;
            if (draft.columnGroup !== undefined) patch.columnGroup = draft.columnGroup;
            await db.update(siteNavigation).set(patch).where(eq(siteNavigation.id, navRow.id));
            results.push({ id: navRow.id, published: true });
          }
          return { websiteId, count: results.length, items: results };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );


  // ── POST REVISIONS ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'posts_list_revisions',
    {
      title: 'List post revisions',
      description: 'Revision history for a post (autosaves, manual saves, publishes).',
      inputSchema: {
        postId: z.number(),
        limit: z.number().min(1).max(100).default(25).optional(),
      },
    },
    async ({ postId, limit = 25 }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [post] = await db.select({ websiteId: posts.websiteId }).from(posts)
        .where(eq(posts.id, postId)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      const rows = await db.select().from(postRevisions)
        .where(eq(postRevisions.postId, postId))
        .orderBy(desc(postRevisions.createdAt)).limit(limit);
      return json(rows);
    }
  );


  // ── BLOCK TEMPLATES ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'block_templates_list',
    {
      title: 'List block templates',
      description: 'List reusable CMS block templates. Global templates are shared across clients.',
      inputSchema: {
        category: z.enum(['custom', 'section', 'global']).optional(),
        scope: z.enum(['block', 'section', 'global']).optional(),
      },
    },
    async ({ category, scope }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const conds = [] as ReturnType<typeof eq>[];
      if (category) conds.push(eq(blockTemplates.category, category));
      if (scope) conds.push(eq(blockTemplates.scope, scope));
      const rows = await db.select({
        id: blockTemplates.id,
        name: blockTemplates.name,
        slug: blockTemplates.slug,
        description: blockTemplates.description,
        category: blockTemplates.category,
        scope: blockTemplates.scope,
        thumbnail: blockTemplates.thumbnail,
        tags: blockTemplates.tags,
        version: blockTemplates.version,
        updatedAt: blockTemplates.updatedAt,
      }).from(blockTemplates)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(blockTemplates.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'block_templates_get',
    {
      title: 'Get block template with blocks',
      description: 'Fetch full template including its blocks JSON.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [row] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!row) return json({ error: 'Template not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_create',
    {
      title: 'Create block template (draft)',
      description: 'Create a reusable CMS block template. Writes a base row with everything staged in the `draft` jsonb (pendingCreate=true). The template picker and "use this template" flow ignore draft-only templates until `block_templates_publish` is called. `slug` must be unique across the agency. `scope: "global"` syncs the template back to every post that embeds it; `block` and `section` are copy-on-insert.',
      inputSchema: {
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
        description: z.string().optional(),
        category: z.string().default('custom').optional(),
        scope: z.enum(['block', 'section', 'global']).default('block').optional(),
        blocks: z.array(z.any()).min(1),
        thumbnail: z.string().url().nullable().optional(),
        tags: z.array(z.string()).optional(),
        lockedFields: z.array(z.string()).optional().describe('Field paths that can\'t be edited when the template is reused (e.g. "0.type", "0.style.backgroundColor").'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      try {
        await assertBlocksAllowedForUserId(args.blocks, ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const [collision] = await db.select({ id: blockTemplates.id }).from(blockTemplates)
        .where(eq(blockTemplates.slug, args.slug)).limit(1);
      if (collision) return json({ error: 'A template with this slug already exists' });
      const result = await stageOrApply({
        ctx,
        entityType: 'block_template',
        operation: 'create',
        entityId: null,
        summary: `Create block template "${args.name}" (draft)`,
        payload: args,
        apply: async () => {
          const draft: import('@/lib/db/schema').BlockTemplateDraft = {
            pendingCreate: true,
            name: args.name,
            description: args.description ?? null,
            category: args.category ?? 'custom',
            scope: args.scope ?? 'block',
            blocks: args.blocks,
            thumbnail: args.thumbnail ?? null,
            tags: args.tags ?? [],
            lockedFields: args.lockedFields ?? [],
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          } as import('@/lib/db/schema').BlockTemplateDraft & { pendingCreate: boolean };
          // Live columns get the same values so a later `_publish` can be a
          // simple `draft = null` write, but the renderer/picker filter on
          // draft.pendingCreate to hide unpublished templates.
          const [row] = await db.insert(blockTemplates).values({
            name: args.name,
            slug: args.slug,
            description: args.description ?? null,
            category: args.category ?? 'custom',
            scope: args.scope ?? 'block',
            blocks: args.blocks,
            thumbnail: args.thumbnail ?? null,
            tags: args.tags ?? [],
            lockedFields: args.lockedFields ?? [],
            createdBy: ctx.userId,
            draft,
          }).returning();
          return row;
        },
      });
      const approval = approvalEnvelope(
        await mintLinkForResult({ ctx, entityType: 'block_template', summary: `Template "${args.name}"`, result }),
      );
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending', approval });
      revalidateForWrite('portal');
      return json({ ...result.data, approval });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_update',
    {
      title: 'Update block template (draft)',
      description: 'Stage changes to a block template into its draft jsonb overlay. The live columns and version are untouched — the picker and global-sync paths keep using the published copy until `block_templates_publish` is called.',
      inputSchema: {
        id: z.number().int().positive(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        category: z.string().optional(),
        scope: z.enum(['block', 'section', 'global']).optional(),
        blocks: z.array(z.any()).min(1).optional(),
        thumbnail: z.string().url().nullable().optional(),
        tags: z.array(z.string()).optional(),
        lockedFields: z.array(z.string()).optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) return json({ error: 'Template not found' });
      if (rest.blocks !== undefined) {
        try {
          await assertBlocksAllowedForUserId(rest.blocks, ctx.userId);
        } catch (e) {
          if (e instanceof BlockGateError) return json({ error: e.message });
          throw e;
        }
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'block_template',
        operation: 'update',
        entityId: id,
        summary: `Update block template "${existing.name}" (draft)`,
        payload: { id, ...rest },
        originalSnapshot: {
          name: existing.name,
          description: existing.description,
          category: existing.category,
          scope: existing.scope,
          version: existing.version,
          draft: existing.draft,
        },
        apply: async () => {
          const prev: import('@/lib/db/schema').BlockTemplateDraft = existing.draft ?? {};
          const next: import('@/lib/db/schema').BlockTemplateDraft = {
            ...prev,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          for (const [k, v] of Object.entries(rest)) {
            if (v !== undefined) (next as Record<string, unknown>)[k] = v;
          }
          const [row] = await db.update(blockTemplates)
            .set({ draft: next, updatedAt: new Date() })
            .where(eq(blockTemplates.id, id)).returning();
          return row;
        },
      });
      const approval = approvalEnvelope(
        await mintLinkForResult({
          ctx,
          entityType: 'block_template',
          summary: `Template "${existing.name}" update`,
          result,
        }),
      );
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending', approval });
      revalidateForWrite('portal');
      return json({ ...result.data, approval });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_delete',
    {
      title: 'Delete block template (draft)',
      description: 'Stages a tombstone on the template (draft.pendingDelete). The row is not actually deleted, and embedded usages keep resolving, until `block_templates_publish` runs. Refuses to stage a delete if any posts still embed it as a global template — remove or convert those usages first.',
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) return json({ error: 'Template not found' });
      const usages = await db.select({ id: blockTemplateUsages.id }).from(blockTemplateUsages)
        .where(eq(blockTemplateUsages.templateId, id));
      if (usages.length > 0) {
        return json({ error: `Cannot delete: template is used in ${usages.length} post(s). Remove usages first or convert to non-global.` });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'block_template',
        operation: 'delete',
        entityId: id,
        summary: `Delete block template "${existing.name}" (draft tombstone)`,
        payload: { id },
        originalSnapshot: { name: existing.name, slug: existing.slug, draft: existing.draft },
        apply: async () => {
          const prev: import('@/lib/db/schema').BlockTemplateDraft = existing.draft ?? {};
          const next: import('@/lib/db/schema').BlockTemplateDraft = {
            ...prev,
            pendingDelete: true,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          await db.update(blockTemplates)
            .set({ draft: next, updatedAt: new Date() })
            .where(eq(blockTemplates.id, id));
          return { success: true, id, pendingDelete: true };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_publish',
    {
      title: 'Publish block template draft',
      description: 'Promote a single block template draft to live. If draft.pendingDelete: the row is removed. If draft.pendingCreate: the draft flag is cleared (template becomes visible in the picker). Otherwise: draft fields are applied onto the live columns (bumping `version` when `blocks` changed) and draft is cleared. Subject to the same approval gate as other CMS writes.',
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) return json({ error: 'Template not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'block_template',
        operation: 'publish',
        entityId: id,
        summary: `Publish block template "${existing.name}"`,
        payload: { id },
        originalSnapshot: {
          name: existing.name,
          version: existing.version,
          draft: existing.draft,
        },
        apply: async () => {
          const draft: import('@/lib/db/schema').BlockTemplateDraft | null = existing.draft;
          if (!draft) return { success: true, id, noop: true };
          if (draft.pendingDelete) {
            await db.delete(blockTemplates).where(eq(blockTemplates.id, id));
            return { success: true, id, deleted: true };
          }
          const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
          if (draft.name !== undefined) patch.name = draft.name;
          if (draft.description !== undefined) patch.description = draft.description;
          if (draft.category !== undefined) patch.category = draft.category;
          if (draft.scope !== undefined) patch.scope = draft.scope;
          if (draft.thumbnail !== undefined) patch.thumbnail = draft.thumbnail;
          if (draft.tags !== undefined) patch.tags = draft.tags;
          if (draft.lockedFields !== undefined) patch.lockedFields = draft.lockedFields;
          if (draft.blocks !== undefined) {
            patch.blocks = draft.blocks;
            // Bump version on block-tree changes — global usages key off this
            // to detect drift between the embedded copy and the source.
            patch.version = existing.version + 1;
          }
          const [row] = await db.update(blockTemplates).set(patch)
            .where(eq(blockTemplates.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // ── block_templates_fork ───────────────────────────────────────────
  // Lightweight clone — duplicates the source template into a new row tied
  // back via `parent_template_id`. The new row starts as a fresh draft
  // (pendingCreate=true on the draft overlay) so it's hidden from the
  // picker until the approval-link reviewer approves it.
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_fork',
    {
      title: 'Fork a block template into a new draft',
      description:
        'Duplicate a published block template into a new draft template tied to the original via parent_template_id. Use when you need to riff on a template without touching the original (e.g. building a variant of a hero block for a specific landing page). Returns the new template id + an approval URL.',
      inputSchema: {
        id: z.number().int().positive().describe('Source template id to fork.'),
        nameSuffix: z.string().default(' (fork)').optional(),
        slugSuffix: z.string().default('').optional().describe('Optional suffix appended before the unique fork tag in the new slug.'),
      },
    },
    async ({ id, nameSuffix = ' (fork)', slugSuffix = '' }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [source] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!source) return json({ error: 'Source template not found' });
      const forkSlug = `${source.slug}${slugSuffix ? `-${slugSuffix}` : ''}-fork-${Date.now().toString(36)}`;
      const draft: import('@/lib/db/schema').BlockTemplateDraft = {
        pendingCreate: true,
        name: `${source.name}${nameSuffix}`,
        description: source.description ?? null,
        category: source.category,
        scope: source.scope,
        blocks: source.blocks,
        thumbnail: source.thumbnail ?? null,
        tags: (source.tags as string[] | null) ?? [],
        lockedFields: (source.lockedFields as string[] | null) ?? [],
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.userId,
      };
      const [forkRow] = await db.insert(blockTemplates).values({
        name: `${source.name}${nameSuffix}`,
        slug: forkSlug,
        description: source.description,
        category: source.category,
        scope: source.scope,
        blocks: source.blocks as never,
        thumbnail: source.thumbnail,
        tags: source.tags ?? [],
        lockedFields: source.lockedFields ?? [],
        createdBy: ctx.userId,
        parentTemplateId: source.id,
        draft,
      }).returning();
      const link = await createApprovalLink({
        ctx,
        entityType: 'block_template',
        entityId: forkRow.id,
        summary: `Fork of template "${source.name}"`,
      });
      revalidateForWrite('portal');
      return json({ ...forkRow, approval: approvalEnvelope(link) });
    }
  );


  // ── WEBSITE DOMAINS / ENV VARS ─────────────────────────────────────────
  async function requireClientSite(websiteId: number) {
    const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    return site ?? null;
  }

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'website_domains_list',
    {
      title: 'List website custom domains',
      description: 'List custom domains attached to a website.',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const rows = await db.select().from(websiteDomains)
        .where(eq(websiteDomains.websiteId, websiteId));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_domains_add',
    {
      title: 'Attach domain to website',
      description:
        'Add a custom domain to a website (starts pending until DNS verification). This does NOT provision DNS records — user must configure them externally.',
      inputSchema: {
        websiteId: z.number(),
        domain: z.string().min(3),
        isPrimary: z.boolean().optional(),
      },
    },
    async ({ websiteId, domain, isPrimary }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      if (isPrimary) {
        await db.update(websiteDomains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(websiteDomains.websiteId, websiteId), eq(websiteDomains.isPrimary, true)));
      }
      const [row] = await db.insert(websiteDomains).values({
        websiteId,
        domain: domain.trim().toLowerCase(),
        isPrimary: isPrimary ?? false,
      }).returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_domains_remove',
    {
      title: 'Detach domain from website',
      description: 'Remove a custom domain attachment. Does not affect external DNS.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [domain] = await db
        .select({ id: websiteDomains.id, websiteId: websiteDomains.websiteId })
        .from(websiteDomains)
        .innerJoin(clientWebsites, eq(clientWebsites.id, websiteDomains.websiteId))
        .where(and(eq(websiteDomains.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!domain) return json({ error: 'Domain not found' });
      await db.delete(websiteDomains).where(eq(websiteDomains.id, id));
      revalidateForWrite('sites');
      return json({ success: true, id });
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'website_env_vars_list',
    {
      title: 'List website environment variables',
      description:
        'List env vars for a website environment (defaults to production). Values ARE included — treat output as secrets.',
      inputSchema: {
        websiteId: z.number(),
        environment: z.string().optional().default('production'),
      },
    },
    async ({ websiteId, environment = 'production' }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const [env] = await db.select({ id: websiteEnvironments.id }).from(websiteEnvironments)
        .where(and(eq(websiteEnvironments.websiteId, websiteId), eq(websiteEnvironments.name, environment))).limit(1);
      if (!env) return json({ error: `Environment "${environment}" not found` });
      const rows = await db.select().from(websiteEnvVars)
        .where(eq(websiteEnvVars.environmentId, env.id))
        .orderBy(websiteEnvVars.key);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_env_vars_set',
    {
      title: 'Set website environment variable',
      description:
        'Upsert an env var on a website environment (production/staging). Marks syncedToVercel=false — actual Vercel sync happens via portal UI.',
      inputSchema: {
        websiteId: z.number(),
        environment: z.string().optional().default('production'),
        key: z.string().min(1),
        value: z.string(),
      },
    },
    async ({ websiteId, environment = 'production', key, value }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const [env] = await db.select({ id: websiteEnvironments.id }).from(websiteEnvironments)
        .where(and(eq(websiteEnvironments.websiteId, websiteId), eq(websiteEnvironments.name, environment))).limit(1);
      if (!env) return json({ error: `Environment "${environment}" not found` });
      const [existing] = await db.select({ id: websiteEnvVars.id }).from(websiteEnvVars)
        .where(and(eq(websiteEnvVars.environmentId, env.id), eq(websiteEnvVars.key, key))).limit(1);
      if (existing) {
        const [row] = await db.update(websiteEnvVars)
          .set({ value, syncedToVercel: false })
          .where(eq(websiteEnvVars.id, existing.id)).returning();
        return json(row);
      }
      const [row] = await db.insert(websiteEnvVars).values({
        environmentId: env.id,
        key,
        value,
        syncedToVercel: false,
      }).returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_env_vars_delete',
    {
      title: 'Delete website environment variable',
      description: 'Remove an env var by id.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [envVar] = await db
        .select({ id: websiteEnvVars.id, websiteId: websiteEnvironments.websiteId })
        .from(websiteEnvVars)
        .innerJoin(websiteEnvironments, eq(websiteEnvironments.id, websiteEnvVars.environmentId))
        .innerJoin(clientWebsites, eq(clientWebsites.id, websiteEnvironments.websiteId))
        .where(and(eq(websiteEnvVars.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!envVar) return json({ error: 'Env var not found' });
      await db.delete(websiteEnvVars).where(eq(websiteEnvVars.id, id));
      revalidateForWrite('sites');
      return json({ success: true, id });
    }
  );
}
