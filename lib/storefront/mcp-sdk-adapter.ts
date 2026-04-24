/**
 * Commerce / Store MCP tools.
 *
 * Exposed to portal MCP clients so AI agents can manage products, orders,
 * customers, discounts, and reviews on a client website's storefront.
 *
 * All tools verify that the targeted website belongs to the authenticated
 * client — storefronts are website-scoped, not client-scoped.
 *
 * Scopes:
 *   `store:read`  — product/order/customer reads
 *   `store:write` — product CRUD, order status, discount CRUD, review moderation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  clientWebsites,
  products,
  productCategories,
  productImages,
  productOptions,
  productOptionValues,
  productVariants,
  orders,
  orderItems,
  orderStatusHistory,
  discountCodes,
  storeCustomers,
  storeCustomerMessages,
  storeCustomerMessageReplies,
  storeProductReviews,
} from '@/lib/db/schema';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function denied(scope: string) {
  return {
    content: [{ type: 'text' as const, text: `Permission denied: this API key lacks the "${scope}" scope.` }],
    isError: true,
  };
}

function revalidatePortal() {
  try { revalidatePath('/portal', 'layout'); } catch { /* ignore */ }
}

export function registerStoreToolsOnSdk(server: McpServer, ctx: PortalMcpContext) {
  const clientId = ctx.client.id;

  // Helper: assert a website belongs to this client and return its id.
  async function requireSite(websiteId: number): Promise<number | null> {
    const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    return site?.id ?? null;
  }

  // ── PRODUCTS ───────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_products_list',
    {
      title: 'List store products',
      description: 'List products for a client website. Filter by status, category, search term, or featured flag.',
      inputSchema: {
        websiteId: z.number(),
        status: z.enum(['draft', 'active', 'archived']).optional(),
        categoryId: z.number().optional(),
        featured: z.boolean().optional(),
        search: z.string().optional().describe('Case-insensitive match on name or SKU.'),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ websiteId, status, categoryId, featured, search, limit = 100 }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const conds = [eq(products.websiteId, websiteId)];
      if (status) conds.push(eq(products.status, status));
      if (categoryId) conds.push(eq(products.categoryId, categoryId));
      if (featured !== undefined) conds.push(eq(products.featured, featured));
      if (search) {
        const q = `%${search}%`;
        const fuzzy = or(ilike(products.name, q), ilike(products.sku, q));
        if (fuzzy) conds.push(fuzzy);
      }
      const rows = await db.select().from(products)
        .where(and(...conds))
        .orderBy(desc(products.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_products_get',
    {
      title: 'Get store product with images + variants',
      description: 'Fetch a product including images and variants.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!product) return json({ error: 'Product not found' });
      if (!(await requireSite(product.websiteId))) return json({ error: 'Permission denied' });
      const [images, variants] = await Promise.all([
        db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(productImages.order),
        db.select().from(productVariants).where(eq(productVariants.productId, id)),
      ]);
      return json({ product, images, variants });
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_products_create',
    {
      title: 'Create store product',
      description: 'Create a new product. Price is in cents. Starts in `draft` status — use store_products_update to activate.',
      inputSchema: {
        websiteId: z.number(),
        name: z.string().min(1),
        slug: z.string().optional().describe('Derived from name if omitted.'),
        description: z.string().optional(),
        shortDescription: z.string().optional(),
        price: z.number().int().min(0).describe('Price in cents.'),
        compareAtPrice: z.number().int().min(0).optional(),
        sku: z.string().optional(),
        categoryId: z.number().optional(),
        trackInventory: z.boolean().optional(),
        quantity: z.number().int().min(0).optional(),
        weight: z.number().optional(),
        weightUnit: z.enum(['g', 'kg', 'oz', 'lb']).optional(),
        tags: z.array(z.string()).optional(),
        featured: z.boolean().optional(),
        status: z.enum(['draft', 'active', 'archived']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      if (!(await requireSite(args.websiteId))) return json({ error: 'Site not found' });
      const finalSlug = (args.slug ?? args.name)
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      try {
        const [row] = await db.insert(products).values({
          websiteId: args.websiteId,
          categoryId: args.categoryId ?? null,
          name: args.name.trim(),
          slug: finalSlug,
          description: args.description ?? null,
          shortDescription: args.shortDescription ?? null,
          price: args.price,
          compareAtPrice: args.compareAtPrice ?? null,
          sku: args.sku ?? null,
          trackInventory: args.trackInventory ?? true,
          quantity: args.quantity ?? 0,
          weight: args.weight !== undefined ? String(args.weight) : null,
          weightUnit: args.weightUnit ?? 'g',
          tags: args.tags ?? [],
          featured: args.featured ?? false,
          status: args.status ?? 'draft',
        }).returning();
        revalidatePortal();
        return json(row);
      } catch (err) {
        return json({ error: `Could not create (likely duplicate slug): ${(err as Error).message}` });
      }
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_products_update',
    {
      title: 'Update store product',
      description: 'Update any mutable field on a product. For images/variants use their dedicated tools.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        slug: z.string().optional(),
        description: z.string().nullable().optional(),
        shortDescription: z.string().nullable().optional(),
        price: z.number().int().min(0).optional(),
        compareAtPrice: z.number().int().min(0).nullable().optional(),
        sku: z.string().nullable().optional(),
        categoryId: z.number().nullable().optional(),
        trackInventory: z.boolean().optional(),
        quantity: z.number().int().min(0).optional(),
        tags: z.array(z.string()).optional(),
        featured: z.boolean().optional(),
        status: z.enum(['draft', 'active', 'archived']).optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [existing] = await db.select({ websiteId: products.websiteId })
        .from(products).where(eq(products.id, id)).limit(1);
      if (!existing) return json({ error: 'Product not found' });
      if (!(await requireSite(existing.websiteId))) return json({ error: 'Permission denied' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(products).set(patch)
        .where(eq(products.id, id)).returning();
      revalidatePortal();
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_products_delete',
    {
      title: 'Delete store product',
      description: 'Permanently delete a product. Images and variants cascade. Order items retain historical data via `productName`/`variantName`.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [existing] = await db.select({ websiteId: products.websiteId })
        .from(products).where(eq(products.id, id)).limit(1);
      if (!existing) return json({ error: 'Product not found' });
      if (!(await requireSite(existing.websiteId))) return json({ error: 'Permission denied' });
      await db.delete(products).where(eq(products.id, id));
      revalidatePortal();
      return json({ success: true, id });
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_products_adjust_inventory',
    {
      title: 'Adjust product inventory',
      description:
        'Adjust product quantity by a positive or negative delta (e.g. -3 to decrement, +10 to restock). Use store_products_update to SET an absolute quantity.',
      inputSchema: {
        id: z.number(),
        delta: z.number().int(),
      },
    },
    async ({ id, delta }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [existing] = await db.select({ websiteId: products.websiteId, quantity: products.quantity })
        .from(products).where(eq(products.id, id)).limit(1);
      if (!existing) return json({ error: 'Product not found' });
      if (!(await requireSite(existing.websiteId))) return json({ error: 'Permission denied' });
      const next = existing.quantity + delta;
      if (next < 0) return json({ error: `Would result in negative quantity (${next})` });
      const [row] = await db.update(products)
        .set({ quantity: next, updatedAt: new Date() })
        .where(eq(products.id, id)).returning();
      revalidatePortal();
      return json(row);
    }
  );

  // ── PRODUCT VARIANTS ───────────────────────────────────────────────────
  // Helper: verify a product id belongs to a client-owned website.
  async function requireProductSite(productId: number): Promise<boolean> {
    const [row] = await db.select({ websiteId: products.websiteId }).from(products)
      .where(eq(products.id, productId)).limit(1);
    if (!row) return false;
    return !!(await requireSite(row.websiteId));
  }

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_product_options_create',
    {
      title: 'Create product option',
      description:
        'Add a product option (e.g. "Size", "Color"). Options are the axes that variants vary along. Returns the option — use store_product_option_values_create to add its values.',
      inputSchema: {
        productId: z.number(),
        name: z.string().min(1),
        order: z.number().optional(),
      },
    },
    async ({ productId, name, order }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      if (!(await requireProductSite(productId))) return json({ error: 'Product not found or not yours' });
      const existing = await db.select({ id: productOptions.id }).from(productOptions)
        .where(eq(productOptions.productId, productId));
      const [row] = await db.insert(productOptions).values({
        productId,
        name: name.trim(),
        order: order ?? existing.length,
      }).returning();
      revalidatePortal();
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_product_option_values_create',
    {
      title: 'Add product option value',
      description: 'Add a value (e.g. "Red", "Large") to an existing product option.',
      inputSchema: {
        optionId: z.number(),
        value: z.string().min(1),
        label: z.string().optional(),
        order: z.number().optional(),
      },
    },
    async ({ optionId, value, label, order }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [option] = await db
        .select({ productId: productOptions.productId })
        .from(productOptions)
        .where(eq(productOptions.id, optionId)).limit(1);
      if (!option) return json({ error: 'Option not found' });
      if (!(await requireProductSite(option.productId))) return json({ error: 'Permission denied' });
      const existing = await db.select({ id: productOptionValues.id }).from(productOptionValues)
        .where(eq(productOptionValues.optionId, optionId));
      const [row] = await db.insert(productOptionValues).values({
        optionId,
        value: value.trim(),
        label: label ?? null,
        order: order ?? existing.length,
      }).returning();
      revalidatePortal();
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_product_variants_create',
    {
      title: 'Create product variant',
      description:
        'Create a variant of a product. `optionValues` is an array of { optionId, valueId } tying this variant to specific option values (e.g. Size=Large, Color=Red). Price in cents.',
      inputSchema: {
        productId: z.number(),
        name: z.string().min(1),
        sku: z.string().optional(),
        price: z.number().int().min(0),
        compareAtPrice: z.number().int().min(0).optional(),
        quantity: z.number().int().min(0).optional(),
        optionValues: z.array(z.object({
          optionId: z.number(),
          valueId: z.number(),
        })).optional(),
        image: z.string().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      if (!(await requireProductSite(args.productId))) return json({ error: 'Product not found or not yours' });
      const [row] = await db.insert(productVariants).values({
        productId: args.productId,
        name: args.name.trim(),
        sku: args.sku ?? null,
        price: args.price,
        compareAtPrice: args.compareAtPrice ?? null,
        quantity: args.quantity ?? 0,
        optionValues: args.optionValues ?? [],
        image: args.image ?? null,
      }).returning();
      revalidatePortal();
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_product_variants_update',
    {
      title: 'Update product variant',
      description: 'Update any mutable field on a variant.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        sku: z.string().nullable().optional(),
        price: z.number().int().min(0).optional(),
        compareAtPrice: z.number().int().min(0).nullable().optional(),
        quantity: z.number().int().min(0).optional(),
        active: z.boolean().optional(),
        image: z.string().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [variant] = await db
        .select({ productId: productVariants.productId })
        .from(productVariants)
        .where(eq(productVariants.id, id)).limit(1);
      if (!variant) return json({ error: 'Variant not found' });
      if (!(await requireProductSite(variant.productId))) return json({ error: 'Permission denied' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(productVariants).set(patch)
        .where(eq(productVariants.id, id)).returning();
      revalidatePortal();
      return json(row);
    }
  );

  // ── PRODUCT CATEGORIES ─────────────────────────────────────────────────
  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_categories_list',
    {
      title: 'List product categories',
      description: 'List product categories for a website.',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const rows = await db.select().from(productCategories)
        .where(eq(productCategories.websiteId, websiteId))
        .orderBy(productCategories.order);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_categories_create',
    {
      title: 'Create product category',
      description: 'Create a product category. Supports parent/child hierarchy via `parentId`.',
      inputSchema: {
        websiteId: z.number(),
        name: z.string().min(1),
        slug: z.string().optional(),
        description: z.string().optional(),
        parentId: z.number().optional(),
        image: z.string().optional(),
      },
    },
    async ({ websiteId, name, slug, description, parentId, image }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const finalSlug = (slug ?? name)
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      try {
        const [row] = await db.insert(productCategories).values({
          websiteId,
          name: name.trim(),
          slug: finalSlug,
          description: description ?? null,
          parentId: parentId ?? null,
          image: image ?? null,
        }).returning();
        revalidatePortal();
        return json(row);
      } catch (err) {
        return json({ error: `Could not create category: ${(err as Error).message}` });
      }
    }
  );

  // ── ORDERS ─────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_orders_list',
    {
      title: 'List store orders',
      description: 'List orders for a website. Filter by status, payment status, customer email, or date range.',
      inputSchema: {
        websiteId: z.number(),
        status: z.string().optional().describe('pending, processing, shipped, delivered, cancelled, refunded.'),
        paymentStatus: z.string().optional().describe('pending, paid, failed, refunded.'),
        customerEmail: z.string().optional(),
        since: z.string().optional().describe('ISO datetime — only orders created after.'),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ websiteId, status, paymentStatus, customerEmail, since, limit = 100 }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const conds = [eq(orders.websiteId, websiteId)];
      if (status) conds.push(eq(orders.status, status));
      if (paymentStatus) conds.push(eq(orders.paymentStatus, paymentStatus));
      if (customerEmail) conds.push(eq(orders.customerEmail, customerEmail.toLowerCase()));
      if (since) conds.push(gte(orders.createdAt, new Date(since)));
      const rows = await db.select().from(orders)
        .where(and(...conds))
        .orderBy(desc(orders.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_orders_get',
    {
      title: 'Get order with items + status history',
      description: 'Fetch order detail: the order row, line items, and full status history.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!order) return json({ error: 'Order not found' });
      if (!(await requireSite(order.websiteId))) return json({ error: 'Permission denied' });
      const [items, history] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, id)),
        db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(orderStatusHistory.createdAt),
      ]);
      return json({ order, items, history });
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_orders_update_status',
    {
      title: 'Update order status',
      description:
        'Transition an order through fulfillment states and record a status-history row. Stamps shippedAt/deliveredAt automatically. Does NOT send customer notifications — handle those in the UI.',
      inputSchema: {
        id: z.number(),
        status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
        note: z.string().optional(),
        trackingNumber: z.string().optional(),
        trackingUrl: z.string().optional(),
        shippingMethod: z.string().optional(),
      },
    },
    async ({ id, status, note, trackingNumber, trackingUrl, shippingMethod }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!order) return json({ error: 'Order not found' });
      if (!(await requireSite(order.websiteId))) return json({ error: 'Permission denied' });
      const patch: Record<string, unknown> = { status, updatedAt: new Date() };
      if (status === 'shipped' && !order.shippedAt) patch.shippedAt = new Date();
      if (status === 'delivered' && !order.deliveredAt) patch.deliveredAt = new Date();
      if (trackingNumber !== undefined) patch.trackingNumber = trackingNumber;
      if (trackingUrl !== undefined) patch.trackingUrl = trackingUrl;
      if (shippingMethod !== undefined) patch.shippingMethod = shippingMethod;
      const [row] = await db.update(orders).set(patch).where(eq(orders.id, id)).returning();
      await db.insert(orderStatusHistory).values({
        orderId: id,
        status,
        note: note ?? null,
        changedBy: ctx.userId,
      });
      revalidatePortal();
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_orders_add_note',
    {
      title: 'Add internal note to order',
      description: 'Append (or overwrite) the internal staff-only note on an order. Does not touch customer-facing fields.',
      inputSchema: {
        id: z.number(),
        note: z.string(),
        mode: z.enum(['append', 'replace']).optional().default('append'),
      },
    },
    async ({ id, note, mode = 'append' }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [order] = await db.select({ websiteId: orders.websiteId, internalNote: orders.internalNote })
        .from(orders).where(eq(orders.id, id)).limit(1);
      if (!order) return json({ error: 'Order not found' });
      if (!(await requireSite(order.websiteId))) return json({ error: 'Permission denied' });
      const nextNote = mode === 'replace' || !order.internalNote
        ? note
        : `${order.internalNote}\n${new Date().toISOString()}: ${note}`;
      const [row] = await db.update(orders)
        .set({ internalNote: nextNote, updatedAt: new Date() })
        .where(eq(orders.id, id)).returning();
      return json(row);
    }
  );

  // ── CUSTOMERS ──────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_customers_list',
    {
      title: 'List store customers',
      description: 'List customers of a website\'s storefront. Filter by status or search by email/name.',
      inputSchema: {
        websiteId: z.number(),
        status: z.enum(['active', 'disabled']).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ websiteId, status, search, limit = 100 }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const conds = [eq(storeCustomers.websiteId, websiteId)];
      if (status) conds.push(eq(storeCustomers.status, status));
      if (search) {
        const q = `%${search}%`;
        const fuzzy = or(
          ilike(storeCustomers.email, q),
          ilike(storeCustomers.firstName, q),
          ilike(storeCustomers.lastName, q),
        );
        if (fuzzy) conds.push(fuzzy);
      }
      const rows = await db.select({
        id: storeCustomers.id,
        email: storeCustomers.email,
        firstName: storeCustomers.firstName,
        lastName: storeCustomers.lastName,
        phone: storeCustomers.phone,
        status: storeCustomers.status,
        orderCount: storeCustomers.orderCount,
        totalSpent: storeCustomers.totalSpent,
        createdAt: storeCustomers.createdAt,
      }).from(storeCustomers).where(and(...conds))
        .orderBy(desc(storeCustomers.totalSpent)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_customers_get',
    {
      title: 'Get store customer with order count',
      description: 'Fetch a store customer (PII-redacted — no password hash). Returns recent orders for this customer.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      const [customer] = await db.select({
        id: storeCustomers.id,
        websiteId: storeCustomers.websiteId,
        email: storeCustomers.email,
        firstName: storeCustomers.firstName,
        lastName: storeCustomers.lastName,
        phone: storeCustomers.phone,
        avatarUrl: storeCustomers.avatarUrl,
        defaultShippingAddress: storeCustomers.defaultShippingAddress,
        defaultBillingAddress: storeCustomers.defaultBillingAddress,
        addressBook: storeCustomers.addressBook,
        emailVerified: storeCustomers.emailVerified,
        lastLoginAt: storeCustomers.lastLoginAt,
        status: storeCustomers.status,
        orderCount: storeCustomers.orderCount,
        totalSpent: storeCustomers.totalSpent,
        notes: storeCustomers.notes,
        createdAt: storeCustomers.createdAt,
      }).from(storeCustomers).where(eq(storeCustomers.id, id)).limit(1);
      if (!customer) return json({ error: 'Customer not found' });
      if (!(await requireSite(customer.websiteId))) return json({ error: 'Permission denied' });
      const recentOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
      }).from(orders)
        .where(and(eq(orders.websiteId, customer.websiteId), eq(orders.customerEmail, customer.email)))
        .orderBy(desc(orders.createdAt)).limit(10);
      return json({ customer, recentOrders });
    }
  );

  // ── DISCOUNTS ──────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_discounts_list',
    {
      title: 'List discount codes',
      description: 'List discount codes for a website. Filter by active flag.',
      inputSchema: {
        websiteId: z.number(),
        activeOnly: z.boolean().optional().default(false),
      },
    },
    async ({ websiteId, activeOnly = false }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const conds = [eq(discountCodes.websiteId, websiteId)];
      if (activeOnly) conds.push(eq(discountCodes.active, true));
      const rows = await db.select().from(discountCodes)
        .where(and(...conds))
        .orderBy(desc(discountCodes.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_discounts_create',
    {
      title: 'Create discount code',
      description:
        'Create a discount code. Types: `percent` (amount in basis points, 1000 = 10%), `fixed_amount` (amount in cents), `free_shipping`.',
      inputSchema: {
        websiteId: z.number(),
        code: z.string().min(1),
        discountType: z.enum(['percent', 'fixed_amount', 'free_shipping']),
        amount: z.number().int().min(0),
        description: z.string().optional(),
        minOrderAmount: z.number().int().min(0).optional(),
        maxUses: z.number().int().min(1).optional(),
        startsAt: z.string().optional(),
        expiresAt: z.string().optional(),
        applicableTo: z.enum(['store', 'booking', 'both']).optional().default('store'),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      if (!(await requireSite(args.websiteId))) return json({ error: 'Site not found' });
      try {
        const [row] = await db.insert(discountCodes).values({
          websiteId: args.websiteId,
          code: args.code.trim().toUpperCase(),
          description: args.description ?? null,
          discountType: args.discountType,
          amount: args.amount,
          minOrderAmount: args.minOrderAmount ?? null,
          maxUses: args.maxUses ?? null,
          startsAt: args.startsAt ? new Date(args.startsAt) : null,
          expiresAt: args.expiresAt ? new Date(args.expiresAt) : null,
          applicableTo: args.applicableTo ?? 'store',
        }).returning();
        revalidatePortal();
        return json(row);
      } catch (err) {
        return json({ error: `Could not create discount (likely duplicate code): ${(err as Error).message}` });
      }
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_discounts_toggle',
    {
      title: 'Enable / disable discount code',
      description: 'Flip the `active` flag on a discount code.',
      inputSchema: {
        id: z.number(),
        active: z.boolean(),
      },
    },
    async ({ id, active }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [existing] = await db.select({ websiteId: discountCodes.websiteId }).from(discountCodes)
        .where(eq(discountCodes.id, id)).limit(1);
      if (!existing) return json({ error: 'Discount not found' });
      if (!(await requireSite(existing.websiteId))) return json({ error: 'Permission denied' });
      const [row] = await db.update(discountCodes)
        .set({ active, updatedAt: new Date() })
        .where(eq(discountCodes.id, id)).returning();
      revalidatePortal();
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_discounts_delete',
    {
      title: 'Delete discount code',
      description: 'Permanently delete a discount code.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [existing] = await db.select({ websiteId: discountCodes.websiteId }).from(discountCodes)
        .where(eq(discountCodes.id, id)).limit(1);
      if (!existing) return json({ error: 'Discount not found' });
      if (!(await requireSite(existing.websiteId))) return json({ error: 'Permission denied' });
      await db.delete(discountCodes).where(eq(discountCodes.id, id));
      revalidatePortal();
      return json({ success: true, id });
    }
  );

  // ── REVIEWS ────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_reviews_list',
    {
      title: 'List product reviews',
      description: 'List product reviews across a website, filtered by approval status and/or product.',
      inputSchema: {
        websiteId: z.number(),
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
        productId: z.number().optional(),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ websiteId, status, productId, limit = 100 }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const conds = [eq(storeProductReviews.websiteId, websiteId)];
      if (status) conds.push(eq(storeProductReviews.status, status));
      if (productId) conds.push(eq(storeProductReviews.productId, productId));
      const rows = await db.select().from(storeProductReviews)
        .where(and(...conds))
        .orderBy(desc(storeProductReviews.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_reviews_moderate',
    {
      title: 'Moderate product review',
      description: 'Approve or reject a pending product review.',
      inputSchema: {
        id: z.number(),
        action: z.enum(['approve', 'reject']),
      },
    },
    async ({ id, action }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [review] = await db.select({ id: storeProductReviews.id, websiteId: storeProductReviews.websiteId })
        .from(storeProductReviews).where(eq(storeProductReviews.id, id)).limit(1);
      if (!review) return json({ error: 'Review not found' });
      if (!(await requireSite(review.websiteId))) return json({ error: 'Permission denied' });
      const [row] = await db.update(storeProductReviews)
        .set({ status: action === 'approve' ? 'approved' : 'rejected' })
        .where(eq(storeProductReviews.id, id)).returning();
      revalidatePortal();
      return json(row);
    }
  );

  // ── CUSTOMER MESSAGES ──────────────────────────────────────────────────
  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_customer_messages_list',
    {
      title: 'List customer-support messages',
      description: 'List customer support messages for a website, optionally filtered by status.',
      inputSchema: {
        websiteId: z.number(),
        status: z.string().optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ websiteId, status, limit = 50 }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const conds = [eq(storeCustomerMessages.websiteId, websiteId)];
      if (status) conds.push(eq(storeCustomerMessages.status, status));
      const rows = await db.select().from(storeCustomerMessages)
        .where(and(...conds))
        .orderBy(desc(storeCustomerMessages.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'store:write') && server.registerTool(
    'store_customer_messages_reply',
    {
      title: 'Reply to customer support message',
      description: 'Post a staff reply on a customer support thread. Does not email the customer.',
      inputSchema: {
        messageId: z.number(),
        body: z.string().min(1),
      },
    },
    async ({ messageId, body }) => {
      if (!hasScope(ctx.scopes, 'store:write')) return denied('store:write');
      const [msg] = await db.select({ id: storeCustomerMessages.id, websiteId: storeCustomerMessages.websiteId })
        .from(storeCustomerMessages).where(eq(storeCustomerMessages.id, messageId)).limit(1);
      if (!msg) return json({ error: 'Message not found' });
      if (!(await requireSite(msg.websiteId))) return json({ error: 'Permission denied' });
      const [reply] = await db.insert(storeCustomerMessageReplies).values({
        messageId,
        body,
        isStaff: true,
        authorName: ctx.client.company ?? 'Staff',
      }).returning();
      await db.update(storeCustomerMessages)
        .set({ status: 'replied', updatedAt: new Date() })
        .where(eq(storeCustomerMessages.id, messageId));
      revalidatePortal();
      return json(reply);
    }
  );

  // ── STORE SETTINGS ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'store:read') && server.registerTool(
    'store_settings_get',
    {
      title: 'Get store settings',
      description: 'Get storefront configuration for a website (currency, tax, shipping, payout schedule, enabled flag).',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!hasScope(ctx.scopes, 'store:read')) return denied('store:read');
      if (!(await requireSite(websiteId))) return json({ error: 'Site not found' });
      const rows = await db.execute(sql`SELECT * FROM store_settings WHERE website_id = ${websiteId} LIMIT 1`);
      return json(rows[0] ?? { error: 'Store not yet configured' });
    }
  );

  // Light usage of sql template: import it lazily only if needed elsewhere.
}
