/**
 * PUX-192: pure invoice helpers (no DB import) shared by the page, the
 * InvoiceDocument component and the PDF route.
 */
export function canPayInvoice(status: string): boolean {
  return status === 'sent' || status === 'overdue';
}

/** The row's own dates as a trail — invoices carry no sentAt, so it is issued / due / paid. */
export function invoiceTrail(inv: { createdAt: Date | string; dueDate?: Date | string | null; paidAt?: Date | string | null; status: string }) {
  const trail: { label: string; at: Date; tone: 'ok' | 'warn' | 'muted' }[] = [{ label: 'Issued', at: new Date(inv.createdAt), tone: 'muted' }];
  if (inv.dueDate) trail.push({ label: inv.paidAt ? 'Was due' : 'Due', at: new Date(inv.dueDate), tone: inv.status === 'overdue' ? 'warn' : 'muted' });
  if (inv.paidAt) trail.push({ label: 'Paid', at: new Date(inv.paidAt), tone: 'ok' });
  return trail;
}
