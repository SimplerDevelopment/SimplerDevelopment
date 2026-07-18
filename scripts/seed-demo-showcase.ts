/**
 * Demo Showcase Seeder
 *
 * Inserts clean, professional demo records into the local test database for
 * marketing screenshots. Targets client_id = 1.
 *
 * Run:
 *   DATABASE_URL=postgresql://postgres@localhost:5432/simplerdev_test bunx tsx scripts/seed-demo-showcase.ts
 *
 * Idempotent: checks for existing seed markers before inserting. Safe to run twice.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { randomBytes } from 'crypto';

async function main() {
  const { db } = await import('../lib/db');
  const {
    emailLists,
    emailCampaigns,
    projects,
    kanbanColumns,
    kanbanCards,
    crmContracts,
    brainNotes,
    supportTickets,
    ticketMessages,
    surveys,
    users,
  } = await import('../lib/db/schema');
  const { eq, and, desc } = await import('drizzle-orm');

  const CLIENT_ID = 1;
  const now = new Date();

  // ── IDEMPOTENCY CHECKS ────────────────────────────────────────────────────

  const [existingCampaign] = await db
    .select({ id: emailCampaigns.id })
    .from(emailCampaigns)
    .where(
      and(
        eq(emailCampaigns.name, 'Spring Product Launch'),
        eq(emailCampaigns.clientId, CLIENT_ID),
      ),
    )
    .limit(1);

  const [existingProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.name, 'Website Redesign'),
        eq(projects.clientId, CLIENT_ID),
      ),
    )
    .limit(1);

  const [existingContract] = await db
    .select({ id: crmContracts.id })
    .from(crmContracts)
    .where(
      and(
        eq(crmContracts.title, 'Acme × Northwind — Master Service Agreement'),
        eq(crmContracts.clientId, CLIENT_ID),
      ),
    )
    .limit(1);

  const [existingNote] = await db
    .select({ id: brainNotes.id })
    .from(brainNotes)
    .where(
      and(
        eq(brainNotes.title, 'Employee Onboarding Guide'),
        eq(brainNotes.clientId, CLIENT_ID),
      ),
    )
    .limit(1);

  const [existingTicket] = await db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.subject, 'Login button unresponsive on mobile Safari'),
        eq(supportTickets.clientId, CLIENT_ID),
      ),
    )
    .limit(1);

  const [existingSurvey] = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(
      and(
        eq(surveys.title, 'Customer Satisfaction — Q2 2026'),
        eq(surveys.clientId, CLIENT_ID),
      ),
    )
    .limit(1);

  if (existingCampaign && existingProject && existingContract && existingNote && existingTicket && existingSurvey) {
    console.log('ALREADY SEEDED — skipping (idempotent)');
    process.exit(0);
  }

  const campaignIds: number[] = [];
  let projectId: number | null = null;
  const contractIds: number[] = [];

  // ── EMAIL LIST (resolve or create) ────────────────────────────────────────

  let listId: number;
  const [existingList] = await db
    .select({ id: emailLists.id })
    .from(emailLists)
    .where(eq(emailLists.clientId, CLIENT_ID))
    .limit(1);

  if (existingList) {
    listId = existingList.id;
  } else {
    const [newList] = await db
      .insert(emailLists)
      .values({
        name: 'Newsletter Subscribers',
        description: 'Main newsletter list for Acme',
        clientId: CLIENT_ID,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: emailLists.id });
    listId = newList.id;
  }

  // ── EMAIL CAMPAIGNS ───────────────────────────────────────────────────────

  if (!existingCampaign) {
    const campaignData = [
      {
        name: 'Spring Product Launch',
        subject: 'Meet the new Spring collection ✨',
        fromName: 'Acme Team',
        fromEmail: 'hello@acmecorp.com',
        status: 'sent' as const,
        totalRecipients: 2847,
        totalSent: 2847,
        totalOpened: 1138,
        totalClicked: 284,
        totalBounced: 12,
        totalUnsubscribed: 3,
        sentAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
      {
        name: 'June Newsletter',
        subject: 'Your June update from Acme',
        fromName: 'Acme Team',
        fromEmail: 'hello@acmecorp.com',
        status: 'draft' as const,
        totalRecipients: 0,
        totalSent: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalUnsubscribed: 0,
        sentAt: null,
      },
      {
        name: 'Welcome Series — Day 1',
        subject: 'Welcome to Acme 👋',
        fromName: 'Acme Team',
        fromEmail: 'hello@acmecorp.com',
        status: 'scheduled' as const,
        totalRecipients: 0,
        totalSent: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalUnsubscribed: 0,
        sentAt: null,
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    ];

    for (const campaign of campaignData) {
      const [row] = await db
        .insert(emailCampaigns)
        .values({
          name: campaign.name,
          subject: campaign.subject,
          fromName: campaign.fromName,
          fromEmail: campaign.fromEmail,
          listId,
          clientId: CLIENT_ID,
          htmlContent: `<p>${campaign.subject}</p>`,
          status: campaign.status,
          totalRecipients: campaign.totalRecipients,
          totalSent: campaign.totalSent,
          totalOpened: campaign.totalOpened,
          totalClicked: campaign.totalClicked,
          totalBounced: campaign.totalBounced,
          totalUnsubscribed: campaign.totalUnsubscribed,
          sentAt: campaign.sentAt ?? undefined,
          scheduledAt: (campaign as { scheduledAt?: Date }).scheduledAt ?? undefined,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: emailCampaigns.id });
      campaignIds.push(row.id);
    }
  }

  // ── PROJECT + KANBAN ──────────────────────────────────────────────────────

  if (!existingProject) {
    const [project] = await db
      .insert(projects)
      .values({
        name: 'Website Redesign',
        description:
          'Full redesign of the Acme corporate website — new homepage hero, rebuilt checkout, CMS migration, and GA4 analytics. Target launch: Q3 2026.',
        clientId: CLIENT_ID,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: projects.id });
    projectId = project.id;

    // Columns
    const columnDefs = [
      { name: 'Backlog', order: 0, isDone: false },
      { name: 'In Progress', order: 1, isDone: false },
      { name: 'In Review', order: 2, isDone: false },
      { name: 'Done', order: 3, isDone: true },
    ];

    const columnIds: Record<string, number> = {};
    for (const col of columnDefs) {
      const [colRow] = await db
        .insert(kanbanColumns)
        .values({
          projectId,
          name: col.name,
          order: col.order,
          isDone: col.isDone,
          createdAt: now,
        })
        .returning({ id: kanbanColumns.id });
      columnIds[col.name] = colRow.id;
    }

    // Cards
    const cards = [
      { title: 'Design new homepage hero', priority: 'high', column: 'In Progress', order: 0 },
      { title: 'Audit current site performance', priority: 'medium', column: 'Backlog', order: 0 },
      { title: 'Write launch announcement post', priority: 'low', column: 'Backlog', order: 1 },
      { title: 'Rebuild checkout flow', priority: 'high', column: 'In Review', order: 0 },
      { title: 'Set up GA4 + conversion events', priority: 'medium', column: 'In Progress', order: 1 },
      { title: 'Migrate blog to the CMS', priority: 'medium', column: 'Backlog', order: 2 },
      { title: 'Mobile nav redesign', priority: 'high', column: 'In Review', order: 1 },
      { title: 'Accessibility pass (WCAG AA)', priority: 'medium', column: 'In Progress', order: 2 },
      { title: 'Wire up contact form', priority: 'low', column: 'Done', order: 0 },
      { title: 'Final QA + launch checklist', priority: 'high', column: 'Backlog', order: 3 },
    ];

    for (const card of cards) {
      await db.insert(kanbanCards).values({
        projectId,
        columnId: columnIds[card.column],
        title: card.title,
        priority: card.priority,
        order: card.order,
        workflowState:
          card.column === 'Done'
            ? 'done'
            : card.column === 'In Review'
              ? 'in_review'
              : card.column === 'In Progress'
                ? 'in_progress'
                : 'todo',
        createdAt: now,
        updatedAt: now,
      });
    }
  } else {
    projectId = existingProject.id;
  }

  // ── CONTRACTS ─────────────────────────────────────────────────────────────

  if (!existingContract) {
    const contractDefs = [
      {
        title: 'Acme × Northwind — Master Service Agreement',
        summary:
          'Governs the ongoing services relationship between Acme Corp and Northwind Consulting, including scope, IP ownership, and liability caps.',
        status: 'sent' as const,
        sentAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        title: 'Website Maintenance Retainer — 2026',
        summary:
          'Monthly retainer for ongoing website maintenance, performance monitoring, and content updates. 10 hours/month, billed first of each month.',
        status: 'draft' as const,
        sentAt: null,
      },
    ];

    for (const contract of contractDefs) {
      const clientToken = randomBytes(32).toString('hex');
      const [row] = await db
        .insert(crmContracts)
        .values({
          clientId: CLIENT_ID,
          title: contract.title,
          summary: contract.summary,
          status: contract.status,
          clientToken,
          sentAt: contract.sentAt ?? undefined,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: crmContracts.id });
      contractIds.push(row.id);
    }
  }

  // ── BRAIN NOTES ───────────────────────────────────────────────────────────

  const noteIds: number[] = [];

  if (existingNote) {
    console.log('NOTES ALREADY SEEDED — skipping (idempotent)');
  } else {
    const noteDefs = [
      {
        title: 'Employee Onboarding Guide',
        body: `Welcome to the team! During your first week, complete the following checklist:
1. Set up your company email, Slack, and 1Password accounts.
2. Request access to GitHub, Notion, and the project management board from IT.
3. Schedule a 30-minute intro call with your manager, your skip-level, and at least two teammates.
4. Review the company handbook and sign the required policies in BambooHR.
5. Join the #general, #engineering, and your team's channel in Slack.
Reach out to hr@acmecorp.com with any questions.`,
        tags: ['onboarding', 'hr', 'process'],
        status: 'canonical' as const,
      },
      {
        title: 'Brand Voice & Messaging',
        body: `**Tone:** Confident, warm, and jargon-free. We write like a knowledgeable friend, not a corporate memo.

**Do:** Use plain language, active voice, and specific numbers. Lead with the benefit.
**Don't:** Use buzzwords ("synergy", "leverage", "disruptive"), passive voice, or filler phrases like "in order to."

**Tagline:** *Simpler by design.*

**Core messages:**
- We make complexity disappear — our products are powerful without being complicated.
- We're built for real businesses, not enterprise edge cases.
- Speed matters: setup in minutes, value from day one.`,
        tags: ['brand', 'marketing', 'messaging'],
        status: 'canonical' as const,
      },
      {
        title: 'Q3 Company Goals',
        body: `**Q3 2026 Objectives**

1. **Grow ARR to $2.4M** (Owner: Sarah Chen, VP Sales)
   Target: 35 new customers at an average ACV of $18k. Track weekly in the CRM pipeline review.

2. **Launch the mobile app to GA** (Owner: Marcus Rivera, Head of Product)
   Target: ship iOS + Android by August 15 with a 4.3+ App Store rating within 30 days of launch.

3. **Reduce support ticket first-response time to under 2 hours** (Owner: Priya Nair, Head of Support)
   Target: 90% of tickets answered in <2h by end of Q3, measured in Intercom weekly reports.`,
        tags: ['goals', 'q3', 'okr'],
        status: 'canonical' as const,
      },
      {
        title: 'Incident Response Playbook',
        body: `**Severity Levels**
- **SEV-1 (Critical):** Full outage or data loss. Engage immediately, 24/7.
- **SEV-2 (High):** Major feature broken for all users. Business-hours response within 30 min.
- **SEV-3 (Medium):** Degraded performance or partial outage. Response within 2 hours.
- **SEV-4 (Low):** Minor issue, workaround available. Response within next business day.

**On-Call Rotation:** Managed in PagerDuty. Primary: on-call engineer. Secondary: engineering manager.

**Communications Steps:**
1. Acknowledge the alert in PagerDuty within 5 minutes.
2. Post a status update in #incidents on Slack with severity, scope, and ETA.
3. For SEV-1/SEV-2, notify the Head of Engineering and update status.acmecorp.com within 10 minutes.
4. Post a postmortem in Notion within 48 hours of resolution.`,
        tags: ['incident', 'ops', 'playbook'],
        status: 'canonical' as const,
      },
    ];

    for (const note of noteDefs) {
      const [row] = await db
        .insert(brainNotes)
        .values({
          clientId: CLIENT_ID,
          title: note.title,
          body: note.body,
          tags: note.tags,
          confidentialityLevel: 'standard',
          pinned: false,
          status: note.status,
          source: 'manual',
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: brainNotes.id });
      noteIds.push(row.id);
    }

    console.log(`SEEDED_NOTES note_ids=${noteIds.join(',')}`);
  }

  // ── SUPPORT TICKETS ─────────────────────────────────────────────────────────

  const ticketIds: number[] = [];

  if (existingTicket) {
    console.log('TICKETS ALREADY SEEDED — skipping (idempotent)');
  } else {
    // Compute next ticket number (per-tenant sequential, matching app convention)
    const [lastTicket] = await db
      .select({ number: supportTickets.number })
      .from(supportTickets)
      .where(eq(supportTickets.clientId, CLIENT_ID))
      .orderBy(desc(supportTickets.number))
      .limit(1);
    let nextNumber = (lastTicket?.number ?? 0) + 1;

    // Ticket messages require a valid user FK — find any user in the DB
    const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);

    const ticketDefs = [
      {
        subject: 'Login button unresponsive on mobile Safari',
        status: 'open',
        priority: 'high',
        category: 'technical',
        body: 'Hi team — the login button on my iPhone (Safari 17.4) is completely unresponsive. I tap it and nothing happens. The issue started this morning; I can log in fine on desktop Chrome. I need access for a client meeting later today — please help urgently.',
      },
      {
        subject: 'Feature request: CSV export for analytics',
        status: 'open',
        priority: 'low',
        category: 'general',
        body: "Would love the ability to export the analytics dashboard data as a CSV so I can pull it into our internal reporting tool. Right now I have to copy-paste numbers manually each week — a one-click export would save a lot of time. Happy to test a beta if you build it!",
      },
      {
        subject: "Question about the Scale plan's BYOK limits",
        status: 'waiting_on_customer',
        priority: 'medium',
        category: 'billing',
        body: "I'm considering upgrading to the Scale plan and want to understand the BYOK (Bring Your Own Key) setup. Specifically: (1) Can one Anthropic key be shared across multiple projects? (2) Is there a platform-level rate-limit on AI calls proxied through the system? (3) Does the key get cached, or is it fetched fresh on every request? Thanks in advance.",
      },
      {
        subject: 'How do I connect a custom domain?',
        status: 'resolved',
        priority: 'medium',
        category: 'domain',
        resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        body: "I want to point my domain (acmecorp.com) at my client website on the platform. I've added the site but I can't find the DNS instructions. Can you walk me through the exact records I need to set?",
        replyBody: "Great news — you just need to add a CNAME record pointing `www` to `sites.simplerdevelopment.com` and an A record for the apex (`@`) pointing to our anycast IP `76.76.21.21`. Changes typically propagate within 30 minutes. Let us know if you hit any issues!",
      },
    ];

    for (const def of ticketDefs) {
      const [ticket] = await db
        .insert(supportTickets)
        .values({
          number: nextNumber++,
          clientId: CLIENT_ID,
          subject: def.subject,
          status: def.status,
          priority: def.priority,
          category: def.category,
          resolvedAt: (def as { resolvedAt?: Date }).resolvedAt ?? undefined,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: supportTickets.id });

      ticketIds.push(ticket.id);

      // Add the opening message — only if a real user exists to satisfy the NOT NULL authorId FK
      if (anyUser) {
        await db.insert(ticketMessages).values({
          ticketId: ticket.id,
          authorId: anyUser.id,
          body: def.body,
          isInternal: false,
          createdAt: now,
        });

        // For the resolved ticket, also insert the staff reply message
        if ((def as { replyBody?: string }).replyBody) {
          await db.insert(ticketMessages).values({
            ticketId: ticket.id,
            authorId: anyUser.id,
            body: (def as { replyBody?: string }).replyBody!,
            isInternal: false,
            createdAt: new Date(now.getTime() + 60 * 1000),
          });
        }
      }
    }

    console.log(`SEEDED_TICKETS ticket_ids=${ticketIds.join(',')}`);
  }

  // ── SURVEYS ──────────────────────────────────────────────────────────────────
  // Note: surveys.status valid values are 'draft', 'active', 'closed' (per schema comment).
  // The task specified "published" which is not a valid enum member — 'active' is used instead.
  // No child survey_questions table exists; questions are stored as JSON in the fields column.

  const surveyIds: number[] = [];

  if (existingSurvey) {
    console.log('SURVEYS ALREADY SEEDED — skipping (idempotent)');
  } else {
    const surveyDefs = [
      {
        title: 'Customer Satisfaction — Q2 2026',
        slug: 'acme-csat-q2-2026',
        description: 'A short survey to gauge overall satisfaction with our service in Q2 2026. Results are reviewed monthly by the Customer Success team.',
        status: 'active', // 'published' is not a valid value; closest real enum member is 'active'
      },
      {
        title: 'Product Feedback: New Dashboard',
        slug: 'acme-product-feedback-dashboard-2026',
        description: 'Help us improve the new analytics dashboard by sharing what\'s working, what\'s confusing, and what you\'d like to see added.',
        status: 'active',
      },
      {
        title: 'Onboarding Experience Survey',
        slug: 'acme-onboarding-experience-2026',
        description: 'Tell us how your onboarding went. We use this feedback to improve the setup experience for every new client.',
        status: 'draft',
      },
    ];

    for (const def of surveyDefs) {
      const [survey] = await db
        .insert(surveys)
        .values({
          clientId: CLIENT_ID,
          title: def.title,
          slug: def.slug,
          description: def.description,
          status: def.status,
          fields: [],
          pages: [{ title: 'Page 1' }],
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: surveys.id });

      surveyIds.push(survey.id);
    }

    console.log(`SEEDED_SURVEYS survey_ids=${surveyIds.join(',')}`);
  }

  console.log(
    `SEEDED project_id=${projectId} campaign_ids=${campaignIds.join(',')} contract_ids=${contractIds.join(',')}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
