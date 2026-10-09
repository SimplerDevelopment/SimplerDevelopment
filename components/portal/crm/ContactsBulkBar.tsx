'use client';

/**
 * PUX-169 (design doc screen 28): the ink bulk bar over selected contacts.
 * Only actions with a real path today: Email (mailto: bcc of the selected
 * addresses), Add to company (the per-contact PUT, one call each — there is
 * no bulk route), Export (CSV built from the rows already on screen, since
 * /api/portal/crm/export filters by search/status, not by ids).
 * Tag is deliberately absent: PUT's tagIds is full-replace, so a bulk tag
 * would clobber each contact's existing tags without a read-first loop.
 */

import { useState } from 'react';
import CrmCompanyTypeaheadPicker, { type CompanyOption } from '@/components/portal/CrmCompanyTypeaheadPicker';

export interface BulkContact {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  title: string | null;
  status: string;
}

const csvCell = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;

export function contactsCsv(rows: BulkContact[]): string {
  const head = ['First name', 'Last name', 'Email', 'Phone', 'Company', 'Title', 'Status'];
  return [head.join(','), ...rows.map((c) => [c.firstName, c.lastName, c.email, c.phone, c.companyName, c.title, c.status].map(csvCell).join(','))].join('\n');
}

const btn = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-background/90 hover:bg-background/10 disabled:opacity-50';

export default function ContactsBulkBar({ rows, onClear, onChanged }: { rows: BulkContact[]; onClear: () => void; onChanged: () => void }) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const emails = rows.map((c) => c.email).filter((e): e is string => !!e);

  async function attach(opt: CompanyOption | null) {
    if (!opt) return;
    setBusy(true);
    try {
      await Promise.all(rows.map((c) => fetch(`/api/portal/crm/contacts/${c.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: opt.id }),
      })));
      setPicking(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([contactsCsv(rows)], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'contacts.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-foreground px-3 py-2 text-background" role="toolbar" aria-label="Bulk actions">
      <span className="text-xs font-semibold tabular-nums">{rows.length} selected</span>
      {emails.length > 0 && (
        <a href={`mailto:?bcc=${encodeURIComponent(emails.join(','))}`} className={btn}>
          <span className="material-icons text-base">mail</span>Email
        </a>
      )}
      <button type="button" onClick={() => setPicking((p) => !p)} disabled={busy} className={btn}>
        <span className="material-icons text-base">domain_add</span>Add to company
      </button>
      {picking && (
        <span className="min-w-[220px] text-foreground">
          <CrmCompanyTypeaheadPicker value="" onChange={attach} placeholder="Pick a company…" />
        </span>
      )}
      <button type="button" onClick={exportCsv} className={btn}>
        <span className="material-icons text-base">download</span>Export
      </button>
      <button type="button" onClick={onClear} aria-label="Clear selection" className={`${btn} ml-auto`}>
        <span className="material-icons text-base">close</span>
      </button>
    </div>
  );
}
