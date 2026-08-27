'use client';

/**
 * Presentational grid/table views for the projects landing page.
 * Split out of app/portal/projects/page.tsx to keep that file under the
 * file-size budget ratchet (.file-budget.baseline.json) — extraction only,
 * no behavior change.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RelatedModulesStrip } from '@/components/portal/billing/RelatedModulesStrip';
import { EmptyState } from '@/components/portal/EmptyState';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { initials, relativeTime } from '@/lib/notifications/feed';
import type { ProjectRollup } from '@/lib/projects/list-rollup-shape';

export type ProjectRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  myRole?: ProjectRole;
  /** PUX-151: present only when the client has the portal-redesign flag */
  rollup?: ProjectRollup | null;
}

const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-500',
};

const statusIcon: Record<string, string> = {
  active: 'play_circle',
  paused: 'pause_circle',
  completed: 'check_circle',
  archived: 'archive',
};

const roleLabel: Record<ProjectRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

// ─── Project Grid ────────────────────────────────────────────────────────────

export function ProjectGrid({
  projects,
  emptyMessage,
  onCreate,
}: {
  projects: Project[];
  emptyMessage: string;
  onCreate?: () => void;
}) {
  const studio = useFeatureFlag('portal-redesign');
  if (projects.length === 0) return <EmptyProjects message={emptyMessage} onCreate={onCreate} />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/portal/projects/${project.id}`}
          // Disable viewport prefetch: ~30 tiles each triggering an `_rsc`
          // prefetch on render storms the server with concurrent RSC payload
          // requests. Hover still triggers prefetch in Next/Link by default.
          prefetch={false}
          className="bg-card border border-border rounded-2xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group min-w-0"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <span className="material-icons text-2xl text-primary group-hover:scale-110 transition-transform">view_kanban</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusColor[project.status] ?? 'bg-muted text-muted-foreground'}`}>
              <span className="material-icons text-xs">{statusIcon[project.status] ?? 'circle'}</span>
              {project.status}
            </span>
          </div>
          <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground truncate">{project.name}</h2>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{project.description}</p>
          )}
          {studio && project.rollup ? (
            // PUX-151 (design doc screen 10): what is done, what is where, what moved, who is on it.
            <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
              <div>
                <div className="flex items-center justify-between">
                  <span>{project.rollup.shipped} of {project.rollup.total} cards shipped</span>
                  <span className="font-mono">{project.rollup.pct}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><i className="block h-full bg-primary" style={{ width: `${project.rollup.pct}%` }} /></div>
              </div>
              {project.rollup.lanes.length > 0 && (
                <div className="truncate">{project.rollup.lanes.map((l) => `${l.count} ${l.name}`).join(' · ')}</div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 truncate">
                  <span className="material-icons text-[13px]">history</span>
                  {project.rollup.lastActivityAt ? `Last activity ${relativeTime(project.rollup.lastActivityAt)}` : 'No activity yet'}
                </span>
                <span className="flex shrink-0">
                  {project.rollup.members.map((m, i) => (
                    <span key={m.id} title={m.name} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground ${i > 0 ? '-ml-1.5' : ''}`}>{initials(m.name)}</span>
                  ))}
                </span>
              </div>
            </div>
          ) : (
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {project.myRole && (
              <span className="flex items-center gap-1">
                <span className="material-icons text-xs">person</span>
                {roleLabel[project.myRole]}
              </span>
            )}
            {project.startDate && (
              <span className="flex items-center gap-1">
                <span className="material-icons text-xs">calendar_today</span>
                {new Date(project.startDate).toLocaleDateString('en-US')}
              </span>
            )}
            {project.dueDate && (
              <span className="flex items-center gap-1">
                <span className="material-icons text-xs">event</span>
                Due {new Date(project.dueDate).toLocaleDateString('en-US')}
              </span>
            )}
          </div>
          )}
        </Link>
      ))}
      <RelatedModulesStrip currentDomain="projects" />
    </div>
  );
}

// ─── Project Table ───────────────────────────────────────────────────────────

export function ProjectTable({
  projects,
  emptyMessage,
}: {
  projects: Project[];
  emptyMessage: string;
}) {
  const router = useRouter();

  if (projects.length === 0) return <EmptyProjects message={emptyMessage} />;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Start</th>
                <th className="px-4 py-3 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const href = `/portal/projects/${project.id}`;
                return (
                  <tr
                    key={project.id}
                    onClick={() => router.push(href)}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={href}
                        prefetch={false}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-foreground hover:underline"
                      >
                        {project.name}
                      </Link>
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{project.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${statusColor[project.status] ?? 'bg-muted text-muted-foreground'}`}>
                        <span className="material-icons text-xs">{statusIcon[project.status] ?? 'circle'}</span>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{project.myRole ? roleLabel[project.myRole] : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{project.startDate ? new Date(project.startDate).toLocaleDateString('en-US') : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{project.dueDate ? new Date(project.dueDate).toLocaleDateString('en-US') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <RelatedModulesStrip currentDomain="projects" />
    </div>
  );
}

// ─── Shared empty state ──────────────────────────────────────────────────────

function EmptyProjects({ message, onCreate }: { message: string; onCreate?: () => void }) {
  // PUX-144/151: a preview with a button, not an icon and a sentence.
  return (
    <EmptyState
      className="bg-card border border-border rounded-2xl p-6"
      title="The work we're doing for you, on a board you can see."
      body="Each project is a board — backlog to shipped — with the people and the checklist on every card. Yours will show up here as we start."
      cta={onCreate ? { label: 'New project', icon: 'add', onClick: onCreate } : undefined}
      ghostLabel="Backlog · Planned · In progress · Shipped"
      legacy={(
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">view_kanban</span>
          <h2 className="mt-4 font-display font-extrabold tracking-[-0.01em] text-foreground">No projects yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{message}</p>
        </div>
      )}
    />
  );
}
