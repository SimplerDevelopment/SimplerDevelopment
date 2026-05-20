/**
 * Children — child cards whose parentCardId matches this card. Read-only;
 * children's parent is set from the child card's own detail modal. Useful for
 * Epic → Story / Story → Task hierarchy at-a-glance.
 */
'use client';

import type { DependencyRef } from '../_lib/types';
import { CARD_TYPE_META } from '../_lib/agile';

interface Props {
  children: DependencyRef[];
}

export function CardChildren({ children }: Props) {
  if (children.length === 0) return null;
  const totalPoints = children.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0);
  const completed = children.filter(c => c.columnIsDone).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Children ({completed}/{children.length} done · {totalPoints} pts)
        </h3>
      </div>
      <div className="space-y-1">
        {children.map(c => {
          const type = c.cardType ?? 'task';
          const meta = CARD_TYPE_META[type];
          return (
            <div
              key={c.id}
              className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border border-border ${
                c.columnIsDone ? 'bg-emerald-50/50 text-muted-foreground line-through' : 'bg-card text-foreground'
              }`}
            >
              <span className={`material-icons text-sm ${meta.color}`} title={meta.label}>{meta.icon}</span>
              {c.key && <span className="font-mono text-muted-foreground">{c.key}</span>}
              <span className="flex-1 truncate">{c.title}</span>
              {c.storyPoints != null && (
                <span className="px-1 rounded bg-primary/10 text-primary font-semibold shrink-0">{c.storyPoints} pts</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
