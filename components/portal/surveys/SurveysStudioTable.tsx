'use client';

/**
 * PUX-178 (design doc screen 37): surveys in the list idiom — Survey (title,
 * question count, what it's linked to), Status, Responses, Last response, and
 * a real CRM link on the row when the survey is linked to a deal or proposal.
 * No NPS column: scoring is per response (survey_responses.score) and nothing
 * rolls it up per survey today — omitted rather than invented.
 * Studio-only; the server page gates on hasFlag(client, 'portal-redesign').
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import { relativeTime } from '@/lib/notifications/feed';

export interface SurveyRow {
  id: number;
  title: string;
  status: string;
  responseCount: number;
  questionCount: number;
  linkedType: string | null;
  linkedId: number | null;
  lastResponseAt: string | null;
}

/** Where a survey's linkage lives in the portal — only the CRM kinds get a row link. */
export function crmHref(linkedType: string | null, linkedId: number | null): string | null {
  if (linkedId == null) return null;
  if (linkedType === 'crm_deal') return `/portal/crm/deals/${linkedId}`;
  if (linkedType === 'crm_proposal') return `/portal/crm/proposals/${linkedId}`;
  return null;
}

const STATUS: Record<string, string> = {
  active: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  draft: 'bg-muted text-muted-foreground',
  closed: 'bg-muted text-muted-foreground',
};

export default function SurveysStudioTable({ rows }: { rows: SurveyRow[] }) {
  const router = useRouter();
  const columns: StudioColumn<SurveyRow>[] = [
    { key: 'survey', label: 'Survey', render: (s) => {
      const href = crmHref(s.linkedType, s.linkedId);
      return (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{s.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {s.questionCount} {s.questionCount === 1 ? 'question' : 'questions'}
            {s.linkedType && (href
              ? <> · <Link href={href} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">linked to {s.linkedType === 'crm_deal' ? 'a deal' : 'a proposal'}</Link></>
              : <> · linked to {s.linkedType.replace(/_/g, ' ')}</>)}
          </p>
        </div>
      );
    } },
    { key: 'status', label: 'Status', render: (s) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS[s.status] ?? 'bg-muted text-muted-foreground'}`}>{s.status}</span> },
    { key: 'responses', label: 'Responses', align: 'right', render: (s) => s.responseCount },
    { key: 'last', label: 'Last response', className: 'hidden md:table-cell text-muted-foreground', render: (s) => s.lastResponseAt ? relativeTime(s.lastResponseAt) : '—' },
  ];
  const responses = rows.reduce((n, s) => n + s.responseCount, 0);
  return (
    <StudioTable
      columns={columns}
      rows={rows}
      rowKey={(s) => s.id}
      onRowClick={(s) => router.push(`/portal/surveys/${s.id}`)}
      footer={`${rows.length} ${rows.length === 1 ? 'survey' : 'surveys'} · ${responses} ${responses === 1 ? 'response' : 'responses'}`}
    />
  );
}
