import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingWaivers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

type Params = { params: Promise<{ id: string; waiverId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id, waiverId } = await params;

  const [page] = await db.select({ id: bookingPages.id, title: bookingPages.title }).from(bookingPages)
    .where(and(eq(bookingPages.id, parseInt(id)), eq(bookingPages.clientId, client.id)))
    .limit(1);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [waiver] = await db.select().from(bookingWaivers)
    .where(and(eq(bookingWaivers.id, parseInt(waiverId)), eq(bookingWaivers.bookingPageId, page.id)))
    .limit(1);
  if (!waiver) return NextResponse.json({ success: false, message: 'Waiver not found' }, { status: 404 });

  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageSize = [612, 792] as [number, number]; // Letter size

    let pdfPage = pdfDoc.addPage(pageSize);
    let y = 750;

    const drawText = (text: string, opts?: { bold?: boolean; size?: number }) => {
      const size = opts?.size || 11;
      const f = opts?.bold ? boldFont : font;
      pdfPage.drawText(text, { x: 50, y, size, font: f, color: rgb(0, 0, 0) });
      y -= size + 6;
      if (y < 60) {
        pdfPage = pdfDoc.addPage(pageSize);
        y = 750;
      }
    };

    // Header
    drawText('SIGNED WAIVER', { bold: true, size: 18 });
    y -= 10;
    drawText(`Booking: ${page.title}`, { bold: true, size: 13 });
    y -= 10;

    // Signer info
    drawText(`Name: ${waiver.signerName}`);
    drawText(`Email: ${waiver.signerEmail}`);
    drawText(`Signed: ${waiver.signedAt.toISOString().replace('T', ' ').split('.')[0]} UTC`);
    drawText(`IP Address: ${waiver.ipAddress || 'Unknown'}`);
    y -= 15;

    // Waiver content
    drawText('Waiver Terms:', { bold: true, size: 12 });
    y -= 5;
    // Split long text into lines
    const waiverText = (waiver.waiverContent || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = waiverText.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(testLine, 10) > 510) {
        drawText(line, { size: 10 });
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) drawText(line, { size: 10 });

    // Signature
    y -= 20;
    drawText('Signature:', { bold: true, size: 12 });
    y -= 5;

    // Embed signature image if it's base64 PNG
    if (waiver.signatureData.startsWith('data:image/png;base64,')) {
      const base64 = waiver.signatureData.split(',')[1];
      const sigImage = await pdfDoc.embedPng(Buffer.from(base64, 'base64'));
      const sigDims = sigImage.scale(0.5);
      const maxWidth = 200;
      const scale = sigDims.width > maxWidth ? maxWidth / sigDims.width : 1;

      pdfPage.drawImage(sigImage, {
        x: 50,
        y: y - sigDims.height * scale,
        width: sigDims.width * scale,
        height: sigDims.height * scale,
      });
    }

    const pdfBytes = await pdfDoc.save();

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="waiver-${waiver.id}-${waiver.signerName.replace(/\s+/g, '_')}.pdf"`,
      },
    });
  } catch (err) {
    console.error('Waiver PDF generation error:', err);
    return NextResponse.json({ success: false, message: 'Failed to generate PDF' }, { status: 500 });
  }
}
