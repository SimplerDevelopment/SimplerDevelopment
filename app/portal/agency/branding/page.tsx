'use client';

// Agency-level branding overrides. Distinct from per-website branding —
// these three fields drive the *portal chrome* (sidebar header, login
// page wordmark, document title) when white-label is enabled.

import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import AgencyBrandingForm from '@/app/portal/agency/_components/AgencyBrandingForm';

export default function AgencyBrandingPage() {
  return (
    <div className="max-w-2xl">
      <Link href="/portal/agency" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <span className="material-icons text-base">arrow_back</span>
        Agency settings
      </Link>

      <PortalPageHeader
        eyebrow="Agency"
        title="Agency Branding"
        subtitle="These overrides appear in the portal chrome — sidebar header, login wordmark, document title — when white-label mode is on."
      />

      <AgencyBrandingForm />
    </div>
  );
}
