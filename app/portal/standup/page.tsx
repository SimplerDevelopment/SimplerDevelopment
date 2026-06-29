'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pSectionTitle } from '@/components/portal/portal-ui';

type CardType = 'task' | 'story' | 'epic' | 'bug' | 'spike';
type WorkflowState = 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';

interface StandupCard {
  id: number;
  number: number | null;
  title: string;
  priority: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  cardType: CardType;
  workflowState: WorkflowState;
  projectId: number;
  projectName: string;
  projectKey: string | null;
  columnName: string | null;
  columnIsDone: boolean | null;
}

interface StandupPayload {
  yesterday: StandupCard[];
  today: StandupCard[];
  blocked: StandupCard[];
}

const priorityColor: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-700',
};

function CardRow({ c, badge }: { c: StandupCard; badge?: string }) {
  const key = c.projectKey && c.number != null ? `${c.projectKey}-${c.number}` : `#${c.id}`;
  return (
    <Link
      href={`/portal/projects/${c.projectId}?card=${c.id}`}
      // Standup view typically renders many card rows across multiple
      // sections; viewport prefetch on every link DDoSes the project detail
      // route. Defer prefetch to hover.
      prefetch={false}
      className="flex items-start gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-sm transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-mono text-muted-foreground">{key}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground truncate">{c.projectName}</span>
          {c.priority && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityColor[c.priority] ?? 'bg-muted text-muted-foreground'}`}>
              {c.priority}
            </span>
          )}
          {c.storyPoints != null && (
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">{c.storyPoints} pts</span>
          )}
          {badge && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">{badge}</span>
          )}
        </div>
        <p className="text-sm text-foreground mt-0.5 truncate">{c.title}</p>
        {c.dueDate && (
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <span className="material-icons text-xs">event</span>
            Due {new Date(c.dueDate).toLocaleDateString()}
          </p>
        )}
      </div>
    </Link>
  );
}

function Section({ title, icon, cards, emptyText, badge }: { title: string; icon: string; cards: StandupCard[]; emptyText: string; badge?: string }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="material-icons text-base text-primary">{icon}</span>
        <h2 className={`${pSectionTitle} uppercase`}>{title}</h2>
        <span className="text-xs text-muted-foreground">({cards.length})</span>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {cards.map(c => <CardRow key={`${title}-${c.id}`} c={c} badge={badge} />)}
        </div>
      )}
    </section>
  );
}

export default function StandupPage() {
  const [data, setData] = useState<StandupPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/standup')
      .then(r => r.json())
      .then(json => {
        if (!cancelled && json.success) setData(json.data);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Team"
        title="Standup"
        subtitle="What you did, what you're doing, and what's blocking you. Use this on the daily."
      />

      {loading || !data ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary">refresh</span>
        </div>
      ) : (
        <div className="space-y-8">
          <Section
            title="Yesterday"
            icon="history"
            cards={data.yesterday}
            emptyText="No card activity in the last 24 hours."
          />
          <Section
            title="Today"
            icon="today"
            cards={data.today}
            emptyText="Nothing assigned to you right now. Pull a card from the backlog."
          />
          <Section
            title="Blocked"
            icon="block"
            cards={data.blocked}
            emptyText="Nothing blocked — keep moving."
            badge="blocked"
          />
        </div>
      )}
    </div>
  );
}
