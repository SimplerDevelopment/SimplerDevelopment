import { generateSEO } from '@/lib/utils/seo';
import { formatMoney } from '@/lib/utils/money';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { TIERS } from '@/lib/billing/domain-catalog';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateFAQSchema } from '@/lib/utils/structured-data';

export const metadata = generateSEO({
  title: 'Pricing',
  description: 'Simple, transparent per-seat pricing. Starter $19 · Growth $59 · Scale $119. 14-day free trial, no credit card required.',
  path: '/pricing',
});

const faqs = [
  {
    question: 'Is there really a free trial?',
    answer: '14 days, no credit card required. You get full access to every feature in your chosen plan so you can see real value before you pay anything.',
  },
  {
    question: 'What counts as a "seat"?',
    answer: 'A seat is one team member with portal access. Client-facing websites, booking pages, and forms don\'t consume seats — only the people logging in to run your business.',
  },
  {
    question: 'Can I switch plans later?',
    answer: 'Yes. Upgrades take effect immediately (you\'re charged the prorated difference). Downgrades take effect at the start of your next billing cycle.',
  },
  {
    question: 'What is BYOK on Scale?',
    answer: 'Bring Your Own Key — connect your own OpenAI or Anthropic API key and use the AI agent at cost with no platform markup. Scale also ships with 3M included tokens/mo for teams that don\'t want to manage a key.',
  },
  {
    question: 'Do you offer agency or white-label plans?',
    answer: 'Yes — contact us and we\'ll put together a custom quote for multi-seat agency accounts, white-label portals, or reseller arrangements.',
  },
];


export default function PricingPage() {
  const faqSchema = generateFAQSchema(faqs);
  return (
    <>
      <StructuredData data={faqSchema} />
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
                One price.{' '}
                <span className="text-primary">Everything included.</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.2}>
              <p className="text-xl text-muted-foreground max-w-xl">
                Per-seat, month-to-month. Start a free trial in seconds — no credit card required, no setup fees, no lock-in.
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
                14-day free trial on every plan. Cancel any time.
              </p>
            </FadeIn>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {TIERS.map((tier, index) => {
              const isHero = tier.key === 'growth';
              return (
                <SlideIn key={tier.slug} direction="up" delay={index * 0.08}>
                  <div
                    className={`relative flex flex-col h-full rounded-2xl border p-7 bg-background transition-shadow hover:shadow-lg ${
                      isHero
                        ? 'border-primary shadow-lg shadow-primary/15 ring-1 ring-primary/20'
                        : 'border-border'
                    }`}
                  >
                    {isHero && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full tracking-wide">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="mb-6">
                      <h3 className="font-display text-2xl font-bold mb-1">{tier.name}</h3>
                      <p className="text-sm text-muted-foreground leading-snug">{tier.tagline}</p>
                    </div>

                    <div className="mb-6 pb-6 border-b border-border">
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-bold">{formatMoney(tier.monthlyPriceCents, { fractionDigits: 0 })}</span>
                        <span className="text-sm text-muted-foreground mb-1.5">/seat/mo</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        14-day free trial · no credit card required
                      </div>
                      {tier.byokEligible && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium">
                          <span className="material-icons text-base leading-none">vpn_key</span>
                          BYOK — use AI at cost, no markup
                        </div>
                      )}
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
                      href={`/portal/signup?plan=${tier.slug}`}
                      size="md"
                      variant={isHero ? 'default' : 'outline'}
                      className="w-full justify-center"
                    >
                      Start free trial
                      <span className="material-icons text-lg ml-1">arrow_forward</span>
                    </Button>
                  </div>
                </SlideIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* What's Always Included strip */}
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
              {[
                { icon: 'cloud_done', label: 'Managed hosting', description: 'SSL, CDN, daily backups, and 99.9% uptime — all included.' },
                { icon: 'update', label: 'All updates included', description: 'Platform improvements ship automatically, no maintenance required.' },
                { icon: 'lock', label: 'SOC 2-ready tenancy', description: 'Your data is isolated per workspace — strict multi-tenant boundaries.' },
                { icon: 'login', label: 'One login for everything', description: 'Website, email, CRM, Brain, booking, and more — one dashboard.' },
              ].map((item, i) => (
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

      {/* FAQ */}
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

      {/* Bottom CTA */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-accent-warm/5" />

        <div className="container mx-auto px-4 text-center relative z-10">
          <FadeIn>
            <p className="text-primary font-mono text-sm font-semibold mb-4 tracking-wider">{'// NEXT STEP'}</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Ready to start?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Pick a plan above and start your free trial in under a minute. No credit card needed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/portal/signup" size="lg">
                Start free trial
                <span className="material-icons text-lg ml-1">arrow_forward</span>
              </Button>
              <Button href="/solutions" variant="outline" size="lg">
                Explore the Platform
              </Button>
            </div>

            <p className="mt-10 text-sm text-muted-foreground">
              Need a custom agency plan?{' '}
              <a href="/contact" className="text-primary underline underline-offset-2 hover:opacity-80">
                Book a consultation
              </a>{' '}
              and we&apos;ll build a quote around your needs.
            </p>
          </FadeIn>
        </div>
      </section>
    </div>
    </>
  );
}
