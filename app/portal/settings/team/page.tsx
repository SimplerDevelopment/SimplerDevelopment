'use client';

import { useEffect, useState } from 'react';

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

export default function TeamSettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/portal/settings/team')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setMembers(res.data);
          setIsOwner(res.isOwner);
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
      const res = await fetch('/api/portal/settings/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (data.success) {
        setInviteResult(data.data);
        setInviteForm({ name: '', email: '' });
        load();
      } else {
        setInviteError(data.message);
      }
    } catch {
      setInviteError('Something went wrong. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: number) => {
    if (!confirm('Remove this team member?')) return;
    setRemovingId(memberId);
    try {
      const res = await fetch(`/api/portal/settings/team/${memberId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) load();
    } finally {
      setRemovingId(null);
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
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Team Members</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>

        {members.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">No team members yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {members.map(m => (
              <li key={m.memberId} className="flex items-center gap-4 px-6 py-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-semibold text-sm uppercase">
                    {m.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.name}
                    {m.isCurrentUser && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  m.isOwner
                    ? 'bg-primary/10 text-primary'
                    : 'bg-accent text-muted-foreground'
                }`}>
                  {m.isOwner ? 'Owner' : 'Member'}
                </span>
                {isOwner && !m.isCurrentUser && (
                  <button
                    onClick={() => handleRemove(m.memberId)}
                    disabled={removingId === m.memberId}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                    title="Remove member"
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

      {/* Invite form — only owners */}
      {isOwner && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Invite a Team Member</h2>
            <p className="text-xs text-muted-foreground mt-0.5">They will receive login credentials to access this portal account.</p>
          </div>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Full Name</label>
                <input
                  value={inviteForm.name}
                  onChange={e => { setInviteForm(p => ({ ...p, name: e.target.value })); setInviteError(''); }}
                  required
                  placeholder="Jane Smith"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email Address</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => { setInviteForm(p => ({ ...p, email: e.target.value })); setInviteError(''); }}
                  required
                  placeholder="jane@acmeinc.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {inviteError && (
              <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <span className="material-icons text-base">error</span>
                {inviteError}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={inviting}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {inviting && <span className="material-icons text-base animate-spin">refresh</span>}
                <span className="material-icons text-base">person_add</span>
                {inviting ? 'Adding…' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invite result — show temp password once */}
      {inviteResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 dark:bg-green-900/20 dark:border-green-800">
          <div className="flex items-start gap-3">
            <span className="material-icons text-green-600 text-xl mt-0.5">check_circle</span>
            <div className="space-y-2 flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                {inviteResult.name} has been added to your team.
              </p>
              {inviteResult.isNewUser && inviteResult.tempPassword && (
                <div className="space-y-1">
                  <p className="text-xs text-green-700 dark:text-green-400">
                    A new account was created. Share these credentials — they will only be shown once:
                  </p>
                  <div className="bg-white dark:bg-black/20 border border-green-200 dark:border-green-700 rounded-lg p-3 space-y-1 font-mono text-xs text-green-900 dark:text-green-200">
                    <p><span className="font-semibold">Email:</span> {inviteResult.email}</p>
                    <p><span className="font-semibold">Password:</span> {inviteResult.tempPassword}</p>
                  </div>
                </div>
              )}
              {!inviteResult.isNewUser && (
                <p className="text-xs text-green-700 dark:text-green-400">
                  They already have an account and can sign in with their existing credentials.
                </p>
              )}
            </div>
            <button
              onClick={() => setInviteResult(null)}
              className="text-green-600 hover:text-green-800 transition-colors"
            >
              <span className="material-icons text-base">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
