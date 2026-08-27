'use client';

// The empty-state rule (PUX-144; design doc PUX-134, screens 01/05/22/27/41/49):
// "An empty surface is a preview with a button. Never a grey icon and a
// sentence." A surface with no data yet shows a ghosted or sample version of
// ITSELF, written in the client's vocabulary ("Ask your guests how the trip
// went", not "No surveys yet"), with one way in.
//
// Two shapes, both behind the `portal-redesign` flag:
//   <EmptyState>  copy beside a preview. `sample` is a real drawing of what the
//                 surface will show (a sparkline, four funnel bars); `ghostLabel`
//                 falls back to a striped placeholder with a mono tag.
//                 layout="stack" puts the preview above the copy, for chart
//                 cards that already carry a heading.
//   <GhostCard>   the dashed card that IS the action ("Add a site" → href/onClick),
//                 or a dashed container around a form ("Add a domain" → children).
//
// `legacy` is what unflagged clients see — today's markup, verbatim. Flag off
// renders `legacy ?? null`, so converting a caller can never change an
// unflagged tenant's page. At GA delete the prop and the old markup with it.
//
// Copy rule for callers: the title is a sentence about the CLIENT's business,
// the body says what will appear here and how it gets there, the button names
// the act. One teal (`sBtn`) per page — everything else is `ghost: true`.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useFeatureFlag } from './FeatureFlagsProvider';
import { sBtn, sBtnGhost } from './portal-ui';

type Cta = { label: string; href?: string; onClick?: () => void; ghost?: boolean; icon?: string };

function CtaButton({ cta }: { cta: Cta }) {
  const cls = cta.ghost ? sBtnGhost : sBtn;
  const inner = (
    <>
      {cta.icon && <span className="material-icons text-base">{cta.icon}</span>}
      {cta.label}
    </>
  );
  return cta.href
    ? <Link href={cta.href} className={cls}>{inner}</Link>
    : <button type="button" onClick={cta.onClick} className={cls}>{inner}</button>;
}

/** Striped dashed placeholder with a mono tag — the document's `.s-ghost`. */
export function Ghost({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      className={`relative min-h-24 rounded-[10px] border border-dashed border-[var(--studio-line-strong)] bg-[repeating-linear-gradient(0deg,transparent_0_13px,var(--border)_13px_14px)] p-2.5 ${className}`}
      aria-hidden
    >
      <span className="absolute bottom-2 right-2 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/** Framed sample of the real thing — the document's `.s-sample`. */
function Sample({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-[10px] border border-border bg-background px-3 pb-2.5 pt-6 text-xs" aria-hidden>
      <span className="absolute right-2 top-1.5 font-mono text-[9.5px] uppercase tracking-[.06em] text-muted-foreground">Sample</span>
      {children}
    </div>
  );
}

export function EmptyState({
  title, body, cta, sample, ghostLabel, layout = 'split', legacy, className = '',
}: {
  title?: string;
  body?: string;
  cta?: Cta;
  sample?: ReactNode;
  ghostLabel?: string;
  layout?: 'split' | 'stack';
  legacy?: ReactNode;
  className?: string;
}) {
  const studio = useFeatureFlag('portal-redesign');
  if (!studio) return legacy ?? null;
  const preview = sample ? <Sample>{sample}</Sample> : ghostLabel ? <Ghost label={ghostLabel} /> : null;
  const copy = (
    <div>
      {title && <b className="block font-display text-[17px] font-semibold tracking-[-0.01em] text-foreground">{title}</b>}
      {body && <p className="mb-2.5 mt-1 max-w-[44ch] text-[13px] leading-relaxed text-muted-foreground">{body}</p>}
      {cta && <CtaButton cta={cta} />}
    </div>
  );
  return layout === 'stack'
    ? <div className={`space-y-3 ${className}`}>{preview}{copy}</div>
    : <div className={`grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_200px] ${className}`}>{copy}{preview}</div>;
}

export function GhostCard({
  icon = 'add_circle', title, body, href, onClick, legacy, children, className = '',
}: {
  icon?: string;
  title: string;
  body?: string;
  href?: string;
  onClick?: () => void;
  legacy?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const studio = useFeatureFlag('portal-redesign');
  if (!studio) return legacy ?? null;
  const frame = `rounded-2xl border border-dashed border-[var(--studio-line-strong)] bg-card ${className}`;
  if (href || onClick) {
    const cls = `group flex w-full items-center justify-center transition-colors hover:border-primary/60 ${frame}`;
    const inner = (
      <span className="flex flex-col items-center gap-1.5 p-5 text-center">
        <span className="material-icons text-[30px] text-muted-foreground transition-colors group-hover:text-primary">{icon}</span>
        <b className="text-sm font-semibold text-foreground">{title}</b>
        {body && <span className="max-w-[22ch] text-xs text-muted-foreground">{body}</span>}
      </span>
    );
    return href
      ? <Link href={href} className={cls}>{inner}</Link>
      : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  }
  return (
    <div className={`p-5 ${frame}`}>
      <b className="block text-sm font-semibold text-foreground">{title}</b>
      {body && <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
