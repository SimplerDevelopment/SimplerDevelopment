import Image from 'next/image';
import { generateSEO } from '@/lib/utils/seo';
import { StructuredData } from '@/components/seo/StructuredData';
import {
  generateFAQSchema,
  generateServiceSchema,
  generateBreadcrumbListSchema,
} from '@/lib/utils/structured-data';
import { BookingFormInline } from '@/components/blocks/render/BookingFormInline';
import { RetroHero, CreamBand, InkPanel, CTABanner } from '@/components/retro/sections';
import { SectionHeading, RetroCard, RetroBadge, StatBlock, Star } from '@/components/retro/primitives';

/**
 * /ai-consulting — the agency services page (PUX-091).
 *
 * This page sells a DIFFERENT thing than the rest of the marketing tree. Every
 * other public page sells the platform (open source, self-hostable, MCP-native);
 * this one sells implementation work, and the platform appears as evidence and
 * as an optional substrate, never as the deliverable. That seam is deliberate
 * and load-bearing: there is exactly ONE primary CTA on the page (book a
 * briefing) and the platform is always the secondary path. If you add a second
 * competing "start free" CTA above the fold, the page stops converting for
 * either audience — that was the explicit trade-off accepted when it shipped.
 *
 * Copy is written answer-first under question-shaped headings, and the FAQ is
 * fully visible with no accordion, for the same reason app/(pages)/faq/page.tsx
 * is: answer engines extract prose they can read without executing JS, and the
 * visible text must match generateFAQSchema below verbatim.
 *
 * Every number on this page is verifiable in-repo — 478 is the canonical tool
 * count from packages/cli/manifest.json (enforced by
 * tests/unit/mcp-tool-registry-baseline.test.ts) and 51 is BUILT_IN_BLOCK_TYPES
 * in lib/blocks/registry.ts. There are no invented client case studies or
 * testimonials here, because we have none to cite. If you add a stat, add it
 * from the code, and update it when the code moves.
 */

// The same "30 Minute Consultation" booking page (#9) that /contact embeds —
// client 104, served publicly at /book/<slug>. Reused deliberately: one booking
// page means one calendar and one set of notifications, and a second page for
// "consulting" would silently split the pipeline in two.
const BOOKING_SLUG = '30-minute-consultation-mq0h6cgc';

// Pinned to this page's palette rather than resolved from the portal brand
// profile — see the identical block in app/(pages)/contact/page.tsx for why:
// we are an agency client, so brand fallback can hand this widget a showcase
// client's colours and logo on our own marketing page.
const BOOKING_STYLE = {
  primaryColor: '#FF5C2B',   // --retro-orange
  textColor: '#0B0D14',      // --retro-ink
  backgroundColor: 'transparent',
  formBg: 'transparent',
  buttonBg: '#FF5C2B',
  buttonText: '#FFFFFF',
} as const;

export const metadata = generateSEO({
  title: 'AI Consulting & AI Agent Development',
  description:
    'AI consulting that ships working agents, not slide decks. We design, build, and run production AI agents and RAG systems in Mastra, CrewAI, and LangGraph, wired to your data over MCP. Fixed-scope sprints from $9,500.',
  path: '/ai-consulting',
});

// ── Capabilities ───────────────────────────────────────────────────────────
const capabilities: { title: string; icon: string; body: string }[] = [
  {
    title: 'Agents & Multi-Agent Workflows',
    icon: 'robot',
    body:
      'Agents that do real work: triage a queue, enrich a record, draft and route a document, chase a task to completion. Built with typed tools, retries, and explicit approval gates on anything that writes.',
  },
  {
    title: 'Retrieval & Company Knowledge',
    icon: 'observatory',
    body:
      'RAG that answers from your documents instead of guessing. Chunking, embeddings, and a vector index tuned against a real eval set — so you can measure whether an answer got better, not just whether it sounds better.',
  },
  {
    title: 'Automation & Integration',
    icon: 'satellite',
    body:
      'The unglamorous half that decides whether any of it survives: connecting CRMs, inboxes, calendars, billing, and internal databases, with rate limits, retries, and idempotency handled properly.',
  },
  {
    title: 'MCP & Tool Infrastructure',
    icon: 'radio-tower',
    body:
      'Model Context Protocol servers that let Claude, ChatGPT, or Cursor reach your systems under scoped permissions — so your team can drive internal tools from the AI client they already use.',
  },
];

// ── Offer tiers ────────────────────────────────────────────────────────────
// Anchored "from" pricing, deliberately. Exact fixed fees were rejected as too
// committing for scoped work; no pricing at all was rejected because a page an
// answer engine can't quote a number from doesn't get cited. Keep a real figure
// and a real duration on every tier if you edit these.
const tiers: {
  index: number;
  title: string;
  price: string;
  duration: string;
  summary: string;
  includes: string[];
  accent?: boolean;
}[] = [
  {
    index: 1,
    title: 'Agent Sprint',
    price: 'from $9,500',
    duration: '2 weeks',
    summary:
      'One workflow, picked because it is expensive and repetitive, taken to production. Fixed scope, fixed price.',
    includes: [
      'One high-volume workflow, live',
      'Framework and model selection, with the reasoning written down',
      'Eval set so you can tell if it regresses',
      'Handover session and a runbook',
    ],
  },
  {
    index: 2,
    title: 'Agent Build',
    price: 'from $35,000',
    duration: '6–12 weeks',
    summary:
      'A multi-agent system your team owns and can extend: orchestration, retrieval, integrations, observability, and the tests that keep it honest.',
    includes: [
      'Multi-agent orchestration across your real systems',
      'Retrieval layer over your documents and records',
      'Evals, tracing, and cost instrumentation',
      'Approval gates on every write path',
      'Source code, in your repository, no vendor lock',
    ],
    accent: true,
  },
  {
    index: 3,
    title: 'Run & Improve',
    price: 'from $4,500',
    duration: 'per month',
    summary:
      'We operate what we built. Models change underneath you roughly every quarter — this is the tier that absorbs that instead of letting it quietly degrade.',
    includes: [
      'Model upgrades and prompt migration',
      'Eval regression runs on every change',
      'Token and inference cost tuning',
      'Monthly report, and a human who answers',
    ],
  },
];

// ── Engagement process ─────────────────────────────────────────────────────
const process: { title: string; body: string }[] = [
  {
    title: 'Briefing',
    body:
      'Thirty minutes. You describe the work that eats your team’s week; we say plainly whether an agent is the right tool for it, and tell you when it isn’t.',
  },
  {
    title: 'Flight Plan',
    body:
      'A short written plan: the workflow we’d automate first, the framework we’d use and why, what it costs to run per month, and how we’ll measure whether it worked.',
  },
  {
    title: 'Build',
    body:
      'Weekly working software, not status decks. You see the agent run against real data early, while it is still cheap to change direction.',
  },
  {
    title: 'Handover',
    body:
      'Code in your repository, evals in your CI, a runbook your team can act on, and a walkthrough. You can carry on without us — that is the point.',
  },
];

// ── Framework selection ────────────────────────────────────────────────────
// Kept factual and vendor-neutral on purpose. These are capability statements
// we can defend in a briefing call, not repeated vendor marketing numbers.
const frameworks: { name: string; strength: string; pick: string }[] = [
  {
    name: 'Mastra',
    strength:
      'TypeScript-native agent framework. Agents, workflows, memory, and a server in one place, with typed tool inputs and a built-in evals, traces, and metrics layer.',
    pick:
      'Your stack is TypeScript or Next.js, you want type safety across tool boundaries, and you would rather deploy one framework than assemble five libraries.',
  },
  {
    name: 'CrewAI',
    strength:
      'Role-based multi-agent orchestration in Python — crews of specialist agents with tasks and flows, plus governance controls for platform teams.',
    pick:
      'The work genuinely maps to a team of specialists, and you want the fastest honest path from idea to a working multi-agent prototype.',
  },
  {
    name: 'LangGraph',
    strength:
      'Agents modelled as an explicit graph of nodes and edges, with checkpointing, resume, and deep tracing and evaluation tooling.',
    pick:
      'Runs are long, must survive a crash mid-flight, need human approval gates partway through, or have to be auditable after the fact.',
  },
  {
    name: 'MCP',
    strength:
      'Not an orchestrator — an open protocol for how any agent reaches your tools and data under scoped permissions. It sits underneath whichever framework you pick.',
    pick:
      'You want the same integration to serve Claude, ChatGPT, Cursor, and your own agents, instead of writing the connection four times.',
  },
];

// ── FAQ ────────────────────────────────────────────────────────────────────
// Visible copy and schema come from this one array — do not let them drift.
const faqs: { question: string; answer: string }[] = [
  {
    question: 'How much does AI consulting cost?',
    answer:
      'Our engagements start at $9,500 for a two-week Agent Sprint that puts one workflow into production, $35,000 for a six-to-twelve week Agent Build of a multi-agent system, and $4,500 per month to operate and improve what we built. Scope is agreed before anything starts, so the number you see in the flight plan is the number you pay.',
  },
  {
    question: 'How long until something is actually in production?',
    answer:
      'Two weeks for a single workflow in an Agent Sprint. Six to twelve weeks for a multi-agent build. We deliberately put the first agent in front of real data in week one, because pilots that stay in a sandbox are how most AI projects quietly die.',
  },
  {
    question: 'Which framework will you use — Mastra, CrewAI, or LangGraph?',
    answer:
      'Whichever fits your stack and your failure modes, and we write the reasoning down. Mastra when you are TypeScript or Next.js and want typed tools and built-in evals. CrewAI when the work maps to a crew of role-specialists and you want a fast prototype. LangGraph when runs are long, need approval gates, or must survive a crash. MCP sits underneath any of them as the integration layer.',
  },
  {
    question: 'Do we own the code?',
    answer:
      'Yes. Code lands in your repository under your licence, with no runtime dependency on us and no per-seat fee to keep using it. Our own platform is Apache-2.0 for the same reason: we do not think lock-in is a business model.',
  },
  {
    question: 'Do we have to use the SimplerDevelopment platform?',
    answer:
      'No. Most engagements build into the client’s existing stack. The platform is there if you want somewhere to run the result — CRM, documents, automations, and a 478-tool MCP server already wired up — but choosing it is optional and never a condition of the work.',
  },
  {
    question: 'What if our data is a mess?',
    answer:
      'That is the normal starting condition, and it is usually the actual project. Retrieval quality is set by how your documents are structured, chunked, and permissioned long before the model matters. We audit that in the flight plan and tell you honestly if the first phase needs to be data work rather than agents.',
  },
  {
    question: 'How do you stop an agent doing something destructive?',
    answer:
      'Scoped credentials so an agent can only reach what it needs, approval gates on every write path so a human confirms consequential actions, and an eval set that runs on each change so regressions surface before your customers find them. We build the same way on our own platform, where AI-proposed changes go through a human approval queue.',
  },
  {
    question: 'Can you work with our existing team and stack?',
    answer:
      'Yes, and it is the better outcome. We build alongside your engineers, in your repository and your CI, and hand over with a runbook and a walkthrough so the system keeps improving after we leave.',
  },
];

export default function AiConsultingPage() {
  const serviceSchema = generateServiceSchema(
    'AI Consulting & AI Agent Development',
    'Design, build, and operation of production AI agents, multi-agent systems, and retrieval-augmented knowledge systems using Mastra, CrewAI, LangGraph, and the Model Context Protocol. Fixed-scope engagements from $9,500.',
    'AI Consulting'
  );
  const faqSchema = generateFAQSchema(faqs);
  const breadcrumb = generateBreadcrumbListSchema([
    { name: 'Home', item: '/' },
    { name: 'AI Consulting', item: '/ai-consulting' },
  ]);

  return (
    <>
      <StructuredData data={[serviceSchema, faqSchema, breadcrumb]} />

      <RetroHero
        eyebrow="Mission Brief"
        title="AI Consulting That Ships"
        accent="Working Agents."
        subtitle="Most AI projects stall as a demo that impressed everyone once. We design, build, and run production AI agents — in Mastra, CrewAI, or LangGraph, wired to your real systems over MCP — and hand you the code, the evals, and the runbook."
        primary={{ href: '#briefing', label: 'Book A Flight Briefing' }}
        secondary={{ href: '#profiles', label: 'See Mission Profiles' }}
        art="ai-consulting-hero"
        footnote={
          <>
            <span>478 MCP tools shipped in production</span>
            <span>Apache-2.0, public repository</span>
            <span>Fixed scope, from $9,500</span>
          </>
        }
      />

      {/* Answer-first definition. Question-shaped H2, short lead paragraph — the
          shape answer engines actually extract. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Flight Manual"
          title="What Does An AI Consultant Actually Do?"
          subtitle="An AI consultant works out which parts of your business an AI agent can genuinely take over, builds those agents against your real systems, and puts controls around them so they can be trusted in production. In practice that is four kinds of work — and the last two are where most projects fail."
        />
        <div className="grid gap-6 md:grid-cols-2">
          {capabilities.map((c) => (
            <RetroCard key={c.title} title={c.title} icon={c.icon}>
              {c.body}
            </RetroCard>
          ))}
        </div>
      </CreamBand>

      {/* The differentiator band. Honest about the failure mode we're selling
          against — matches the "Honest Log Entry" voice used on /compare. */}
      <InkPanel>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <SectionHeading
            eyebrow="Honest Log Entry"
            title="Why Most AI Pilots Never Reach Production."
            onDark
          />
          <p className="text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            The demo is the easy 20%. Projects stall on the other 80%: nobody can tell whether a
            change made the agent better or worse, permissions were never scoped so it can’t be
            trusted with real data, costs are invisible until the first surprising invoice, and
            when the model is upgraded underneath it, quality quietly drops and no one notices for
            a month.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
            We build the boring parts first — evals, scoped credentials, approval gates, cost
            instrumentation — because they are the difference between an agent you demo and an
            agent you depend on.
          </p>
        </div>
      </InkPanel>

      {/* Offer tiers. Exactly one accent card per the RetroCard contract. */}
      <CreamBand id="profiles">
        <SectionHeading
          eyebrow="Mission Profiles"
          title="Three Ways To Fly This."
          subtitle="Fixed scope agreed before we start. Pricing anchors below are starting points, not estimates you discover later."
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {tiers.map((t) => (
            <RetroCard key={t.title} title={t.title} index={t.index} accent={t.accent}>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-extrabold">{t.price}</span>
                <span className="text-xs uppercase tracking-[0.14em] opacity-80">{t.duration}</span>
              </div>
              {t.accent && (
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em]">
                  Most chosen
                </p>
              )}
              <p className="mt-3">{t.summary}</p>
              <ul className="mt-4 space-y-2">
                {t.includes.map((line) => (
                  <li key={line} className="flex gap-2">
                    <Star
                      className={`mt-1 h-3 w-3 shrink-0 ${
                        t.accent ? 'text-[var(--retro-cream)]' : 'text-[var(--retro-gold)]'
                      }`}
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </RetroCard>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-[color-mix(in_srgb,var(--retro-ink)_65%,transparent)]">
          Not sure which profile fits? That is what the briefing is for — and we will tell you if
          the answer is none of them.
        </p>
      </CreamBand>

      {/* Process. Numbered on dark. */}
      <InkPanel>
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Flight Sequence"
            title="How An Engagement Runs."
            subtitle="Four stages. You can stop after any one of them and still be left with something that works."
            onDark
          />
          <ol className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {process.map((step, i) => (
              <li key={step.title}>
                <div className="font-display flex h-9 w-9 items-center justify-center rounded-full border border-[var(--retro-gold)] text-xs font-bold text-[var(--retro-gold)]">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="font-display mt-4 text-lg font-bold text-[var(--retro-cream)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </InkPanel>

      {/* Framework selection — the page's strongest AEO asset. Table markup
          mirrors /compare so the two pages read as one system. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Instrument Selection"
          title="Which AI Agent Framework Should You Use?"
          subtitle="There is no single right answer, and anyone who says otherwise is selling their preference. Here is how we actually decide — and we put the reasoning in writing before we build."
        />
        {/* Four instruments, four designs — the illustration carries the section's
            argument (different tools for different jobs) before the table proves it. */}
        <Image
          src="/retro/agent-crew.webp"
          alt="Four retro robots of different designs standing in a row, each built for a different job"
          width={900}
          height={600}
          className="mx-auto mb-10 h-auto w-full max-w-2xl object-contain"
        />
        <div className="overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_40%,transparent)]">
          <div className="grid grid-cols-1 md:grid-cols-[0.7fr_1.4fr_1.4fr]">
            <div className="hidden bg-[var(--retro-cream)] p-5 md:block" />
            <div className="hidden border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[var(--retro-cream)] p-5 font-display text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-ink)] md:block">
              What It Is Best At
            </div>
            <div className="hidden border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-orange)_10%,var(--retro-cream))] p-5 font-display text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-orange)] md:block">
              When We Pick It
            </div>
            {frameworks.map((f) => (
              <div key={f.name} className="contents">
                <div className="border-t border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-mid)_8%,var(--retro-cream))] p-5 font-display text-sm font-bold text-[var(--retro-ink)]">
                  {f.name}
                </div>
                <div className="border-t border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] p-5 text-sm text-[color-mix(in_srgb,var(--retro-ink)_72%,transparent)]">
                  <span className="mb-1 block font-display text-xs font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--retro-ink)_55%,transparent)] md:hidden">
                    Best at
                  </span>
                  {f.strength}
                </div>
                <div className="border-t border-l border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-orange)_6%,var(--retro-cream))] p-5 text-sm text-[var(--retro-ink)]">
                  <span className="mb-1 block font-display text-xs font-bold uppercase tracking-wide text-[var(--retro-orange)] md:hidden">
                    When we pick it
                  </span>
                  {f.pick}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CreamBand>

      {/* The platform seam. Secondary path only — never a competing hero CTA. */}
      <InkPanel>
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-6 py-16 sm:py-20 md:grid-cols-2">
          <div>
            <RetroBadge tone="gold">Optional</RetroBadge>
            <h2 className="font-display mt-4 text-3xl font-extrabold leading-tight text-[var(--retro-cream)] sm:text-4xl">
              Need Somewhere To Run It?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_80%,transparent)]">
              Agents need somewhere to read from and write to. If you don’t already have that,
              our platform gives you a CRM, documents, automations, bookings, and a 478-tool MCP
              server the agent can drive on day one — instead of spending the first three weeks
              of the build wiring up plumbing.
            </p>
            <p className="mt-4 text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_80%,transparent)]">
              It is Apache-2.0 and self-hostable, and it is entirely optional. Most engagements
              build straight into the client’s existing stack.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              ['478 MCP tools', 'Scoped, permissioned, ready for an agent to call.'],
              ['Company Brain', 'Retrieval over your documents with pgvector, already built.'],
              ['Approval queue', 'AI proposes, a human confirms, before anything goes live.'],
              ['Apache-2.0', 'Self-host it, fork it, or walk away with your data.'],
            ].map(([label, note]) => (
              <li
                key={label}
                className="flex gap-3 border-b border-[color-mix(in_srgb,var(--retro-cream)_18%,transparent)] pb-3 last:border-0"
              >
                <Star className="mt-1 h-3 w-3 shrink-0 text-[var(--retro-gold)]" />
                <span className="text-sm text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]">
                  <span className="font-display font-bold text-[var(--retro-cream)]">{label}</span>
                  {' — '}
                  {note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </InkPanel>

      {/* Proof. Platform-as-artifact — no invented testimonials. */}
      <CreamBand>
        <SectionHeading
          eyebrow="Flight Record"
          title="Read The Code Before You Hire Us."
          subtitle="We are not going to show you a logo wall. Everything we claim about building agent infrastructure is in a public repository you can audit before the first call — which is a harder thing to fake than a testimonial."
        />
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <StatBlock value="478" label="MCP tools shipped" sub="in production, baseline-tested" />
          <StatBlock value="51" label="Block types" sub="in the visual editor" />
          <StatBlock value="100%" label="Open source" sub="Apache-2.0, no rug-pull" />
          <StatBlock value="0" label="NDAs to read it" sub="the repo is public" />
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_72%,transparent)]">
          The same team that built a 478-tool Model Context Protocol server, a pgvector retrieval
          layer, and a human-in-the-loop approval queue is the team that will build yours. You can
          go and read how we did it.
        </p>
      </CreamBand>

      {/* FAQ — fully visible, no accordion, verbatim match to generateFAQSchema. */}
      <InkPanel>
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <SectionHeading eyebrow="Transmissions In" title="AI Consulting, Answered." onDark />
          <dl className="space-y-8">
            {faqs.map((f) => (
              <div
                key={f.question}
                className="border-b border-[color-mix(in_srgb,var(--retro-cream)_20%,transparent)] pb-8 last:border-0"
              >
                <dt className="font-display text-lg font-bold text-[var(--retro-cream)]">
                  {f.question}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                  {f.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </InkPanel>

      {/* The one primary conversion point. Same booking page as /contact — see
          that file for why the style overrides are pinned rather than resolved
          from the client's brand profile. */}
      <CreamBand id="briefing">
        <SectionHeading
          eyebrow="Open A Channel"
          title="Book A Flight Briefing."
          subtitle="Thirty minutes. Bring the workflow that eats your team’s week. You will leave knowing whether an agent is the right tool for it — including when the answer is no."
        />
        <div className="mx-auto max-w-2xl">
          <RetroCard title="30-Minute Briefing" icon="satellite-dish">
            <p className="mb-6">
              No pitch deck, no discovery-call funnel. An engineer who has shipped this, looking at
              your actual problem.
            </p>
            <BookingFormInline
              slug={BOOKING_SLUG}
              showPageTitle={false}
              showLogo={false}
              styleOverrides={BOOKING_STYLE}
            />
          </RetroCard>
        </div>
      </CreamBand>

      <CTABanner
        title="Still Weighing It Up?"
        subtitle="Read how we build agent infrastructure, or see the platform they run on."
        primary={{ href: '/contact', label: 'Talk To The Crew' }}
        secondary={{ href: '/solutions', label: 'Explore The Platform' }}
        art="mission-control-ai"
      />
    </>
  );
}
