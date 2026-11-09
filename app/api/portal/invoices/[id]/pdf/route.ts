import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { auth } from '@/lib/auth';
import { resolvePortalInvoice } from '@/lib/billing/portal-invoice';
import { formatCents } from '@/lib/portal-utils';

/**
 * PUX-192 (design doc screen 51): Download PDF. pdf-lib is already a
 * dependency, so the invoice is drawn directly — number, dates, line items,
 * totals — with the same resolvePortalInvoice scoping as the page.
 *
 * ponytail: plain text layout, one page, no logo. Reach for @react-pdf
 * (also installed) if a branded template is ever wanted.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const resolved = await resolvePortalInvoice(session, parseInt(id, 10));
  if (!resolved || resolved === 'no-client') return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  const { invoice, items } = resolved;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  const line = (text: string, opts: { x?: number; size?: number; b?: boolean; right?: boolean } = {}) => {
    const f = opts.b ? bold : font; const size = opts.size ?? 11;
    const x = opts.right ? 562 - f.widthOfTextAtSize(text, size) : (opts.x ?? 50);
    page.drawText(text, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.12) });
  };
  line(`Invoice ${invoice.number}`, { size: 20, b: true }); y -= 22;
  line(`Issued ${new Date(invoice.createdAt).toLocaleDateString('en-US')}${invoice.dueDate ? ` · Due ${new Date(invoice.dueDate).toLocaleDateString('en-US')}` : ''} · ${invoice.status}`, { size: 10 }); y -= 30;
  line('Description', { b: true }); line('Total', { b: true, right: true }); y -= 16;
  for (const it of items) {
    line(`${it.description} × ${it.quantity}`); line(formatCents(it.total), { right: true }); y -= 15;
    if (y < 120) break; // ponytail: single page; long invoices are truncated on paper, never on screen
  }
  y -= 10;
  line('Subtotal'); line(formatCents(invoice.subtotal), { right: true }); y -= 15;
  if (invoice.tax > 0) { line('Tax'); line(formatCents(invoice.tax), { right: true }); y -= 15; }
  line('Total', { b: true, size: 13 }); line(formatCents(invoice.total), { b: true, size: 13, right: true });
  if (invoice.paidAt) { y -= 24; line(`Paid ${new Date(invoice.paidAt).toLocaleDateString('en-US')}`, { size: 10 }); }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.number}.pdf"` },
  });
}
