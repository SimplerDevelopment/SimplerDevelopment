import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

/**
 * Idempotent services seed.
 *
 * Up to 2026-04 this script `DELETE`d every row in `services` before re-inserting,
 * which silently nuked any client_services FK that pointed at a row we then
 * re-numbered. We now upsert by `slug` (the existing unique key) so the seed is
 * safe to run on a database that already has paying clients.
 *
 * Pricing notes:
 *   • `brain` ($49/mo) — added 2026-05 to close GA blocker §11.8 of the
 *     companyBrain audit. $49 mirrors Chat Bot's price point — both are
 *     AI-heavy SKUs with comparable infra cost — and slots between Booking
 *     ($29) and All-In-One ($149).
 */

interface SeedRow {
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  billingCycle: 'once' | 'monthly' | 'annually';
  active: boolean;
  includedAiCredits: number;
  features: string[];
  surveyFields?: unknown[];
  usageLimits?: Record<string, number>;
}

const ROWS: SeedRow[] = [
  {
    name: 'Websites',
    slug: 'websites',
    description: 'A fully managed content management system for your website. Create and edit pages, blog posts, and landing pages using a powerful drag-and-drop block editor — no coding required.',
    category: 'cms',
    price: 3900,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 50000,
    features: [
      'Drag-and-drop block editor',
      'Unlimited pages & blog posts',
      'Media library',
      'SEO settings per page',
      'Custom post types',
      'Multi-user access',
      '50K AI tokens/mo',
    ],
    surveyFields: [
      { id: 'website_url', type: 'url', label: 'Current website URL (if any)', placeholder: 'https://yoursite.com', required: false, order: 0 },
      { id: 'page_count', type: 'select', label: 'How many pages does your site need?', options: ['1–5', '6–15', '16–30', '30+'], required: true, order: 1 },
      { id: 'blog_needed', type: 'toggle', label: 'Do you need a blog?', required: false, order: 2 },
    ],
  },
  {
    name: 'Email Marketing',
    slug: 'email-marketing',
    description: 'Send beautiful email campaigns to your audience. Manage subscriber lists, design emails with a rich editor, and track opens, clicks, and unsubscribes — all from your client portal.',
    category: 'email',
    price: 1900,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 25000,
    features: [
      'Unlimited subscriber lists',
      'Visual email campaign builder',
      'Open & click tracking',
      'Unsubscribe management',
      'Custom sending domain',
      'Campaign scheduling',
      '25K AI tokens/mo',
    ],
    surveyFields: [
      { id: 'list_size', type: 'select', label: 'Estimated subscriber count', options: ['Under 500', '500–2,000', '2,000–10,000', '10,000+'], required: true, order: 0 },
      { id: 'send_frequency', type: 'select', label: 'How often do you plan to send campaigns?', options: ['Weekly', 'Bi-weekly', 'Monthly', 'Occasionally'], required: false, order: 1 },
      { id: 'custom_domain', type: 'text', label: 'Domain you want to send from (e.g. mail.yoursite.com)', placeholder: 'mail.yoursite.com', required: false, order: 2 },
    ],
  },
  {
    name: 'Booking System',
    slug: 'booking-system',
    description: 'Let customers book appointments, classes, or services directly from your website. Manage availability, send automated reminders, and integrate with your calendar.',
    category: 'booking',
    price: 2900,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 25000,
    features: [
      'Online appointment booking',
      'Calendar sync (Google/Outlook)',
      'Automated email & SMS reminders',
      'Custom availability windows',
      'Service & staff management',
      'Embeddable booking widget',
      '25K AI tokens/mo',
    ],
    surveyFields: [
      { id: 'booking_type', type: 'select', label: 'What type of bookings do you need?', options: ['1-on-1 appointments', 'Group classes/events', 'Resource reservations', 'Mixed'], required: true, order: 0 },
      { id: 'staff_count', type: 'select', label: 'Number of staff members taking bookings', options: ['Just me', '2–5', '6–15', '15+'], required: true, order: 1 },
      { id: 'payment_required', type: 'toggle', label: 'Do you need to collect payment at booking?', required: false, order: 2 },
      { id: 'existing_calendar', type: 'select', label: 'Calendar you use', options: ['Google Calendar', 'Outlook / Microsoft 365', 'Apple Calendar', 'None'], required: false, order: 3 },
    ],
  },
  {
    name: 'Project Management System',
    slug: 'project-mgmt-system',
    description: 'A branded project management workspace for your team and clients. Kanban boards, task tracking, file sharing, time logging, and client-facing portals — all under your brand.',
    category: 'project-mgmt',
    price: 3900,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 50000,
    features: [
      'Kanban boards & task tracking',
      'Sprint planning',
      'Client-facing portal',
      'File & document sharing',
      'Time logging',
      'Team & client messaging',
      '50K AI tokens/mo',
    ],
    surveyFields: [
      { id: 'team_size', type: 'select', label: 'Team size', options: ['Solo', '2–5', '6–15', '15+'], required: true, order: 0 },
      { id: 'client_access', type: 'toggle', label: 'Do your clients need access to view project progress?', required: false, order: 1 },
      { id: 'integrations', type: 'checkbox', label: 'Integrations you need', options: ['Slack', 'Google Drive', 'GitHub', 'Zapier'], required: false, order: 2 },
    ],
  },
  {
    name: 'Chat Bot',
    slug: 'chat-bot',
    description: 'An AI-powered chat assistant trained on your business content. Answer customer questions 24/7, capture leads, and hand off to human support when needed — embedded directly on your website.',
    category: 'ai',
    price: 4900,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 500000,
    features: [
      'AI trained on your content',
      'Lead capture & qualification',
      'Human handoff support',
      'Website embed widget',
      'Conversation history & analytics',
      'Custom persona & branding',
      '500K AI tokens/mo',
    ],
    surveyFields: [
      { id: 'primary_goal', type: 'select', label: 'Primary goal for the chat bot', options: ['Answer FAQs', 'Capture leads', 'Book appointments', 'Customer support', 'All of the above'], required: true, order: 0 },
      { id: 'knowledge_sources', type: 'checkbox', label: 'What content should the bot be trained on?', options: ['Website pages', 'FAQ document', 'Product catalog', 'Support docs', 'Custom Q&A'], required: false, order: 1 },
      { id: 'human_handoff', type: 'toggle', label: 'Do you need live human handoff capability?', required: false, order: 2 },
      { id: 'bot_name', type: 'text', label: 'What should we name your bot?', placeholder: 'e.g. Aria, Max, or your brand name + "AI"', required: false, order: 3 },
    ],
  },
  {
    name: 'Pitch Decks',
    slug: 'pitch-decks',
    description: 'Create AI-powered pitch decks branded to your company. Enter a prompt, provide your website URL, and get a polished, on-brand deck generated in seconds.',
    category: 'pitch-decks',
    price: 1500,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 200000,
    features: [
      'AI-generated slide decks',
      'Auto-brand from your website',
      'Edit slides with AI prompts',
      'Version history & restore',
      'Export to PDF',
      'Unlimited decks',
      '200K AI tokens/mo',
    ],
    surveyFields: [],
  },
  {
    name: 'Surveys',
    slug: 'surveys',
    description: 'Create and distribute surveys to collect feedback, measure satisfaction, and qualify leads. Multi-page forms with conditional logic, branching, custom branding, and response analytics.',
    category: 'surveys',
    price: 1500,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 25000,
    features: [
      'Unlimited surveys',
      'Multi-page forms with logic branching',
      '15 field types (rating, slider, etc.)',
      'Custom branding & colors',
      'Response analytics & CSV export',
      'Embeddable forms',
      '25K AI tokens/mo',
    ],
    surveyFields: [],
  },
  {
    name: 'Hosting & DNS',
    slug: 'hosting-dns',
    description: 'Managed hosting and DNS for your websites. We handle server configuration, SSL certificates, CDN, backups, and DNS management so you can focus on your business.',
    category: 'hosting',
    price: 1900,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 0,
    features: [
      'Managed server hosting',
      'Free SSL certificates',
      'CDN for fast loading',
      'Automated daily backups',
      'DNS management',
      '99.9% uptime SLA',
    ],
    surveyFields: [
      { id: 'domain', type: 'text', label: 'Domain name (if you have one)', placeholder: 'yoursite.com', required: false, order: 0 },
      { id: 'current_host', type: 'text', label: 'Current hosting provider (if migrating)', placeholder: 'e.g. GoDaddy, Bluehost', required: false, order: 1 },
    ],
  },
  {
    name: 'Company Brain',
    slug: 'company-brain',
    description: 'A structured AI operating layer for your business. Capture meetings, decisions, and commitments; AI proposes tasks and connections; humans approve. Searchable across all your communications and records, with citations back to source.',
    category: 'brain',
    price: 4900,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 250000,
    features: [
      'Meeting transcript ingestion',
      'AI-extracted tasks & decisions (human approval required)',
      'Industry templates (wealth advisory, etc.)',
      'Cross-record search with citations',
      'Confidentiality controls',
      'CRM-aware relationships overlay',
      '250K AI tokens/mo',
    ],
    surveyFields: [
      { id: 'industry_template', type: 'select', label: 'Which industry template fits best?', options: ['Wealth advisory', 'Generic / business operations', 'Other'], required: true, order: 0 },
      { id: 'meeting_volume', type: 'select', label: 'How many meetings/calls per week to ingest?', options: ['Under 5', '5–15', '15–40', '40+'], required: false, order: 1 },
      { id: 'confidentiality', type: 'toggle', label: 'Do you handle regulated / confidential client data?', required: false, order: 2 },
    ],
  },
  {
    name: 'All-In-One',
    slug: 'all-in-one',
    description: 'Get every SimplerDevelopment tool in one package at 29% off. Includes websites, email marketing, booking, surveys, project management, AI chat bot, pitch decks, Company Brain, and hosting — all with pooled AI credits and generous usage limits.',
    category: 'bundle',
    price: 14900,
    billingCycle: 'monthly',
    active: true,
    includedAiCredits: 1100000,
    usageLimits: {
      emailSends: 25000,
      hostingStorageGb: 20,
      hostingBandwidthGb: 500,
    },
    features: [
      'All 9 services included',
      'Websites & CMS',
      'Email Marketing (25K sends/mo)',
      'Booking System',
      'Surveys',
      'Project Management',
      'AI Chat Bot',
      'Pitch Deck Generator',
      'Company Brain',
      'Managed Hosting (20GB storage)',
      '1.1M AI tokens/mo (pooled)',
      '29% savings vs individual',
    ],
    surveyFields: [],
  },
];

async function seedServices() {
  try {
    const { db } = await import('../lib/db');
    const { services } = await import('../lib/db/schema');
    const { eq } = await import('drizzle-orm');

    let inserted = 0;
    let updated = 0;

    for (const row of ROWS) {
      const [existing] = await db
        .select({ id: services.id })
        .from(services)
        .where(eq(services.slug, row.slug))
        .limit(1);

      if (existing) {
        await db
          .update(services)
          .set({
            name: row.name,
            description: row.description,
            category: row.category,
            price: row.price,
            billingCycle: row.billingCycle,
            active: row.active,
            includedAiCredits: row.includedAiCredits,
            features: row.features,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            surveyFields: (row.surveyFields ?? []) as any,
            usageLimits: row.usageLimits ?? {},
            updatedAt: new Date(),
          })
          .where(eq(services.id, existing.id));
        updated += 1;
      } else {
        await db.insert(services).values({
          name: row.name,
          slug: row.slug,
          description: row.description,
          category: row.category,
          price: row.price,
          billingCycle: row.billingCycle,
          active: row.active,
          includedAiCredits: row.includedAiCredits,
          features: row.features,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          surveyFields: (row.surveyFields ?? []) as any,
          usageLimits: row.usageLimits ?? {},
        });
        inserted += 1;
      }
    }

    console.log(`Services seeded: ${inserted} inserted, ${updated} updated`);
    console.log('   Websites           $39/mo  (50K AI tokens)');
    console.log('   Email Marketing    $19/mo  (25K AI tokens)');
    console.log('   Booking System     $29/mo  (25K AI tokens)');
    console.log('   Project Management $39/mo  (50K AI tokens)');
    console.log('   Chat Bot           $49/mo  (500K AI tokens)');
    console.log('   Pitch Decks        $15/mo  (200K AI tokens)');
    console.log('   Surveys            $15/mo  (25K AI tokens)');
    console.log('   Hosting & DNS      $19/mo  (no AI tokens)');
    console.log('   Company Brain      $49/mo  (250K AI tokens) ← new');
    console.log('   All-In-One         $149/mo (1.1M AI tokens, all services)');
  } catch (error) {
    console.error('Error seeding services:', error);
    process.exit(1);
  }
  process.exit(0);
}

seedServices();
