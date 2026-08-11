import Image from 'next/image';
import { generateSEO } from '@/lib/utils/seo';
import { siteConfig } from '@/config/site';
import { ContactForm } from '@/components/forms/ContactForm';
import { BookingFormInline } from '@/components/blocks/render/BookingFormInline';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { PageHeader, CTABanner } from '@/components/retro/sections';
import { SectionHeading, RetroCard } from '@/components/retro/primitives';

// "30 Minute Consultation" booking page (#9) on the SimplerDevelopment client
// (client id 104) in the portal — bookings flow through our own platform.
// Served publicly at /book/<slug>.
const BOOKING_SLUG = '30-minute-consultation-mq0h6cgc';

// Pin the widget to this page's own palette instead of letting it resolve brand
// from the portal. We are an agency client: we own every site we build, so the
// client-level brand fallback can hand this widget a *showcase client's* colours
// and logo — on our own contact page. Passing explicit overrides (and hiding the
// logo) means this surface never depends on that resolution at all.
const BOOKING_STYLE = {
  primaryColor: '#FF5C2B',   // --retro-orange
  textColor: '#0B0D14',      // --retro-ink
  backgroundColor: 'transparent',
  formBg: 'transparent',
  buttonBg: '#FF5C2B',
  buttonText: '#FFFFFF',
} as const;

export const metadata = generateSEO({
  title: 'Contact Us',
  description: 'Get in touch with SimplerDevelopment - Let\'s discuss your next project and how we can help transform your digital presence.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Open A Channel"
        title="Get In Touch."
        subtitle="Have a project in mind? Tell us the mission parameters — we’ll help chart the flight plan."
      />

      {/* Two ways in: a booked call or a written message. */}
      <section className="bg-[var(--retro-cream)]">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <div className="grid gap-8 md:grid-cols-2">
            <SlideIn direction="left">
              <RetroCard title="Book A Flight Briefing" icon="satellite-dish">
                <p className="mb-6">30 minutes, no fluff — just your project and how we can help.</p>
                <BookingFormInline
                  slug={BOOKING_SLUG}
                  showPageTitle={false}
                  showLogo={false}
                  styleOverrides={BOOKING_STYLE}
                />
              </RetroCard>
            </SlideIn>

            <SlideIn direction="right" delay={0.1}>
              <RetroCard title="Send A Transmission" icon="radio-tower">
                <p className="mb-6">Prefer to write? Send a message and we&apos;ll get back to you within 24 hours.</p>
                <ContactForm />
              </RetroCard>
            </SlideIn>
          </div>
        </div>
      </section>

      {/* Direct lines — how to reach the crew without the form. */}
      <section className="bg-[var(--retro-ink)] text-[var(--retro-cream)]">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <SlideIn direction="up" delay={0.2}>
            <SectionHeading
              eyebrow="Direct Lines"
              title="Reach Us Directly."
              onDark
            />
            <div className="grid gap-5 md:grid-cols-3">
              {[
                {
                  title: 'Email',
                  value: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'info@simplerdevelopment.com',
                  art: 'satellite',
                },
                {
                  title: 'Location',
                  value: 'Remote & On-site Available',
                  art: 'observatory',
                },
                {
                  title: 'Business Hours',
                  value: 'Monday - Friday: 9:00 AM - 6:00 PM EST',
                  art: 'control-console',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-md border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[var(--retro-deep)] p-6 text-center"
                >
                  <Image
                    src={`/retro/${item.art}.webp`}
                    alt=""
                    width={120}
                    height={120}
                    className="mx-auto h-12 w-12 object-contain"
                  />
                  <h3 className="font-display mt-3 text-base font-bold text-[var(--retro-cream)]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </SlideIn>
        </div>
      </section>

      {/* Quick response guarantee. */}
      <section className="bg-[var(--retro-cream)]">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <FadeIn delay={0.1}>
            <div className="mx-auto max-w-2xl rounded-md border border-[var(--retro-orange)] bg-[color-mix(in_srgb,var(--retro-gold)_14%,var(--retro-cream))] p-8 text-center">
              <h3 className="font-display text-lg font-bold text-[var(--retro-ink)]">Quick Response Guarantee</h3>
              <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_78%,transparent)]">
                We respond to all inquiries within 24 hours during business days. Most messages get a reply within a
                few hours.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      <CTABanner
        title="Ready To Start The Mission?"
        subtitle="Free forever if you host it yourself. We'll be here either way."
        primary={{ href: '/portal/signup', label: 'Start Free' }}
        secondary={{ href: siteConfig.links.github, label: 'Read the Source' }}
        art="astronaut-pointing"
      />
    </>
  );
}
