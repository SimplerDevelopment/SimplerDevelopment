import { NextResponse } from 'next/server';
import { unwatch, verifyUnsubscribe } from '@/lib/pm-notifications';

/**
 * One-click unsubscribe from a card's watcher list. Clicked from email footers.
 * Does NOT require login — auth is the signed HMAC token tied to (cardId, userId).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  const url = new URL(req.url);
  const userId = parseInt(url.searchParams.get('u') ?? '', 10);
  const token = url.searchParams.get('t') ?? '';

  if (Number.isNaN(cardId) || Number.isNaN(userId) || !token) {
    return new NextResponse(htmlError('Invalid unsubscribe link.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (!verifyUnsubscribe(cardId, userId, token)) {
    return new NextResponse(htmlError('This unsubscribe link is invalid or has expired.'), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  await unwatch(cardId, userId);
  return new NextResponse(htmlSuccess(), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:48px 16px;color:#0f172a;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;text-align:center;">${body}</div>
  </body></html>`;
}
function htmlSuccess(): string {
  return shell('Unsubscribed', `
    <div style="font-size:40px;margin-bottom:12px;">✅</div>
    <h1 style="margin:0 0 8px;font-size:20px;">You're unsubscribed</h1>
    <p style="margin:0;color:#64748b;font-size:14px;line-height:1.5;">You won't get further emails about this card. You can start watching it again anytime from the card detail page.</p>
  `);
}
function htmlError(msg: string): string {
  return shell('Error', `
    <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
    <h1 style="margin:0 0 8px;font-size:20px;">${msg}</h1>
  `);
}
