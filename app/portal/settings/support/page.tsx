import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, supportTickets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ticketStatusColor, priorityColor } from '@/lib/portal';

export default async function SettingsSupportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) redirect('/portal/dashboard');

  const tickets = await db.select().from(supportTickets).where(eq(supportTickets.clientId, client.id)).orderBy(supportTickets.createdAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Get help from our team.</p>
        <Link
          href="/portal/tickets/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          New Ticket
        </Link>
      </div>

      {tickets.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">support_agent</span>
          <h3 className="mt-4 font-semibold text-foreground">No tickets yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Need help? Open your first support ticket.</p>
          <Link href="/portal/tickets/new" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
            <span className="material-icons text-base">add</span>
            Open Ticket
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">#{ticket.number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/portal/tickets/${ticket.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ticketStatusColor(ticket.status)}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(ticket.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
