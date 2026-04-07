import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const CLIENT_ID = 98;
const USER_ID = 183;

async function createSurvey() {
  const { db } = await import('../../../lib/db');
  const { surveys } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const slug = 'cy-strategy-discovery';

  // Check if already exists
  const [existing] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.clientId, CLIENT_ID), eq(surveys.slug, slug)))
    .limit(1);

  if (existing) {
    console.log(`Survey already exists: ID ${existing.id}`);
    process.exit(0);
  }

  const fields = [
    // ── Page 0: About You ──
    {
      id: 'heading-about',
      type: 'heading' as const,
      label: "Let's start with the basics.",
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 0,
      page: 0,
    },
    {
      id: 'name',
      type: 'text' as const,
      label: 'Your name',
      placeholder: 'First and last',
      helpText: '',
      required: true,
      options: [],
      order: 1,
      page: 0,
    },
    {
      id: 'company',
      type: 'text' as const,
      label: 'Company / brand name',
      placeholder: '',
      helpText: '',
      required: true,
      options: [],
      order: 2,
      page: 0,
    },
    {
      id: 'website',
      type: 'url' as const,
      label: 'Website (if you have one)',
      placeholder: 'https://',
      helpText: '',
      required: false,
      options: [],
      order: 3,
      page: 0,
    },
    {
      id: 'role',
      type: 'select' as const,
      label: 'Your role',
      placeholder: 'Select one',
      helpText: '',
      required: true,
      options: ['Founder / CEO', 'Marketing lead', 'Operations / COO', 'Sales lead', 'Other'],
      order: 4,
      page: 0,
    },

    // ── Page 1: Where you are now ──
    {
      id: 'heading-now',
      type: 'heading' as const,
      label: 'Where you are right now',
      placeholder: '',
      helpText: "No wrong answers \u2014 this helps me understand where you're starting from.",
      required: false,
      options: [],
      order: 5,
      page: 1,
    },
    {
      id: 'stage',
      type: 'radio' as const,
      label: 'How would you describe your current marketing?',
      placeholder: '',
      helpText: '',
      required: true,
      options: [
        "We're just getting started \u2014 no real system yet",
        "We do some things but it's inconsistent",
        "We have a team / agency but results are flat",
        "Things are working but we need to scale smarter",
      ],
      order: 6,
      page: 1,
    },
    {
      id: 'revenue',
      type: 'select' as const,
      label: 'Annual revenue range',
      placeholder: 'Select one',
      helpText: 'Helps me calibrate recommendations to your scale.',
      required: true,
      options: [
        'Pre-revenue / early stage',
        'Under $500K',
        '$500K \u2013 $2M',
        '$2M \u2013 $10M',
        '$10M+',
        'Prefer not to say',
      ],
      order: 7,
      page: 1,
    },
    {
      id: 'channels',
      type: 'checkbox' as const,
      label: 'Which channels are you currently using?',
      placeholder: '',
      helpText: 'Check all that apply.',
      required: false,
      options: [
        'Organic social',
        'Paid ads (Google, Meta, etc.)',
        'Email marketing',
        'SEO / content',
        'Referrals / word of mouth',
        'Events / partnerships',
        'None of the above',
      ],
      order: 8,
      page: 1,
    },

    // ── Page 2: What you need ──
    {
      id: 'heading-need',
      type: 'heading' as const,
      label: "What you're looking for",
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 9,
      page: 2,
    },
    {
      id: 'service-interest',
      type: 'checkbox' as const,
      label: 'Which of these sounds most like what you need?',
      placeholder: '',
      helpText: 'Select all that apply.',
      required: true,
      options: [
        'A quick snapshot \u2014 what to do next and what to stop doing',
        'A full strategy & roadmap I can hand to my team',
        'A targeted campaign plan for a specific goal',
        'Ongoing strategic guidance (fractional CMO-style)',
        "Not sure yet \u2014 I'd like to talk it through",
      ],
      order: 10,
      page: 2,
      goToPage: {
        "Not sure yet \u2014 I'd like to talk it through": 4, // skip to final page
      },
    },
    {
      id: 'timeline',
      type: 'radio' as const,
      label: 'How soon are you looking to get started?',
      placeholder: '',
      helpText: '',
      required: true,
      options: [
        'ASAP \u2014 this is urgent',
        'Within the next month',
        'Next quarter',
        'Just exploring for now',
      ],
      order: 11,
      page: 2,
    },
    {
      id: 'budget',
      type: 'select' as const,
      label: 'Approximate monthly marketing budget (including any agency / tools)',
      placeholder: 'Select one',
      helpText: '',
      required: false,
      options: [
        'Under $2K/mo',
        '$2K \u2013 $5K/mo',
        '$5K \u2013 $15K/mo',
        '$15K+/mo',
        'No budget set yet',
      ],
      order: 12,
      page: 2,
    },

    // ── Page 3: The big picture ──
    {
      id: 'heading-big-picture',
      type: 'heading' as const,
      label: 'The big picture',
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 13,
      page: 3,
    },
    {
      id: 'biggest-challenge',
      type: 'textarea' as const,
      label: "What's the #1 thing holding your marketing back right now?",
      placeholder: 'Be as specific as you like \u2014 this is the most useful part.',
      helpText: '',
      required: false,
      options: [],
      order: 14,
      page: 3,
    },
    {
      id: 'success-looks-like',
      type: 'textarea' as const,
      label: 'What would success look like 6 months from now?',
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 15,
      page: 3,
    },

    // ── Page 4: Wrap up ──
    {
      id: 'heading-wrap',
      type: 'heading' as const,
      label: "Almost done \u2014 how should I reach you?",
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 16,
      page: 4,
    },
    {
      id: 'email',
      type: 'email' as const,
      label: 'Email',
      placeholder: 'you@company.com',
      helpText: '',
      required: true,
      options: [],
      order: 17,
      page: 4,
    },
    {
      id: 'phone',
      type: 'phone' as const,
      label: 'Phone (optional)',
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 18,
      page: 4,
    },
    {
      id: 'anything-else',
      type: 'textarea' as const,
      label: 'Anything else you want me to know before we talk?',
      placeholder: '',
      helpText: '',
      required: false,
      options: [],
      order: 19,
      page: 4,
    },
  ];

  const pages = [
    { title: 'About You' },
    { title: 'Where You Are Now' },
    { title: 'What You Need' },
    { title: 'The Big Picture' },
    { title: 'Wrap Up' },
  ];

  const [survey] = await db.insert(surveys).values({
    clientId: CLIENT_ID,
    title: 'Strategy Discovery',
    slug,
    description: "If you want a clearer sense of scope, timing, and fit before we talk, start here. Takes about 3 minutes.",
    fields,
    pages,
    thankYouTitle: "You're all set.",
    thankYouMessage: "I'll review your answers and follow up within one business day with initial thoughts and a suggested next step. No obligation, no pitch \u2014 just a clear-eyed take on where I think I can help.",
    redirectUrl: null,
    color: '#0D6B6E',
    status: 'active',
    allowMultiple: false,
    requireEmail: true,
    notifyOnResponse: true,
    createdBy: USER_ID,
  }).returning();

  console.log(`Survey created: ID ${survey.id}, slug: ${slug}`);
  console.log(`Public URL: /s/${slug}`);
  process.exit(0);
}

createSurvey().catch((err) => {
  console.error(err);
  process.exit(1);
});
