// Home's first card under the redesign (PUX-145, design doc screen 01): the
// top five of collectNeedsYou(). The verb leads each row so the list reads as
// a to-do. Only the first row's button is teal — one teal per page.
import Link from 'next/link';
import { EmptyState } from '@/components/portal/EmptyState';
import { sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { VERB, type NeedsYouRow } from '@/lib/portal/needs-you-shape';

export default function NeedsYouCard({ items, total }: { items: NeedsYouRow[]; total: number }) {
  const top = items.slice(0, 5);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="needs-you-h">
      <h2 id="needs-you-h" className="flex items-center gap-2 px-4 py-3 text-[13px] font-bold tracking-[-0.01em] text-foreground">
        <span className="material-icons text-[17px] text-primary">bolt</span>
        Needs you
        <span className="ml-auto font-mono text-[11px] font-normal text-muted-foreground">{total} {total === 1 ? 'item' : 'items'}</span>
      </h2>
      {top.length === 0 ? (
        <EmptyState
          className="border-t border-border px-4 py-4"
          title="Nothing needs you right now."
          body="Approvals, replies, invoices and decisions land here the moment one does, and leave when you've handled it."
          ghostLabel="Approve · Reply · Pay · Decide"
        />
      ) : top.map((it, i) => {
        const v = VERB[it.kind];
        return (
          <div key={it.key} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-4 py-3">
            <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${v.gold ? 'text-[var(--studio-gold-ink)]' : 'text-foreground'}`}>
              <span className="material-icons text-base">{v.icon}</span>{v.label}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{it.title}</span>
              <small className="block truncate text-xs text-muted-foreground">{it.meta}</small>
            </span>
            <Link href={it.href} className={i === 0 ? sBtn : sBtnGhost}>
              {it.cta}{i === 0 && <span className="material-icons text-base">arrow_forward</span>}
            </Link>
          </div>
        );
      })}
    </section>
  );
}
