'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface DuplicateContact {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  matchReasons: string[];
}

interface CrmDuplicateWarningProps {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
}

const reasonLabels: Record<string, string> = {
  exact_email: 'Email match',
  exact_phone: 'Phone match',
  name_fuzzy: 'Similar name',
};

export default function CrmDuplicateWarning({ email, phone, firstName, lastName }: CrmDuplicateWarningProps) {
  const [duplicates, setDuplicates] = useState<DuplicateContact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email && !phone && !firstName) {
      setDuplicates([]);
      return;
    }

    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (email) params.set('email', email);
      if (phone) params.set('phone', phone);
      if (firstName) params.set('firstName', firstName);
      if (lastName) params.set('lastName', lastName);

      if (!params.toString()) return;

      setLoading(true);
      try {
        const res = await fetch(`/api/portal/crm/contacts/duplicates?${params}`);
        const d = await res.json();
        setDuplicates(d.data ?? []);
      } catch {
        setDuplicates([]);
      }
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [email, phone, firstName, lastName]);

  if (loading || duplicates.length === 0) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-yellow-800">
        <span className="material-icons text-base">warning</span>
        Potential duplicate{duplicates.length > 1 ? 's' : ''} found
      </div>
      <div className="space-y-1.5">
        {duplicates.slice(0, 3).map(dup => (
          <div key={dup.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Link
                href={`/portal/crm/contacts/${dup.id}`}
                className="text-primary hover:underline font-medium"
                target="_blank"
              >
                {dup.firstName} {dup.lastName}
              </Link>
              <span className="text-xs text-muted-foreground">{dup.email}</span>
            </div>
            <div className="flex gap-1">
              {dup.matchReasons.map(r => (
                <span key={r} className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium">
                  {reasonLabels[r] || r}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {duplicates.length > 3 && (
        <p className="text-xs text-yellow-700">and {duplicates.length - 3} more...</p>
      )}
    </div>
  );
}
