import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, suggestedProjects } from '@/lib/db/schema';
import { eq, isNull, or, and } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const categoryLabel: Record<string, string> = {
  website: 'Website',
  ecommerce: 'E-Commerce',
  mobile: 'Mobile App',
  maintenance: 'Maintenance',
  branding: 'Branding',
  development: 'Development',
  other: 'Other',
};

const categoryIcon: Record<string, string> = {
  website: 'web',
  ecommerce: 'shopping_cart',
  mobile: 'phone_iphone',
  maintenance: 'build',
  branding: 'palette',
  development: 'code',
  other: 'category',
};

// Preserve a consistent display order
const categoryOrder = ['website', 'ecommerce', 'mobile', 'development', 'maintenance', 'branding', 'other'];

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function SuggestedProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) redirect('/portal/dashboard');

  const items = await db
    .select()
    .from(suggestedProjects)
    .where(
      and(
        eq(suggestedProjects.active, true),
        or(
          isNull(suggestedProjects.clientId),
          eq(suggestedProjects.clientId, client.id),
        ),
      ),
    )
    .orderBy(suggestedProjects.order, suggestedProjects.createdAt);

  // Group by category, preserving display order
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  const categories = categoryOrder.filter(c => grouped[c]?.length);

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Suggested Projects</h1>
        <p className="text-muted-foreground mt-1">Ideas we think would be a great fit for you.</p>
      </div>

      {categories.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">rocket_launch</span>
          <h3 className="mt-4 font-semibold text-foreground">No suggestions yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Check back soon — we&apos;ll add tailored recommendations for you.</p>
        </div>
      ) : (
        categories.map((category) => (
          <section key={category}>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-icons text-primary">{categoryIcon[category] ?? 'category'}</span>
              <h2 className="text-lg font-semibold text-foreground">{categoryLabel[category] ?? category}</h2>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-1">
                {grouped[category].length}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {grouped[category].map((item) => (
                <Link
                  key={item.id}
                  href={`/portal/suggested-projects/${item.id}`}
                  className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/50 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="material-icons text-2xl text-primary group-hover:scale-110 transition-transform">{item.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                  {(item.features ?? []).length > 0 && (
                    <ul className="space-y-1">
                      {(item.features ?? []).slice(0, 3).map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span className="material-icons text-sm text-green-600 dark:text-green-400 flex-shrink-0">check_circle</span>
                          {f}
                        </li>
                      ))}
                      {(item.features ?? []).length > 3 && (
                        <li className="text-xs text-muted-foreground pl-5">+{item.features!.length - 3} more</li>
                      )}
                    </ul>
                  )}
                  <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-border">
                    <div>
                      <p className="text-base font-bold text-foreground">
                        {item.estimatedPrice ? `~${formatCents(item.estimatedPrice)}` : 'Quote on request'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Estimated · billed hourly</p>
                      {item.estimatedTimeline && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <span className="material-icons text-xs">schedule</span>
                          {item.estimatedTimeline}
                        </p>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-primary font-medium group-hover:underline">
                      View details
                      <span className="material-icons text-sm">arrow_forward</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
