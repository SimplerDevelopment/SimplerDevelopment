'use client';

import { use } from 'react';
import { useState, useEffect } from 'react';
import { BookingFormInline } from '@/components/blocks/render/BookingFormInline';

export default function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const [embedFlags, setEmbedFlags] = useState({ hideTitle: false, hideDescription: false, hideSteps: false });
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setEmbedFlags({
      hideTitle: sp.get('hideTitle') === '1',
      hideDescription: sp.get('hideDescription') === '1',
      hideSteps: sp.get('hideSteps') === '1',
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <BookingFormInline
        slug={slug}
        showPageTitle={!embedFlags.hideTitle}
        showDescription={!embedFlags.hideDescription}
        showSteps={!embedFlags.hideSteps}
      />
      <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-6">
        Powered by Simpler Development
      </p>
    </div>
  );
}
