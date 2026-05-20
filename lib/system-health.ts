// Static registry of scheduled/recurring jobs we know about. The
// /admin/system-health dashboard joins this against the `cron_health` table
// at runtime so jobs that have never run still appear as rows (rather than
// being silently dropped because their row doesn't exist yet).
//
// Adding a new job? Two places:
//   1. The job itself (api/cron route wrapped in withCronHealth, or a
//      scripts/routines/ entry — scripts/routines aren't instrumented
//      because they run on GitHub Actions and not against our DB).
//   2. This file — add an entry with the canonical `name` so the dashboard
//      stops marking it as "never tracked".

export type SystemHealthArea = 'api-cron' | 'routine' | 'brain-12';

export interface KnownJob {
  /** Stable identifier (must match what `withCronHealth({ name })` uses). */
  name: string;
  area: SystemHealthArea;
  /** Short human-readable label for the dashboard. */
  label: string;
  /** Cron expression (Vercel cron syntax) or "GitHub Actions: …" for jobs
   *  that run as workflows. "unknown" when not findable. */
  schedule: string;
  /** One-line description of what the job does. */
  purpose: string;
  /** Whether this job currently writes to `cron_health`. Routines/GitHub
   *  Actions don't (they run in CI, not against our app DB), so the
   *  dashboard shows them as "external — see workflow logs". */
  tracked: boolean;
}

// Schedules sourced verbatim from /vercel.json (`crons` array).
const API_CRONS: KnownJob[] = [
  {
    name: 'api-cron:expire-mcp-pendings',
    area: 'api-cron',
    label: 'Expire MCP pendings',
    schedule: '17 3 * * *',
    purpose: 'Auto-expire stale MCP pending action rows.',
    tracked: true,
  },
  {
    name: 'api-cron:renew-gmail-watches',
    area: 'api-cron',
    label: 'Renew Gmail watches',
    schedule: '47 3 * * *',
    purpose: 'Re-subscribe to Gmail push notifications before expiry.',
    tracked: true,
  },
  {
    name: 'api-cron:renew-drive-watches',
    area: 'api-cron',
    label: 'Renew Drive watches',
    schedule: '13 4 * * *',
    purpose: 'Re-subscribe to Google Drive push notifications before expiry.',
    tracked: true,
  },
  {
    name: 'api-cron:drive-sync',
    area: 'api-cron',
    label: 'Drive sync',
    schedule: '*/10 * * * *',
    purpose: 'Incremental Google Drive change sync into the Brain.',
    tracked: true,
  },
  {
    name: 'api-cron:process-embeddings',
    area: 'api-cron',
    label: 'Process embeddings queue',
    schedule: '* * * * *',
    purpose: 'Drain pending entries from brain_embedding_jobs.',
    tracked: true,
  },
  {
    name: 'api-cron:brain-daily-notes',
    area: 'api-cron',
    label: 'Brain daily notes',
    schedule: '5 6 * * *',
    purpose: 'Materialize a daily note for each active tenant.',
    tracked: true,
  },
  {
    name: 'api-cron:brain-empty-old-trash',
    area: 'api-cron',
    label: 'Brain: empty old trash',
    schedule: '15 7 * * *',
    purpose: 'Hard-delete brain notes that have been in trash > N days.',
    tracked: true,
  },
  {
    name: 'api-cron:failing-automations-notify',
    area: 'api-cron',
    label: 'Failing automations notify',
    schedule: '0 12 * * *',
    purpose: 'CRM notification for automation rules failing 5x in a row.',
    tracked: true,
  },
  {
    name: 'api-cron:surveys-zero-responses',
    area: 'api-cron',
    label: 'Surveys: zero responses',
    schedule: '30 10 * * 1',
    purpose: 'Weekly nudge for published surveys with no responses yet.',
    tracked: true,
  },
  {
    name: 'api-cron:stale-crm-deals',
    area: 'api-cron',
    label: 'Stale CRM deals',
    schedule: '0 11 * * 1',
    purpose: 'Flag CRM deals that have been idle past their threshold.',
    tracked: true,
  },
  {
    name: 'api-cron:stuck-booking-holds',
    area: 'api-cron',
    label: 'Stuck booking holds',
    schedule: '*/30 * * * *',
    purpose: 'Notify owners about bookings stuck in pending payment > 24h.',
    tracked: true,
  },
  {
    name: 'api-cron:renew-microsoft-subscriptions',
    area: 'api-cron',
    label: 'Renew Microsoft subscriptions',
    schedule: '*/25 * * * *',
    purpose: 'Re-subscribe to Microsoft Graph notifications before expiry.',
    tracked: true,
  },
  {
    name: 'api-cron:pm-recurrences',
    area: 'api-cron',
    label: 'PM recurrences',
    schedule: '*/5 * * * *',
    purpose: 'Materialize kanban cards from due card_recurrences.',
    tracked: true,
  },
  {
    name: 'api-cron:pm-column-snapshots',
    area: 'api-cron',
    label: 'PM column snapshots',
    schedule: '55 23 * * *',
    purpose: 'Daily snapshot of card counts per kanban column per project.',
    tracked: true,
  },
  {
    name: 'api-cron:process-survey-email-followups',
    area: 'api-cron',
    label: 'Survey email follow-ups',
    schedule: '*/15 * * * *',
    purpose: 'Send DIST-01/02 survey follow-up emails.',
    tracked: true,
  },
  {
    name: 'api-cron:brain-12',
    area: 'api-cron',
    label: 'BRAIN-12 cleanup',
    schedule: '30 7 * * *',
    purpose: 'One-shot soft-delete sweep for tagged duplicate brain notes.',
    tracked: true,
  },
  {
    name: 'api-cron:resend-usage-sync',
    area: 'api-cron',
    label: 'Resend usage sync',
    schedule: '15 4 * * *',
    purpose: 'Pull email-send counts from Resend into usage tables.',
    tracked: true,
  },
  {
    name: 'api-cron:usage-rollup',
    area: 'api-cron',
    label: 'Usage rollup',
    schedule: '45 4 * * *',
    purpose: 'Aggregate raw usage events into billing-period summaries.',
    tracked: true,
  },
  {
    name: 'api-cron:process-scheduled-automations',
    area: 'api-cron',
    label: 'Scheduled automations tick',
    schedule: '* * * * *',
    purpose: 'Fire automation rules whose next_run_at is due.',
    tracked: true,
  },
];

// scripts/routines/* — these run on GitHub Actions, not Vercel cron. They
// connect to the prod DB read-only and don't share our app's `db` import.
// Listed here for visibility; their truth is the GitHub Actions UI.
const ROUTINES: KnownJob[] = [
  {
    name: 'routine:block-controls-drift',
    area: 'routine',
    label: 'Block controls drift',
    schedule: 'GitHub Actions: 0 15 * * 1 (Mon 15:00 UTC)',
    purpose: 'Diff live block-controls coverage against the committed baseline.',
    tracked: false,
  },
  {
    name: 'routine:check-drizzle-tracker-drift',
    area: 'routine',
    label: 'Drizzle tracker drift',
    schedule: 'GitHub Actions: 15 13 * * * (daily 13:15 UTC)',
    purpose: 'Compare drizzle/meta/_journal.json with prod __drizzle_migrations.',
    tracked: false,
  },
  {
    name: 'routine:embeddings-backlog',
    area: 'routine',
    label: 'Embeddings backlog monitor',
    schedule: 'GitHub Actions: 23 * * * * (hourly :23)',
    purpose: 'Email digest when brain_embedding_jobs is piling up.',
    tracked: false,
  },
  {
    name: 'routine:failing-automations-digest',
    area: 'routine',
    label: 'Failing automations digest',
    schedule: 'GitHub Actions: 7 13 * * * (daily 13:07 UTC)',
    purpose: 'Daily email digest of automations whose last 5 runs all failed.',
    tracked: false,
  },
  {
    name: 'routine:stripe-webhook-health',
    area: 'routine',
    label: 'Stripe webhook health',
    schedule: 'GitHub Actions: 17 * * * * (hourly :17)',
    purpose: 'Diff Stripe events against rows our webhook handler persisted.',
    tracked: false,
  },
];

// scripts/brain-12/* — one-off migrations, not recurring jobs. Surfaced
// here for completeness so staff can see they exist; they have no schedule
// and aren't tracked.
const BRAIN_12: KnownJob[] = [
  {
    name: 'brain-12:01-add-deleted-at',
    area: 'brain-12',
    label: 'BRAIN-12 01: add deleted_at column',
    schedule: 'one-shot (manual)',
    purpose: 'Adds brain_notes.deleted_at on prod to match the TS schema.',
    tracked: false,
  },
  {
    name: 'brain-12:02-recheck-dupes',
    area: 'brain-12',
    label: 'BRAIN-12 02: recheck dupes',
    schedule: 'one-shot (manual)',
    purpose: 'Re-tally URL-duplicate brain notes after normalization.',
    tracked: false,
  },
  {
    name: 'brain-12:03-tag',
    area: 'brain-12',
    label: 'BRAIN-12 03: tag dupes/shorts',
    schedule: 'one-shot (manual)',
    purpose: 'Tag duplicate / short-note review rows for the cleanup cron.',
    tracked: false,
  },
  {
    name: 'brain-12:inventory',
    area: 'brain-12',
    label: 'BRAIN-12 inventory',
    schedule: 'one-shot (manual, read-only)',
    purpose: 'Read-only stub/duplicate/orphan tally on prod.',
    tracked: false,
  },
];

export function listKnownJobs(): KnownJob[] {
  return [...API_CRONS, ...ROUTINES, ...BRAIN_12];
}
