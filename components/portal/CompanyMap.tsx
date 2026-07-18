'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

// Leaflet touches `window` at import time, so the implementation must only run
// client-side. This wrapper does the dynamic import so consumers can stay
// server- or client-rendered freely.
const CompanyMapImpl = dynamic(() => import('./CompanyMapImpl'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full rounded-xl bg-muted flex items-center justify-center">
      <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
    </div>
  ),
});

export type { MapCompany } from './CompanyMapImpl';
export default function CompanyMap(props: ComponentProps<typeof CompanyMapImpl>) {
  return <CompanyMapImpl {...props} />;
}
