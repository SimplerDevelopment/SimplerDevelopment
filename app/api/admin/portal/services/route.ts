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

export async function GET() {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const data = await db.select().from(services).orderBy(services.category, services.name);
  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.name || !body.category || body.price === undefined) {
    return NextResponse.json({ success: false, message: 'name, category, and price are required' }, { status: 400 });
  }

  const slug = body.slug ?? body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const [svc] = await db.insert(services).values({
    name: body.name,
    slug,
    description: body.description ?? null,
    category: body.category,
    price: body.price,
    billingCycle: body.billingCycle ?? 'once',
    stripePriceId: body.stripePriceId ?? null,
    active: body.active ?? true,
    features: body.features ?? [],
    surveyFields: body.surveyFields ?? [],
  }).returning();

  // Auto-sync to Stripe if key is set and no price ID was manually provided
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && !body.stripePriceId) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey);

      const product = await stripe.products.create({
        name: body.name,
        description: body.description ?? undefined,
        metadata: { serviceId: String(svc.id), source: 'simpler-development' },
      });

      const priceParams: Record<string, unknown> = {
        product: product.id,
        unit_amount: body.price,
        currency: 'usd',
        metadata: { serviceId: String(svc.id) },
      };
      if (body.billingCycle === 'monthly') priceParams.recurring = { interval: 'month' };
      else if (body.billingCycle === 'annually') priceParams.recurring = { interval: 'year' };

      const price = await stripe.prices.create(priceParams as Parameters<typeof stripe.prices.create>[0]);

      const [updated] = await db.update(services).set({
        stripeProductId: product.id,
        stripePriceId: price.id,
      }).where(eq(services.id, svc.id)).returning();

      return NextResponse.json({ success: true, data: updated });
    } catch (err) {
      console.error('Stripe sync failed:', err);
      // Service was created — return it even if Stripe sync failed
    }
  }

  return NextResponse.json({ success: true, data: svc });
}

// Quick toggle (active/inactive) — full edits go through /[id] route
export async function PATCH(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  const [svc] = await db.update(services).set({ ...updates, updatedAt: new Date() }).where(eq(services.id, id)).returning();
  return NextResponse.json({ success: true, data: svc });
}
