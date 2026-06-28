'use client';

import { useEffect, useState } from 'react';

type ProjectRole = 'owner' | 'editor' | 'commenter' | 'viewer';

interface Member {
  id: number;
  userId: number;
  role: ProjectRole;
  addedAt: string;
  name: string | null;
  email: string;
}

interface TeamUser {
  userId: number;
  name: string | null;
  email: string;
}

const ROLE_OPTIONS: ProjectRole[] = ['owner', 'editor', 'commenter', 'viewer'];

const roleLabel: Record<ProjectRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

const roleDescription: Record<ProjectRole, string> = {
  owner: 'Full control, including managing members and deleting the project',
  editor: 'Can create and edit cards, columns, sprints, labels, files, webhooks',
  commenter: 'Can comment on cards, log time, attach files',
  viewer: 'Read-only access',
};

export default function ProjectMembersTab({ projectId, canManage }: { projectId: number; canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ userId: '' as string | number, role: 'editor' as ProjectRole });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, t] = await Promise.all([
        fetch(`/api/portal/projects/${projectId}/members`).then(r => r.json()),
        fetch('/api/portal/team').then(r => r.json()).catch(() => ({ success: false })),
      ]);
      if (m.success) setMembers(m.data);
      if (t.success) setTeam(t.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUserId = typeof form.userId === 'number' ? form.userId : parseInt(String(form.userId), 10);
    if (Number.isNaN(targetUserId)) {
      setError('Pick a teammate to add');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, role: form.role }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? 'Failed to add member');
        return;
      }
      setShowAdd(false);
      setForm({ userId: '', role: 'editor' });
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  // Already-on-the-project user IDs are filtered out of the picker.
  const memberIds = new Set(members.map(m => m.userId));
  const availableTeam = team.filter(t => !memberIds.has(t.userId));

  const onChangeRole = async (userId: number, role: ProjectRole) => {
    const res = await fetch(`/api/portal/projects/${projectId}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    const data = await res.json();
    if (!data.success) setError(data.message ?? 'Failed to change role');
    else await load();
  };

  const onRemove = async (userId: number) => {
    if (!confirm('Remove this member from the project?')) return;
    const res = await fetch(`/api/portal/projects/${projectId}/members?userId=${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) setError(data.message ?? 'Failed to remove member');
    else await load();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Members</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Each member has a role that controls what they can do on this project.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">{showAdd ? 'close' : 'person_add'}</span>
            {showAdd ? 'Cancel' : 'Add Member'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {showAdd && canManage && (
        <form onSubmit={onAdd} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Add member</h3>
          {availableTeam.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Everyone on your team is already a member of this project. Invite new teammates from{' '}
              <a href="/portal/settings/team" className="text-primary hover:underline">Team Settings</a>.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Teammate <span className="text-destructive">*</span></label>
                <select
                  required
                  value={String(form.userId)}
                  onChange={e => setForm(p => ({ ...p, userId: parseInt(e.target.value, 10) }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Choose teammate…</option>
                  {availableTeam.map(t => (
                    <option key={t.userId} value={t.userId}>{t.name ?? t.email} ({t.email})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value as ProjectRole }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r} value={r}>{roleLabel[r]} — {roleDescription[r]}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {availableTeam.length > 0 && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting && <span className="material-icons text-base animate-spin">refresh</span>}
                Add Member
              </button>
            </div>
          )}
        </form>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-icons animate-spin text-primary">refresh</span>
          </div>
        ) : members.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No members yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Member</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Added</th>
                {canManage && <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{m.name ?? m.email}</div>
                    {m.name && <div className="text-xs text-muted-foreground">{m.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        value={m.role}
                        onChange={e => onChangeRole(m.userId, e.target.value as ProjectRole)}
                        className="px-2 py-1 rounded border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      >
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{roleLabel[r]}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{roleLabel[m.role]}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(m.addedAt).toLocaleDateString('en-US')}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onRemove(m.userId)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
