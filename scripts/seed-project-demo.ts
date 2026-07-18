/**
 * seed-project-demo.ts — one comprehensive demo project that exercises the
 * ENTIRE project-management domain, so developers can spin up realistic data
 * to preview / test every project feature (board, backlog, sprints, reports,
 * member interaction, card sub-features, templates, recurrences, cross-links).
 *
 * Run:   bun run db:seed:project-demo
 *   or:  DATABASE_URL=postgresql://postgres@localhost:5432/simplerdev_dev bunx tsx scripts/seed-project-demo.ts
 *
 * Requires a reachable DATABASE_URL (lib/db throws at import if unset). Point it
 * at an ISOLATED dev DB — never staging/prod. Optional env:
 *   SEED_CLIENT_EMAIL   user email whose client owns the demo (default client@example.com;
 *                       falls back to the first client in the DB if that user is absent).
 *
 * Idempotent: on each run it deletes any prior demo project with the same marker
 * name (cascades to every child row) and rebuilds from scratch — safe to re-run.
 *
 * Coverage: project + members(roles) · sprints across all stages + scope-history
 * (velocity/burndown) + retros · columns · full card matrix (every cardType &
 * workflowState, epic→child hierarchy, sprint assignment) · assignees · watchers ·
 * comments(+mentions) · checklist items · labels · dependencies/blockers · time logs ·
 * card files · card artifacts + project artifacts (light cross-links) · card templates ·
 * recurrences · custom fields(+values) · goals · saved views · notifications · activities.
 * ponytail: columnDailySnapshots (CFD) skipped — derived by a cron worker; add a
 * date-series loop here if you need the cumulative-flow chart populated too.
 */
import 'dotenv/config';
import { db } from '../lib/db';
import {
  clients, users, posts,
  projects, projectMembers,
  sprints, sprintScopeHistory, sprintRetros, sprintRetroItems,
  kanbanColumns, kanbanCards,
  kanbanCardAssignees, kanbanCardWatchers, kanbanCardComments, kanbanCardChecklistItems,
  kanbanLabels, kanbanCardLabels, kanbanCardDependencies, kanbanCardTimeLogs,
  kanbanCardFiles, kanbanCardArtifacts, projectArtifacts,
  cardTemplates, cardRecurrences, kanbanCardActivities,
  projectCustomFields, cardCustomFieldValues, projectGoals, projectSavedViews, notifications,
} from '../lib/db/schema';
import { and, eq } from 'drizzle-orm';

const PROJECT_NAME = 'Demo — Project Feature Tour';

const MS_DAY = 86_400_000;
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * MS_DAY);
const daysAhead = (n: number) => new Date(now.getTime() + n * MS_DAY);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  // ── Resolve the owning client + a set of users for member interaction ──
  const email = process.env.SEED_CLIENT_EMAIL ?? 'client@example.com';
  const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let client: { id: number } | undefined;
  if (byEmail) {
    [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.userId, byEmail.id)).limit(1);
  }
  if (!client) {
    [client] = await db.select({ id: clients.id }).from(clients).limit(1);
  }
  if (!client) { console.error('No client rows in the DB — run bun run db:seed first.'); process.exit(1); }

  const people = await db.select({ id: users.id }).from(users).limit(6);
  if (people.length === 0) { console.error('No users in the DB — run bun run db:seed first.'); process.exit(1); }
  // Round-robin picker so the seed degrades gracefully when few users exist.
  const u = (i: number) => people[i % people.length].id;
  const owner = u(0);

  // ── Idempotency: nuke any prior demo project (cascade wipes all children) ──
  const prior = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.name, PROJECT_NAME), eq(projects.clientId, client.id)));
  for (const p of prior) await db.delete(projects).where(eq(projects.id, p.id));
  if (prior.length) console.log(`Removed ${prior.length} prior demo project(s).`);

  // ── Project ──
  const [project] = await db.insert(projects).values({
    name: PROJECT_NAME,
    description: 'Seeded demo exercising every project-management feature — sprints, reports, board, backlog, members, and all card sub-features. Safe to delete; regenerate with `bun run db:seed:project-demo`.',
    clientId: client.id,
    status: 'active',
    startDate: daysAgo(45),
    createdBy: owner,
  }).returning({ id: projects.id });
  const projectId = project.id;
  console.log(`Created project ${projectId}: ${PROJECT_NAME}`);

  // ── Members (all four roles) ──
  const memberRoles = ['owner', 'editor', 'commenter', 'viewer'];
  for (let i = 0; i < memberRoles.length && i < people.length; i++) {
    await db.insert(projectMembers).values({
      projectId, userId: u(i), role: memberRoles[i], addedBy: owner,
    });
  }

  // ── Columns ──
  const columnDefs = [
    { name: 'Backlog', order: 0, color: '#64748b', isDone: false },
    { name: 'To Do', order: 1, color: '#3b82f6', isDone: false },
    { name: 'In Progress', order: 2, color: '#f59e0b', isDone: false, wipLimit: 3 },
    { name: 'In Review', order: 3, color: '#a855f7', isDone: false },
    { name: 'Done', order: 4, color: '#22c55e', isDone: true },
  ];
  const col: Record<string, number> = {};
  for (const d of columnDefs) {
    const [row] = await db.insert(kanbanColumns).values({
      projectId, name: d.name, order: d.order, color: d.color, isDone: d.isDone, wipLimit: d.wipLimit ?? null,
    }).returning({ id: kanbanColumns.id });
    col[d.name] = row.id;
  }

  // ── Sprints across every stage (drives planning + reports) ──
  const sprintDefs = [
    { key: 's1', name: 'Sprint 1 — Foundations', goal: 'Design system, auth, and app shell.', status: 'completed', startDate: daysAgo(42), endDate: daysAgo(28), order: 0 },
    { key: 's2', name: 'Sprint 2 — Core Pages', goal: 'Marketing pages live.', status: 'completed', startDate: daysAgo(28), endDate: daysAgo(14), order: 1 },
    { key: 's3', name: 'Sprint 3 — Commerce', goal: 'Storefront + checkout.', status: 'active', startDate: daysAgo(12), endDate: daysAhead(2), order: 2 },
    { key: 's4', name: 'Sprint 4 — Launch', goal: 'Perf, a11y, SEO, cutover.', status: 'planning', startDate: null, endDate: null, order: 3 },
  ];
  const sprint: Record<string, number> = {};
  const sprintStart: Record<string, Date | null> = {};
  const sprintEnd: Record<string, Date | null> = {};
  for (const s of sprintDefs) {
    const [row] = await db.insert(sprints).values({
      projectId, name: s.name, goal: s.goal, status: s.status,
      startDate: s.startDate, endDate: s.endDate, order: s.order,
    }).returning({ id: sprints.id });
    sprint[s.key] = row.id;
    sprintStart[s.key] = s.startDate;
    sprintEnd[s.key] = s.endDate;
  }

  // ── Cards: every cardType, every workflowState, hierarchy, sprint spread ──
  type CardSpec = {
    key: string; title: string; description?: string; column: string;
    workflowState: string; cardType: string; priority: string;
    storyPoints?: number | null; sprintKey?: string; parentKey?: string;
  };
  const cardDefs: CardSpec[] = [
    // Epic parent (backlog, no points)
    { key: 'epic', title: 'Website Redesign', description: 'Umbrella epic for the Acme site rebuild.', column: 'Backlog', workflowState: 'todo', cardType: 'epic', priority: 'high', storyPoints: null },
    // Sprint 1 (completed / done)
    { key: 'tokens', title: 'Design tokens & Tailwind theme', column: 'Done', workflowState: 'done', cardType: 'story', priority: 'high', storyPoints: 5, sprintKey: 's1', parentKey: 'epic' },
    { key: 'auth', title: 'Auth flow (NextAuth)', column: 'Done', workflowState: 'done', cardType: 'story', priority: 'urgent', storyPoints: 8, sprintKey: 's1', parentKey: 'epic' },
    { key: 'shell', title: 'Base layout & nav shell', column: 'Done', workflowState: 'done', cardType: 'task', priority: 'medium', storyPoints: 3, sprintKey: 's1' },
    // Sprint 2 (completed / done)
    { key: 'hero', title: 'Home page hero + sections', column: 'Done', workflowState: 'done', cardType: 'story', priority: 'high', storyPoints: 8, sprintKey: 's2', parentKey: 'epic' },
    { key: 'about', title: 'About page', column: 'Done', workflowState: 'done', cardType: 'story', priority: 'medium', storyPoints: 3, sprintKey: 's2', parentKey: 'epic' },
    { key: 'shift', title: 'Fix layout shift on hero image', column: 'Done', workflowState: 'done', cardType: 'bug', priority: 'high', storyPoints: 2, sprintKey: 's2' },
    // Sprint 3 (active / mixed states)
    { key: 'catalog', title: 'Store product catalog page', column: 'In Progress', workflowState: 'in_progress', cardType: 'story', priority: 'high', storyPoints: 8, sprintKey: 's3', parentKey: 'epic' },
    { key: 'checkout', title: 'Checkout + Stripe integration', column: 'In Progress', workflowState: 'in_progress', cardType: 'story', priority: 'urgent', storyPoints: 13, sprintKey: 's3', parentKey: 'epic' },
    { key: 'rounding', title: 'Fix cart total rounding error', column: 'In Review', workflowState: 'in_review', cardType: 'bug', priority: 'high', storyPoints: 2, sprintKey: 's3' },
    { key: 'cart', title: 'Cart drawer component', column: 'Done', workflowState: 'done', cardType: 'task', priority: 'medium', storyPoints: 5, sprintKey: 's3' },
    { key: 'gallery', title: 'Product image gallery block', column: 'To Do', workflowState: 'todo', cardType: 'task', priority: 'low', storyPoints: 3, sprintKey: 's3' },
    { key: 'perms', title: 'Editor role permissions for CMS', column: 'To Do', workflowState: 'todo', cardType: 'spike', priority: 'medium', storyPoints: 3, sprintKey: 's3' },
    // Sprint 4 (planning / todo)
    { key: 'perf', title: 'Lighthouse performance pass', column: 'To Do', workflowState: 'todo', cardType: 'story', priority: 'medium', storyPoints: 5, sprintKey: 's4' },
    { key: 'seo', title: 'SEO metadata + sitemap', column: 'To Do', workflowState: 'todo', cardType: 'story', priority: 'medium', storyPoints: 3, sprintKey: 's4' },
    { key: 'a11y', title: 'Accessibility audit fixes', column: 'To Do', workflowState: 'todo', cardType: 'story', priority: 'high', storyPoints: 5, sprintKey: 's4' },
    // Backlog (unsprinted) + a canceled card
    { key: 'newsletter', title: 'Newsletter signup block', column: 'Backlog', workflowState: 'todo', cardType: 'story', priority: 'low', storyPoints: 3 },
    { key: 'chat', title: 'Live chat widget integration', column: 'Backlog', workflowState: 'todo', cardType: 'story', priority: 'low', storyPoints: 5 },
    { key: 'i18n', title: 'Multi-language support', description: 'Stretch epic — deferred.', column: 'Backlog', workflowState: 'todo', cardType: 'epic', priority: 'low', storyPoints: null },
    { key: 'ie11', title: 'Legacy IE11 support', description: 'Dropped — out of scope.', column: 'Backlog', workflowState: 'canceled', cardType: 'task', priority: 'low', storyPoints: 2 },
  ];

  const cardId: Record<string, number> = {};
  let cardNo = 0;
  // First pass: insert cards without parent links so parents exist for the update pass.
  for (const c of cardDefs) {
    const [row] = await db.insert(kanbanCards).values({
      columnId: col[c.column], projectId, number: ++cardNo,
      title: c.title, description: c.description ?? null,
      priority: c.priority, order: cardNo,
      sprintId: c.sprintKey ? sprint[c.sprintKey] : null,
      storyPoints: c.storyPoints ?? null, cardType: c.cardType,
      workflowState: c.workflowState, createdBy: owner,
    }).returning({ id: kanbanCards.id });
    cardId[c.key] = row.id;
  }
  // Second pass: wire epic → child hierarchy (parentCardId has no FK; set by convention).
  for (const c of cardDefs) {
    if (c.parentKey) {
      await db.update(kanbanCards).set({ parentCardId: cardId[c.parentKey] }).where(eq(kanbanCards.id, cardId[c.key]));
    }
  }
  console.log(`Created ${cardDefs.length} cards.`);

  // ── Sprint scope history → powers velocity + burndown reports ──
  // For each sprint with real dates: sprint_started, then per-card added (at start)
  // and completed (at end, for done cards). Charts replay these events.
  const cardBySprint = (key: string) => cardDefs.filter((c) => c.sprintKey === key);
  for (const s of sprintDefs) {
    const start = sprintStart[s.key];
    if (!start) continue; // planning sprint has no history yet
    await db.insert(sprintScopeHistory).values({
      sprintId: sprint[s.key], cardId: null, action: 'sprint_started', points: null, occurredAt: start, occurredBy: owner,
    });
    for (const c of cardBySprint(s.key)) {
      await db.insert(sprintScopeHistory).values({
        sprintId: sprint[s.key], cardId: cardId[c.key], action: 'added', points: c.storyPoints ?? null, occurredAt: start, occurredBy: owner,
      });
    }
    const end = sprintEnd[s.key] ?? now;
    for (const c of cardBySprint(s.key)) {
      if (c.workflowState === 'done') {
        await db.insert(sprintScopeHistory).values({
          sprintId: sprint[s.key], cardId: cardId[c.key], action: 'completed', points: c.storyPoints ?? null,
          occurredAt: new Date(Math.min(end.getTime(), now.getTime())), occurredBy: owner,
        });
      }
    }
  }

  // ── Sprint retro on a completed sprint (+ items, one promoted to a card) ──
  const [retro] = await db.insert(sprintRetros).values({
    sprintId: sprint['s2'], status: 'closed', createdBy: owner,
  }).returning({ id: sprintRetros.id });
  await db.insert(sprintRetroItems).values([
    { retroId: retro.id, kind: 'went_well', text: 'Design system paid off — pages came together fast.', votes: 4, authorUserId: u(0) },
    { retroId: retro.id, kind: 'went_poorly', text: 'Hero layout shift slipped past review.', votes: 2, authorUserId: u(1) },
    { retroId: retro.id, kind: 'action_item', text: 'Add CLS budget to the perf pass.', votes: 3, authorUserId: u(2), promotedCardId: cardId['perf'] },
  ]);

  // ── Labels + assignments ──
  const labelDefs = [
    { name: 'Frontend', color: '#3b82f6' }, { name: 'Backend', color: '#8b5cf6' },
    { name: 'Design', color: '#ec4899' }, { name: 'Bug', color: '#ef4444' }, { name: 'Tech Debt', color: '#f59e0b' },
  ];
  const label: Record<string, number> = {};
  for (const l of labelDefs) {
    const [row] = await db.insert(kanbanLabels).values({ projectId, name: l.name, color: l.color }).returning({ id: kanbanLabels.id });
    label[l.name] = row.id;
  }
  const labelLinks: Array<[string, string[]]> = [
    ['tokens', ['Design', 'Frontend']], ['auth', ['Backend']], ['hero', ['Frontend', 'Design']],
    ['catalog', ['Frontend', 'Backend']], ['checkout', ['Backend']], ['rounding', ['Bug', 'Backend']],
    ['shift', ['Bug', 'Frontend']], ['perms', ['Backend', 'Tech Debt']],
  ];
  for (const [ck, names] of labelLinks) {
    for (const n of names) await db.insert(kanbanCardLabels).values({ cardId: cardId[ck], labelId: label[n] });
  }

  // ── Assignees + watchers (member interaction) ──
  const assign: Array<[string, number[]]> = [
    ['catalog', [u(1), u(2)]], ['checkout', [u(1)]], ['rounding', [u(2)]], ['gallery', [u(3)]],
    ['perms', [u(0)]], ['perf', [u(1)]], ['a11y', [u(2)]], ['hero', [u(0), u(1)]],
  ];
  for (const [ck, uids] of assign) {
    for (const uid of [...new Set(uids)]) await db.insert(kanbanCardAssignees).values({ cardId: cardId[ck], userId: uid });
  }
  for (const [ck, uid] of [['checkout', u(0)], ['catalog', u(0)]] as Array<[string, number]>) {
    await db.insert(kanbanCardWatchers).values({ cardId: cardId[ck], userId: uid });
  }

  // ── Comments (+ a mention) ──
  await db.insert(kanbanCardComments).values([
    { cardId: cardId['checkout'], userId: u(0), body: 'Stripe test keys are wired — need the webhook secret in env before we can flip to live.', mentions: [u(1)] },
    { cardId: cardId['checkout'], userId: u(1), body: 'On it. Webhook handler is stubbed on the `commerce` branch.', mentions: [] },
    { cardId: cardId['rounding'], userId: u(2), body: 'Root cause: float math on line totals. Switching to integer cents.', mentions: [] },
    { cardId: cardId['catalog'], userId: u(1), body: 'Filtering + pagination done; empty-state design still TBD.', mentions: [u(2)] },
  ]);

  // ── Checklist items (mixed complete/incomplete → progress bars) ──
  const checklists: Array<[string, Array<[string, boolean]>]> = [
    ['checkout', [['Cart → order mapping', true], ['Stripe PaymentIntent', true], ['Webhook: payment_succeeded', false], ['Order confirmation email', false]]],
    ['catalog', [['Grid + card layout', true], ['Category filter', true], ['Sort control', false]]],
    ['a11y', [['Run axe on all pages', false], ['Fix color-contrast fails', false], ['Keyboard nav pass', false]]],
  ];
  for (const [ck, items] of checklists) {
    let o = 0;
    for (const [text, done] of items) {
      await db.insert(kanbanCardChecklistItems).values({
        cardId: cardId[ck], text, completed: done, order: o++,
        createdBy: owner, completedBy: done ? u(1) : null, completedAt: done ? daysAgo(3) : null,
      });
    }
  }

  // ── Dependencies / blockers (same table, queried both ways) ──
  await db.insert(kanbanCardDependencies).values([
    { blockedCardId: cardId['checkout'], blockerCardId: cardId['catalog'] }, // checkout waits on catalog
    { blockedCardId: cardId['rounding'], blockerCardId: cardId['cart'] },
    { blockedCardId: cardId['perf'], blockerCardId: cardId['catalog'] },
  ]);

  // ── Time logs (across members) ──
  await db.insert(kanbanCardTimeLogs).values([
    { cardId: cardId['auth'], userId: u(1), minutes: 240, note: 'NextAuth provider config + callbacks', loggedAt: daysAgo(30) },
    { cardId: cardId['hero'], userId: u(0), minutes: 180, note: 'Hero + sections', loggedAt: daysAgo(20) },
    { cardId: cardId['checkout'], userId: u(1), minutes: 420, note: 'Stripe integration WIP', loggedAt: daysAgo(4) },
    { cardId: cardId['checkout'], userId: u(2), minutes: 90, note: 'Pairing on webhook handler', loggedAt: daysAgo(2) },
    { cardId: cardId['rounding'], userId: u(2), minutes: 75, note: 'Repro + fix', loggedAt: daysAgo(1) },
  ]);

  // ── Card files (attachment) ──
  await db.insert(kanbanCardFiles).values({
    cardId: cardId['hero'], projectId, userId: owner,
    originalName: 'hero-spec.pdf', storedFilename: 'demo/hero-spec.pdf',
    mimeType: 'application/pdf', fileSize: 248_000, url: '/uploads/demo/hero-spec.pdf',
  });

  // ── Card artifacts + project artifacts (light cross-links) ──
  // Prefer linking a real post if one exists; always safe-fallback to the project itself.
  const [somePost] = await db.select({ id: posts.id }).from(posts).limit(1);
  if (somePost) {
    await db.insert(kanbanCardArtifacts).values({
      cardId: cardId['hero'], artifactType: 'post', artifactId: somePost.id,
      displayTitle: 'Related blog post', pinned: true, createdBy: owner,
    });
    await db.insert(projectArtifacts).values({
      projectId, artifactType: 'post', artifactId: somePost.id,
      displayTitle: 'Launch announcement draft', pinned: false, createdBy: owner,
    });
  }
  // A self-referential 'project' link is always valid and exercises the card→project artifact type.
  await db.insert(kanbanCardArtifacts).values({
    cardId: cardId['epic'], artifactType: 'project', artifactId: projectId,
    displayTitle: 'This project', pinned: false, createdBy: owner,
  });

  // ── Card templates (project-scoped so they cascade on teardown) ──
  const [bugTemplate] = await db.insert(cardTemplates).values({
    clientId: client.id, projectId, name: 'Bug report',
    description: 'Standard bug intake with repro checklist.',
    payload: {
      titlePattern: 'Bug: ', cardType: 'bug', priority: 'high', workflowState: 'todo',
      labelIds: [label['Bug']],
      checklist: [{ text: 'Steps to reproduce', order: 0 }, { text: 'Expected vs actual', order: 1 }, { text: 'Environment', order: 2 }],
    },
    createdBy: owner,
  }).returning({ id: cardTemplates.id });
  await db.insert(cardTemplates).values({
    clientId: client.id, projectId, name: 'Weekly status',
    description: 'Recurring status note.',
    payload: { titlePattern: 'Status — ', cardType: 'task', priority: 'low', workflowState: 'todo' },
    createdBy: owner,
  });

  // ── Recurrence (weekly, seeded from the bug template's column) ──
  await db.insert(cardRecurrences).values({
    projectId, columnId: col['To Do'], templateId: bugTemplate.id,
    titlePattern: 'Weekly triage — {{date}}', description: 'Auto-created weekly triage card.',
    cadence: 'weekly', dayOfWeek: 1, hourUtc: 9, active: true, nextFireAt: daysAhead(1), createdBy: owner,
  });

  // ── Custom fields + values ──
  const [fComponent] = await db.insert(projectCustomFields).values({
    projectId, key: 'component', name: 'Component', kind: 'select', required: false,
    options: ['Web', 'API', 'Design', 'Infra'], order: 0, createdBy: owner,
  }).returning({ id: projectCustomFields.id });
  const [fHours] = await db.insert(projectCustomFields).values({
    projectId, key: 'est_hours', name: 'Est. Hours', kind: 'number', required: false, options: [], order: 1, createdBy: owner,
  }).returning({ id: projectCustomFields.id });
  await db.insert(cardCustomFieldValues).values([
    { cardId: cardId['checkout'], fieldId: fComponent.id, value: 'API' },
    { cardId: cardId['checkout'], fieldId: fHours.id, value: 24 },
    { cardId: cardId['hero'], fieldId: fComponent.id, value: 'Web' },
  ]);

  // ── Goals / OKRs ──
  await db.insert(projectGoals).values([
    { projectId, title: 'Launch Acme site', description: 'Ship all four sprints.', unitLabel: 'sprints', currentValue: 2, targetValue: 4, targetDate: daysAhead(21), status: 'active', createdBy: owner },
    { projectId, title: 'Lighthouse ≥ 90', description: 'Perf/a11y/SEO/best-practices.', unitLabel: '%', currentValue: 72, targetValue: 90, targetDate: daysAhead(14), status: 'active', createdBy: owner },
  ]);

  // ── Saved views (board + reports) ──
  await db.insert(projectSavedViews).values([
    { projectId, userId: null, scope: 'board', name: 'My open bugs', filterJson: { cardType: 'bug', workflowState: ['todo', 'in_progress'] }, isDefault: false, createdBy: owner },
    { projectId, userId: null, scope: 'reports', name: 'Velocity (last 3 sprints)', filterJson: { window: 3 }, isDefault: true, createdBy: owner },
    { projectId, userId: owner, scope: 'backlog', name: 'Sized only', filterJson: { sizedOnly: true }, isDefault: false, createdBy: owner },
  ]);

  // ── Notifications (inbox) ──
  await db.insert(notifications).values([
    { userId: u(1), kind: 'comment.mention', cardId: cardId['checkout'], projectId, actorUserId: u(0), title: 'You were mentioned', body: 'on “Checkout + Stripe integration”' },
    { userId: u(2), kind: 'card.assigned', cardId: cardId['rounding'], projectId, actorUserId: u(0), title: 'Assigned to you', body: '“Fix cart total rounding error”' },
  ]);

  // ── Activity log ──
  await db.insert(kanbanCardActivities).values([
    { cardId: cardId['checkout'], userId: u(0), type: 'card.created', payload: {} },
    { cardId: cardId['checkout'], userId: u(1), type: 'card.moved', payload: { from: 'To Do', to: 'In Progress' } },
    { cardId: cardId['rounding'], userId: u(2), type: 'card.moved', payload: { from: 'In Progress', to: 'In Review' } },
  ]);

  console.log(`\nDemo project ready → /portal/projects/${projectId}`);
  console.log(`  ${cardDefs.length} cards · ${sprintDefs.length} sprints · ${labelDefs.length} labels · ${people.length} members pool`);
  console.log(`  Reports have data (scope history on ${sprintDefs.filter((s) => s.startDate).length} sprints); snapshot date ${ymd(now)}.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
