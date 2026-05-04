'use client';

/**
 * SurveyHeader — back-link, title, status pill, and publish/close/reopen
 * action buttons. Lifted verbatim from page.tsx so the page can stay focused
 * on tab routing.
 */

import Link from 'next/link';
import type { Survey } from '../_lib/api';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

interface Props {
  survey: Survey;
  onToggleStatus: (newStatus: string) => void;
}

export default function SurveyHeader({ survey, onToggleStatus }: Props) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <Link href="/portal/surveys" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <span className="material-icons text-xl text-muted-foreground">arrow_back</span>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="material-icons text-xl" style={{ color: survey.color || '#2563eb' }}>
              poll
            </span>
            <h1 className="text-2xl font-bold text-foreground">{survey.title}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[survey.status]}`}>
              {survey.status}
            </span>
          </div>
          {survey.description && <p className="text-muted-foreground text-sm mt-1">{survey.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {survey.status === 'draft' && (
          <button
            onClick={() => onToggleStatus('active')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <span className="material-icons text-lg">publish</span>
            Publish
          </button>
        )}
        {survey.status === 'active' && (
          <button
            onClick={() => onToggleStatus('closed')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <span className="material-icons text-lg">block</span>
            Close
          </button>
        )}
        {survey.status === 'closed' && (
          <button
            onClick={() => onToggleStatus('active')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <span className="material-icons text-lg">play_arrow</span>
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
