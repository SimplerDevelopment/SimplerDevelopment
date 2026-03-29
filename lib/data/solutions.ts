export interface SolutionData {
  slug: string;
  badge: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  features: string[];
  benefits: string[];
  process: {
    title: string;
    description: string;
  }[];
}

export const solutions: SolutionData[] = [
  {
    slug: 'websites',
    badge: 'Website Builder',
    title: 'Drag-and-Drop Website Builder',
    description: 'Create stunning websites without writing a line of code. Our visual editor gives you unlimited pages, built-in blog, SEO tools, and a full ecommerce store — all managed from one dashboard.',
    color: '#3b82f6',
    icon: 'language',
    features: [
      'Visual drag-and-drop page editor',
      'Built-in blog with categories & tags',
      'SEO tools & meta management',
      'Ecommerce store with products & orders',
      'Custom branding & domain support',
      'Media library & asset management',
    ],
    benefits: [
      'Launch a professional site in hours, not weeks',
      'No developer needed for content updates',
      'Built-in SEO so customers can find you',
      'Sell products directly from your site',
    ],
    process: [
      { title: 'Pick a Template', description: 'Start from a professionally designed template or build from scratch with our block editor.' },
      { title: 'Customize Everything', description: 'Drag, drop, and style every element to match your brand. Add pages, blog posts, and products.' },
      { title: 'Connect Your Domain', description: 'Point your custom domain and go live with SSL, CDN, and managed hosting included.' },
      { title: 'Grow & Optimize', description: 'Use built-in analytics and SEO tools to drive traffic and convert visitors into customers.' },
    ],
  },
  {
    slug: 'email-marketing',
    badge: 'Email Marketing',
    title: 'Email Campaigns That Convert',
    description: 'Send beautiful email campaigns, manage subscriber lists, and track engagement — all from the same platform where you manage your website and CRM. No third-party tools needed.',
    color: '#8b5cf6',
    icon: 'email',
    features: [
      'Visual email campaign builder',
      'Subscriber lists & segmentation',
      'Automated email sequences',
      'Open & click tracking analytics',
      'Custom email templates',
      'Domain authentication & deliverability',
    ],
    benefits: [
      'Keep your audience engaged with targeted campaigns',
      'Automate follow-ups and onboarding sequences',
      'Track exactly what resonates with your audience',
      'All your contacts in one place — no CSV exports',
    ],
    process: [
      { title: 'Import or Build Your List', description: 'Add subscribers manually, import a CSV, or capture leads from your website forms.' },
      { title: 'Design Your Campaign', description: 'Use the visual editor to create branded emails that look great on every device.' },
      { title: 'Target & Send', description: 'Segment your audience and send to the right people at the right time.' },
      { title: 'Measure & Improve', description: 'Track opens, clicks, and conversions to optimize future campaigns.' },
    ],
  },
  {
    slug: 'booking',
    badge: 'Scheduling',
    title: 'Online Booking & Scheduling',
    description: 'Let clients book time with you directly from your website. Calendar sync, automatic reminders, and embeddable widgets make scheduling effortless for you and your customers.',
    color: '#10b981',
    icon: 'calendar_month',
    features: [
      'Embeddable booking pages',
      'Calendar sync (Google, Outlook)',
      'Automated email reminders',
      'Custom availability rules',
      'Multiple booking page types',
      'Timezone-aware scheduling',
    ],
    benefits: [
      'Eliminate the back-and-forth of scheduling',
      'Reduce no-shows with automatic reminders',
      'Embed booking directly on your website',
      'Clients can self-serve 24/7',
    ],
    process: [
      { title: 'Set Your Availability', description: 'Define when you are available, buffer times between appointments, and booking windows.' },
      { title: 'Create Booking Pages', description: 'Build branded booking pages for different services, meetings, or event types.' },
      { title: 'Share or Embed', description: 'Share a link or embed the booking widget directly on your website.' },
      { title: 'Manage Appointments', description: 'View upcoming bookings, get reminders, and sync everything to your calendar.' },
    ],
  },
  {
    slug: 'pitch-decks',
    badge: 'Pitch Decks',
    title: 'AI-Powered Pitch Decks',
    description: 'Create polished, investor-ready pitch decks in minutes. Our AI generates branded slides from your business details, with one-click PDF export and shareable links.',
    color: '#f59e0b',
    icon: 'slideshow',
    features: [
      'AI-generated slide content',
      'Auto-branding from your website',
      'One-click PDF export',
      'Shareable presentation links',
      'Multiple deck templates',
      'Custom slide editing',
    ],
    benefits: [
      'Go from idea to pitch deck in minutes',
      'Consistent branding across every slide',
      'Share a link instead of emailing attachments',
      'Always have an up-to-date deck ready',
    ],
    process: [
      { title: 'Enter Your Details', description: 'Tell us about your business, product, and goals — or import from your website.' },
      { title: 'AI Generates Slides', description: 'Our AI creates a complete, branded deck with the right structure and messaging.' },
      { title: 'Customize & Polish', description: 'Edit any slide, adjust the design, and fine-tune the narrative.' },
      { title: 'Share or Export', description: 'Send a shareable link or download a polished PDF for your next meeting.' },
    ],
  },
  {
    slug: 'project-management',
    badge: 'Projects',
    title: 'Project Management & Collaboration',
    description: 'Keep every project on track with Kanban boards, sprint planning, and team collaboration. See exactly where things stand and what needs attention — all in one view.',
    color: '#4f46e5',
    icon: 'view_kanban',
    features: [
      'Kanban boards with drag-and-drop',
      'Sprint planning & tracking',
      'Team member assignments',
      'Project timeline views',
      'File attachments & comments',
      'Status tracking & notifications',
    ],
    benefits: [
      'See every project at a glance',
      'Keep your team aligned and accountable',
      'No more status update meetings',
      'Works seamlessly with your other portal tools',
    ],
    process: [
      { title: 'Create a Project', description: 'Set up a project with goals, team members, and a timeline.' },
      { title: 'Break It Down', description: 'Add tasks, assign owners, and organize work into sprints or phases.' },
      { title: 'Track Progress', description: 'Move cards across your Kanban board as work progresses.' },
      { title: 'Ship & Review', description: 'Mark milestones complete and review what went well for next time.' },
    ],
  },
  {
    slug: 'crm',
    badge: 'CRM',
    title: 'Customer Relationship Management',
    description: 'Track every contact, company, and deal in one place. Manage your sales pipeline, send proposals, and close deals faster — with all your customer data connected to your other tools.',
    color: '#0ea5e9',
    icon: 'groups',
    features: [
      'Contact & company management',
      'Deal pipeline with stages',
      'Proposal builder & tracking',
      'Activity timeline per contact',
      'Custom fields & filters',
      'Import/export contacts',
    ],
    benefits: [
      'Never lose track of a lead or follow-up',
      'See your entire sales pipeline at a glance',
      'Send proposals directly from your CRM',
      'Connected to your email, website, and booking tools',
    ],
    process: [
      { title: 'Add Your Contacts', description: 'Import existing contacts or add them as they come in from your website and booking pages.' },
      { title: 'Track Deals', description: 'Create deals, move them through pipeline stages, and attach notes and files.' },
      { title: 'Send Proposals', description: 'Build and send branded proposals with e-signature support.' },
      { title: 'Close & Grow', description: 'Win deals, track revenue, and use insights to improve your sales process.' },
    ],
  },
  {
    slug: 'ai-chatbot',
    badge: 'AI Chatbot',
    title: 'AI Chatbot Trained on Your Content',
    description: 'Deploy an intelligent chatbot on your website that knows your business inside and out. Capture leads, answer support questions, and engage visitors 24/7 — powered by AI trained on your content.',
    color: '#a855f7',
    icon: 'smart_toy',
    features: [
      'Trained on your website & docs',
      'Lead capture & qualification',
      'Instant customer support',
      'Customizable personality & tone',
      'Conversation history & analytics',
      'Seamless handoff to human support',
    ],
    benefits: [
      'Answer customer questions instantly, 24/7',
      'Capture and qualify leads while you sleep',
      'Reduce support ticket volume',
      'Sounds like your brand, not a generic bot',
    ],
    process: [
      { title: 'Train on Your Content', description: 'Point the AI at your website, docs, or knowledge base and it learns your business.' },
      { title: 'Customize the Experience', description: 'Set the tone, personality, and what actions the bot can take.' },
      { title: 'Embed on Your Site', description: 'Add the chat widget to your website with a single line of code.' },
      { title: 'Monitor & Improve', description: 'Review conversations, refine responses, and watch your engagement grow.' },
    ],
  },
  {
    slug: 'hosting',
    badge: 'Hosting',
    title: 'Managed Hosting & Infrastructure',
    description: 'Fast, secure, worry-free hosting included with every website. SSL certificates, CDN, daily backups, and 99.9% uptime — so you can focus on your business, not your server.',
    color: '#64748b',
    icon: 'cloud',
    features: [
      'SSL certificates included',
      'Global CDN for fast load times',
      'Automatic daily backups',
      '99.9% uptime guarantee',
      'Custom domain support',
      'DDoS protection & security',
    ],
    benefits: [
      'Zero server management required',
      'Your site loads fast from anywhere in the world',
      'Sleep easy knowing backups run every day',
      'Enterprise-grade security at every tier',
    ],
    process: [
      { title: 'Connect Your Domain', description: 'Point your domain to our servers and SSL is provisioned automatically.' },
      { title: 'We Handle the Rest', description: 'CDN, caching, backups, and security updates are managed for you.' },
      { title: 'Monitor Performance', description: 'See uptime stats, load times, and bandwidth usage in your dashboard.' },
      { title: 'Scale When Ready', description: 'As your traffic grows, infrastructure scales with you seamlessly.' },
    ],
  },
];

export function getSolutionBySlug(slug: string): SolutionData | undefined {
  return solutions.find((solution) => solution.slug === slug);
}

export function getAllSolutions(): SolutionData[] {
  return solutions;
}
