import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import crypto from 'crypto';

dotenv.config({ path: '.env' });

const ts = Date.now();

function randomToken(len = 64): string {
  return crypto.randomBytes(len / 2).toString('hex');
}

async function seedAdminE2E() {
  try {
    const { db } = await import('../lib/db');
    const {
      users,
      clients,
      // CRM
      crmCompanies,
      crmContacts,
      crmPipelines,
      crmPipelineStages,
      crmDeals,
      crmActivities,
      crmProposals,
      crmContracts,
      crmContractSigners,
      // Subscriptions
      services,
      clientServices,
      // AI Credits
      aiCreditBalances,
      aiCreditLedger,
      aiCreditPackages,
      // Automation
      automationRules,
      automationLogs,
      // Bookings
      bookingPages,
      bookings,
      // Membership (portal active-client resolution)
      clientMembers,
      // Onboarding completion (portal redirect gate)
      userOnboarding,
      // Brain
      brainProfiles,
    } = await import('../lib/db/schema');
    const { eq, and } = await import('drizzle-orm');
    const { getOrCreatePublishingProject } = await import('../lib/publishing/bootstrap');

    // ── Find or create client ──────────────────────────────────────────────────

    const clientEmail = 'client@example.com';
    const clientPassword = 'client123';
    const hashedPassword = await hash(clientPassword, 10);

    const existingUser = await db.select().from(users).where(eq(users.email, clientEmail)).limit(1);
    const [user] = existingUser.length > 0
      ? existingUser
      : await db.insert(users).values({
          name: 'Jane Smith',
          email: clientEmail,
          password: hashedPassword,
          role: 'client',
          active: true,
        }).returning();
    console.log('User ready:', user.id);

    const existingClient = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
    const [client] = existingClient.length > 0
      ? existingClient
      : await db.insert(clients).values({
          userId: user.id,
          company: 'Acme Corp',
          phone: '(555) 123-4567',
          website: 'https://acmecorp.example.com',
          notes: 'Demo client account for portal testing',
        }).returning();
    console.log('Client ready:', client.id);

    const clientId = client.id;

    // ── Admin user + portal client context ──────────────────────────────────────
    // The e2e fixtures' `adminApi` signs in as admin@example.com and hits
    // /api/portal/* routes, which resolve the active client via team membership
    // or ownership (lib/portal-client.ts → getPortalClients). A bare admin user
    // has neither, so every adminApi portal call 404s ("Client not found").
    // Provision the admin user here (test.sh only runs THIS seed for e2e) and
    // make it an admin member of the demo client so the active-client resolver
    // returns clientId for adminApi without needing the sd-active-client cookie.
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
    const [adminUser] = existingAdmin.length > 0
      ? existingAdmin
      : await db.insert(users).values({
          name: 'Admin User',
          email: adminEmail,
          password: await hash(adminPassword, 10),
          role: 'admin',
          active: true,
        }).returning();
    console.log('Admin user ready:', adminUser.id);

    // Idempotent membership wiring (unique index on clientId+userId).
    const existingMembership = await db
      .select()
      .from(clientMembers)
      .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, adminUser.id)))
      .limit(1);
    if (existingMembership.length === 0) {
      await db.insert(clientMembers).values({
        clientId,
        userId: adminUser.id,
        // 'owner' so adminApi can exercise owner-gated flows (team invites,
        // publishing manage_campaigns) — the demo client's underlying owner is
        // the client user, but e2e drives these as the admin/owner persona.
        role: 'owner',
      });
    }

    // Bootstrap the Publishing project (+ Idea/Draft/In Review/Scheduled/Published
    // columns) for the demo client. Idempotent (find-or-create). Unblocks the
    // publishing calendar/campaign specs and gives the kanban-card specs a
    // project with columns to resolve via getFirstColumnId.
    const publishingProject = await getOrCreatePublishingProject(clientId, adminUser.id);
    console.log('Publishing project ready:', publishingProject.id, `(${publishingProject.columns.length} columns)`);

    // Mark onboarding complete for the demo client so the portal behaves like a
    // settled tenant — an incomplete-onboarding user is redirected from
    // /portal/login (and most routes) to /portal/onboarding, which breaks the
    // route-smoke spec and anything asserting it lands on the dashboard.
    for (const onboardUserId of [user.id, adminUser.id]) {
      await db
        .insert(userOnboarding)
        .values({ userId: onboardUserId, clientId, step: 'done', completedAt: new Date() })
        .onConflictDoUpdate({
          target: userOnboarding.userId,
          set: { step: 'done', completedAt: new Date(), clientId },
        });
    }
    console.log('Onboarding marked complete for client + admin users');

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. CRM DATA
    // ═══════════════════════════════════════════════════════════════════════════

    // -- Companies --
    const [techVentures] = await db.insert(crmCompanies).values({
      clientId,
      name: 'TechVentures Inc',
      domain: 'techventures.io',
      industry: 'Technology',
      size: '51-200',
      phone: '(555) 200-1000',
      website: 'https://techventures.io',
      notes: 'Seed data for admin E2E tests',
    }).returning();

    const [greenLeaf] = await db.insert(crmCompanies).values({
      clientId,
      name: 'GreenLeaf Studios',
      domain: 'greenleafstudios.co',
      industry: 'Creative',
      size: '11-50',
      phone: '(555) 300-2000',
      website: 'https://greenleafstudios.co',
      notes: 'Seed data for admin E2E tests',
    }).returning();
    console.log('CRM companies created:', techVentures.id, greenLeaf.id);

    // -- Contacts (2 per company) --
    const [contact1] = await db.insert(crmContacts).values({
      clientId,
      companyId: techVentures.id,
      firstName: 'Alice',
      lastName: 'Chen',
      email: 'alice@techventures.io',
      phone: '(555) 200-1001',
      title: 'CTO',
      source: 'web',
      status: 'lead',
    }).returning();

    const [contact2] = await db.insert(crmContacts).values({
      clientId,
      companyId: techVentures.id,
      firstName: 'Bob',
      lastName: 'Martinez',
      email: 'bob@techventures.io',
      phone: '(555) 200-1002',
      title: 'VP Engineering',
      source: 'referral',
      status: 'active',
    }).returning();

    const [contact3] = await db.insert(crmContacts).values({
      clientId,
      companyId: greenLeaf.id,
      firstName: 'Carol',
      lastName: 'Davis',
      email: 'carol@greenleafstudios.co',
      phone: '(555) 300-2001',
      title: 'Creative Director',
      source: 'referral',
      status: 'customer',
    }).returning();

    const [contact4] = await db.insert(crmContacts).values({
      clientId,
      companyId: greenLeaf.id,
      firstName: 'Dave',
      lastName: 'Wilson',
      email: 'dave@greenleafstudios.co',
      phone: '(555) 300-2002',
      title: 'Project Manager',
      source: 'web',
      status: 'active',
    }).returning();
    console.log('CRM contacts created:', contact1.id, contact2.id, contact3.id, contact4.id);

    // -- Pipeline & Stages --
    const [pipeline] = await db.insert(crmPipelines).values({
      clientId,
      name: 'Sales Pipeline',
      isDefault: true,
    }).returning();

    const stageData = [
      { name: 'Lead', color: '#94a3b8', sortOrder: 0, probability: 10 },
      { name: 'Qualified', color: '#60a5fa', sortOrder: 1, probability: 30 },
      { name: 'Proposal', color: '#fbbf24', sortOrder: 2, probability: 60 },
      { name: 'Closing', color: '#34d399', sortOrder: 3, probability: 90 },
    ];

    const stages: Array<{ id: number; name: string }> = [];
    for (const s of stageData) {
      const [stage] = await db.insert(crmPipelineStages).values({
        pipelineId: pipeline.id,
        name: s.name,
        color: s.color,
        sortOrder: s.sortOrder,
        probability: s.probability,
      }).returning();
      stages.push(stage);
    }
    console.log('CRM pipeline created with', stages.length, 'stages');

    // -- Deals --
    const [deal1] = await db.insert(crmDeals).values({
      clientId,
      pipelineId: pipeline.id,
      stageId: stages[1].id, // Qualified
      contactId: contact1.id,
      companyId: techVentures.id,
      title: 'TechVentures Platform Build',
      value: 1500000, // $15,000 in cents
      status: 'open',
      priority: 'high',
      expectedCloseDate: new Date('2026-05-15'),
    }).returning();

    const [deal2] = await db.insert(crmDeals).values({
      clientId,
      pipelineId: pipeline.id,
      stageId: stages[3].id, // Closing
      contactId: contact3.id,
      companyId: greenLeaf.id,
      title: 'GreenLeaf Brand Refresh',
      value: 850000, // $8,500 in cents
      status: 'won',
      priority: 'medium',
      closedAt: new Date('2026-03-20'),
    }).returning();

    const [deal3] = await db.insert(crmDeals).values({
      clientId,
      pipelineId: pipeline.id,
      stageId: stages[2].id, // Proposal
      contactId: contact2.id,
      companyId: techVentures.id,
      title: 'TechVentures API Integration',
      value: 2200000, // $22,000 in cents
      status: 'open',
      priority: 'high',
      expectedCloseDate: new Date('2026-06-01'),
    }).returning();
    console.log('CRM deals created:', deal1.id, deal2.id, deal3.id);

    // -- Proposals --
    const [proposal1] = await db.insert(crmProposals).values({
      clientId,
      contactId: contact1.id,
      companyId: techVentures.id,
      dealId: deal1.id,
      title: 'Platform Build Proposal',
      summary: 'Full-stack web platform development for TechVentures Inc.',
      status: 'draft',
      sections: [
        { id: 'sec-1', type: 'heading', title: 'Project Overview' },
        { id: 'sec-2', type: 'text', content: 'We propose building a modern SaaS platform using Next.js, PostgreSQL, and Tailwind CSS.' },
        { id: 'sec-3', type: 'pricing', title: 'Pricing Breakdown' },
      ],
      lineItems: [
        { id: 'li-1', description: 'Discovery & Architecture', quantity: 1, unitPrice: 500000 },
        { id: 'li-2', description: 'Frontend Development', quantity: 1, unitPrice: 600000 },
        { id: 'li-3', description: 'Backend & API', quantity: 1, unitPrice: 400000 },
      ],
      fees: [],
      clientToken: randomToken(),
    }).returning();

    const [proposal2] = await db.insert(crmProposals).values({
      clientId,
      contactId: contact3.id,
      companyId: greenLeaf.id,
      dealId: deal2.id,
      title: 'Brand Refresh Proposal',
      summary: 'Complete brand identity refresh for GreenLeaf Studios.',
      status: 'sent',
      sentAt: new Date('2026-03-10'),
      sections: [
        { id: 'sec-1', type: 'heading', title: 'Scope of Work' },
        { id: 'sec-2', type: 'text', content: 'Logo redesign, brand guidelines, and website reskin.' },
      ],
      lineItems: [
        { id: 'li-1', description: 'Logo & Identity Design', quantity: 1, unitPrice: 350000 },
        { id: 'li-2', description: 'Brand Guidelines Document', quantity: 1, unitPrice: 200000 },
        { id: 'li-3', description: 'Website Reskin', quantity: 1, unitPrice: 300000 },
      ],
      fees: [
        { id: 'fee-1', label: 'Returning Client Discount', type: 'percent', amount: 500 }, // 5%
      ],
      clientToken: randomToken(),
    }).returning();
    console.log('CRM proposals created:', proposal1.id, proposal2.id);

    // -- Contract (skip if table doesn't exist) --
    try {
      const contractToken = randomToken();
      const [contract] = await db.insert(crmContracts).values({
        clientId,
        proposalId: proposal1.id,
        dealId: deal1.id,
        contactId: contact1.id,
        companyId: techVentures.id,
        title: 'TechVentures Platform — Service Agreement',
        summary: 'Master service agreement for the TechVentures platform build project.',
        status: 'draft',
        clauses: [
          { id: 'cl-1', title: 'Scope of Work', content: 'Simpler Development will deliver a full-stack web platform as described in the attached proposal.', required: true },
          { id: 'cl-2', title: 'Payment Terms', content: 'Payment due net-30 from invoice date. 50% deposit required before work begins.', required: true },
        ],
        clientToken: contractToken,
      }).returning();

      // -- Contract Signers --
      await db.insert(crmContractSigners).values([
        {
          contractId: contract.id,
          name: 'Alice Chen',
          email: 'alice@techventures.io',
          role: 'signer',
          order: 1,
          token: randomToken(),
        },
        {
          contractId: contract.id,
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'signer',
          order: 2,
          token: randomToken(),
        },
      ]);
      console.log('CRM contract created with 2 signers:', contract.id);
    } catch (e) {
      console.log('Skipping contracts (table may not exist):', (e as Error).message?.slice(0, 60));
    }

    // -- Activities --
    await db.insert(crmActivities).values([
      {
        clientId,
        contactId: contact1.id,
        dealId: deal1.id,
        companyId: techVentures.id,
        type: 'call',
        title: 'Discovery call with Alice Chen',
        description: 'Discussed platform requirements and timeline expectations.',
        completedAt: new Date('2026-03-15'),
      },
      {
        clientId,
        contactId: contact3.id,
        dealId: deal2.id,
        companyId: greenLeaf.id,
        type: 'email',
        title: 'Sent brand refresh proposal to Carol',
        description: 'Emailed the finalized brand refresh proposal for review.',
        completedAt: new Date('2026-03-10'),
      },
      {
        clientId,
        contactId: contact2.id,
        dealId: deal3.id,
        companyId: techVentures.id,
        type: 'meeting',
        title: 'API architecture review',
        description: 'In-person meeting to review proposed API architecture and integration points.',
        dueDate: new Date('2026-04-10'),
      },
    ]);
    console.log('CRM activities created: 3');

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. SUBSCRIPTION DATA
    // ═══════════════════════════════════════════════════════════════════════════

    // Find existing services by slug, or create them
    let maintenanceSvc = (await db.select().from(services).where(eq(services.slug, 'monthly-maintenance')).limit(1))[0];
    if (!maintenanceSvc) {
      [maintenanceSvc] = await db.insert(services).values({
        name: 'Monthly Maintenance',
        slug: 'monthly-maintenance',
        description: 'Ongoing site maintenance, security updates, and up to 5 hours of minor edits per month.',
        category: 'maintenance',
        price: 29900,
        billingCycle: 'monthly',
        active: true,
        features: ['Security & dependency updates', '5 hrs/month minor edits', 'Uptime monitoring', 'Monthly report'],
      }).returning();
      console.log('Created Monthly Maintenance service');
    }

    let domainSvc = (await db.select().from(services).where(eq(services.slug, 'white-label-domain')).limit(1))[0];
    if (!domainSvc) {
      [domainSvc] = await db.insert(services).values({
        name: 'White Label Domain',
        slug: 'white-label-domain',
        description: 'Register and manage a custom domain under your brand.',
        category: 'domain',
        price: 1500,
        billingCycle: 'annually',
        active: true,
        features: ['Custom domain registration', 'DNS management', 'Free SSL certificate'],
      }).returning();
      console.log('Created White Label Domain service');
    }

    // All-features bundle so the E2E tenant is fully entitled. `hasServiceAccess`
    // (lib/portal-auth.ts) and the brain/MCP guards treat an active service whose
    // category is `bundle` as access to EVERY feature category — without this the
    // full suite fails ~250 specs with 402/403 (only @critical avoids the gated
    // domains). Entitlement-*gate* tests use their own unentitled tenants, so
    // granting the bundle to the shared e2e client is safe.
    let bundleSvc = (await db.select().from(services).where(eq(services.slug, 'e2e-all-access-bundle')).limit(1))[0];
    if (!bundleSvc) {
      [bundleSvc] = await db.insert(services).values({
        name: 'E2E All-Access Bundle',
        slug: 'e2e-all-access-bundle',
        description: 'Grants every feature category to the E2E test tenant.',
        category: 'bundle',
        price: 0,
        billingCycle: 'monthly',
        active: true,
        includedAiCredits: 1000000,
      }).returning();
      console.log('Created E2E All-Access Bundle service');
    }

    // Client subscriptions
    await db.insert(clientServices).values([
      {
        clientId,
        serviceId: bundleSvc.id,
        status: 'active',
        startDate: new Date('2026-01-01'),
        notes: 'All-access bundle — full feature entitlement for E2E',
      },
      {
        clientId,
        serviceId: maintenanceSvc.id,
        status: 'active',
        startDate: new Date('2026-01-01'),
        renewalDate: new Date('2026-05-01'),
        notes: 'Monthly maintenance subscription',
      },
      {
        clientId,
        serviceId: domainSvc.id,
        status: 'active',
        startDate: new Date('2026-01-15'),
        renewalDate: new Date('2027-01-15'),
        notes: 'Annual domain registration',
      },
    ]);
    console.log('Client services created: 2');

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. AI CREDITS
    // ═══════════════════════════════════════════════════════════════════════════

    // Balance (upsert via checking existence since clientId is the PK)
    const existingBalance = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId)).limit(1);
    if (existingBalance.length > 0) {
      await db.update(aiCreditBalances).set({
        balance: 50000,
        monthlyGrant: 10000,
        payAsYouGo: false,
      }).where(eq(aiCreditBalances.clientId, clientId));
    } else {
      await db.insert(aiCreditBalances).values({
        clientId,
        balance: 50000,
        monthlyGrant: 10000,
        payAsYouGo: false,
      });
    }
    console.log('AI credit balance set: 50000 tokens');

    // Ledger entries
    await db.insert(aiCreditLedger).values([
      {
        clientId,
        type: 'grant',
        amount: 10000,
        balanceAfter: 10000,
        description: 'Monthly AI credit grant',
        serviceCategory: 'maintenance',
        createdAt: new Date('2026-03-01'),
      },
      {
        clientId,
        type: 'usage',
        amount: -2500,
        balanceAfter: 7500,
        description: 'AI conversation: project brainstorming',
        serviceCategory: 'ai-chat',
        referenceId: 'conv-seed-001',
        createdAt: new Date('2026-03-15'),
      },
      {
        clientId,
        type: 'purchase',
        amount: 5000,
        balanceAfter: 12500,
        description: 'Purchased additional AI credits',
        referenceId: 'pi_seed_001',
        createdAt: new Date('2026-03-20'),
      },
    ]);
    console.log('AI credit ledger entries created: 3');

    // Credit packages
    await db.insert(aiCreditPackages).values([
      {
        name: 'Starter Pack',
        tokens: 10000,
        price: 999,
        active: true,
      },
      {
        name: 'Pro Pack',
        tokens: 100000,
        price: 7999,
        active: true,
      },
    ]);
    console.log('AI credit packages created: 2');

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. AUTOMATION RULES
    // ═══════════════════════════════════════════════════════════════════════════

    const [autoRule1] = await db.insert(automationRules).values({
      clientId,
      name: 'Auto-assign tickets',
      description: 'Automatically assign new support tickets to the on-call team member.',
      trigger: { event: 'support_ticket.created', filters: { priority: 'high' } },
      conditions: [
        { field: 'priority', operator: 'equals', value: 'high' },
      ],
      actions: [
        { tool: 'assign_ticket', params: { assignTo: 'on-call' } },
        { tool: 'send_notification', params: { channel: 'slack', message: 'New high-priority ticket assigned' } },
      ],
      enabled: true,
      source: 'nlp',
      executionCount: 5,
      lastExecutedAt: new Date('2026-03-28'),
    }).returning();

    const [autoRule2] = await db.insert(automationRules).values({
      clientId,
      name: 'Welcome email on signup',
      description: 'Send a welcome email when a new contact is created via web form.',
      trigger: { event: 'crm.contact.created', filters: { source: 'web' } },
      conditions: [
        { field: 'email', operator: 'exists' },
      ],
      actions: [
        { tool: 'send_email', params: { template: 'welcome', to: '{{contact.email}}' } },
      ],
      enabled: true,
      source: 'settings',
      productScope: 'crm',
      executionCount: 12,
      lastExecutedAt: new Date('2026-03-30'),
    }).returning();
    console.log('Automation rules created:', autoRule1.id, autoRule2.id);

    // Automation logs (both for the first rule)
    await db.insert(automationLogs).values([
      {
        clientId,
        ruleId: autoRule1.id,
        triggerEvent: 'support_ticket.created',
        triggerPayload: { ticketId: 999, priority: 'high', subject: 'Staging site down' },
        actionsExecuted: [
          { tool: 'assign_ticket', params: { assignTo: 'on-call' }, result: { assignedTo: 'admin@simplerdevelopment.com' } },
          { tool: 'send_notification', params: { channel: 'slack', message: 'New high-priority ticket assigned' }, result: { sent: true } },
        ],
        status: 'success',
        duration: 320,
        createdAt: new Date('2026-03-28'),
      },
      {
        clientId,
        ruleId: autoRule1.id,
        triggerEvent: 'support_ticket.created',
        triggerPayload: { ticketId: 1000, priority: 'high', subject: 'SSL certificate expired' },
        actionsExecuted: [
          { tool: 'assign_ticket', params: { assignTo: 'on-call' }, result: { assignedTo: 'admin@simplerdevelopment.com' } },
          { tool: 'send_notification', params: { channel: 'slack', message: 'New high-priority ticket assigned' }, result: null, error: 'Slack webhook returned 503' },
        ],
        status: 'failed',
        duration: 1500,
        errorMessage: 'Slack webhook returned 503 Service Unavailable',
        createdAt: new Date('2026-03-29'),
      },
    ]);
    console.log('Automation logs created: 2');

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. BOOKING DATA
    // ═══════════════════════════════════════════════════════════════════════════

    const [bookingPage] = await db.insert(bookingPages).values({
      clientId,
      title: 'Strategy Call',
      slug: `strategy-call-${ts}`,
      description: 'Book a 30-minute strategy session to discuss your project goals and requirements.',
      duration: 30,
      bufferBefore: 5,
      bufferAfter: 10,
      maxAdvanceDays: 60,
      minNoticeMins: 120,
      timezone: 'America/New_York',
      availability: [
        { day: 1, startTime: '09:00', endTime: '17:00', enabled: true },
        { day: 2, startTime: '09:00', endTime: '17:00', enabled: true },
        { day: 3, startTime: '09:00', endTime: '17:00', enabled: true },
        { day: 4, startTime: '09:00', endTime: '17:00', enabled: true },
        { day: 5, startTime: '09:00', endTime: '17:00', enabled: true },
        { day: 0, startTime: '09:00', endTime: '17:00', enabled: false },
        { day: 6, startTime: '09:00', endTime: '17:00', enabled: false },
      ],
      questions: [
        { id: 'q1', label: 'What is the main goal for this call?', type: 'textarea', required: true },
      ],
      color: '#2563eb',
      active: true,
    }).returning();
    console.log('Booking page created:', bookingPage.id);

    // Future confirmed booking (+7 days)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    futureDate.setHours(10, 0, 0, 0);
    const futureEnd = new Date(futureDate);
    futureEnd.setMinutes(futureEnd.getMinutes() + 30);

    // Past completed booking (-7 days)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);
    pastDate.setHours(14, 0, 0, 0);
    const pastEnd = new Date(pastDate);
    pastEnd.setMinutes(pastEnd.getMinutes() + 30);

    // Cancelled booking (-3 days)
    const cancelDate = new Date();
    cancelDate.setDate(cancelDate.getDate() - 3);
    cancelDate.setHours(11, 0, 0, 0);
    const cancelEnd = new Date(cancelDate);
    cancelEnd.setMinutes(cancelEnd.getMinutes() + 30);

    await db.insert(bookings).values([
      {
        bookingPageId: bookingPage.id,
        clientId,
        guestName: 'Alice Chen',
        guestEmail: 'alice@techventures.io',
        guestPhone: '(555) 200-1001',
        startTime: futureDate,
        endTime: futureEnd,
        timezone: 'America/New_York',
        status: 'confirmed',
        answers: { q1: 'Discuss new platform architecture and timeline.' },
        cancelToken: randomToken(),
      },
      {
        bookingPageId: bookingPage.id,
        clientId,
        guestName: 'Carol Davis',
        guestEmail: 'carol@greenleafstudios.co',
        startTime: pastDate,
        endTime: pastEnd,
        timezone: 'America/New_York',
        status: 'completed',
        answers: { q1: 'Review brand refresh deliverables.' },
        cancelToken: randomToken(),
      },
      {
        bookingPageId: bookingPage.id,
        clientId,
        guestName: 'Dave Wilson',
        guestEmail: 'dave@greenleafstudios.co',
        startTime: cancelDate,
        endTime: cancelEnd,
        timezone: 'America/New_York',
        status: 'cancelled',
        cancelledAt: new Date(cancelDate.getTime() - 86400000), // cancelled 1 day before
        answers: { q1: 'Project kickoff planning.' },
        cancelToken: randomToken(),
      },
    ]);
    console.log('Bookings created: 3');

    // -- Brain profile (enabled: true so cov-u8 meetings lifecycle test passes) --
    await db.insert(brainProfiles)
      .values({ clientId, name: 'Company Brain', enabled: true })
      .onConflictDoUpdate({ target: brainProfiles.clientId, set: { enabled: true } });
    console.log('Brain profile enabled: true');

    // ═══════════════════════════════════════════════════════════════════════════

    console.log('\n========================================');
    console.log('  Admin E2E seed complete!');
    console.log('========================================');
    console.log('  Client ID:', clientId);
    console.log('  Email:     client@example.com');
    console.log('  Password:  client123');
    console.log('========================================\n');

  } catch (error) {
    console.error('Error seeding admin E2E data:', error);
  }
  process.exit(0);
}

seedAdminE2E();
