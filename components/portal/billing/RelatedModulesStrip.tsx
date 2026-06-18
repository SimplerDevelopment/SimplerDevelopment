'use client';

import { useEffect, useState } from 'react';
import { getDomainByKey } from '@/lib/billing/domain-catalog';
import { DomainUpsellCard } from './DomainUpsellCard';

interface EntitlementsResponse {
  success: boolean;
  data: {
    mode: string;
    domains: string[];
    hasBundle: boolean;
    gatingBypassed: boolean;
  };
}

interface RelatedModulesStripProps {
  currentDomain: string;
}

export function RelatedModulesStrip({ currentDomain }: RelatedModulesStripProps) {
  const [upsellKeys, setUpsellKeys] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/portal/billing/entitlements');
        if (!res.ok) return;
        const json: EntitlementsResponse = await res.json();
        if (!json.success || json.data.gatingBypassed) return;

        const domain = getDomainByKey(currentDomain);
        if (!domain) return;

        const entitledSet = new Set(json.data.domains);
        const candidates = domain.promotesTo
          .filter((k) => !entitledSet.has(k))
          .slice(0, 2);

        if (!cancelled) setUpsellKeys(candidates);
      } catch {
        // silently suppress — strip is non-critical
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [currentDomain]);

  if (!upsellKeys || upsellKeys.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="text-xs font-medium text-muted-foreground mb-3">Works great with</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
        {upsellKeys.map((key) => (
          <DomainUpsellCard key={key} domainKey={key} />
        ))}
      </div>
    </div>
  );
}
