'use client';

import { useEffect, useState } from 'react';
import { pBtnPrimary, pCard, pInput, pSelect } from '@/components/portal/portal-ui';

interface Member {
  memberId: number;
  userId: number;
  name: string;
  email: string;
  role: string;
  isOwner: boolean;
  isCurrentUser: boolean;
  joinedAt: string;
}

interface InviteResult {
  name: string;
  email: string;
  isNewUser: boolean;
  tempPassword: string | null;
}

const ROLES = [
  { value: 'admin', label: 'Admin', description: 'Can invite members, change roles, manage projects' },
  { value: 'member', label: 'Member', description: 'Can view and collaborate on projects' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to projects and invoices' },
] as const;

const roleBadgeClass: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  member: 'bg-accent text-muted-foreground',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function SettingsTeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'member' });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<number | null>(null);

  const canManage = currentRole === 'owner' || currentRole === 'admin';

  const load = () => {
    setLoading(true);
    fetch('/api/portal/team')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setMembers(res.data);
          setCurrentRole(res.currentRole);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError('');
    setInviteResult(null);
    try {
      const res = await fetch('/api/portal/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (data.success) {
        setInviteResult(data.data);
        setInviteForm({ name: '', email: '', role: 'member' });
        load();
      } else {
        setInviteError(data.message);
      }
    } catch {
      setInviteError('Something went wrong.');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: number) => {
    if (!confirm('Remove this team member?')) return;
    setRemovingId(memberId);
    try {
      const res = await fetch(`/api/portal/team/${memberId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) load();
    } finally {
      setRemovingId(null);
    }
  };

  const handleRoleChange = async (memberId: number, newRole: string) => {
    setUpdatingRoleId(memberId);
    try {
      const res = await fetch(`/api/portal/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) { load(); setEditingRoleId(null); }
    } finally {
      setUpdatingRoleId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Members list */}
      <div className={`${pCard} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-display font-extrabold tracking-[-0.01em] text-foreground">Team Members</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>

        {members.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">No team members yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {members.map(m => (
              <li key={m.memberId} className="flex items-center gap-4 px-6 py-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-semibold text-sm uppercase">{m.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.name}
                    {m.isCurrentUser && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>

                {editingRoleId === m.memberId ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      defaultValue={m.role}
                      disabled={updatingRoleId === m.memberId}
                      onChange={e => handleRoleChange(m.memberId, e.target.value)}
                      className="text-xs px-2 py-1 rounded-lg border border-border bg-background text-foreground"
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button onClick={() => setEditingRoleId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => canManage && !m.isOwner && !m.isCurrentUser ? setEditingRoleId(m.memberId) : undefined}
                    disabled={!canManage || m.isOwner || m.isCurrentUser}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${roleBadgeClass[m.isOwner ? 'owner' : m.role] ?? roleBadgeClass.member} ${
                      canManage && !m.isOwner && !m.isCurrentUser ? 'cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow' : ''
                    }`}
                  >
                    {m.isOwner ? 'Owner' : m.role}
                  </button>
                )}

                {canManage && !m.isCurrentUser && !m.isOwner && (
                  <button
                    onClick={() => handleRemove(m.memberId)}
                    disabled={removingId === m.memberId}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                  >
                    {removingId === m.memberId
                      ? <span className="material-icons text-base animate-spin">refresh</span>
                      : <span className="material-icons text-base">person_remove</span>
                    }
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invite form */}
      {canManage && (
        <div className={`${pCard} p-6 space-y-4`}>
          <div>
            <h2 className="text-base font-display font-extrabold tracking-[-0.01em] text-foreground">Invite a Team Member</h2>
            <p className="text-xs text-muted-foreground mt-0.5">They will receive login credentials to access this portal.</p>
          </div>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Full Name</label>
                <input
                  value={inviteForm.name}
                  onChange={e => { setInviteForm(p => ({ ...p, name: e.target.value })); setInviteError(''); }}
                  required
                  placeholder="Jane Smith"
                  className={pInput}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => { setInviteForm(p => ({ ...p, email: e.target.value })); setInviteError(''); }}
                  required
                  placeholder="jane@acme.com"
                  className={pInput}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}
                  className={pSelect}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            {inviteError && (
              <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <span className="material-icons text-base">error</span>{inviteError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={inviting}
                className={pBtnPrimary}
              >
                {inviting && <span className="material-icons text-base animate-spin">refresh</span>}
                <span className="material-icons text-base">person_add</span>
                {inviting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invite result */}
      {inviteResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 dark:bg-green-900/20 dark:border-green-800">
          <div className="flex items-start gap-3">
            <span className="material-icons text-green-600 text-xl mt-0.5">check_circle</span>
            <div className="space-y-2 flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">{inviteResult.name} has been added.</p>
              {inviteResult.isNewUser && inviteResult.tempPassword && (
                <div className="space-y-1">
                  <p className="text-xs text-green-700 dark:text-green-400">Share these credentials (shown once):</p>
                  <div className="bg-white dark:bg-black/20 border border-green-200 dark:border-green-700 rounded-lg p-3 space-y-1 font-mono text-xs text-green-900 dark:text-green-200">
                    <p><span className="font-semibold">Email:</span> {inviteResult.email}</p>
                    <p><span className="font-semibold">Password:</span> {inviteResult.tempPassword}</p>
                  </div>
                </div>
              )}
              {!inviteResult.isNewUser && (
                <p className="text-xs text-green-700 dark:text-green-400">They can sign in with their existing credentials.</p>
              )}
            </div>
            <button onClick={() => setInviteResult(null)} className="text-green-600 hover:text-green-800"><span className="material-icons text-base">close</span></button>
          </div>
        </div>
      )}

      {!canManage && (
        <div className={`${pCard} p-5 text-center`}>
          <span className="material-icons text-muted-foreground text-2xl mb-2">lock</span>
          <p className="text-sm text-muted-foreground">Only owners and admins can manage team members.</p>
        </div>
      )}
    </div>
  );
}
