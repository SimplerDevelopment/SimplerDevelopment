import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';

dotenv.config({ path: '.env' });

async function seedPortalClient() {
  try {
    const { db } = await import('../lib/db');
    const { users, clients, projects, kanbanColumns, kanbanCards, supportTickets, ticketMessages, services, invoices, invoiceItems } = await import('../lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const clientEmail = 'client@example.com';
    const clientPassword = 'client123';
    const hashedPassword = await hash(clientPassword, 10);

    // 1. Create client user (skip if already exists)
    const existing = await db.select().from(users).where(eq(users.email, clientEmail)).limit(1);
    const [user] = existing.length > 0
      ? existing
      : await db.insert(users).values({
          name: 'Jane Smith',
          email: clientEmail,
          password: hashedPassword,
          role: 'client',
          active: true,
        }).returning();
    console.log('✅ Client user created');

    // 2. Create client profile
    const [client] = await db.insert(clients).values({
      userId: user.id,
      company: 'Acme Corp',
      phone: '(555) 123-4567',
      website: 'https://acmecorp.example.com',
      notes: 'Demo client account for portal testing',
    }).returning();
    console.log('✅ Client profile created');

    // 3. Create a project with Kanban board
    const [project] = await db.insert(projects).values({
      name: 'Website Redesign',
      description: 'Full redesign of the Acme Corp marketing website including new brand identity.',
      clientId: client.id,
      status: 'active',
      startDate: new Date('2026-03-01'),
      dueDate: new Date('2026-06-01'),
    }).returning();
    console.log('✅ Project created');

    const columnNames = ['To Do', 'In Progress', 'Review', 'Done'];
    const columnColors = ['#6b7280', '#3b82f6', '#f59e0b', '#10b981'];
    const cols = [];
    for (let i = 0; i < columnNames.length; i++) {
      const [col] = await db.insert(kanbanColumns).values({
        projectId: project.id,
        name: columnNames[i],
        order: i,
        color: columnColors[i],
      }).returning();
      cols.push(col);
    }
    console.log('✅ Kanban columns created');

    // Seed cards across columns
    const cardData = [
      { col: 0, title: 'Gather brand assets', description: 'Collect logos, fonts, and brand guidelines from client.', priority: 'high' },
      { col: 0, title: 'Write homepage copy', description: 'Draft hero section, about, and CTA copy.', priority: 'medium' },
      { col: 0, title: 'Setup staging environment', description: 'Configure Railway staging server.', priority: 'low' },
      { col: 1, title: 'Design wireframes', description: 'Create low-fidelity wireframes for all key pages.', priority: 'high' },
      { col: 1, title: 'Build navigation component', description: 'Responsive nav with mobile drawer.', priority: 'medium' },
      { col: 2, title: 'Homepage hero section', description: 'Client review requested for hero design and copy.', priority: 'urgent' },
      { col: 3, title: 'Project kickoff call', description: 'Initial scope and timeline confirmed.', priority: 'low' },
      { col: 3, title: 'Domain setup', description: 'DNS configured and SSL active.', priority: 'medium' },
    ];

    for (let i = 0; i < cardData.length; i++) {
      const c = cardData[i];
      await db.insert(kanbanCards).values({
        columnId: cols[c.col].id,
        projectId: project.id,
        title: c.title,
        description: c.description,
        priority: c.priority,
        order: i,
      });
    }
    console.log('✅ Kanban cards created');

    // 4. Create support tickets
    const [ticket1] = await db.insert(supportTickets).values({
      number: 1001,
      clientId: client.id,
      projectId: project.id,
      subject: 'Staging site returning 502 error',
      status: 'in_progress',
      priority: 'high',
      category: 'hosting',
      createdBy: user.id,
    }).returning();

    await db.insert(ticketMessages).values({
      ticketId: ticket1.id,
      authorId: user.id,
      body: 'Hi team, the staging site at staging.acmecorp.example.com is returning a 502 Bad Gateway error since this morning. Can you please investigate?',
      isInternal: false,
    });
    console.log('✅ Support ticket created');

    const [ticket2] = await db.insert(supportTickets).values({
      number: 1002,
      clientId: client.id,
      subject: 'Invoice payment question',
      status: 'open',
      priority: 'low',
      category: 'billing',
      createdBy: user.id,
    }).returning();

    await db.insert(ticketMessages).values({
      ticketId: ticket2.id,
      authorId: user.id,
      body: 'Can I pay the upcoming invoice via ACH bank transfer instead of credit card?',
      isInternal: false,
    });

    // 5. Create services
    const [domainSvc] = await db.insert(services).values({
      name: 'White Label Domain',
      slug: 'white-label-domain',
      description: 'Register and manage a custom domain under your brand. Includes DNS management and SSL.',
      category: 'domain',
      price: 1500,
      billingCycle: 'annually',
      active: true,
      features: ['Custom domain registration', 'DNS management', 'Free SSL certificate', 'Email forwarding setup'],
    }).returning();

    await db.insert(services).values({
      name: 'Railway Hosting (Starter)',
      slug: 'railway-hosting-starter',
      description: 'White-label Railway hosting for your application. Fully managed, auto-scaling infrastructure.',
      category: 'hosting',
      price: 4900,
      billingCycle: 'monthly',
      active: true,
      features: ['1 vCPU / 512MB RAM', 'Auto-deploy from Git', 'Custom domain', 'Managed PostgreSQL', '99.9% uptime SLA'],
    });

    await db.insert(services).values({
      name: 'Railway Hosting (Pro)',
      slug: 'railway-hosting-pro',
      description: 'High-performance Railway hosting for production workloads.',
      category: 'hosting',
      price: 14900,
      billingCycle: 'monthly',
      active: true,
      features: ['4 vCPU / 4GB RAM', 'Auto-scaling', 'Custom domain', 'Managed PostgreSQL + Redis', 'Priority support', '99.99% uptime SLA'],
    });

    await db.insert(services).values({
      name: 'Monthly Maintenance',
      slug: 'monthly-maintenance',
      description: 'Ongoing site maintenance, security updates, and up to 5 hours of minor edits per month.',
      category: 'maintenance',
      price: 29900,
      billingCycle: 'monthly',
      active: true,
      features: ['Security & dependency updates', '5 hrs/month minor edits', 'Uptime monitoring', 'Monthly report'],
    });
    console.log('✅ Services created');

    // 6. Create invoices
    const [inv1] = await db.insert(invoices).values({
      number: 'INV-2026-0001',
      clientId: client.id,
      projectId: project.id,
      status: 'sent',
      dueDate: new Date('2026-04-01'),
      subtotal: 450000,
      tax: 0,
      total: 450000,
      notes: 'Website Redesign — Phase 1: Discovery & Design',
    }).returning();

    await db.insert(invoiceItems).values([
      { invoiceId: inv1.id, description: 'Discovery & strategy session (8 hrs)', quantity: 8, unitPrice: 15000, total: 120000 },
      { invoiceId: inv1.id, description: 'UX wireframing & design (22 hrs)', quantity: 22, unitPrice: 15000, total: 330000 },
    ]);

    const [inv2] = await db.insert(invoices).values({
      number: 'INV-2026-0002',
      clientId: client.id,
      status: 'paid',
      paidAt: new Date('2026-03-05'),
      dueDate: new Date('2026-03-15'),
      subtotal: 150000,
      tax: 0,
      total: 150000,
      notes: 'Domain registration + initial setup fee',
    }).returning();

    await db.insert(invoiceItems).values([
      { invoiceId: inv2.id, description: 'White Label Domain (1 year)', quantity: 1, unitPrice: 1500, total: 1500, serviceId: domainSvc.id },
      { invoiceId: inv2.id, description: 'Hosting setup & configuration', quantity: 1, unitPrice: 148500, total: 148500 },
    ]);
    console.log('✅ Invoices created');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Portal Client Login');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  URL:      /portal/login');
    console.log('  Email:    client@example.com');
    console.log('  Password: client123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error seeding portal client:', error);
  }
  process.exit(0);
}

seedPortalClient();
