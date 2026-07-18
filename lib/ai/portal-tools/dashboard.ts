/**
 * Dashboard AI tools — high-level summary of the client's portal state.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { projects, supportTickets, invoices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dashboardTools: Anthropic.Tool[] = [
  {
    name: 'get_dashboard_summary',
    description: 'Get a high-level dashboard summary: active project count, open ticket count, unpaid invoices, amount due, and recent activity.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
];

export type DashboardHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const dashboardHandlers: Record<string, DashboardHandler> = {
  get_dashboard_summary: async (_input, clientId, _userId) => {
    const [projectRows, ticketRows, invoiceRows] = await Promise.all([
      db.select({ id: projects.id, status: projects.status })
        .from(projects).where(eq(projects.clientId, clientId)),
      db.select({ id: supportTickets.id, status: supportTickets.status })
        .from(supportTickets).where(eq(supportTickets.clientId, clientId)),
      db.select({ id: invoices.id, status: invoices.status, total: invoices.total })
        .from(invoices).where(eq(invoices.clientId, clientId)),
    ]);
    const activeProjects = projectRows.filter(p => p.status === 'active').length;
    const openTickets = ticketRows.filter(t => t.status === 'open' || t.status === 'in_progress').length;
    const unpaidInvoices = invoiceRows.filter(i => i.status === 'sent' || i.status === 'overdue');
    const amountDue = unpaidInvoices.reduce((sum, i) => sum + i.total, 0);
    return {
      activeProjects,
      totalProjects: projectRows.length,
      openTickets,
      totalTickets: ticketRows.length,
      unpaidInvoiceCount: unpaidInvoices.length,
      amountDueDollars: (amountDue / 100).toFixed(2),
    };
  },
};
