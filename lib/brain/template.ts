/**
 * Brain note template engine. Renders `{{variable}}` placeholders inside a
 * markdown body using values pulled from the tenant's brain database
 * (open tasks, recent meetings) plus a few date helpers.
 *
 * Unrecognized variables are deliberately left in place — users may want to
 * include literal `{{vars}}` in note bodies, and silently dropping them would
 * surprise people. Recognized-but-empty results render as a friendly
 * "_(none)_" placeholder so the surrounding markdown still parses cleanly.
 */
import { db } from '@/lib/db';
import { brainMeetings, brainTasks } from '@/lib/db/schema';
import { and, desc, eq, gte, ne } from 'drizzle-orm';

export interface TemplateContext {
  today: Date;
  clientId: number;
  userName?: string | null;
}

const VAR_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function longDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * ISO 8601 week label like "2026-W18". Uses the standard ISO algorithm:
 * Thursday of the current week determines the year.
 */
function isoWeek(d: Date): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function renderOpenTasks(clientId: number): Promise<string> {
  const rows = await db.select({ id: brainTasks.id, title: brainTasks.title, dueDate: brainTasks.dueDate })
    .from(brainTasks)
    .where(and(eq(brainTasks.clientId, clientId), ne(brainTasks.status, 'done')))
    .orderBy(desc(brainTasks.createdAt))
    .limit(10);
  if (rows.length === 0) return '_(no open tasks)_';
  return rows.map((t) => {
    const due = t.dueDate ? ` _(due ${isoDate(t.dueDate)})_` : '';
    return `- ${t.title}${due}`;
  }).join('\n');
}

async function renderRecentMeetings(clientId: number, today: Date): Promise<string> {
  const cutoff = new Date(today.getTime() - 7 * 86_400_000);
  const rows = await db.select({
    id: brainMeetings.id,
    title: brainMeetings.title,
    meetingDate: brainMeetings.meetingDate,
    createdAt: brainMeetings.createdAt,
  }).from(brainMeetings)
    .where(and(
      eq(brainMeetings.clientId, clientId),
      // Prefer meetingDate when set; fall back to createdAt for adapters that
      // don't populate the original meeting timestamp. We filter by createdAt
      // because it's always populated and the index supports it.
      gte(brainMeetings.createdAt, cutoff),
    ))
    .orderBy(desc(brainMeetings.createdAt))
    .limit(10);
  if (rows.length === 0) return '_(no meetings in the last 7 days)_';
  return rows.map((m) => {
    const when = m.meetingDate ?? m.createdAt;
    return `- ${m.title} _(${isoDate(when)})_`;
  }).join('\n');
}

/**
 * Render a template body. Reads from the brain DB to compute dynamic vars.
 * Unrecognized variables are returned untouched.
 */
export async function applyTemplate(body: string, ctx: TemplateContext): Promise<string> {
  // Match the variable set first so we only run expensive lookups when
  // referenced. Templates without `{{open_tasks}}` shouldn't pay for the SQL.
  const referenced = new Set<string>();
  for (const m of body.matchAll(VAR_PATTERN)) referenced.add(m[1]);

  const cache: Record<string, string> = {};

  if (referenced.has('today')) cache.today = isoDate(ctx.today);
  if (referenced.has('today.long')) cache['today.long'] = longDate(ctx.today);
  if (referenced.has('week')) cache.week = isoWeek(ctx.today);
  if (referenced.has('userName')) cache.userName = ctx.userName ?? '';
  if (referenced.has('open_tasks')) {
    cache.open_tasks = await renderOpenTasks(ctx.clientId);
  }
  if (referenced.has('recent_meetings')) {
    cache.recent_meetings = await renderRecentMeetings(ctx.clientId, ctx.today);
  }

  return body.replace(VAR_PATTERN, (full, name: string) => {
    if (Object.prototype.hasOwnProperty.call(cache, name)) return cache[name];
    // Unrecognized — leave literal so users can write `{{anything}}` in notes.
    return full;
  });
}
