import Script from 'next/script';
import { generateSEO } from '@/lib/utils/seo';
import { ContactForm } from '@/components/forms/ContactForm';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';

export const metadata = generateSEO({
  title: 'Contact Us',
  description: 'Get in touch with SimplerDevelopment - Let\'s discuss your next project and how we can help transform your digital presence.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <div className="container mx-auto px-4 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <FadeIn>
            <p className="text-primary font-semibold mb-4 text-sm">Let&apos;s Talk</p>
            <h1 className="font-display text-4xl md:text-6xl font-bold mb-4">Get in Touch</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Have a project in mind? Let&apos;s discuss how we can help bring your vision to life.
            </p>
          </FadeIn>
        </div>

        {/* Contact Options - Side by Side */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Schedule a Meeting */}
          <div>
            <SlideIn direction="left">
              <div className="border border-border rounded-xl p-6 h-full bg-background">
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                  Schedule a Meeting
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Book a 30-minute call to discuss your project
                </p>
                {/* Calendly inline widget begin */}
                <div className="calendly-inline-widget" data-url="https://calendly.com/danielpcoyle-info/30min" style={{ minWidth: '320px', height: '600px' }}></div>
                <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
                {/* Calendly inline widget end */}
              </div>
            </SlideIn>
          </div>

          {/* Send a Message */}
          <div>
            <SlideIn direction="right" delay={0.1}>
              <div className="border border-border rounded-xl p-6 h-full bg-background">
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                  Send a Message
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Prefer to write? Send us a message and we&apos;ll get back to you within 24 hours
                </p>
                <ContactForm />
              </div>
            </SlideIn>
          </div>
        </div>

        {/* Contact Info - Bottom Section */}
        <div className="border-t border-border pt-12">
          <SlideIn direction="up" delay={0.2}>
            <div className="grid md:grid-cols-3 gap-8 mb-8">
              <div className="text-center p-6 rounded-xl bg-muted/30 border border-border">
                <div className="flex justify-center mb-3">
                  <svg
                    className="w-8 h-8 text-primary"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">Email</h3>
                <p className="text-muted-foreground">contact@simplerdevelopment.com</p>
              </div>

              <div className="text-center p-6 rounded-xl bg-muted/30 border border-border">
                <div className="flex justify-center mb-3">
                  <svg
                    className="w-8 h-8 text-primary"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">Location</h3>
                <p className="text-muted-foreground">Remote & On-site Available</p>
              </div>

              <div className="text-center p-6 rounded-xl bg-muted/30 border border-border">
                <div className="flex justify-center mb-3">
                  <svg
                    className="w-8 h-8 text-primary"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">Business Hours</h3>
                <p className="text-muted-foreground">
                  Monday - Friday: 9:00 AM - 6:00 PM EST
                </p>
              </div>
            </div>

            <div className="max-w-2xl mx-auto p-6 bg-primary/5 border border-primary/10 rounded-xl text-center">
              <h3 className="font-semibold mb-2">Quick Response Guarantee</h3>
              <p className="text-muted-foreground text-sm">
                We respond to all inquiries within 24 hours during business days. Most messages get a reply within a few hours.
              </p>
            </div>
          </SlideIn>
        </div>
      </div>
    </div>
  );
}
