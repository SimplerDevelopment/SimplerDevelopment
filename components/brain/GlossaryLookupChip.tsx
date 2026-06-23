'use client';

/**
 * GlossaryLookupChip — inline pill rendering a glossary term reference.
 *
 * Hover (or focus) shows a short-definition tooltip / popover; the chip
 * itself is a link to the term detail page. Used wherever the app inlines
 * a glossary reference — note bodies, AI answers, etc.
 *
 * Exported for downstream surfaces. This branch only exports it; no current
 * surface mounts it yet.
 *
 * Props accept either `termId` (preferred when known) or `slug` (when the
 * caller resolved by slug). `definition` / `shortDefinition` are optional —
 * when supplied they populate the tooltip immediately; when omitted the chip
 * still renders but the popover shows a placeholder.
 */

import Link from 'next/link';
import { useState, useId } from 'react';

interface Props {
  /** Numeric id (preferred for the link target). */
  termId?: number;
  /** Slug — used as link target fallback when no id is available. */
  slug?: string;
  /** Display label. Falls back to slug. */
  term?: string;
  /** Full definition — only used when shortDefinition is missing. */
  definition?: string | null;
  /** Short definition for the tooltip. */
  shortDefinition?: string | null;
  /** Optional sizing. */
  size?: 'sm' | 'md';
}

export default function GlossaryLookupChip({
  termId,
  slug,
  term,
  definition,
  shortDefinition,
  size = 'sm',
}: Props) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  const label = term ?? slug ?? 'term';
  const href = termId
    ? `/portal/brain/glossary/${termId}`
    : slug
      ? `/portal/brain/glossary?search=${encodeURIComponent(slug)}`
      : '/portal/brain/glossary';

  const tooltip = shortDefinition
    ?? (definition ? definition.slice(0, 200) + (definition.length > 200 ? '…' : '') : null);

  const sizeClass = size === 'md'
    ? 'text-xs px-2 py-0.5'
    : 'text-[11px] px-1.5 py-0.5';

  return (
    <span className="relative inline-block">
      <Link
        href={href}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-0.5 rounded font-medium border border-dotted border-primary/50 text-primary hover:bg-primary/10 hover:border-primary transition-colors ${sizeClass}`}
      >
        <span className="material-icons text-[10px]">menu_book</span>
        {label}
      </Link>
      {open && tooltip && (
        <span
          role="tooltip"
          id={tooltipId}
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-56 p-2 text-[11px] leading-snug text-foreground bg-popover border border-border rounded shadow-md pointer-events-none"
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}
