'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  clientId: number;
  company: string | null;
  clientName: string;
}

interface Client {
  id: number;
  company: string | null;
  userName: string;
  userEmail: string;
}

const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-500',
};

function ProjectsContent() {
  const searchParams = useSearchParams();
  const filterClientId = searchParams.get('clientId');

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', clientId: filterClientId ?? '', status: 'active', startDate: '', dueDate: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/portal/projects').then(r => r.json()),
      fetch('/api/admin/portal/clients').then(r => r.json()),
    ]).then(([p, c]) => {
      setProjects(p.data ?? []);
      setClients(c.data ?? []);
      setLoading(false);
    });
  }, []);

  const filtered = filterClientId ? projects.filter(p => String(p.clientId) === filterClientId) : projects;

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/admin/portal/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, clientId: parseInt(form.clientId, 10) }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      const client = clients.find(c => c.id === data.data.clientId);
      setProjects(prev => [...prev, { ...data.data, company: client?.company ?? null, clientName: client?.userName ?? '' }]);
      setShowForm(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage client projects and Kanban boards.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <span className="material-icons text-base">add</span>New Project
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Create Project</h2>
          <form onSubmit={createProject} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Project Name <span className="text-destructive">*</span></label>
              <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Client <span className="text-destructive">*</span></label>
              <select required value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company ?? c.userName}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving ? <><span className="material-icons text-base animate-spin">refresh</span>Creating...</> : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <span className="material-icons text-5xl text-muted-foreground">view_kanban</span>
              <h3 className="mt-4 font-semibold text-foreground">No projects</h3>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Due</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{p.name}</p>
                      {p.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{p.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.company ?? p.clientName}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[p.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/portal/projects/${p.id}`} className="text-xs text-primary hover:underline">
                        Open Board
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPortalProjectsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading...</div>}>
      <ProjectsContent />
    </Suspense>
  );
}
