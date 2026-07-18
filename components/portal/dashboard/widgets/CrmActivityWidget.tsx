import { db } from '@/lib/db';
import { crmActivities } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';

// Map activity type → Material Icon name
const ACTIVITY_ICONS: Record<string, string> = {
  call: 'call',
  email: 'email',
  meeting: 'groups',
  note: 'sticky_note_2',
  task: 'task_alt',
};

export default async function CrmActivityWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const activities = await db
    .select({
      id: crmActivities.id,
      type: crmActivities.type,
      title: crmActivities.title,
      description: crmActivities.description,
      contactId: crmActivities.contactId,
      dealId: crmActivities.dealId,
      completedAt: crmActivities.completedAt,
      createdAt: crmActivities.createdAt,
    })
    .from(crmActivities)
    .where(eq(crmActivities.clientId, clientId))
    .orderBy(desc(crmActivities.createdAt))
    .limit(5);

  if (activities.length === 0) {
    return (
      <div className="py-2 text-center">
        <p className="text-sm text-muted-foreground mb-2">No CRM activity yet.</p>
        <Link href="/portal/crm" className="text-xs text-primary hover:underline">
          Log your first activity
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {activities.map((a) => {
        const icon = ACTIVITY_ICONS[a.type] ?? 'event_note';
        const href = a.dealId
          ? `/portal/crm/deals/${a.dealId}`
          : a.contactId
          ? `/portal/crm/contacts/${a.contactId}`
          : '/portal/crm';
        const displayDate = a.completedAt ?? a.createdAt;
        return (
          <li key={a.id}>
            <Link
              href={href}
              className="flex items-start gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
            >
              <span className="material-icons text-muted-foreground text-base shrink-0 mt-0.5">
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                {a.description && (
                  <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(displayDate).toLocaleDateString()}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
