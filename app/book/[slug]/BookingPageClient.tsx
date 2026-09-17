'use client';

import { useState, useEffect } from 'react';
import { BookingFormInline } from '@/components/blocks/render/BookingFormInline';

export function BookingPageClient({ slug }: { slug: string }) {

  const [embedFlags, setEmbedFlags] = useState({ hideTitle: false, hideDescription: false, hideSteps: false });
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setEmbedFlags({
      hideTitle: sp.get('hideTitle') === '1',
      hideDescription: sp.get('hideDescription') === '1',
      hideSteps: sp.get('hideSteps') === '1',
    });
  }, []);

  // force-light: a public booking page carries the OPERATOR's brand palette,
  // which the API applies as inline styles (app/api/public/booking/[slug]/
  // route.ts backgroundColor/textColor). An inline color beats `dark:text-*`,
  // so under a viewer's .dark the branded near-black textColor landed on the
  // widget's dark:bg-gray-900 cards — the calendar dates were invisible
  // (operator-reported, PUX-218). Pinning the subtree light makes the page
  // render identically for every visitor regardless of their OS theme, which
  // is the same call app/sites/[domain]/layout.tsx and app/(pages)/layout.tsx
  // already make for tenant sites and the marketing site. The `dark:` utilities
  // below and throughout BookingFormInline are inert inside it — do not re-add
  // one expecting it to fire.
  return (
    <div className="force-light min-h-screen bg-gray-50">
      <BookingFormInline
        slug={slug}
        showPageTitle={!embedFlags.hideTitle}
        showDescription={!embedFlags.hideDescription}
        showSteps={!embedFlags.hideSteps}
      />
      <p className="text-center text-xs text-gray-400 pb-6">
        Powered by Simpler Development
      </p>
    </div>
  );
}
