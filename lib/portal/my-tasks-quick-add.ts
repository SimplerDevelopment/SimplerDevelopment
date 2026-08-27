// Quick-add on My tasks (PUX-154, design doc screen 13): "adding a row here
// posts to whichever board or Brain queue the group belongs to." Pure —
// resolves a target to the existing create route + body; the component does
// the fetch. Brain targets land in the uncategorized queue: the brain task
// create route takes no deal/company today, so a deal- or company-grouped
// Brain task cannot be quick-added into its group (noted on the card).
import type { MyTaskGroup } from './my-tasks-shape';

export interface QuickAddTarget {
  key: string;
  label: string;
  kind: 'kanban' | 'brain';
  columnId?: number;
}

export function quickAddTargets(groups: MyTaskGroup[], brainEnabled: boolean): QuickAddTarget[] {
  const seen = new Set<string>();
  const out: QuickAddTarget[] = [];
  for (const g of groups) {
    if (g.source !== 'kanban' || g.defaultColumnId == null) continue;
    const key = `kanban:${g.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: g.name, kind: 'kanban', columnId: g.defaultColumnId });
  }
  if (brainEnabled) out.push({ key: 'brain', label: 'Brain tasks', kind: 'brain' });
  return out;
}

export function quickAddRequest(target: QuickAddTarget, title: string): { url: string; body: Record<string, unknown> } {
  const t = title.trim();
  return target.kind === 'kanban'
    ? { url: '/api/portal/cards', body: { columnId: target.columnId, title: t } }
    : { url: '/api/portal/brain/tasks', body: { title: t } };
}
