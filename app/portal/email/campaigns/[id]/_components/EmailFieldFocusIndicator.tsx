/**
 * EmailFieldFocusIndicator — wraps a form field and overlays a colored
 * outline + tooltip when a remote peer's `focusedField` matches the
 * field path passed via prop.
 *
 * The wrapper is `position: relative` so the absolute outline can hug the
 * child input without affecting layout. The outline is purely decorative
 * (`pointer-events: none`) so it never blocks the underlying field.
 *
 * Usage:
 *   <EmailFieldFocusIndicator fieldPath="subject">
 *     <input ... />
 *   </EmailFieldFocusIndicator>
 */

'use client';

import { useMemo, type ReactNode } from 'react';
import { useEmailPresence } from './EmailCollaborationProvider';

export interface EmailFieldFocusIndicatorProps {
  /** Flat field-path identifier (e.g. "subject", "previewText"). */
  fieldPath: string;
  children: ReactNode;
  className?: string;
}

export function EmailFieldFocusIndicator({
  fieldPath,
  children,
  className,
}: EmailFieldFocusIndicatorProps) {
  const { peers } = useEmailPresence();

  // Find the first peer focused on this field (multi-peer collisions are
  // rare; if it matters later we can render a stacked badge).
  const focusedPeer = useMemo(
    () => peers.find((p) => p.focusedField === fieldPath) ?? null,
    [peers, fieldPath]
  );

  return (
    <div className={`relative ${className ?? ''}`}>
      {children}
      {focusedPeer && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-md"
            style={{
              outline: `2px solid ${focusedPeer.user.color}`,
              outlineOffset: '1px',
            }}
          />
          <div
            className="pointer-events-none absolute -top-5 right-0 text-[10px] font-medium px-1.5 py-0.5 rounded text-white shadow-sm"
            style={{ backgroundColor: focusedPeer.user.color }}
          >
            {focusedPeer.user.name} is editing
          </div>
        </>
      )}
    </div>
  );
}
