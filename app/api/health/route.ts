import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  // Don't expose uptimeMs (signals last redeploy) or any other internal state.
  const body = {
    ok: dbOk,
    db: dbOk ? 'up' : 'down',
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
