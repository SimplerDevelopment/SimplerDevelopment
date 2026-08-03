import { generateSEO } from '@/lib/utils/seo';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { solutions } from '@/lib/data/solutions';

export const metadata = generateSEO({
  title: 'About Us',
  description:
    'Simpler Development replaces the stack of disconnected tools small businesses juggle — website, email, CRM, booking, projects — with one platform, backed by a team that helps you use it.',
  path: '/about',
});

// Swiss-systematic direction (see the four-part brief in the vault design note).
// Deliberate: nothing on this page is centre-aligned, hierarchy comes from weight
// and scale inside ONE family (font-display === DM Sans), and rhythm alternates
// between airy statement blocks and dense/inverted data bands. The previous
// version ran seven identical `py-20` centred sections separated by primary/3
// gradient washes, which is what made it read as generic.
const values = [
  { id: 'simplicity', key: 'Simplicity', title: 'Elegant over complex', body: 'We replace a stack of disconnected tools with one platform that just works.' },
  { id: 'ownership', key: 'Ownership', title: 'Your data, your brand', body: 'Tools you control, not walled gardens that hold your business hostage.' },
  { id: 'partnership', key: 'Partnership', title: 'A real team', body: 'Not a faceless SaaS. Every client gets designers and developers who know their business.' },
  { id: 'craft', key: 'Craft', title: 'Quality over hype', body: 'Every feature built with care. We ship polish, not quantity.' },
];

// Derived, not hardcoded: `lib/data/solutions.ts` is the canonical product
// surface (it drives /solutions and the footer). A hardcoded count here would
// silently go stale the moment a solution is added or removed, and this page
// asserts it as a fact to prospects.
const TOOL_COUNT = solutions.length;

const record = [
  { value: String(TOOL_COUNT), label: 'Integrated tools' },
  { value: '40+', label: 'Clients served' },
  { value: '16+', label: 'Years building' },
  { value: '99.9%', label: 'Uptime' },
];

const EYEBROW = 'text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground';

export default function AboutPage() {
  return (
    <div className="font-display">
      {/* Masthead — sets the left-aligned, ruled language for the whole page. */}
      <div className="container mx-auto px-4">
        <div className="flex items-baseline justify-between border-b-2 border-foreground py-5">
          <span className={EYEBROW}>Simpler Development</span>
          <span className={EYEBROW}>About</span>
        </div>

        {/* Hero: the headline carries the page, the deck sits beside it rather
            than beneath it, so the eye starts left and stays left. */}
        <div className="grid grid-cols-1 items-end gap-8 py-16 md:grid-cols-12 md:gap-12 md:py-20">
          {/* `immediate` is load-bearing: this H1 is the LCP element, and a
              scroll-reveal that starts at opacity 0 blocks LCP until the
              animation runs (see the FadeIn docblock — it previously cost ~7s
              on throttled mobile). */}
          <FadeIn immediate className="md:col-span-8">
            <h1 className="text-[clamp(3.25rem,9vw,8.25rem)] font-extrabold leading-[0.86] tracking-[-0.048em]">
              One platform.
              <br />
              One team.
            </h1>
          </FadeIn>
          <FadeIn immediate className="md:col-span-4">
            <p className="text-[15.5px] leading-relaxed text-muted-foreground">
              We built the all-in-one platform we wished existed, then paired it with a
              full-service agency so you never have to figure it out alone.
            </p>
          </FadeIn>
        </div>
      </div>

      {/* AIR — the page slows down here. One statement, lots of room. */}
      <div className="container mx-auto border-t-2 border-foreground px-4">
        <section className="py-20 md:py-28">
          <SlideIn direction="up">
            <span className={EYEBROW}>Why we built this</span>
            {/* "tabs/bills/logins" deliberately, NOT "tools": this block sits
                directly above a band reading "19 INTEGRATED TOOLS", and reusing
                the word made the five read as OUR count rather than the stack
                we replace. The five is the customer's status quo; the nineteen
                is the answer to it. */}
            <p className="mt-6 max-w-[16ch] text-[clamp(1.75rem,4.6vw,4rem)] font-bold leading-[1.06] tracking-[-0.038em]">
              Five tabs.
              <br />
              Five bills.
              <br />
              <span className="text-accent-secondary">None of them talking.</span>
            </p>
            <p className="mt-7 max-w-[58ch] text-[15.5px] leading-relaxed text-muted-foreground">
              Squarespace for the site, Mailchimp for email, Calendly for booking, HubSpot
              for the CRM, Asana for projects. That is the stack most businesses end up
              with. We replaced it with {TOOL_COUNT} integrated tools under one login,
              backed by a team that actually helps you use it. A lead from your site enters
              the CRM, gets a welcome email, and can book a call. No Zapier in the middle.
            </p>
          </SlideIn>
        </section>
      </div>

      {/* TIGHT — inverted band. Pace changes hard, and the proof becomes
          structural instead of another centred stat row. Inversion uses the
          existing tokens rather than a bespoke dark colour. */}
      <div className="bg-foreground py-11 text-background">
        <div className="container mx-auto grid grid-cols-2 gap-7 px-4 md:grid-cols-4">
          {record.map((r) => (
            <div key={r.label}>
              <b className="block text-[clamp(1.875rem,4vw,3.375rem)] font-extrabold leading-none tracking-[-0.045em]">
                {r.value}
              </b>
              <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-background/55">
                {r.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* DENSE — hairline grid, deliberately tight against the airy block above. */}
      <div className="container mx-auto px-4">
        <section className="py-14 md:py-16">
          <span className={EYEBROW}>What we stand for</span>
          <div className="mt-7 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <SlideIn key={v.id} direction="up" delay={i * 0.06}>
                <div className="h-full bg-background p-6">
                  <span className="mb-3 block text-[10px] font-bold uppercase tracking-[0.2em] text-accent-secondary">
                    {v.key}
                  </span>
                  <b className="mb-1.5 block text-base font-bold tracking-[-0.01em]">{v.title}</b>
                  <p className="text-sm leading-relaxed text-muted-foreground">{v.body}</p>
                </div>
              </SlideIn>
            ))}
          </div>
        </section>

        {/* Close — same left-aligned logic, single CTA. */}
        <section className="grid grid-cols-1 items-end gap-8 border-t-2 border-foreground py-20 md:grid-cols-12 md:py-24">
          <FadeIn className="md:col-span-8">
            <h2 className="text-[clamp(1.75rem,4vw,3.375rem)] font-extrabold leading-[1.02] tracking-[-0.038em]">
              See what it looks like
              <br />
              for your business.
            </h2>
          </FadeIn>
          <FadeIn className="md:col-span-4">
            <a
              href="/contact"
              className="inline-block bg-foreground px-8 py-4 text-[15px] font-bold tracking-[-0.01em] text-background transition-colors hover:bg-accent-secondary"
            >
              Book a consultation
            </a>
          </FadeIn>
        </section>
      </div>
    </div>
  );
}
