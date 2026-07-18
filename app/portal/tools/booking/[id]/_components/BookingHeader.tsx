/**
 * Page-level header for the booking-page editor.
 *
 * Owns: back link, title + slug, Preview link, Save Changes button.
 * The save button has three states (idle / saving / saved) — the parent
 * passes those flags so this stays presentational.
 */
'use client';

import Link from 'next/link';

interface BookingHeaderProps {
  title: string;
  slug: string;
  publicUrl: string;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}

export function BookingHeader({ title, slug, publicUrl, saving, saved, onSave }: BookingHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <Link
          href="/portal/tools/booking"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <span className="material-icons text-lg">arrow_back</span>
          Back to Booking Pages
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">/book/{slug}</p>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
        >
          <span className="material-icons text-lg">open_in_new</span>
          Preview
        </a>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <span className="material-icons animate-spin text-lg">autorenew</span>
              Saving...
            </>
          ) : saved ? (
            <>
              <span className="material-icons text-lg">check</span>
              Saved
            </>
          ) : (
            <>
              <span className="material-icons text-lg">save</span>
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
