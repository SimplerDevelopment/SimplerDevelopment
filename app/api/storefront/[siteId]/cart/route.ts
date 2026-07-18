import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  storeSettings, carts, cartItems, products, productImages,
  productVariants, designs,
} from '@/lib/db/schema';
import { eq, and, asc, isNull, sql } from 'drizzle-orm';
import { extractToken, validateSession } from '@/lib/storefront/customer-auth';

async function verifyStore(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return store;
}

async function getActiveCart(websiteId: number, sessionId: string) {
  const [cart] = await db.select().from(carts)
    .where(and(
      eq(carts.websiteId, websiteId),
      eq(carts.sessionId, sessionId),
      eq(carts.status, 'active'),
    ))
    .limit(1);
  return cart;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ success: false, message: 'sessionId is required' }, { status: 400 });
    }

    const cart = await getActiveCart(websiteId, sessionId);
    if (!cart) {
      return NextResponse.json({ success: true, data: { items: [], subtotal: 0 } });
    }

    // Fetch cart items with product details + (optional) saved-design info.
    // Left-join on designs so storefront can render the design
    // thumbnail/name and an "Edit design" link without a second round-trip.
    const items = await db.select({
      id: cartItems.id,
      productId: cartItems.productId,
      variantId: cartItems.variantId,
      designId: cartItems.designId,
      quantity: cartItems.quantity,
      unitPrice: cartItems.unitPrice,
      productName: products.name,
      productSlug: products.slug,
      productStatus: products.status,
      designRowId: designs.id,
      designName: designs.name,
      designThumbnailUrl: designs.thumbnailUrl,
    })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .leftJoin(designs, eq(designs.id, cartItems.designId))
      .where(eq(cartItems.cartId, cart.id));

    // Fetch first image per product
    const productIds = [...new Set(items.map(i => i.productId))];
    const imagesMap: Record<number, string> = {};

    if (productIds.length > 0) {
      const images = await db.select({
        productId: productImages.productId,
        url: productImages.url,
      })
        .from(productImages)
        .where(sql`${productImages.productId} IN ${productIds}`)
        .orderBy(asc(productImages.order));

      for (const img of images) {
        if (!imagesMap[img.productId]) {
          imagesMap[img.productId] = img.url;
        }
      }
    }

    // Fetch variant names
    const variantIds = items.filter(i => i.variantId).map(i => i.variantId!);
    const variantsMap: Record<number, string> = {};

    if (variantIds.length > 0) {
      const variants = await db.select({
        id: productVariants.id,
        name: productVariants.name,
      })
        .from(productVariants)
        .where(sql`${productVariants.id} IN ${variantIds}`);

      for (const v of variants) {
        variantsMap[v.id] = v.name;
      }
    }

    const enrichedItems = items.map(item => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      designId: item.designId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * item.quantity,
      productName: item.productName,
      productSlug: item.productSlug,
      variantName: item.variantId ? (variantsMap[item.variantId] || null) : null,
      image: imagesMap[item.productId] || null,
      // `design` is null when (a) no designId on the row, or (b) the
      // referenced design has been soft-deleted (left-join misses on
      // `isNull(deletedAt)`).
      design: item.designRowId
        ? {
            id: item.designRowId,
            name: item.designName,
            thumbnailUrl: item.designThumbnailUrl,
          }
        : null,
    }));

    const subtotal = enrichedItems.reduce((sum, i) => sum + i.lineTotal, 0);

    return NextResponse.json({
      success: true,
      data: {
        cartId: cart.id,
        items: enrichedItems,
        subtotal,
        itemCount: enrichedItems.reduce((sum, i) => sum + i.quantity, 0),
      },
    });
  } catch (err) {
    console.error('Storefront cart GET error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const body = await req.json();
    const { sessionId, productId, variantId, quantity = 1, designId } = body as {
      sessionId?: string;
      productId?: number;
      variantId?: number | null;
      quantity?: number;
      designId?: string | null;
    };

    if (!sessionId || !productId) {
      return NextResponse.json({ success: false, message: 'sessionId and productId are required' }, { status: 400 });
    }

    // Validate optional designId — must belong to this site & product, and caller must own it
    if (designId !== undefined && designId !== null) {
      if (typeof designId !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(designId)) {
        return NextResponse.json({ success: false, message: 'Invalid designId' }, { status: 400 });
      }

      const [design] = await db.select().from(designs)
        .where(and(
          eq(designs.id, designId),
          eq(designs.websiteId, websiteId),
          eq(designs.productId, productId),
        ))
        .limit(1);

      if (!design) {
        return NextResponse.json({ success: false, message: 'Design not found' }, { status: 404 });
      }

      // Authorize: either logged-in customer matches OR sessionId matches
      let authorized = false;
      const token = extractToken(req);
      if (token) {
        const customerSession = await validateSession(token);
        if (customerSession && customerSession.websiteId === websiteId && design.customerId === customerSession.customerId) {
          authorized = true;
        }
      }
      if (!authorized && design.sessionId && design.sessionId === sessionId) {
        authorized = true;
      }
      if (!authorized) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    // Verify product is active and in this store
    const [product] = await db.select().from(products)
      .where(and(
        eq(products.id, productId),
        eq(products.websiteId, websiteId),
        eq(products.status, 'active'),
      ))
      .limit(1);

    if (!product) {
      return NextResponse.json({ success: false, message: 'Product not found' }, { status: 404 });
    }

    // Determine price and stock
    let unitPrice = product.price;
    let availableStock = product.trackInventory ? product.quantity : Infinity;

    if (variantId) {
      const [variant] = await db.select().from(productVariants)
        .where(and(
          eq(productVariants.id, variantId),
          eq(productVariants.productId, productId),
          eq(productVariants.active, true),
        ))
        .limit(1);

      if (!variant) {
        return NextResponse.json({ success: false, message: 'Variant not found' }, { status: 404 });
      }

      unitPrice = variant.price;
      availableStock = product.trackInventory ? variant.quantity : Infinity;
    }

    if (product.trackInventory && quantity > availableStock) {
      return NextResponse.json({
        success: false,
        message: `Only ${availableStock} available in stock`,
      }, { status: 400 });
    }

    // Get or create cart
    let cart = await getActiveCart(websiteId, sessionId);

    if (!cart) {
      const [newCart] = await db.insert(carts).values({
        websiteId,
        sessionId,
        status: 'active',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }).returning();
      cart = newCart;
    }

    // Check if item already exists in cart. Each unique (product, variant,
    // design) tuple is its own line — designed items are always treated as a new line
    // (different design = different fulfillment), so skip the merge when designId is present.
    const existingConditions = [
      eq(cartItems.cartId, cart.id),
      eq(cartItems.productId, productId),
    ];
    if (variantId) {
      existingConditions.push(eq(cartItems.variantId, variantId));
    } else {
      existingConditions.push(isNull(cartItems.variantId));
    }
    if (designId != null) {
      existingConditions.push(eq(cartItems.designId, designId));
    } else {
      existingConditions.push(isNull(cartItems.designId));
    }

    const existing = !designId ? (await db.select().from(cartItems)
      .where(and(...existingConditions))
      .limit(1))[0] : undefined;

    if (existing) {
      const newQty = existing.quantity + quantity;
      if (product.trackInventory && newQty > availableStock) {
        return NextResponse.json({
          success: false,
          message: `Only ${availableStock} available in stock`,
        }, { status: 400 });
      }

      const [updated] = await db.update(cartItems)
        .set({ quantity: newQty, unitPrice, updatedAt: new Date() })
        .where(eq(cartItems.id, existing.id))
        .returning();

      return NextResponse.json({ success: true, data: updated });
    }

    const [item] = await db.insert(cartItems).values({
      cartId: cart.id,
      productId,
      variantId: variantId || null,
      designId: designId || null,
      quantity,
      unitPrice,
    }).returning();

    return NextResponse.json({ success: true, data: item });
  } catch (err) {
    console.error('Storefront cart POST error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const body = await req.json();
    const { cartItemId, quantity } = body;

    if (!cartItemId || quantity === undefined) {
      return NextResponse.json({ success: false, message: 'cartItemId and quantity are required' }, { status: 400 });
    }

    // Verify the cart item belongs to this store
    const [item] = await db.select({
      id: cartItems.id,
      cartId: cartItems.cartId,
      productId: cartItems.productId,
      variantId: cartItems.variantId,
      cartWebsiteId: carts.websiteId,
    })
      .from(cartItems)
      .innerJoin(carts, eq(carts.id, cartItems.cartId))
      .where(and(
        eq(cartItems.id, cartItemId),
        eq(carts.websiteId, websiteId),
        eq(carts.status, 'active'),
      ))
      .limit(1);

    if (!item) {
      return NextResponse.json({ success: false, message: 'Cart item not found' }, { status: 404 });
    }

    // Remove if quantity is 0
    if (quantity <= 0) {
      await db.delete(cartItems).where(eq(cartItems.id, cartItemId));
      return NextResponse.json({ success: true, data: { removed: true } });
    }

    // Validate stock
    const [product] = await db.select().from(products)
      .where(eq(products.id, item.productId)).limit(1);

    if (product?.trackInventory) {
      let stock = product.quantity;
      if (item.variantId) {
        const [variant] = await db.select().from(productVariants)
          .where(eq(productVariants.id, item.variantId)).limit(1);
        if (variant) stock = variant.quantity;
      }
      if (quantity > stock) {
        return NextResponse.json({
          success: false,
          message: `Only ${stock} available in stock`,
        }, { status: 400 });
      }
    }

    const [updated] = await db.update(cartItems)
      .set({ quantity, updatedAt: new Date() })
      .where(eq(cartItems.id, cartItemId))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('Storefront cart PUT error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ success: false, message: 'sessionId is required' }, { status: 400 });
    }

    const cart = await getActiveCart(websiteId, sessionId);
    if (!cart) {
      return NextResponse.json({ success: true, data: { cleared: true } });
    }

    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));

    return NextResponse.json({ success: true, data: { cleared: true } });
  } catch (err) {
    console.error('Storefront cart DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
