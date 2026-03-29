import { generateSEO } from '@/lib/utils/seo';
import { Hero } from '@/components/sections/Hero';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { Card } from '@/components/ui/Card';

export const metadata = generateSEO({
  title: 'About Us',
  description: 'Simpler Development is a platform and agency that gives businesses the tools to manage their website, email, CRM, booking, and more — all from one place.',
  path: '/about',
});

const values = [
  {
    id: '1',
    title: 'Simplicity',
    description: 'Complex problems deserve elegant solutions. We replace a stack of disconnected tools with one platform that just works.',
    icon: 'auto_awesome',
  },
  {
    id: '2',
    title: 'Ownership',
    description: 'Your data, your brand, your platform. We build tools you control — not walled gardens that hold your business hostage.',
    icon: 'lock_open',
  },
  {
    id: '3',
    title: 'Partnership',
    description: 'We are not a faceless SaaS. Every client gets a real team of designers and developers who know their business.',
    icon: 'handshake',
  },
  {
    id: '4',
    title: 'Craft',
    description: 'Every feature is built with care. We ship quality over quantity and polish over hype.',
    icon: 'workspace_premium',
  },
];

const stats = [
  { label: 'Integrated Tools', value: '8+' },
  { label: 'Clients Served', value: '40+' },
  { label: 'Years Building Software', value: '16+' },
  { label: 'Uptime Guarantee', value: '99.9%' },
];

export default function AboutPage() {
  return (
    <>
      <Hero
        subtitle="About Simpler Development"
        title="The Platform and the Team Behind It"
        description="We built the all-in-one platform we wished existed — then paired it with a full-service agency so you never have to figure it out alone."
        ctaText="Book a Consultation"
        ctaLink="/contact"
        secondaryCtaText="See the Platform"
        secondaryCtaLink="/solutions"
      />

      {/* Mission Section */}
      <section className="py-20 bg-gradient-to-b from-background to-primary/3">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <FadeIn>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-6">Why We Built This</h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                We spent years watching small businesses juggle Squarespace for their site, Mailchimp for email,
                Calendly for booking, HubSpot for CRM, and Asana for projects — none of them talking to each other,
                all of them charging separately. So we built one platform that does it all, backed by a team that
                actually helps you use it.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <FadeIn>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">What We Stand For</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                The principles behind every feature we build and every client we serve
              </p>
            </FadeIn>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <SlideIn key={value.id} direction="up" delay={index * 0.1}>
                <Card
                  title={value.title}
                  description={value.description}
                  icon={value.icon}
                />
              </SlideIn>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-r from-primary/5 to-primary/3">
        <div className="container mx-auto px-4">
          <FadeIn>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                    {stat.value}
                  </div>
                  <div className="text-sm md:text-base text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* What Sets Us Apart */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-12 text-center">
                What Sets Us Apart
              </h2>
            </FadeIn>

            <div className="space-y-12">
              <SlideIn direction="left">
                <div className="flex flex-col md:flex-row gap-6 items-start p-6 rounded-xl bg-muted/30 border border-border">
                  <span className="material-icons text-5xl text-primary">hub</span>
                  <div>
                    <h3 className="font-heading text-2xl font-bold mb-3">Platform + Agency</h3>
                    <p className="text-muted-foreground">
                      Most SaaS tools give you software and leave you to figure it out. Most agencies build
                      something custom and hand you the keys. We do both — a powerful platform managed
                      and optimized by a team that knows your business.
                    </p>
                  </div>
                </div>
              </SlideIn>

              <SlideIn direction="right">
                <div className="flex flex-col md:flex-row gap-6 items-start p-6 rounded-xl bg-muted/30 border border-border">
                  <span className="material-icons text-5xl text-primary">sync_alt</span>
                  <div>
                    <h3 className="font-heading text-2xl font-bold mb-3">Everything Connected</h3>
                    <p className="text-muted-foreground">
                      Your website, email campaigns, CRM, booking pages, and projects all share data.
                      A new lead from your site automatically enters your CRM, gets a welcome email,
                      and can book a call — no Zapier required.
                    </p>
                  </div>
                </div>
              </SlideIn>

              <SlideIn direction="left">
                <div className="flex flex-col md:flex-row gap-6 items-start p-6 rounded-xl bg-muted/30 border border-border">
                  <span className="material-icons text-5xl text-primary">rocket_launch</span>
                  <div>
                    <h3 className="font-heading text-2xl font-bold mb-3">Ship Fast, Grow Steady</h3>
                    <p className="text-muted-foreground">
                      Most clients go live within a week. Start with a website and booking, then add
                      email marketing, CRM, and AI as you grow. The platform scales with your ambitions,
                      and our team is here at every step.
                    </p>
                  </div>
                </div>
              </SlideIn>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-b from-primary/3 to-background">
        <div className="container mx-auto px-4 text-center">
          <FadeIn>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
              Ready to See It in Action?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Book a free consultation and we'll walk you through the platform,
              answer your questions, and show you what's possible for your business.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-4 text-lg font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Book a Free Consultation
            </a>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
