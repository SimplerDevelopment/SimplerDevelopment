import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { services } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const serviceId = parseInt(id, 10);
  const body = await req.json();

  const [current] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!current) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const updates: Record<string, unknown> = { ...body };

  if (stripeKey && current.stripeProductId) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey);

      // Update product name/description if changed
      if (body.name !== undefined || body.description !== undefined) {
        await stripe.products.update(current.stripeProductId, {
          name: body.name ?? current.name,
          description: body.description ?? current.description ?? undefined,
        });
      }

      // If price changed, archive old price and create new one
      if (body.price !== undefined && body.price !== current.price) {
        if (current.stripePriceId) {
          await stripe.prices.update(current.stripePriceId, { active: false });
        }
        const cycle = body.billingCycle ?? current.billingCycle;
        const priceParams: Record<string, unknown> = {
          product: current.stripeProductId,
          unit_amount: body.price,
          currency: 'usd',
        };
        if (cycle === 'monthly') priceParams.recurring = { interval: 'month' };
        else if (cycle === 'annually') priceParams.recurring = { interval: 'year' };

        const newPrice = await stripe.prices.create(priceParams as unknown as Parameters<typeof stripe.prices.create>[0]);
        updates.stripePriceId = newPrice.id;
      }
    } catch (err) {
      console.error('Stripe update failed:', err);
    }
  }

  const [svc] = await db.update(services)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(services.id, serviceId))
    .returning();

  return NextResponse.json({ success: true, data: svc });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const serviceId = parseInt(id, 10);

  const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!svc) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && svc.stripeProductId) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey);
      await stripe.products.update(svc.stripeProductId, { active: false });
    } catch (err) {
      console.error('Stripe archive failed:', err);
    }
  }

  await db.delete(services).where(eq(services.id, serviceId));
  return NextResponse.json({ success: true });
}
