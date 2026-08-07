/**
 * Homepage-only bands for the retro-future marketing skin.
 *
 * All Server Components with zero hydration — the homepage is deliberately kept
 * off the hydration critical path (see the header of app/(pages)/HomeClient.tsx;
 * making it a client component once pushed mobile LCP render-delay to ~5s).
 * Nothing here holds state, so nothing here needs 'use client'. The Mission
 * Control console in particular is CSS and inline SVG rather than a screenshot,
 * because a screenshot is stale within a sprint and illegible on a phone.
 *
 * Each band carries ONE claim, and they were deliberately separated:
 *   CrewLanes      → breadth: how much of the job the platform covers
 *   ModuleManifest → nothing is gated: the whole list ships on every plan
 *   MissionControl → one database, with the activity feed as the evidence
 *   SignalBand     → it is operable by an agent, not just by a person
 *   LicencePlate   → the licence is the promise
 * An earlier draft had the first three all arguing "it shares one database",
 * which read as one point made three times. If you add a band here, give it a
 * claim none of the others make.
 */
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SectionHeading, Star } from './primitives';

// ─── Crew lanes ─────────────────────────────────────────────────────────────

/**
 * Five figures on a shared ground line, read as a crew roster.
 *
 * The art is cropped to a fixed portrait box rather than scaled to a common
 * height: the five illustrations were drawn at different framings (two are
 * near half-length, three full-body), so matching their heights made the
 * full-body pair read as smaller people instead of as further away. Cropping
 * top-anchored puts every head on the same line.
 *
 * Deliberately NOT numbered. The five are a set, not a sequence — nothing makes
 * Sell come before Serve — so an "01..05" rail would be decoration pretending
 * to be structure. (The module manifest keeps its numbering because there the
 * index is the argument.)
 */
export type CrewLane = { title: string; art: string; blurb: string };

export function CrewLanes({ lanes }: { lanes: CrewLane[] }) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
      {lanes.map((lane) => (
        <div key={lane.title} className="flex flex-col items-center gap-3 text-center">
          <div className="flex max-h-[230px] w-full justify-center overflow-hidden border-b-2 border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] [aspect-ratio:4/5]">
            <Image
              src={`/retro/${lane.art}.webp`}
              alt=""
              // Lanes are cropped by the 4/5 box, so a single nominal size is fine
              // here; the crop, not the intrinsic ratio, decides what is shown.
              width={752}
              height={900}
              className="h-full w-full object-cover object-top"
            />
          </div>
          <h3 className="font-display text-base font-bold text-[var(--retro-cream)]">{lane.title}</h3>
          <p className="max-w-[27ch] text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_74%,transparent)] [text-wrap:pretty]">
            {lane.blurb}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Systems manifest ───────────────────────────────────────────────────────

export type ManifestModule = { title: string; description: string; href: string; tag?: string };

/**
 * The module inventory, numbered 01..N.
 *
 * The numbering IS the argument here — the section claims eighteen modules and
 * the running index is the proof — which is the one case where a numeric rail
 * earns its place. It follows that `lead` and `rest` must be a REORDER of the
 * full list and never a subset: a jump from 02 to 13 reads as a rendering bug
 * and quietly undermines the count the section exists to make.
 */
export function ModuleManifest({ lead, rest }: { lead: ManifestModule[]; rest: ManifestModule[] }) {
  return (
    <>
      <Grid className="mb-px">
        {lead.map((m, i) => (
          <ModuleCell key={m.href} module={m} index={i + 1} lead />
        ))}
      </Grid>
      <Grid>
        {rest.map((m, i) => (
          <ModuleCell key={m.href} module={m} index={lead.length + i + 1} />
        ))}
      </Grid>
    </>
  );
}

function Grid({ children, className = '' }: { children: ReactNode; className?: string }) {
  // 1px gap over a ruled background is what gives the hairline-grid read
  // without a border on every cell fighting its neighbour's.
  return (
    <div
      className={`grid grid-cols-1 gap-px border border-[color-mix(in_srgb,var(--retro-mid)_34%,transparent)] bg-[color-mix(in_srgb,var(--retro-mid)_34%,transparent)] sm:grid-cols-2 lg:grid-cols-3 ${className}`}
    >
      {children}
    </div>
  );
}

function ModuleCell({ module: m, index, lead = false }: { module: ManifestModule; index: number; lead?: boolean }) {
  return (
    <Link
      href={m.href}
      className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 bg-[color-mix(in_srgb,#ffffff_26%,var(--retro-cream))] transition-colors hover:bg-[color-mix(in_srgb,var(--retro-gold)_16%,var(--retro-cream))] ${
        lead ? 'p-7' : 'px-5 py-4'
      }`}
    >
      <span
        className={`font-display row-span-2 pt-1 font-bold tabular-nums text-[var(--retro-label)] ${
          lead ? 'text-base' : 'text-[0.78rem]'
        }`}
      >
        {String(index).padStart(2, '0')}
      </span>
      <h3 className={`font-display font-bold leading-snug text-[var(--retro-ink)] ${lead ? 'text-xl' : 'text-base'}`}>
        {m.title}
      </h3>
      <p
        className={`leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_74%,var(--retro-cream))] ${
          lead ? 'text-sm' : 'text-[0.8rem]'
        }`}
      >
        {m.description}
      </p>
      {m.tag && (
        <span className="font-display col-start-2 mt-2 flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--retro-label)]">
          <Star className="h-2.5 w-2.5 text-[var(--retro-gold)]" />
          {m.tag}
        </span>
      )}
    </Link>
  );
}

// ─── Mission control ────────────────────────────────────────────────────────

const NAV_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Build', items: ['Overview', 'Websites', 'Store', 'Content'] },
  { label: 'Grow', items: ['CRM', 'Email', 'Bookings'] },
  { label: 'Operate', items: ['Projects', 'Help Desk', 'Company Brain'] },
];

const TILES = [
  { label: 'Modules on', value: '18' },
  { label: 'MCP tools', value: '214' },
  { label: 'Open deals', value: '26' },
  { label: 'Tickets due', value: '4' },
];

// Health is paired with a written state, never carried by the dot alone, so it
// survives colour-blindness, greyscale print and forced-colors mode.
const SYSTEMS: { name: string; state: string; tone: 'ok' | 'warn' | 'crit' }[] = [
  { name: 'Website builds', state: 'Healthy', tone: 'ok' },
  { name: 'Brain indexing', state: 'Healthy', tone: 'ok' },
  { name: 'Email queue', state: 'Backlog', tone: 'warn' },
  { name: 'Store checkout', state: 'Healthy', tone: 'ok' },
  { name: 'Zapier bridge', state: 'Down', tone: 'crit' },
];

const TONE_FILL: Record<'ok' | 'warn' | 'crit', string> = {
  ok: 'bg-[#4E9A8F]',
  warn: 'bg-[var(--retro-gold)]',
  crit: 'bg-[var(--retro-rust)]',
};

const FEED = [
  { mod: 'CRM', text: 'Deal moved to Proposal · Halden Robotics', at: '11:04' },
  { mod: 'Contracts', text: 'MSA signed by both parties', at: '10:41' },
  { mod: 'Websites', text: 'Pricing page published to production', at: '09:58' },
  { mod: 'Company Brain', text: '14 documents re-indexed', at: '09:12' },
  { mod: 'Help Desk', text: 'Ticket #2214 assigned · SLA 4h', at: '08:47' },
];

/**
 * The product, shown rather than asserted.
 *
 * Sits on a CREAM band even though the frame is ink: a dark screen on paper
 * reads as a monitor on a desk, whereas an ink band behind it would paint the
 * page the same colour as the frame and dissolve it.
 *
 * The figures are sample data and the caption says so. They are the platform's
 * own interface with an example workspace in it — not a customer's numbers, and
 * not dressed up as one. (Fabricated social proof was deliberately removed from
 * this page once already; don't reintroduce it here by implication.)
 */
export function MissionControl() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full overflow-hidden rounded border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[var(--retro-ink)] shadow-[0_20px_44px_rgba(7,22,25,0.26)]">
        <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-gold)_8%,var(--retro-ink))] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--retro-orange)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)]" />
          <span className="font-display ml-2 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-[var(--retro-gold)]">
            Workspace · Overview
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[186px_1fr]">
          <nav
            aria-label="Workspace"
            className="hidden flex-col gap-0.5 border-r border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] p-4 md:flex"
          >
            {NAV_GROUPS.map((g) => (
              <div key={g.label} className="contents">
                <span className="font-display px-2.5 pt-2 pb-1.5 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--retro-cream)_45%,transparent)]">
                  {g.label}
                </span>
                {g.items.map((item) => (
                  <span
                    key={item}
                    className={`rounded-sm px-2.5 py-1.5 text-sm ${
                      item === 'Overview'
                        ? 'bg-[color-mix(in_srgb,var(--retro-gold)_14%,transparent)] font-semibold text-[var(--retro-cream)]'
                        : 'text-[color-mix(in_srgb,var(--retro-cream)_72%,transparent)]'
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </div>
            ))}
          </nav>

          <div className="flex min-w-0 flex-col gap-4 p-4">
            <div className="grid grid-cols-2 gap-px border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] sm:grid-cols-4">
              {TILES.map((t) => (
                <div key={t.label} className="bg-[var(--retro-ink)] px-3.5 py-3">
                  <span className="font-display block text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--retro-cream)_50%,transparent)]">
                    {t.label}
                  </span>
                  <b className="font-display mt-1 block text-2xl font-extrabold tabular-nums text-[var(--retro-cream)]">
                    {t.value}
                  </b>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.25fr_1fr]">
              <Panel title="Published this quarter">
                {/* One series, so no legend — the panel title names it. Thin 2px
                    line, recessive grid, endpoint emphasised instead of a value
                    stamped on every point. */}
                <svg
                  viewBox="0 0 320 92"
                  role="img"
                  aria-label="Pages published per week, rising from 8 to 34 over twelve weeks"
                  className="block h-auto w-full"
                >
                  <g stroke="rgba(225,178,74,.16)" strokeWidth="1">
                    <line x1="0" y1="22" x2="320" y2="22" />
                    <line x1="0" y1="52" x2="320" y2="52" />
                    <line x1="0" y1="82" x2="320" y2="82" />
                  </g>
                  <path
                    d="M6 78 L34 74 L62 68 L90 71 L118 58 L146 61 L174 47 L202 38 L230 44 L258 29 L286 22 L314 14 L314 82 L6 82 Z"
                    fill="rgba(225,90,42,.16)"
                  />
                  <path
                    d="M6 78 L34 74 L62 68 L90 71 L118 58 L146 61 L174 47 L202 38 L230 44 L258 29 L286 22 L314 14"
                    fill="none"
                    stroke="var(--retro-orange)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <circle cx="314" cy="14" r="4" fill="var(--retro-orange)" stroke="var(--retro-ink)" strokeWidth="2" />
                  <text
                    x="298"
                    y="9"
                    textAnchor="end"
                    fontSize="9"
                    fontWeight="700"
                    className="font-display fill-[color-mix(in_srgb,var(--retro-cream)_75%,transparent)]"
                  >
                    34
                  </text>
                </svg>
              </Panel>

              <Panel title="Systems">
                <div className="flex flex-col gap-2">
                  {SYSTEMS.map((s) => (
                    <div key={s.name} className="flex items-center gap-2.5 text-[0.76rem] text-[color-mix(in_srgb,var(--retro-cream)_80%,transparent)]">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_FILL[s.tone]}`} />
                      {s.name}
                      <span className="font-display ml-auto text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[color-mix(in_srgb,var(--retro-cream)_50%,transparent)]">
                        {s.state}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel title="Activity · all modules, one stream">
              <div className="flex flex-col gap-px bg-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)]">
                {FEED.map((f) => (
                  <div
                    key={f.text}
                    className="flex flex-wrap items-center gap-x-3 gap-y-0.5 bg-[var(--retro-ink)] px-3 py-2 text-[0.78rem] text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)]"
                  >
                    <span className="font-display w-auto shrink-0 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[var(--retro-gold)] sm:w-[8.5rem]">
                      {f.mod}
                    </span>
                    {f.text}
                    <time className="ml-auto shrink-0 text-[0.7rem] tabular-nums text-[color-mix(in_srgb,var(--retro-cream)_42%,transparent)]">
                      {f.at}
                    </time>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>

      <Image
        src="/retro/control-console.webp"
        alt=""
        width={900}
        height={257}
        className="-mt-px w-[min(420px,80%)] opacity-90"
      />
      <p className="font-display mt-4 text-center text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--retro-ink)_70%,var(--retro-cream))]">
        Interface preview · sample workspace, not a customer account
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] p-3.5">
      <h4 className="font-display mb-3 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--retro-cream)_55%,transparent)]">
        {title}
      </h4>
      {children}
    </div>
  );
}

// ─── Signal band ────────────────────────────────────────────────────────────

/**
 * The AI-connect argument is literally about machines talking to the platform,
 * so the dish / probe / tower composite does the explaining and the copy stays
 * short. Absolute positioning inside a fixed-height stage rather than a grid:
 * these read as one ground station, not four icons in a row.
 */
export function SignalBand({ chips, children }: { chips: string[]; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
      <div>
        {children}
        <div className="flex flex-wrap gap-1.5 pt-2">
          {chips.map((c) => (
            <span
              key={c}
              className="font-display rounded-sm border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] px-2.5 py-1.5 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-[color-mix(in_srgb,var(--retro-cream)_72%,transparent)]"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="relative min-h-[260px] lg:min-h-[300px]" aria-hidden>
        <Image src="/retro/satellite.webp" alt="" width={789} height={743} className="absolute right-[24%] top-0 w-[34%] opacity-90" />
        <Image src="/retro/satellite-dish.webp" alt="" width={803} height={800} className="absolute bottom-[4%] left-0 w-[56%]" />
        <Image src="/retro/astronaut-pointing.webp" alt="" width={900} height={875} className="absolute bottom-[2%] left-[44%] w-[40%]" />
        <Image src="/retro/radio-tower.webp" alt="" width={491} height={900} className="absolute bottom-0 right-[8%] w-[26%]" />
      </div>
    </div>
  );
}

// ─── Licence plate ──────────────────────────────────────────────────────────

/** True pixel sizes, so next/image gets the right intrinsic ratio per icon. */
const SUPPORT_ART: Record<string, [number, number]> = {
  observatory: [900, 636],
  robot: [885, 876],
  'control-console': [900, 257],
};

export type SupportPoint = { title: string; art: string; body: ReactNode };

/**
 * The open-source argument.
 *
 * Previously four equal cards, which gave the page's strongest claim its
 * weakest layout — the licence was sharing a 4-up grid with three supporting
 * details as though they carried the same weight. The shield now takes the
 * room, and the details sit under it as a ruled row.
 */
export function LicencePlate({ claim, body, support }: { claim: ReactNode; body: ReactNode; support: SupportPoint[] }) {
  return (
    <>
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <div className="flex justify-center">
          <Image
            src="/retro/shield-rocket.webp"
            alt=""
            width={780}
            height={900}
            className="w-[min(300px,64vw)] drop-shadow-[0_14px_26px_rgba(7,22,25,0.22)]"
          />
        </div>
        <div>
          <p className="font-display text-[clamp(2rem,4.4vw,3.1rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-[var(--retro-ink)]">
            {claim}
          </p>
          <p className="mt-4 max-w-[46ch] leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_74%,var(--retro-cream))]">
            {body}
          </p>
        </div>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-px border-y border-[color-mix(in_srgb,var(--retro-mid)_34%,transparent)] bg-[color-mix(in_srgb,var(--retro-mid)_34%,transparent)] md:grid-cols-3">
        {support.map((s) => (
          <div key={s.title} className="grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-1 bg-[var(--retro-cream)] px-6 py-7">
            <Image
              src={`/retro/${s.art}.webp`}
              alt=""
              width={SUPPORT_ART[s.art]?.[0] ?? 900}
              height={SUPPORT_ART[s.art]?.[1] ?? 900}
              className="row-span-2 h-[84px] w-[112px] object-contain object-left"
            />
            <h3 className="font-display text-base font-bold text-[var(--retro-ink)]">{s.title}</h3>
            <p className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_74%,var(--retro-cream))]">{s.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}

/** Re-exported so HomeClient composes bands without two import sites. */
export { SectionHeading };
