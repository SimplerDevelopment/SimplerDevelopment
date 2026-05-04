'use client';

/**
 * SurveyOverviewTab — overview/dashboard tab for the survey detail page.
 *
 * Lifted verbatim from page.tsx. Renders top-level stat cards, three quick-
 * action buttons, and the recent-responses list. The page owns tab routing,
 * so this component takes a `setTab` callback for the quick-action wiring.
 */

import type { Survey, SurveyResponse, SurveyResponseStats } from '../_lib/api';

interface Props {
  survey: Survey;
  responses: SurveyResponse[];
  stats: SurveyResponseStats;
  setTab: (tab: 'share' | 'edit' | 'responses') => void;
}

export default function SurveyOverviewTab({ survey, responses, stats, setTab }: Props) {
  const questionCount = (survey.fields as unknown[])?.length || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Responses</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.withEmail}</p>
          <p className="text-xs text-muted-foreground">With Email</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{questionCount}</p>
          <p className="text-xs text-muted-foreground">Questions</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <button
          onClick={() => setTab('share')}
          className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
        >
          <span className="material-icons text-xl text-primary mb-2">share</span>
          <p className="font-medium text-foreground text-sm">Share Survey</p>
          <p className="text-xs text-muted-foreground">Get link, embed code, or email integration</p>
        </button>
        <button
          onClick={() => setTab('edit')}
          className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
        >
          <span className="material-icons text-xl text-primary mb-2">edit</span>
          <p className="font-medium text-foreground text-sm">Edit Questions</p>
          <p className="text-xs text-muted-foreground">Add, remove, or reorder questions</p>
        </button>
        <button
          onClick={() => setTab('responses')}
          className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
        >
          <span className="material-icons text-xl text-primary mb-2">analytics</span>
          <p className="font-medium text-foreground text-sm">View Responses</p>
          <p className="text-xs text-muted-foreground">See individual answers and analytics</p>
        </button>
      </div>

      {responses.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="material-icons text-lg text-primary">schedule</span>
            Recent Responses
          </h3>
          <div className="space-y-2">
            {responses.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className="material-icons text-muted-foreground">person</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {r.respondentEmail || r.respondentName || 'Anonymous'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.source} &middot; {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {r.completedAt && <span className="material-icons text-green-500 text-sm">check_circle</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
