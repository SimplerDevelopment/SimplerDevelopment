'use client';

/**
 * The interactive half of /calculator.
 *
 * The SD side of the arithmetic is NOT reimplemented here — it calls
 * `computeAccountBilling`, the same function that builds the real Stripe line
 * items. That is deliberate: a marketing calculator that quotes a price the
 * checkout then contradicts is worse than no calculator, and the only way to
 * guarantee it can't drift is to share the function rather than the number.
 * Module prices come from FEATURE_DOMAINS for the same reason.
 *
 * The competitor side is a static cited table — see ./competitor-stack.ts.
 */

import { useMemo, useState } from 'react';
import {
  FEATURE_DOMAINS,
  computeAccountBilling,
  volumeTierFor,
  SEAT_PRICE_CAP_CENTS,
  INCLUDED_SEATS,
} from '@/lib/billing/domain-catalog';
import { formatMoney } from '@/lib/utils/money';
import {
  competitorFor,
  competitorMonthlyCents,
  DEFAULT_SEATS,
  DEFAULT_SELECTION,
} from './competitor-stack';

const MAX_SEATS = 50;

/** Opening states worth one click. Keys must exist in FEATURE_DOMAINS. */
const PRESETS: { label: string; seats: number; keys: string[] }[] = [
  {
    label: 'Solo operator',
    seats: 1,
    keys: ['websites', 'crm', 'email', 'bookings'],
  },
  { label: 'Small agency', seats: DEFAULT_SEATS, keys: DEFAULT_SELECTION },
  {
    label: 'The whole stack',
    seats: 8,
    keys: FEATURE_DOMAINS.map((d) => d.key),
  },
];

const RULE = 'border-[color-mix(in_srgb,var(--retro-mid)_30%,transparent)]';
const MUTED = 'text-[color-mix(in_srgb,var(--retro-ink)_65%,transparent)]';

export default function StackCalculator() {
  const [seats, setSeats] = useState(DEFAULT_SEATS);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTION);

  const result = useMemo(() => {
    // Catalog order, not click order — keeps the table stable as boxes are ticked.
    const domains = FEATURE_DOMAINS.filter((d) => selected.includes(d.key));
    const sd = computeAccountBilling(
      domains.map((d) => d.monthlyPriceCents),
      seats,
    );
    const rows = domains.map((d, i) => {
      const rival = competitorFor(d.key);
      return {
        domain: d,
        rival,
        rivalCents: rival ? competitorMonthlyCents(rival, seats) : 0,
        sdCents: sd.discountedModuleCents[i],
      };
    });
    const stackCents = rows.reduce((s, r) => s + r.rivalCents, 0);
    return { sd, rows, stackCents, savingsCents: stackCents - sd.totalCents };
  }, [seats, selected]);

  const { sd, rows, stackCents, savingsCents } = result;
  const tier = volumeTierFor(selected.length);
  const saving = savingsCents > 0;

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    setSeats(p.seats);
    setSelected(p.keys);
  }

  return (
    <>
      {/* The sticky total is scoped to THIS grid on purpose — the breakdown
          table below is a sibling, not a col-span-2 row inside the grid. As a
          grid child it shared the container's full height, so the sticky panel
          travelled down over the table and covered its right-hand column. */}
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        {/* ── Inputs ─────────────────────────────────────────────────────── */}
        <div>
          <div className="mb-8 flex flex-wrap items-end gap-6">
            <div>
              <label
                htmlFor="seats"
                className="font-display block text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-label)]"
              >
                People who need a login
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="seats"
                  type="range"
                  min={1}
                  max={MAX_SEATS}
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className="h-1 w-48 cursor-pointer accent-[var(--retro-orange)]"
                />
                <output
                  htmlFor="seats"
                  className="font-display w-16 text-2xl font-extrabold text-[var(--retro-ink)]"
                >
                  {seats}
                </output>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`font-display rounded border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] transition-colors ${RULE} ${MUTED} hover:border-[var(--retro-orange)] hover:text-[var(--retro-orange)]`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <p className="font-display mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--retro-label)]">
            Tick what you already pay for
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURE_DOMAINS.map((d) => {
              const rival = competitorFor(d.key);
              const on = selected.includes(d.key);
              return (
                <label
                  key={d.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                    on
                      ? 'border-[var(--retro-orange)] bg-[color-mix(in_srgb,var(--retro-orange)_7%,var(--retro-cream))]'
                      : `${RULE} bg-[var(--retro-cream)] hover:border-[var(--retro-mid)]`
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(d.key)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--retro-orange)]"
                  />
                  <span>
                    <span className="font-display block font-bold text-[var(--retro-ink)]">
                      {rival ? `${rival.vendor} ${rival.plan}` : d.name}
                    </span>
                    <span className={`block text-xs ${MUTED}`}>
                      replaced by {d.name} ·{' '}
                      {formatMoney(d.monthlyPriceCents, { fractionDigits: 0 })}
                      /mo
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* ── Result ─────────────────────────────────────────────────────── */}
        <aside
          className="rounded-md border border-[var(--retro-mid)] bg-[var(--retro-ink)] p-6 text-[var(--retro-cream)] lg:sticky lg:top-24"
          aria-live="polite"
        >
          {selected.length === 0 ? (
            <p className="text-sm text-[color-mix(in_srgb,var(--retro-cream)_75%,transparent)]">
              Tick at least one tool to see the comparison.
            </p>
          ) : (
            <>
              <Line label="Your point-tool stack" value={formatMoney(stackCents)} />
              <Line label="SimplerDevelopment" value={formatMoney(sd.totalCents)} accent />

              <div className="mt-5 border-t border-[color-mix(in_srgb,var(--retro-cream)_25%,transparent)] pt-5">
                <p className="eyebrow eyebrow--on-ink">{saving ? 'You keep' : 'Difference'}</p>
                <p
                  className={`font-display mt-1 text-4xl font-extrabold ${
                    saving ? 'text-[var(--retro-gold)]' : 'text-[var(--retro-cream)]'
                  }`}
                >
                  {formatMoney(Math.abs(savingsCents))}
                  <span className="text-base font-bold">/mo</span>
                </p>
                <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
                  {formatMoney(Math.abs(savingsCents) * 12)} a year
                  {!saving && ' more on SimplerDevelopment — see the note below.'}
                </p>
              </div>

              <dl className="mt-5 space-y-1.5 border-t border-[color-mix(in_srgb,var(--retro-cream)_25%,transparent)] pt-5 text-xs text-[color-mix(in_srgb,var(--retro-cream)_72%,transparent)]">
                <Detail
                  term={`${selected.length} module${selected.length === 1 ? '' : 's'}`}
                  desc={formatMoney(sd.moduleSubtotalCents)}
                />
                {/* Label the tier's own threshold, not how many boxes are
                  ticked — "5+ modules" when the discount actually unlocks at 4
                  misstates the pricing rule to the reader. */}
                {tier && (
                  <Detail
                    term={`Volume discount (${tier.minModules}+ modules)`}
                    desc={`−${tier.percentOff}%`}
                  />
                )}
                <Detail
                  term={`${sd.additionalSeats} extra seat${sd.additionalSeats === 1 ? '' : 's'} @ ${formatMoney(sd.seatUnitCents)}`}
                  desc={formatMoney(sd.seatTotalCents)}
                />
              </dl>
            </>
          )}
        </aside>
      </div>

      {/* ── Line-by-line ───────────────────────────────────────────────── */}
      {selected.length > 0 && (
        <div className="mt-10">
          <div className={`overflow-x-auto rounded-md border ${RULE}`}>
            <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Line-by-line monthly cost of each point tool against the SimplerDevelopment module
                that replaces it, at {seats} seat
                {seats === 1 ? '' : 's'}.
              </caption>
              <thead>
                <tr className="bg-[color-mix(in_srgb,var(--retro-mid)_10%,var(--retro-cream))]">
                  <Th>What you pay for today</Th>
                  <Th align="right">Their price</Th>
                  <Th>Replaced by</Th>
                  <Th align="right">Ours</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ domain, rival, rivalCents, sdCents }) => (
                  <tr key={domain.key} className={`border-t ${RULE} align-top`}>
                    <td className="p-3">
                      <span className="font-display font-bold text-[var(--retro-ink)]">
                        {rival ? `${rival.vendor} · ${rival.plan}` : '—'}
                      </span>
                      {rival && (
                        <span className={`mt-0.5 block text-xs ${MUTED}`}>
                          {formatMoney(rival.monthlyCents)}
                          {rival.basis === 'seat'
                            ? `/seat · billed for ${Math.max(seats, rival.minSeats ?? 1)}${
                                rival.minSeats && seats < rival.minSeats
                                  ? ` (${rival.minSeats}-seat minimum)`
                                  : ''
                              }`
                            : ' flat'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold text-[var(--retro-ink)]">
                      {formatMoney(rivalCents)}
                    </td>
                    <td className="p-3 text-[var(--retro-ink)]">{domain.name}</td>
                    <td className="p-3 text-right font-semibold text-[var(--retro-orange)]">
                      {formatMoney(sdCents)}
                    </td>
                  </tr>
                ))}
                <tr
                  className={`border-t-2 border-[var(--retro-mid)] bg-[color-mix(in_srgb,var(--retro-mid)_8%,var(--retro-cream))]`}
                >
                  <td className="font-display p-3 font-bold text-[var(--retro-ink)]">
                    Seats beyond the first
                  </td>
                  <td className={`p-3 text-right text-xs ${MUTED}`}>already counted per tool</td>
                  <td className={`p-3 text-xs ${MUTED}`}>
                    {sd.additionalSeats} × {formatMoney(sd.seatUnitCents)}
                    {sd.seatUnitCents === SEAT_PRICE_CAP_CENTS && ' (capped)'}
                  </td>
                  <td className="p-3 text-right font-semibold text-[var(--retro-orange)]">
                    {formatMoney(sd.seatTotalCents)}
                  </td>
                </tr>
                <tr className="border-t-2 border-[var(--retro-mid)] bg-[color-mix(in_srgb,var(--retro-mid)_14%,var(--retro-cream))]">
                  <td className="font-display p-3 text-base font-extrabold text-[var(--retro-ink)]">
                    Every month
                  </td>
                  <td className="font-display p-3 text-right text-base font-extrabold text-[var(--retro-ink)]">
                    {formatMoney(stackCents)}
                  </td>
                  <td />
                  <td className="font-display p-3 text-right text-base font-extrabold text-[var(--retro-orange)]">
                    {formatMoney(sd.totalCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className={`mt-3 text-xs ${MUTED}`}>
            The first seat is included on both sides. Ours are capped at{' '}
            {formatMoney(SEAT_PRICE_CAP_CENTS, { fractionDigits: 0 })} each no matter how many
            modules you run — which is why the gap widens as the team grows, not because their
            software got worse. {INCLUDED_SEATS === 1 ? '' : `(${INCLUDED_SEATS} seats included.)`}
          </p>
        </div>
      )}
    </>
  );
}

function Line({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">
        {label}
      </span>
      <span
        className={`font-display text-xl font-extrabold ${
          accent ? 'text-[var(--retro-orange)]' : 'text-[var(--retro-cream)]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Detail({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{term}</dt>
      <dd className="font-semibold">{desc}</dd>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`font-display p-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--retro-ink)] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}
