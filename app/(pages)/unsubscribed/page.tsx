// Confirmation page after a click on the one-click-unsubscribe link
// (see app/api/email/unsubscribe/route.ts). Short and low-stakes, so retro
// voice is fine here — but the outcome ("you're off the list") has to stay
// unambiguous, so the headline and confirmation line are kept literal.
import { PageHeader, CreamBand, CTABanner } from '@/components/retro/sections';

export default function UnsubscribedPage() {
  return (
    <>
      <PageHeader eyebrow="Transmission Ended" title="You&rsquo;ve Been Unsubscribed." />

      <CreamBand className="!py-12 sm:!py-16">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_82%,transparent)]">
            Confirmed — you&rsquo;ve been removed from our mailing list. No further transmissions will
            land in your inbox.
          </p>
        </div>
      </CreamBand>

      <CTABanner
        title="Change Your Mind?"
        subtitle="Reach out any time — we're happy to add you back or answer a question directly."
        primary={{ href: '/contact', label: 'Contact Us' }}
        secondary={{ href: '/', label: 'Back To The Homepage' }}
        art="satellite-dish"
      />
    </>
  );
}
