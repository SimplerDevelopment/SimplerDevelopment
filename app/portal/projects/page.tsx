'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
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

type Tab = 'agency' | 'private';

// ─── Component ───────────────────────────────────────────────────────────────

export default function PortalProjectsPage() {
  const [tab, setTab] = useState<Tab>('agency');
  const [agencyProjects, setAgencyProjects] = useState<Project[]>([]);
  const [privateProjects, setPrivateProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/portal/projects')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setAgencyProjects(res.data.agency ?? res.data ?? []);
          setPrivateProjects(res.data.private ?? []);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/portal/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        setCreateForm({ name: '', description: '' });
        load();
      }
    } finally {
      setCreating(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'agency', label: 'Simpler Development Projects', icon: 'business' },
    { key: 'private', label: 'Private Projects', icon: 'lock' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage and track all your projects.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/portal/projects/automations"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-muted-foreground text-sm font-medium hover:bg-accent hover:text-foreground transition-colors"
          >
            <span className="material-icons text-base">bolt</span>
            Automations
          </Link>
          <Link
            href="/portal/suggested-projects"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-muted-foreground text-sm font-medium hover:bg-accent hover:text-foreground transition-colors"
          >
            <span className="material-icons text-base">rocket_launch</span>
            Suggested Projects
          </Link>
          {tab === 'private' && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">{showCreateForm ? 'close' : 'add'}</span>
              {showCreateForm ? 'Cancel' : 'New Project'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <span className="material-icons text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreateForm && tab === 'private' && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Create Private Project</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Project Name</label>
              <input
                value={createForm.name}
                onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                required
                placeholder="e.g. Q2 Marketing Campaign"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Description</label>
              <input
                value={createForm.description}
                onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
      ) : tab === 'agency' ? (
        <ProjectGrid projects={agencyProjects} emptyMessage="No agency projects yet. Your projects will appear here once your team sets them up." emptyIcon="business" />
      ) : (
        <ProjectGrid projects={privateProjects} emptyMessage="No private projects yet. Create your first project to get started with kanban boards, task tracking, and more." emptyIcon="lock" isPrivate />
      )}
    </div>
  );
}

// ─── Project Grid ────────────────────────────────────────────────────────────

function ProjectGrid({
  projects,
  emptyMessage,
  emptyIcon,
  isPrivate = false,
}: {
  projects: Project[];
  emptyMessage: string;
  emptyIcon: string;
  isPrivate?: boolean;
}) {
  if (projects.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <span className="material-icons text-5xl text-muted-foreground">{emptyIcon}</span>
        <h3 className="mt-4 font-semibold text-foreground">No projects yet</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/portal/projects/${project.id}`}
          className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <span className="material-icons text-2xl text-primary group-hover:scale-110 transition-transform">
              {isPrivate ? 'lock' : 'view_kanban'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusColor[project.status] ?? 'bg-muted text-muted-foreground'}`}>
              <span className="material-icons text-xs">{statusIcon[project.status] ?? 'circle'}</span>
              {project.status}
            </span>
          </div>
          <h3 className="font-semibold text-foreground truncate">{project.name}</h3>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{project.description}</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
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
    </div>
  );
}
