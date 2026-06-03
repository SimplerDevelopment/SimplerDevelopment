import { generateSEO } from '@/lib/utils/seo';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';

export const metadata = generateSEO({
  title: 'Pricing',
  description: 'Tailored plans for every stage of growth. Every plan includes the full platform, agency setup, and managed hosting — book a call to get a custom quote.',
  path: '/pricing',
});

// TODO: replace 'Custom' with real pricing once plans are finalized
interface Tier {
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  features: string[];
  cta: string;
  highlight: boolean;
  badge?: string;
}

const tiers: Tier[] = [
  {
    name: 'Launch',
    tagline: 'Get online fast with a professional website and booking.',
    price: 'Custom',
    priceNote: 'Book a call for a quote',
    features: [
      'Website Builder (drag-and-drop editor)',
      'Managed Hosting (SSL, CDN, backups)',
      'Online Booking & Scheduling',
      'Basic CRM (contacts & pipeline)',
      'Agency setup & onboarding',
      'One custom domain',
    ],
    cta: 'Book a Consultation',
    highlight: false,
  },
  {
    name: 'Grow',
    tagline: 'Add marketing, ecommerce, and automation to your platform.',
    price: 'Custom',
    priceNote: 'Book a call for a quote',
    features: [
      'Everything in Launch',
      'Email Marketing (campaigns & sequences)',
      'Online Store & Ecommerce',
      'Surveys, Forms & Lead Capture',
      'Automations & Workflows',
      'Contracts & E-Sign',
      'Priority agency support',
    ],
    cta: 'Book a Consultation',
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Scale',
    tagline: 'Full platform access with AI and advanced project management.',
    price: 'Custom',
    priceNote: 'Book a call for a quote',
    features: [
      'Everything in Grow',
      'Company Brain (AI knowledge base)',
      'AI Connect (MCP / bring-your-own AI)',
      'AI-Powered Pitch Decks',
      'Project Management & Collaboration',
      'Advanced analytics & reporting',
      'Dedicated account manager',
    ],
    cta: 'Book a Consultation',
    highlight: false,
  },
  {
    name: 'Enterprise',
    tagline: 'Custom development, white-label options, and dedicated support.',
    price: 'Custom',
    priceNote: 'Let\'s talk',
    features: [
      'Everything in Scale',
      'White-label platform (your brand)',
      'Custom feature development',
      'Dedicated development team',
      'SLA-backed uptime guarantee',
      'On-site / executive onboarding',
      'Multi-site & agency licensing',
    ],
    cta: 'Get a Quote',
    highlight: false,
  },
];

const includedItems = [
  { icon: 'support_agent', label: 'Agency setup & support', description: 'Real humans who set up and run the platform with you.' },
  { icon: 'cloud_done', label: 'Managed hosting', description: 'SSL, CDN, daily backups, and 99.9% uptime — all included.' },
  { icon: 'update', label: 'All updates included', description: 'Platform improvements ship automatically, no maintenance required.' },
  { icon: 'login', label: 'One login for everything', description: 'Website, email, CRM, booking, and more — one dashboard.' },
];

const faqs = [
  {
    question: 'How is pricing determined?',
    answer: 'Every business is different in size, goals, and the tools they need. We work with you to build a plan that fits your stage — from a simple website + booking setup to a full platform with AI and automations. Pricing is based on the tools you use, your support level, and the scope of setup work.',
  },
  {
    question: 'Is there a contract or long-term commitment?',
    answer: 'We offer month-to-month and annual plans. Annual plans come with a meaningful discount. We believe in earning your business every month — not locking you in.',
  },
  {
    question: 'Can I add tools later as my business grows?',
    answer: 'Absolutely. Most clients start with Launch (website + booking) and add email marketing, CRM, automations, and AI as they grow. The platform is designed to scale with you — there\'s no migration cost to unlock new tools.',
  },
  {
    question: 'Do you offer white-label or agency plans?',
    answer: 'Yes. Enterprise clients can white-label the platform under their own brand and use it to serve their own clients. We also offer agency licensing for teams who want to build multiple client sites on one account. Book a call to discuss what that looks like for your business.',
  },
  {
    question: 'What\'s included in setup?',
    answer: 'Every plan includes a hands-on onboarding with our team. We help configure your platform, migrate existing content, set up your domain, and train you on the tools. For larger plans, setup includes custom design, data migration, and workflow configuration.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-24 md:py-32 overflow-hidden bg-dot-grid">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <FadeIn>
              <p className="text-primary font-mono text-sm font-semibold mb-4 tracking-wider">{'// PRICING'}</p>
            </FadeIn>
            <FadeIn delay={0.1}>
              <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 leading-[1.05]">
                Simple Pricing.{' '}
                <span className="text-primary">Everything Included.</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.2}>
              <p className="text-xl text-muted-foreground max-w-xl">
                Every plan is tailored to your business and includes the full platform plus dedicated agency support. No nickel-and-diming — one plan, everything connected.
              </p>
              <div className="mt-6 w-20 h-1 bg-gradient-to-r from-primary to-accent-warm rounded-full" />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Tier Cards */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <FadeIn>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Choose Your Plan</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                All plans are custom-quoted — book a call and we&apos;ll build a package around your exact needs.
              </p>
            </FadeIn>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {tiers.map((tier, index) => (
              <SlideIn key={tier.name} direction="up" delay={index * 0.08}>
                <div
                  className={`relative flex flex-col h-full rounded-2xl border p-7 bg-background transition-shadow hover:shadow-lg ${
                    tier.highlight
                      ? 'border-primary shadow-md shadow-primary/10'
                      : 'border-border'
                  }`}
                >
                  {tier.badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full tracking-wide">
                        {tier.badge}
                      </span>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="font-display text-2xl font-bold mb-1">{tier.name}</h3>
                    <p className="text-sm text-muted-foreground leading-snug">{tier.tagline}</p>
                  </div>

                  <div className="mb-6 pb-6 border-b border-border">
                    <div className="text-3xl font-bold">{tier.price}</div>
                    <div className="text-xs text-muted-foreground mt-1">{tier.priceNote}</div>
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <span className="material-icons text-base text-primary mt-0.5 flex-shrink-0">check_circle</span>
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    href="/contact"
                    size="md"
                    variant={tier.highlight ? 'default' : 'outline'}
                    className="w-full justify-center"
                  >
                    {tier.cta}
                  </Button>
                </div>
              </SlideIn>
            ))}
          </div>
        </div>
      </section>

      {/* Everything Includes Strip */}
      <section className="py-20 section-dark relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-5" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-12">
                <p className="font-mono text-sm font-semibold mb-3 tracking-wider opacity-50">{'// EVERY PLAN'}</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  What&apos;s Always Included
                </h2>
                <p className="text-lg opacity-70 max-w-2xl mx-auto">
                  No matter which tier you choose, these are non-negotiables
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 rounded-2xl overflow-hidden">
              {includedItems.map((item, i) => (
                <SlideIn key={item.label} direction="up" delay={i * 0.1}>
                  <div className="p-8 bg-foreground text-background h-full">
                    <span className="material-icons text-3xl mb-4 block" style={{ color: '#60a5fa' }}>{item.icon}</span>
                    <h3 className="font-heading text-base font-bold mb-1">{item.label}</h3>
                    <p className="text-sm opacity-60">{item.description}</p>
                  </div>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <FadeIn>
              <div className="text-center mb-14">
                <p className="text-primary font-mono text-sm font-semibold mb-3 tracking-wider">{'// FAQ'}</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  Common Questions
                </h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  Honest answers about how pricing and plans work
                </p>
              </div>
            </FadeIn>

            <div className="space-y-5">
              {faqs.map((faq, index) => (
                <SlideIn key={index} direction="up" delay={index * 0.07}>
                  <div className="p-6 rounded-xl bg-background border border-border">
                    <h3 className="font-heading text-lg font-bold mb-2 flex items-start gap-2">
                      <span className="material-icons text-primary text-xl mt-0.5 flex-shrink-0">help_outline</span>
                      {faq.question}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed pl-7">{faq.answer}</p>
                  </div>
                </SlideIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-accent-warm/5" />

        <div className="container mx-auto px-4 text-center relative z-10">
          <FadeIn>
            <p className="text-primary font-mono text-sm font-semibold mb-4 tracking-wider">{'// NEXT STEP'}</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Ready to Get a Quote?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Book a free consultation and we&apos;ll walk you through the platform, understand your goals, and put together a plan built around your business.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/contact" size="lg">
                Book a Free Consultation
                <span className="material-icons text-lg ml-1">arrow_forward</span>
              </Button>
              <Button href="/solutions" variant="outline" size="lg">
                Explore the Platform
              </Button>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
