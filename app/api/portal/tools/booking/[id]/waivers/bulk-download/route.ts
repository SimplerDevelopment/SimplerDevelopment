import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingWaivers } from '@/lib/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [page] = await db.select({ id: bookingPages.id, title: bookingPages.title }).from(bookingPages)
    .where(and(eq(bookingPages.id, parseInt(id)), eq(bookingPages.clientId, client.id)))
    .limit(1);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const conditions = [eq(bookingWaivers.bookingPageId, page.id)];
  if (startDate) conditions.push(gte(bookingWaivers.signedAt, new Date(startDate)));
  if (endDate) conditions.push(lte(bookingWaivers.signedAt, new Date(endDate + 'T23:59:59Z')));

  const waivers = await db.select().from(bookingWaivers)
    .where(and(...conditions))
    .orderBy(desc(bookingWaivers.signedAt));

  if (waivers.length === 0) {
    return NextResponse.json({ success: false, message: 'No waivers found in the specified range' }, { status: 404 });
  }

  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    for (const waiver of waivers) {
      const pdfPage = pdfDoc.addPage([612, 792]);
      let y = 750;

      const drawText = (text: string, opts?: { bold?: boolean; size?: number }) => {
        const size = opts?.size || 11;
        const f = opts?.bold ? boldFont : font;
        pdfPage.drawText(text, { x: 50, y, size, font: f, color: rgb(0, 0, 0) });
        y -= size + 6;
      };

      drawText(`WAIVER — ${page.title}`, { bold: true, size: 14 });
      y -= 5;
      drawText(`Name: ${waiver.signerName}`);
      drawText(`Email: ${waiver.signerEmail}`);
      drawText(`Signed: ${waiver.signedAt.toISOString().replace('T', ' ').split('.')[0]} UTC`);
      drawText(`IP: ${waiver.ipAddress || 'Unknown'}`);
      y -= 10;

      // Truncated waiver text for bulk
      const text = (waiver.waiverContent || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const truncated = text.length > 500 ? text.substring(0, 500) + '...' : text;
      const words = truncated.split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, 9) > 510) {
          drawText(line, { size: 9 });
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) drawText(line, { size: 9 });

      // Embed signature
      y -= 15;
      drawText('Signature:', { bold: true });
      if (waiver.signatureData.startsWith('data:image/png;base64,')) {
        try {
          const base64 = waiver.signatureData.split(',')[1];
          const sigImage = await pdfDoc.embedPng(Buffer.from(base64, 'base64'));
          const maxWidth = 180;
          const scale = sigImage.width > maxWidth ? maxWidth / sigImage.width : 1;
          pdfPage.drawImage(sigImage, {
            x: 50, y: y - sigImage.height * scale,
            width: sigImage.width * scale, height: sigImage.height * scale,
          });
        } catch {
          drawText('[Signature image could not be embedded]', { size: 9 });
        }
      }
    }

    const pdfBytes = await pdfDoc.save();

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="waivers-${page.title.replace(/\s+/g, '_')}-bulk.pdf"`,
      },
    });
  } catch (err) {
    console.error('Bulk waiver PDF error:', err);
    return NextResponse.json({ success: false, message: 'Failed to generate PDF' }, { status: 500 });
  }
}
