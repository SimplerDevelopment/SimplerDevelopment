'use client';

import { useState, useEffect } from 'react';

interface ProjectRequest {
  id: number;
  status: string;
  answers: Record<string, unknown> | null;
  message: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: number;
  projectTitle: string;
  projectCategory: string;
  clientId: number;
  clientCompany: string | null;
  clientUserId: number;
  clientUserName: string;
  clientUserEmail: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700',  icon: 'hourglass_empty' },
  reviewed: { label: 'Reviewed', color: 'bg-blue-100 text-blue-700',    icon: 'visibility' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700',  icon: 'check_circle' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700',      icon: 'cancel' },
};

const STATUSES = Object.keys(STATUS_CONFIG);

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminProjectRequestsPage() {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetch('/api/admin/portal/suggested-project-requests')
      .then(r => r.json())
      .then(d => { setRequests(d.data ?? []); setLoading(false); });
  }, []);

  async function updateRequest(id: number, patch: { status?: string; adminNotes?: string }) {
    setSavingId(id);
    const res = await fetch(`/api/admin/portal/suggested-project-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setSavingId(null);
    if (data.success) {
      setRequests(prev => prev.map(r => r.id === id ? data.data : r));
    }
  }

  async function saveNotes(req: ProjectRequest) {
    const notes = editingNotes[req.id] ?? req.adminNotes ?? '';
    await updateRequest(req.id, { adminNotes: notes });
    setEditingNotes(prev => { const n = { ...prev }; delete n[req.id]; return n; });
  }

  const filtered = filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus);

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = requests.filter(r => r.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Project Requests</h1>
        <p className="text-muted-foreground mt-1">Client intake submissions from suggested projects. Review answers and update status.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUSES.map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
              className={`text-left p-4 rounded-xl border transition-colors ${
                filterStatus === s ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`material-icons text-sm ${cfg.color.split(' ')[1]}`}>{cfg.icon}</span>
                <span className="text-2xl font-bold text-foreground">{counts[s] ?? 0}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 capitalize">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilterStatus('all')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterStatus === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
          All ({requests.length})
        </button>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {STATUS_CONFIG[s].label} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {filterStatus === 'all' ? 'No project requests yet.' : `No ${filterStatus} requests.`}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending;
            const isExpanded = expandedId === req.id;
            const hasAnswers = req.answers && Object.keys(req.answers).length > 0;
            const isEditingNotes = req.id in editingNotes;

            return (
              <div key={req.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-start gap-4 p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                        <span className="material-icons text-xs">{cfg.icon}</span>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded capitalize">{req.projectCategory}</span>
                    </div>
                    <h3 className="font-semibold text-foreground mt-1">{req.projectTitle}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <span className="material-icons text-sm">person</span>
                        {req.clientUserName}
                        {req.clientCompany && <span className="text-xs text-muted-foreground ml-1">({req.clientCompany})</span>}
                      </span>
                      <span className="text-muted-foreground text-xs">{req.clientUserEmail}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(req.createdAt)}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={req.status}
                      onChange={e => updateRequest(req.id, { status: e.target.value })}
                      disabled={savingId === req.id}
                      className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                    >
                      {STATUSES.map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <span className="material-icons text-base">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-5 pb-5 pt-4 bg-muted/20 space-y-4">
                    {req.message && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Message</p>
                        <p className="text-sm text-foreground bg-card border border-border rounded-lg px-4 py-3 whitespace-pre-wrap">{req.message}</p>
                      </div>
                    )}

                    {hasAnswers && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Survey Answers</p>
                        <div className="space-y-2">
                          {Object.entries(req.answers!).map(([key, val]) => (
                            <div key={key} className="bg-card border border-border rounded-lg px-4 py-3">
                              <p className="text-xs text-muted-foreground font-medium mb-0.5">{key}</p>
                              <p className="text-sm text-foreground whitespace-pre-wrap">
                                {Array.isArray(val) ? (val as string[]).join(', ') : String(val ?? '—')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Admin Notes</p>
                        {!isEditingNotes && (
                          <button
                            onClick={() => setEditingNotes(prev => ({ ...prev, [req.id]: req.adminNotes ?? '' }))}
                            className="text-xs text-primary hover:underline"
                          >
                            {req.adminNotes ? 'Edit' : 'Add notes'}
                          </button>
                        )}
                      </div>
                      {isEditingNotes ? (
                        <div className="space-y-2">
                          <textarea
                            rows={3}
                            value={editingNotes[req.id]}
                            onChange={e => setEditingNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            placeholder="Internal notes — not visible to client"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveNotes(req)} disabled={savingId === req.id}
                              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                              {savingId === req.id ? 'Saving...' : 'Save Notes'}
                            </button>
                            <button onClick={() => setEditingNotes(prev => { const n = { ...prev }; delete n[req.id]; return n; })}
                              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : req.adminNotes ? (
                        <p className="text-sm text-foreground bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 whitespace-pre-wrap">{req.adminNotes}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No notes yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
