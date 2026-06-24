import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, suggestedProjects } from '@/lib/db/schema';
import { eq, isNull, or, and } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { pBtnPrimary, pBtnGhost, pSectionTitle } from '@/components/portal/portal-ui';

// ─── Category-specific content & design configs ──────────────────────────────

interface CategoryConfig {
  heroGradient: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  iconBg: string;
  tagline: string;
  subtagline: string;
  valueProps: { icon: string; title: string; body: string }[];
  process: { icon: string; label: string; desc: string }[];
  faqs: { q: string; a: string }[];
  statLabel: string;
  statValue: string;
  statIcon: string;
}

const configs: Record<string, CategoryConfig> = {
  website: {
    heroGradient: 'from-blue-600 via-blue-500 to-cyan-500',
    accentColor: 'text-blue-600 dark:text-blue-400',
    accentBg: 'bg-blue-50 dark:bg-blue-950/40',
    accentBorder: 'border-blue-200 dark:border-blue-800/50',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    tagline: 'A Website That Works as Hard as You Do',
    subtagline: 'Most business websites lose 70% of visitors in the first 10 seconds. Ours don\'t — because every element is built around converting visitors into customers.',
    valueProps: [
      { icon: 'trending_up', title: 'Rank Higher on Google', body: 'Built with structured data, fast load times, and clean code that search engines reward.' },
      { icon: 'devices', title: 'Flawless on Every Device', body: 'Mobile-first design that looks perfect whether someone finds you on a phone, tablet, or desktop.' },
      { icon: 'bolt', title: 'Speed That Converts', body: 'Sites that load in under 2 seconds see 15% higher conversions. We optimize every asset.' },
    ],
    process: [
      { icon: 'forum', label: 'Discovery', desc: 'We learn your goals, audience, and competitive landscape before designing a single pixel.' },
      { icon: 'draw', label: 'Design & Build', desc: 'You review and approve the design before development begins. No surprises.' },
      { icon: 'rocket_launch', label: 'Launch & Grow', desc: 'Go live with full training, SEO setup, and a 30-day support window.' },
    ],
    faqs: [
      { q: 'How long does a website project typically take?', a: 'Most website projects are complete in 3–6 weeks depending on scope and how quickly feedback rounds go.' },
      { q: 'Will I be able to update the content myself?', a: 'Yes — we build on platforms you can manage, and provide training so you\'re never dependent on us for basic updates.' },
      { q: 'Do you handle hosting and domain setup?', a: 'We can manage everything — hosting, domain, SSL, DNS — or work within your existing setup. Your choice.' },
    ],
    statLabel: 'Average increase in leads after launch',
    statValue: '3×',
    statIcon: 'show_chart',
  },
  ecommerce: {
    heroGradient: 'from-emerald-600 via-emerald-500 to-teal-400',
    accentColor: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    accentBorder: 'border-emerald-200 dark:border-emerald-800/50',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    tagline: 'Your Store, Open 24/7 and Built to Sell',
    subtagline: 'A complete e-commerce experience — designed to reduce cart abandonment, build trust at checkout, and turn browsers into buyers from day one.',
    valueProps: [
      { icon: 'payments', title: 'Frictionless Checkout', body: 'Streamlined payment flows with Stripe, Apple Pay, and more. Fewer steps means more completed purchases.' },
      { icon: 'inventory_2', title: 'Easy Product Management', body: 'Add products, manage inventory, and fulfill orders without needing technical knowledge.' },
      { icon: 'insights', title: 'Built-In Analytics', body: 'Know exactly which products are driving revenue, where customers drop off, and how to improve.' },
    ],
    process: [
      { icon: 'category', label: 'Catalog Setup', desc: 'Products, categories, variants, and pricing configured and imported.' },
      { icon: 'palette', label: 'Brand & Design', desc: 'Your brand identity applied to every page — from homepage to confirmation email.' },
      { icon: 'local_shipping', label: 'Go Live', desc: 'Shipping zones, tax rules, and payment gateways tested and ready to process orders.' },
    ],
    faqs: [
      { q: 'What payment processors do you support?', a: 'Stripe, PayPal, Apple Pay, Google Pay, and most major processors. We set them all up and test before launch.' },
      { q: 'Can I manage the store myself after launch?', a: 'Absolutely. We build on platforms designed for non-technical owners and provide a walkthrough before handoff.' },
      { q: 'What about shipping and taxes?', a: 'We configure shipping zones, carrier rates, and automatic tax calculation based on your locations and products.' },
    ],
    statLabel: 'Average revenue recovered via cart optimization',
    statValue: '18%',
    statIcon: 'shopping_cart',
  },
  mobile: {
    heroGradient: 'from-violet-600 via-purple-500 to-fuchsia-500',
    accentColor: 'text-violet-600 dark:text-violet-400',
    accentBg: 'bg-violet-50 dark:bg-violet-950/40',
    accentBorder: 'border-violet-200 dark:border-violet-800/50',
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    tagline: 'Put Your Business in Every Pocket',
    subtagline: 'Mobile apps have 3× higher engagement than websites. Give your customers an experience they\'ll use daily — on iOS and Android, built to feel native on both.',
    valueProps: [
      { icon: 'notifications_active', title: 'Re-Engage Instantly', body: 'Push notifications bring customers back at exactly the right moment — promotions, reminders, or updates.' },
      { icon: 'offline_bolt', title: 'Works Without Wi-Fi', body: 'Core features stay available offline. No more frustrated users when the signal drops.' },
      { icon: 'star_rate', title: 'App Store Presence', body: 'We handle submission to both the Apple App Store and Google Play, including review compliance.' },
    ],
    process: [
      { icon: 'lightbulb', label: 'Strategy & UX', desc: 'Map out every user flow and screen before a line of code is written.' },
      { icon: 'phone_iphone', label: 'Design & Build', desc: 'Native-feeling UI built with React Native, reviewed on real devices throughout.' },
      { icon: 'publish', label: 'Submit & Support', desc: 'App Store and Play Store submissions handled — plus a support window post-launch.' },
    ],
    faqs: [
      { q: 'Does it work on both iPhone and Android?', a: 'Yes. We build with React Native which delivers native performance on both platforms from a single codebase.' },
      { q: 'How do app store submissions work?', a: 'We manage the entire process — developer accounts, review guidelines compliance, screenshots, and release notes.' },
      { q: 'Can the app connect to my existing website or backend?', a: 'Absolutely. We integrate with your existing APIs, databases, or third-party services during the build.' },
    ],
    statLabel: 'Higher engagement vs. mobile web',
    statValue: '3×',
    statIcon: 'phone_iphone',
  },
  maintenance: {
    heroGradient: 'from-amber-500 via-orange-500 to-red-400',
    accentColor: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-50 dark:bg-amber-950/40',
    accentBorder: 'border-amber-200 dark:border-amber-800/50',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    tagline: 'Your Website, Always Online. Never a Worry.',
    subtagline: 'A hacked or broken website costs an average of $200/hour in lost business. Our maintenance plan catches problems before they happen — so you never find out the hard way.',
    valueProps: [
      { icon: 'security', title: 'Security Before It\'s a Problem', body: 'Plugin updates, vulnerability patches, and malware scans run on a strict schedule — not after an incident.' },
      { icon: 'backup', title: 'Daily Backups, Instant Restore', body: 'Full-site backups every 24 hours. If anything ever goes wrong, we restore in minutes, not days.' },
      { icon: 'monitor_heart', title: 'Uptime Monitoring 24/7', body: 'We\'re alerted the second your site goes down — often resolving issues before you or your customers notice.' },
    ],
    process: [
      { icon: 'link', label: 'Onboard in Minutes', desc: 'We connect to your hosting, set up monitoring tools, and baseline your site\'s current health.' },
      { icon: 'autorenew', label: 'Ongoing Maintenance', desc: 'Automated and manual updates, security scans, and performance checks run continuously.' },
      { icon: 'summarize', label: 'Monthly Reports', desc: 'A plain-language summary of everything done, any issues caught, and your site\'s health score.' },
    ],
    faqs: [
      { q: 'What happens if my site gets hacked?', a: 'Malware removal and full restoration is included at no extra charge. We handle it completely — you just get notified when it\'s done.' },
      { q: 'Do I need to do anything once I sign up?', a: 'Nothing. We handle everything in the background. You\'ll hear from us monthly, and only urgently if something needs your input.' },
      { q: 'Does this work with any hosting provider?', a: 'Yes — we work with all major hosts including GoDaddy, Bluehost, WP Engine, Cloudflare, and custom setups.' },
    ],
    statLabel: 'Sites protected without a single incident this year',
    statValue: '100%',
    statIcon: 'verified_user',
  },
  branding: {
    heroGradient: 'from-rose-500 via-pink-500 to-fuchsia-400',
    accentColor: 'text-rose-600 dark:text-rose-400',
    accentBg: 'bg-rose-50 dark:bg-rose-950/40',
    accentBorder: 'border-rose-200 dark:border-rose-800/50',
    iconBg: 'bg-rose-100 dark:bg-rose-900/40',
    tagline: 'A Brand That Gets You Remembered',
    subtagline: 'It takes 7 seconds to form a first impression. Professional branding ensures yours says exactly what you want — before you\'ve spoken a single word.',
    valueProps: [
      { icon: 'visibility', title: 'Stand Out Instantly', body: 'A distinctive logo and visual identity that sets you apart in a crowded market and sticks in memory.' },
      { icon: 'verified', title: 'Build Instant Credibility', body: 'Consistent, polished branding signals professionalism and builds the trust new customers need to buy.' },
      { icon: 'style', title: 'Consistent Everywhere', body: 'Brand guidelines covering all touchpoints — social, print, web — so you always look cohesive and intentional.' },
    ],
    process: [
      { icon: 'search', label: 'Discovery', desc: 'We research your industry, competitors, and ideal audience to ground every design decision in strategy.' },
      { icon: 'brush', label: 'Design & Refine', desc: 'Multiple concepts presented, refined through collaborative feedback rounds until it\'s exactly right.' },
      { icon: 'folder_zip', label: 'Brand Kit Delivery', desc: 'Every file you\'ll ever need — logos in all formats, color codes, typography specs, and usage guidelines.' },
    ],
    faqs: [
      { q: 'What\'s included in the brand kit?', a: 'Full logo suite (primary, secondary, icon-only), color palette, typography system, brand guidelines PDF, and all source files.' },
      { q: 'How many logo concepts will I see?', a: 'We present 3 distinct directions to start. Once you choose a direction, we refine through up to 3 revision rounds.' },
      { q: 'Can you match branding to an existing website or product?', a: 'Absolutely — we audit your existing materials and build a brand identity that evolves rather than replaces what you have.' },
    ],
    statLabel: 'Increase in perceived value after rebrand',
    statValue: '2.5×',
    statIcon: 'trending_up',
  },
  development: {
    heroGradient: 'from-slate-700 via-slate-600 to-indigo-600',
    accentColor: 'text-indigo-600 dark:text-indigo-400',
    accentBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    accentBorder: 'border-indigo-200 dark:border-indigo-800/50',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/40',
    tagline: 'Custom Software Built for Your Exact Workflow',
    subtagline: 'Off-the-shelf tools cost you time in workarounds and money in unused features. A custom solution does exactly what you need — nothing more, nothing less.',
    valueProps: [
      { icon: 'extension', title: 'Fits Like a Glove', body: 'Every feature maps to a real workflow step in your business. No bloat, no compromises, no workarounds.' },
      { icon: 'lock', title: 'Secure & Well-Tested', body: 'Full test coverage, security review, and code written to standards you can hand off to any developer.' },
      { icon: 'open_in_new', title: 'Scales With Your Growth', body: 'Architecture designed for growth — built to handle 10× the load without a rewrite.' },
    ],
    process: [
      { icon: 'description', label: 'Spec & Scope', desc: 'Requirements documented in detail before a line of code is written. No scope creep surprises.' },
      { icon: 'code', label: 'Build & Review', desc: 'Agile development with demo check-ins so you see progress and give feedback throughout.' },
      { icon: 'deployed_code', label: 'Deploy & Handoff', desc: 'Production deployment with full documentation, code ownership, and a training session.' },
    ],
    faqs: [
      { q: 'Will I own the code?', a: 'Yes, completely. You receive full ownership of all source code, documentation, and deployment scripts.' },
      { q: 'What tech stack do you use?', a: 'We primarily build with Next.js, React, TypeScript, and PostgreSQL — proven, battle-tested tools with a large support ecosystem.' },
      { q: 'What happens if something breaks after launch?', a: 'All projects include a post-launch support window. We also offer ongoing maintenance retainers for long-term peace of mind.' },
    ],
    statLabel: 'Average manual hours saved per week via automation',
    statValue: '12h',
    statIcon: 'timer',
  },
  other: {
    heroGradient: 'from-primary via-primary/80 to-primary/60',
    accentColor: 'text-primary',
    accentBg: 'bg-primary/5',
    accentBorder: 'border-primary/20',
    iconBg: 'bg-primary/10',
    tagline: 'Let\'s Build Something Great Together',
    subtagline: 'Every great business has unique needs. This is a tailored solution designed specifically around your goals — not a template, not a workaround.',
    valueProps: [
      { icon: 'handshake', title: 'Built Around You', body: 'We adapt our process, technology, and approach to fit your specific situation — not the other way around.' },
      { icon: 'support_agent', title: 'Direct Access', body: 'Work directly with the people building your project. No account managers, no relay of information.' },
      { icon: 'verified_user', title: 'Satisfaction Guaranteed', body: 'We don\'t consider a project done until you\'re genuinely happy with the result.' },
    ],
    process: [
      { icon: 'forum', label: 'Discovery', desc: 'A focused conversation to understand your goals, constraints, and definition of success.' },
      { icon: 'build', label: 'Execute', desc: 'Build and iterate with transparent progress updates throughout.' },
      { icon: 'check_circle', label: 'Deliver & Support', desc: 'Launch with documentation and a support window so you\'re never left hanging.' },
    ],
    faqs: [
      { q: 'How do we get started?', a: 'Open a ticket below — we\'ll schedule a discovery call to understand your needs and put together a detailed proposal.' },
      { q: 'How are projects priced?', a: 'We offer fixed-price quotes for well-defined scope, and time-and-materials for exploratory or evolving projects.' },
      { q: 'What if I\'m not sure what I need?', a: 'That\'s exactly what the discovery call is for. Come with a problem to solve — we\'ll help figure out the right solution.' },
    ],
    statLabel: 'Client satisfaction rate',
    statValue: '100%',
    statIcon: 'star',
  },
};

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

const categoryLabel: Record<string, string> = {
  website: 'Website',
  ecommerce: 'E-Commerce',
  mobile: 'Mobile App',
  maintenance: 'Maintenance',
  branding: 'Branding',
  development: 'Development',
  other: 'Other',
};

export default async function SuggestedProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) notFound();

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) redirect('/portal/dashboard');

  const [item] = await db
    .select()
    .from(suggestedProjects)
    .where(
      and(
        eq(suggestedProjects.id, projectId),
        eq(suggestedProjects.active, true),
        or(
          isNull(suggestedProjects.clientId),
          eq(suggestedProjects.clientId, client.id),
        ),
      ),
    )
    .limit(1);

  if (!item) notFound();

  const cfg = configs[item.category] ?? configs.other;
  const features = (item.features ?? []) as string[];
  const hasSurvey = ((item.surveyFields ?? []) as unknown[]).length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal/suggested-projects" className="hover:text-foreground transition-colors flex items-center gap-1">
          <span className="material-icons text-sm">arrow_back</span>
          Suggested Projects
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span className="text-foreground truncate">{item.title}</span>
      </div>

      {/* ── Hero ── */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${cfg.heroGradient} text-white`}>
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-16 -left-8 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <span className="material-icons text-3xl text-white">{item.icon}</span>
            </div>
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              {categoryLabel[item.category] ?? item.category}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">{item.title}</h1>
          <p className="text-white/80 text-lg leading-relaxed max-w-xl">
            {item.description || cfg.tagline}
          </p>

          {/* Price + Timeline + CTA */}
          <div className="mt-8 flex items-end gap-8 flex-wrap">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Estimated cost</p>
              <p className="text-4xl font-bold">
                {item.estimatedPrice ? formatCents(item.estimatedPrice) : 'Quote on request'}
              </p>
              <p className="text-white/60 text-xs mt-1">Billed hourly — final cost depends on scope</p>
            </div>
            {item.estimatedTimeline && (
              <div>
                <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Timeline</p>
                <p className="text-2xl font-semibold flex items-center gap-2">
                  <span className="material-icons text-xl text-white/80">schedule</span>
                  {item.estimatedTimeline}
                </p>
              </div>
            )}
            <div className="ml-auto self-end">
              <Link
                href={`/portal/suggested-projects/${item.id}/request`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-foreground rounded-xl font-bold text-sm hover:bg-white/90 transition-colors shadow-lg"
              >
                <span className="material-icons text-base">{hasSurvey ? 'assignment' : 'chat'}</span>
                {hasSurvey ? 'Get started' : 'Request this project'}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Why this matters ── */}
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">Why this matters</p>
        <p className={`text-lg text-foreground leading-relaxed border-l-4 ${cfg.accentBorder} pl-4`}>
          {cfg.subtagline}
        </p>
      </div>

      {/* ── Value props ── */}
      <div className="grid sm:grid-cols-3 gap-4">
        {cfg.valueProps.map((vp, i) => (
          <div key={i} className={`rounded-xl border ${cfg.accentBorder} ${cfg.accentBg} p-5`}>
            <div className={`w-10 h-10 rounded-lg ${cfg.iconBg} flex items-center justify-center mb-3`}>
              <span className={`material-icons text-xl ${cfg.accentColor}`}>{vp.icon}</span>
            </div>
            <h3 className="font-semibold text-foreground text-sm mb-1">{vp.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{vp.body}</p>
          </div>
        ))}
      </div>

      {/* ── What's included ── */}
      {features.length > 0 && (
        <div className="bg-background border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <span className={`material-icons text-lg ${cfg.accentColor}`}>checklist</span>
            <h2 className={pSectionTitle}>What&apos;s included</h2>
            <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {features.length} deliverable{features.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-border">
            {features.map((f, i) => (
              <div key={i} className="px-6 py-3.5 flex items-center gap-3">
                <span className="material-icons text-green-600 dark:text-green-400 text-lg flex-shrink-0">check_circle</span>
                <span className="text-foreground text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat callout ── */}
      <div className={`rounded-2xl bg-gradient-to-br ${cfg.heroGradient} p-6 flex items-center gap-5`}>
        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <span className="material-icons text-3xl text-white">{cfg.statIcon}</span>
        </div>
        <div>
          <p className="text-4xl font-bold text-white">{cfg.statValue}</p>
          <p className="text-white/80 text-sm mt-0.5">{cfg.statLabel}</p>
        </div>
      </div>

      {/* ── How it works ── */}
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-6">How it works</p>
        <div className="relative">
          {/* Connecting line */}
          <div className="hidden sm:block absolute top-7 left-7 right-7 h-0.5 bg-border z-0" />
          <div className="grid sm:grid-cols-3 gap-6 relative z-10">
            {cfg.process.map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-3">
                <div className={`w-14 h-14 rounded-full ${cfg.iconBg} border-4 border-background flex items-center justify-center`}>
                  <span className={`material-icons text-xl ${cfg.accentColor}`}>{step.icon}</span>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <span className="text-xs font-bold text-muted-foreground">0{i + 1}</span>
                    <h3 className="font-semibold text-foreground text-sm">{step.label}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">Common questions</p>
        <div className="space-y-3">
          {cfg.faqs.map((faq, i) => (
            <div key={i} className="bg-background border border-border rounded-xl p-5">
              <p className="font-semibold text-foreground text-sm mb-1.5 flex items-start gap-2">
                <span className={`material-icons text-base flex-shrink-0 mt-0.5 ${cfg.accentColor}`}>help_outline</span>
                {faq.q}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed pl-6">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="bg-background border border-border rounded-2xl overflow-hidden">
        <div className={`h-1.5 bg-gradient-to-r ${cfg.heroGradient}`} />
        <div className="p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className={pSectionTitle}>Ready to move forward?</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {hasSurvey
                ? 'Fill out a quick intake form and we\'ll put together a detailed proposal.'
                : 'Send us a message and we\'ll schedule a free discovery call — no commitment, just a conversation.'}
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <span className="material-icons text-sm text-green-600 dark:text-green-400">check</span>
                Free consultation
              </span>
              <span className="flex items-center gap-1">
                <span className="material-icons text-sm text-green-600 dark:text-green-400">check</span>
                Detailed proposal included
              </span>
              <span className="flex items-center gap-1">
                <span className="material-icons text-sm text-green-600 dark:text-green-400">check</span>
                No pressure
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <Link
              href={`/portal/suggested-projects/${item.id}/request`}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">{hasSurvey ? 'assignment' : 'chat'}</span>
              {hasSurvey ? 'Start intake form' : 'Start a conversation'}
            </Link>
            <Link
              href="/portal/suggested-projects"
              className={pBtnGhost}
            >
              <span className="material-icons text-sm">arrow_back</span>
              Browse other suggestions
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
