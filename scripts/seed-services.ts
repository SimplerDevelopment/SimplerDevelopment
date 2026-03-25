import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function seedServices() {
  try {
    const { db } = await import('../lib/db');
    const { services } = await import('../lib/db/schema');

    // Clear existing services
    await db.delete(services);
    console.log('✅ Cleared existing services');

    await db.insert(services).values([
      {
        name: 'Websites',
        slug: 'websites',
        description: 'A fully managed content management system for your website. Create and edit pages, blog posts, and landing pages using a powerful drag-and-drop block editor — no coding required.',
        category: 'cms',
        price: 4900,
        billingCycle: 'monthly',
        active: true,
        features: [
          'Drag-and-drop block editor',
          'Unlimited pages & blog posts',
          'Media library',
          'SEO settings per page',
          'Custom post types',
          'Multi-user access',
        ],
        surveyFields: [
          {
            id: 'website_url',
            type: 'url',
            label: 'Current website URL (if any)',
            placeholder: 'https://yoursite.com',
            required: false,
            order: 0,
          },
          {
            id: 'page_count',
            type: 'select',
            label: 'How many pages does your site need?',
            options: ['1–5', '6–15', '16–30', '30+'],
            required: true,
            order: 1,
          },
          {
            id: 'blog_needed',
            type: 'toggle',
            label: 'Do you need a blog?',
            required: false,
            order: 2,
          },
        ],
      },
      {
        name: 'Email Marketing',
        slug: 'email-marketing',
        description: 'Send beautiful email campaigns to your audience. Manage subscriber lists, design emails with a rich editor, and track opens, clicks, and unsubscribes — all from your client portal.',
        category: 'email',
        price: 2900,
        billingCycle: 'monthly',
        active: true,
        features: [
          'Unlimited subscriber lists',
          'Visual email campaign builder',
          'Open & click tracking',
          'Unsubscribe management',
          'Custom sending domain',
          'Campaign scheduling',
        ],
        surveyFields: [
          {
            id: 'list_size',
            type: 'select',
            label: 'Estimated subscriber count',
            options: ['Under 500', '500–2,000', '2,000–10,000', '10,000+'],
            required: true,
            order: 0,
          },
          {
            id: 'send_frequency',
            type: 'select',
            label: 'How often do you plan to send campaigns?',
            options: ['Weekly', 'Bi-weekly', 'Monthly', 'Occasionally'],
            required: false,
            order: 1,
          },
          {
            id: 'custom_domain',
            type: 'text',
            label: 'Domain you want to send from (e.g. mail.yoursite.com)',
            placeholder: 'mail.yoursite.com',
            required: false,
            order: 2,
          },
        ],
      },
      {
        name: 'Booking System',
        slug: 'booking-system',
        description: 'Let customers book appointments, classes, or services directly from your website. Manage availability, send automated reminders, and integrate with your calendar.',
        category: 'booking',
        price: 3900,
        billingCycle: 'monthly',
        active: true,
        features: [
          'Online appointment booking',
          'Calendar sync (Google/Outlook)',
          'Automated email & SMS reminders',
          'Custom availability windows',
          'Service & staff management',
          'Embeddable booking widget',
        ],
        surveyFields: [
          {
            id: 'booking_type',
            type: 'select',
            label: 'What type of bookings do you need?',
            options: ['1-on-1 appointments', 'Group classes/events', 'Resource reservations', 'Mixed'],
            required: true,
            order: 0,
          },
          {
            id: 'staff_count',
            type: 'select',
            label: 'Number of staff members taking bookings',
            options: ['Just me', '2–5', '6–15', '15+'],
            required: true,
            order: 1,
          },
          {
            id: 'payment_required',
            type: 'toggle',
            label: 'Do you need to collect payment at booking?',
            required: false,
            order: 2,
          },
          {
            id: 'existing_calendar',
            type: 'select',
            label: 'Calendar you use',
            options: ['Google Calendar', 'Outlook / Microsoft 365', 'Apple Calendar', 'None'],
            required: false,
            order: 3,
          },
        ],
      },
      {
        name: 'Project Management System',
        slug: 'project-mgmt-system',
        description: 'A branded project management workspace for your team and clients. Kanban boards, task tracking, file sharing, time logging, and client-facing portals — all under your brand.',
        category: 'project-mgmt',
        price: 4900,
        billingCycle: 'monthly',
        active: true,
        features: [
          'Kanban boards & task tracking',
          'Sprint planning',
          'Client-facing portal',
          'File & document sharing',
          'Time logging',
          'Team & client messaging',
        ],
        surveyFields: [
          {
            id: 'team_size',
            type: 'select',
            label: 'Team size',
            options: ['Solo', '2–5', '6–15', '15+'],
            required: true,
            order: 0,
          },
          {
            id: 'client_access',
            type: 'toggle',
            label: 'Do your clients need access to view project progress?',
            required: false,
            order: 1,
          },
          {
            id: 'integrations',
            type: 'checkbox',
            label: 'Integrations you need',
            options: ['Slack', 'Google Drive', 'GitHub', 'Zapier'],
            required: false,
            order: 2,
          },
        ],
      },
      {
        name: 'Chat Bot',
        slug: 'chat-bot',
        description: 'An AI-powered chat assistant trained on your business content. Answer customer questions 24/7, capture leads, and hand off to human support when needed — embedded directly on your website.',
        category: 'ai',
        price: 5900,
        billingCycle: 'monthly',
        active: true,
        features: [
          'AI trained on your content',
          'Lead capture & qualification',
          'Human handoff support',
          'Website embed widget',
          'Conversation history & analytics',
          'Custom persona & branding',
        ],
        surveyFields: [
          {
            id: 'primary_goal',
            type: 'select',
            label: 'Primary goal for the chat bot',
            options: ['Answer FAQs', 'Capture leads', 'Book appointments', 'Customer support', 'All of the above'],
            required: true,
            order: 0,
          },
          {
            id: 'knowledge_sources',
            type: 'checkbox',
            label: 'What content should the bot be trained on?',
            options: ['Website pages', 'FAQ document', 'Product catalog', 'Support docs', 'Custom Q&A'],
            required: false,
            order: 1,
          },
          {
            id: 'human_handoff',
            type: 'toggle',
            label: 'Do you need live human handoff capability?',
            required: false,
            order: 2,
          },
          {
            id: 'bot_name',
            type: 'text',
            label: 'What should we name your bot?',
            placeholder: 'e.g. Aria, Max, or your brand name + "AI"',
            required: false,
            order: 3,
          },
        ],
      },
      {
        name: 'Pitch Decks',
        slug: 'pitch-decks',
        description: 'Create AI-powered pitch decks branded to your company. Enter a prompt, provide your website URL, and get a polished, on-brand deck generated in seconds.',
        category: 'pitch-decks',
        price: 1900,
        billingCycle: 'monthly',
        active: true,
        features: [
          'AI-generated slide decks',
          'Auto-brand from your website',
          'Edit slides with AI prompts',
          'Version history & restore',
          'Export to PDF',
          'Unlimited decks',
        ],
        surveyFields: [],
      },
      {
        name: 'Hosting & DNS',
        slug: 'hosting-dns',
        description: 'Managed hosting and DNS for your websites. We handle server configuration, SSL certificates, CDN, backups, and DNS management so you can focus on your business.',
        category: 'hosting',
        price: 2900,
        billingCycle: 'monthly',
        active: true,
        features: [
          'Managed server hosting',
          'Free SSL certificates',
          'CDN for fast loading',
          'Automated daily backups',
          'DNS management',
          '99.9% uptime SLA',
        ],
        surveyFields: [
          {
            id: 'domain',
            type: 'text',
            label: 'Domain name (if you have one)',
            placeholder: 'yoursite.com',
            required: false,
            order: 0,
          },
          {
            id: 'current_host',
            type: 'text',
            label: 'Current hosting provider (if migrating)',
            placeholder: 'e.g. GoDaddy, Bluehost',
            required: false,
            order: 1,
          },
        ],
      },
    ]);

    console.log('✅ Services seeded:');
    console.log('   • Websites — $49/mo');
    console.log('   • Email Marketing — $29/mo');
    console.log('   • Booking System — $39/mo');
    console.log('   • Project Management System — $49/mo');
    console.log('   • Chat Bot — $59/mo');
    console.log('   • Pitch Decks — $19/mo');
    console.log('   • Hosting & DNS — $29/mo');

  } catch (error) {
    console.error('❌ Error seeding services:', error);
  }
  process.exit(0);
}

seedServices();
