import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getAgenda } from '@/lib/brain/calendar';

function parseDateParam(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function GET(request: Request) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const url = new URL(request.url);
  const now = new Date();
  // Default range: current month (with one-day padding so the week header
  // renders correctly when the page asks for a [from, to] aligned to a Sunday).
  const from = parseDateParam(url.searchParams.get('from'), new Date(now.getFullYear(), now.getMonth(), 1));
  const to = parseDateParam(url.searchParams.get('to'), new Date(now.getFullYear(), now.getMonth() + 1, 1));

  if (to <= from) {
    return NextResponse.json({ success: false, message: 'to must be after from' }, { status: 400 });
  }

  const items = await getAgenda(result.client.id, from, to);
  return NextResponse.json({ success: true, data: items });
}
