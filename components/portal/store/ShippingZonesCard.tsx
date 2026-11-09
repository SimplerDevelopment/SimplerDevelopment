'use client';

/**
 * PUX-211 (design doc screen 75): shipping folded in from its own nav leaf —
 * a read-only card over the existing zones GET (rates come nested), linking
 * to the shipping page for edits. Studio-only.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/utils/money';
import { sBtnGhost } from '@/components/portal/portal-ui';

type Zone = { id: number; name: string; countries: string[]; rates: { id?: number; name: string; price: number }[] };

export default function ShippingZonesCard({ siteId }: { siteId: string }) {
  const [zones, setZones] = useState<Zone[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/websites/${siteId}/store/shipping`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setZones(d?.data ?? []); })
      .catch(() => { if (!cancelled) setZones([]); });
    return () => { cancelled = true; };
  }, [siteId]);
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Shipping zones">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Shipping zones</h2>
        <Link href={`/portal/websites/${siteId}/store/shipping`} className={`${sBtnGhost} !py-1`}>Edit zones</Link>
      </div>
      {zones === null ? <p className="mt-3 text-xs text-muted-foreground">Loading…</p> : zones.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No zones yet — orders can&apos;t ship until one exists.</p> : (
        <ul className="mt-3 divide-y divide-border">
          {zones.map((z) => {
            const min = z.rates.length ? Math.min(...z.rates.map((r) => r.price)) : null;
            return (
              <li key={z.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="material-icons text-base text-muted-foreground">public</span>
                <span className="min-w-0 flex-1"><span className="font-medium text-foreground">{z.name}</span><span className="block truncate text-xs text-muted-foreground">{z.countries.length} {z.countries.length === 1 ? 'country' : 'countries'} · {z.rates.length} {z.rates.length === 1 ? 'rate' : 'rates'}</span></span>
                <span className="tabular-nums text-muted-foreground">{min === null ? '—' : min === 0 ? 'Free' : `from ${formatMoney(min)}`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
