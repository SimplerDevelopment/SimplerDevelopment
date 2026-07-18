'use client';

import Link from 'next/link';
import { getDomainByKey } from '@/lib/billing/domain-catalog';

interface DomainUpsellCardProps {
  domainKey: string;
}

export function DomainUpsellCard({ domainKey }: DomainUpsellCardProps) {
  const domain = getDomainByKey(domainKey);
  if (!domain) return null;

  const dollars = (domain.monthlyPriceCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <div className="flex flex-col gap-2 bg-card border border-border rounded-xl p-4 min-w-0">
      <div className="flex items-center gap-2">
        <span className="material-icons text-primary text-base">{domain.icon}</span>
        <span className="text-sm font-semibold text-foreground">{domain.name}</span>
        <span className="material-icons text-muted-foreground/50 text-sm ml-auto">auto_awesome</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{domain.tagline}</p>
      <div className="flex items-center justify-between mt-1 gap-2">
        <span className="text-xs text-muted-foreground">From {dollars}/mo</span>
        <Link
          href={`/portal/settings/billing/plans?highlight=${domain.key}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Add module
          <span className="material-icons text-xs">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
