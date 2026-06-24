'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { RelatedModulesStrip } from '@/components/portal/billing/RelatedModulesStrip';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

// ─── Types ───────────────────────────────────────────────────────────────────

type ProjectRole = 'owner' | 'editor' | 'commenter' | 'viewer';

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  myRole?: ProjectRole;
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

const STATUS_TABS = ['all', 'active', 'paused', 'completed', 'archived'] as const;
type StatusFilter = typeof STATUS_TABS[number];

const roleLabel: Record<ProjectRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PortalProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    status: 'active',
    startDate: '',
    dueDate: '',
    cloneFromProjectId: '' as string,
  });
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = () => {
    setLoading(true);
    fetch('/api/portal/projects')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          // Server returns a flat array of projects post-unification. The
          // legacy { agency, private } shape is gone but keep a fallback for
          // a single rolling deploy where the client may receive either shape.
          if (Array.isArray(res.data)) setProjects(res.data);
          else if (res.data?.agency || res.data?.private) {
            setProjects([...(res.data.agency ?? []), ...(res.data.private ?? [])]);
          }
        }
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, predates this change
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const cloneId = createForm.cloneFromProjectId
        ? parseInt(createForm.cloneFromProjectId, 10)
        : null;
      const res = await fetch('/api/portal/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description,
          status: createForm.status,
          startDate: createForm.startDate,
          dueDate: createForm.dueDate,
          cloneFromProjectId: cloneId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        setCreateForm({ name: '', description: '', status: 'active', startDate: '', dueDate: '', cloneFromProjectId: '' });
        load();
      }
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s)
          || (p.description ?? '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [projects, search, statusFilter]);

  const counts = useMemo(() => ({
    active: projects.filter(p => p.status === 'active').length,
    paused: projects.filter(p => p.status === 'paused').length,
    completed: projects.filter(p => p.status === 'completed').length,
    total: projects.length,
  }), [projects]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="Delivery"
        title="Projects"
        subtitle="All projects you have access to — agency-managed and your own."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/portal/projects/automations"
              className={pBtnGhost}
            >
              <span className="material-icons text-base">bolt</span>
              Automations
            </Link>
            <Link
              href="/portal/suggested-projects"
              className={pBtnGhost}
            >
              <span className="material-icons text-base">rocket_launch</span>
              Suggested Projects
            </Link>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">{showCreateForm ? 'close' : 'add'}</span>
              {showCreateForm ? 'Cancel' : 'New Project'}
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-green-600">play_circle</span>
            <span className="text-xs text-muted-foreground font-medium">Active</span>
          </div>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{counts.active}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-yellow-600">pause_circle</span>
            <span className="text-xs text-muted-foreground font-medium">Paused</span>
          </div>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{counts.paused}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-blue-600">check_circle</span>
            <span className="text-xs text-muted-foreground font-medium">Completed</span>
          </div>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{counts.completed}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-muted-foreground">folder</span>
            <span className="text-xs text-muted-foreground font-medium">Total</span>
          </div>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{counts.total}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg flex-1 max-w-sm">
          <span className="material-icons text-muted-foreground text-base">search</span>
          <input
            className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Create Project</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Project Name <span className="text-destructive">*</span></label>
              <input
                value={createForm.name}
                onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                required
                placeholder="e.g. Q2 Marketing Campaign"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Status</label>
              <select
                value={createForm.status}
                onChange={e => setCreateForm(p => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                rows={2}
                value={createForm.description}
                onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Start Date</label>
              <input
                type="date"
                value={createForm.startDate}
                onChange={e => setCreateForm(p => ({ ...p, startDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Due Date</label>
              <input
                type="date"
                value={createForm.dueDate}
                onChange={e => setCreateForm(p => ({ ...p, dueDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            {projects.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Clone from existing project</label>
                <select
                  value={createForm.cloneFromProjectId}
                  onChange={e => setCreateForm(p => ({ ...p, cloneFromProjectId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">— Start from scratch —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Copies columns, labels, and card templates. Cards are not copied.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className={pBtnPrimary}
            >
              {creating && <span className="material-icons text-base animate-spin">refresh</span>}
              Create Project
            </button>
          </div>
        </form>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : (
        <ProjectGrid
          projects={filtered}
          emptyMessage={
            search || statusFilter !== 'all'
              ? 'No projects match your filters.'
              : 'No projects yet. Create your first project, or wait for your team to set one up.'
          }
        />
      )}
    </div>
  );
}

// ─── Project Grid ────────────────────────────────────────────────────────────

function ProjectGrid({
  projects,
  emptyMessage,
}: {
  projects: Project[];
  emptyMessage: string;
}) {
  if (projects.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center">
        <span className="material-icons text-5xl text-muted-foreground">view_kanban</span>
        <h3 className="mt-4 font-display font-extrabold tracking-[-0.01em] text-foreground">No projects yet</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{emptyMessage}</p>
      </div>
    );
  }

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
          <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground truncate">{project.name}</h3>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{project.description}</p>
          )}
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
                {new Date(project.startDate).toLocaleDateString()}
              </span>
            )}
            {project.dueDate && (
              <span className="flex items-center gap-1">
                <span className="material-icons text-xs">event</span>
                Due {new Date(project.dueDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </Link>
      ))}
      <RelatedModulesStrip currentDomain="projects" />
    </div>
  );
}
