'use client';

import { useEffect, useState } from 'react';
import { pBtnPrimary, pCard, pInput, pSelect } from '@/components/portal/portal-ui';

interface PipelineStage { id: number; name: string; order: number; }
interface Pipeline { id: number; name: string; stages: PipelineStage[]; }

interface CrmAddDealModalProps {
  companyId?: number;
  contactId?: number;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Shared "Add Deal" modal used from a company or contact detail page's Deals
 * tab (CRM79-008). The parent owns the open/close boolean and only mounts
 * this while open; it does not call onClose itself on success — the parent
 * decides what "created" means (close + refetch its own deals list).
 */
export default function CrmAddDealModal({ companyId, contactId, onClose, onCreated }: CrmAddDealModalProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newDeal, setNewDeal] = useState({ title: '', value: '', pipelineId: '', stageId: '', priority: 'medium', expectedCloseDate: '', notes: '' });

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/portal/crm/pipelines');
      const d = await res.json();
      const list: Pipeline[] = d.data ?? [];
      setPipelines(list);
      const first = list[0];
      const firstStage = first ? [...(first.stages ?? [])].sort((a, b) => a.order - b.order)[0] : undefined;
      if (first) setNewDeal(f => ({ ...f, pipelineId: String(first.id), stageId: firstStage ? String(firstStage.id) : '' }));
    })();
  }, []);

  const dealStages = pipelines.find(p => String(p.id) === newDeal.pipelineId)?.stages?.slice().sort((a, b) => a.order - b.order) ?? [];

  async function createDeal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const valueCents = newDeal.value.trim() === '' ? null : Math.round(parseFloat(newDeal.value) * 100);
    const res = await fetch('/api/portal/crm/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: companyId ?? null,
        contactId: contactId ?? null,
        title: newDeal.title,
        value: valueCents,
        pipelineId: newDeal.pipelineId ? Number(newDeal.pipelineId) : null,
        stageId: newDeal.stageId ? Number(newDeal.stageId) : null,
        priority: newDeal.priority,
        expectedCloseDate: newDeal.expectedCloseDate || null,
        notes: newDeal.notes || null,
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) { setError(d.message ?? 'Failed to create deal.'); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={createDeal} onClick={e => e.stopPropagation()} className={`${pCard} my-8 w-full max-w-2xl p-6 space-y-4`}>
        <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">New Deal</h3><button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><span className="material-icons text-base">close</span></button></div>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
            <span className="material-icons text-base">error</span>
            {error}
          </div>
        )}
        {pipelines.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No pipelines available. Create one in the Deals section first.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
                <input required value={newDeal.title} onChange={e => setNewDeal(f => ({ ...f, title: e.target.value }))} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Value (USD)</label>
                <input type="number" min={0} step="0.01" value={newDeal.value} onChange={e => setNewDeal(f => ({ ...f, value: e.target.value }))} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Expected close</label>
                <input type="date" value={newDeal.expectedCloseDate} onChange={e => setNewDeal(f => ({ ...f, expectedCloseDate: e.target.value }))} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Pipeline</label>
                <select
                  value={newDeal.pipelineId}
                  onChange={e => {
                    const pid = e.target.value;
                    const firstStage = pipelines.find(p => String(p.id) === pid)?.stages?.slice().sort((a, b) => a.order - b.order)[0];
                    setNewDeal(f => ({ ...f, pipelineId: pid, stageId: firstStage ? String(firstStage.id) : '' }));
                  }}
                  className={pSelect}
                >
                  {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Stage</label>
                <select value={newDeal.stageId} onChange={e => setNewDeal(f => ({ ...f, stageId: e.target.value }))} className={pSelect}>
                  {dealStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
                <select value={newDeal.priority} onChange={e => setNewDeal(f => ({ ...f, priority: e.target.value }))} className={pSelect}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                <textarea
                  value={newDeal.notes}
                  onChange={e => setNewDeal(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 resize-y"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving || !newDeal.pipelineId || !newDeal.stageId} className={pBtnPrimary}>
                {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
                Create Deal
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
