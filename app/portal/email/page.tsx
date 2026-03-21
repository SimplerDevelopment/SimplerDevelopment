import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, emailCampaigns, emailLists, emailCampaignSends, emailSubscribers } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default async function PortalEmailPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);

  if (!client) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <span className="material-icons text-5xl text-muted-foreground">person_off</span>
        <h2 className="mt-4 text-xl font-semibold">No client profile found</h2>
        <p className="mt-2 text-muted-foreground text-sm">Please contact us to set up your account.</p>
      </div>
    );
  }

  // Campaigns sent for this client
  const campaigns = await db
    .select({
      id: emailCampaigns.id,
      name: emailCampaigns.name,
      subject: emailCampaigns.subject,
      status: emailCampaigns.status,
      sentAt: emailCampaigns.sentAt,
      totalSent: emailCampaigns.totalSent,
      totalOpened: emailCampaigns.totalOpened,
      totalClicked: emailCampaigns.totalClicked,
      listName: emailLists.name,
    })
    .from(emailCampaigns)
    .leftJoin(emailLists, eq(emailCampaigns.listId, emailLists.id))
    .where(eq(emailCampaigns.clientId, client.id))
    .orderBy(emailCampaigns.createdAt);

  const sentCampaigns = campaigns.filter(c => c.status === 'sent');
  const totalSent = sentCampaigns.reduce((sum, c) => sum + c.totalSent, 0);
  const totalOpened = sentCampaigns.reduce((sum, c) => sum + c.totalOpened, 0);
  const avgOpenRate = totalSent > 0 ? Math.round(totalOpened / totalSent * 100) : 0;

  // Subscriber count for this client's lists
  const clientLists = await db
    .select({ id: emailLists.id })
    .from(emailLists)
    .where(eq(emailLists.clientId, client.id));

  const listIds = clientLists.map(l => l.id);
  const subscriberCount = listIds.length > 0
    ? await db
        .select({ id: emailSubscribers.id })
        .from(emailSubscribers)
        .where(and(inArray(emailSubscribers.listId, listIds), eq(emailSubscribers.status, 'active')))
        .then(rows => rows.length)
    : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Email Campaigns</h1>
        <p className="text-muted-foreground mt-1">Campaigns sent on your behalf.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Campaigns Sent', value: sentCampaigns.length, icon: 'send' },
          { label: 'Total Subscribers', value: subscriberCount, icon: 'group' },
          { label: 'Avg Open Rate', value: `${avgOpenRate}%`, icon: 'drafts' },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <span className="material-icons text-sm">{stat.icon}</span>
              <span className="text-xs">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Campaign list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Campaign History</h2>
        </div>
        {campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-icons text-4xl text-muted-foreground mb-3 block">campaign</span>
            <p className="text-muted-foreground text-sm">No email campaigns yet.</p>
            <p className="text-muted-foreground text-xs mt-1">Campaigns we send on your behalf will appear here.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Campaign</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">List</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Open Rate</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden md:table-cell">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map(c => {
                const openRate = c.totalSent > 0 ? Math.round(c.totalOpened / c.totalSent * 100) : 0;
                return (
                  <tr key={c.id} className="hover:bg-accent transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{c.subject}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.listName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                      {c.status === 'sent' ? `${openRate}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground hidden md:table-cell">
                      {c.status === 'sent' ? c.totalSent.toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
