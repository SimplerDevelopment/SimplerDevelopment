'use client';

import { useState, useEffect } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

interface Segment {
  id: number;
  name: string;
  description: string | null;
  rules: { field: string; operator: string; value: string }[];
  matchType: string;
  subscriberCount: number;
  lastCalculatedAt: string | null;
  createdAt: string;
}

interface Tag {
  id: number;
  name: string;
  color: string;
  subscriberCount: number;
}

const SEGMENT_FIELDS = [
  { value: 'status', label: 'Subscriber Status' },
  { value: 'tag', label: 'Has Tag' },
  { value: 'subscribed_days', label: 'Days Since Subscribed' },
  { value: 'list', label: 'In List' },
  { value: 'opened_campaign', label: 'Opened Campaign' },
  { value: 'clicked_campaign', label: 'Clicked Campaign' },
];

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  status: [{ value: 'equals', label: 'is' }, { value: 'not_equals', label: 'is not' }],
  tag: [{ value: 'has', label: 'has' }, { value: 'not_has', label: 'does not have' }],
  subscribed_days: [{ value: 'gt', label: 'more than' }, { value: 'lt', label: 'less than' }],
  list: [{ value: 'in', label: 'is in' }, { value: 'not_in', label: 'is not in' }],
  opened_campaign: [{ value: 'yes', label: 'opened' }, { value: 'no', label: 'did not open' }],
  clicked_campaign: [{ value: 'yes', label: 'clicked' }, { value: 'no', label: 'did not click' }],
};

type TabType = 'segments' | 'tags';

export default function EmailSegmentsPage() {
  const [tab, setTab] = useState<TabType>('segments');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // Segment form
  const [showCreateSegment, setShowCreateSegment] = useState(false);
  const [segName, setSegName] = useState('');
  const [segDesc, setSegDesc] = useState('');
  const [segMatch, setSegMatch] = useState('all');
  const [segRules, setSegRules] = useState<{ field: string; operator: string; value: string }[]>([{ field: 'status', operator: 'equals', value: 'active' }]);
  const [segSaving, setSegSaving] = useState(false);

  // Tag form
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [tagSaving, setTagSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/email/segments').then(r => r.json()),
      fetch('/api/portal/email/tags').then(r => r.json()),
    ]).then(([s, t]) => {
      if (s.success) setSegments(s.data);
      if (t.success) setTags(t.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleCreateSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segName.trim()) return;
    setSegSaving(true);
    try {
      const res = await fetch('/api/portal/email/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: segName, description: segDesc, rules: segRules, matchType: segMatch }),
      });
      const data = await res.json();
      if (data.success) {
        setSegments(prev => [data.data, ...prev]);
        setShowCreateSegment(false);
        setSegName(''); setSegDesc(''); setSegRules([{ field: 'status', operator: 'equals', value: 'active' }]);
      }
    } finally { setSegSaving(false); }
  };

  const handleDeleteSegment = async (id: number) => {
    if (!confirm('Delete this segment?')) return;
    const res = await fetch(`/api/portal/email/segments/${id}`, { method: 'DELETE' });
    if ((await res.json()).success) setSegments(prev => prev.filter(s => s.id !== id));
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setTagSaving(true);
    try {
      const res = await fetch('/api/portal/email/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });
      const data = await res.json();
      if (data.success) { setTags(prev => [data.data, ...prev]); setNewTagName(''); }
    } finally { setTagSaving(false); }
  };

  const handleDeleteTag = async (id: number) => {
    if (!confirm('Delete this tag?')) return;
    const res = await fetch(`/api/portal/email/tags/${id}`, { method: 'DELETE' });
    if ((await res.json()).success) setTags(prev => prev.filter(t => t.id !== id));
  };

  const addRule = () => setSegRules(prev => [...prev, { field: 'status', operator: 'equals', value: '' }]);
  const removeRule = (i: number) => setSegRules(prev => prev.filter((_, idx) => idx !== i));
  const updateRule = (i: number, key: string, val: string) => {
    setSegRules(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span></div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PortalPageHeader
        eyebrow="Email"
        title="Audience"
        subtitle="Segment and tag your subscribers for targeted campaigns"
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        <button onClick={() => setTab('segments')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'segments' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <span className="material-icons text-base align-text-bottom mr-1.5">filter_alt</span>
          Segments ({segments.length})
        </button>
        <button onClick={() => setTab('tags')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'tags' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <span className="material-icons text-base align-text-bottom mr-1.5">label</span>
          Tags ({tags.length})
        </button>
      </div>

      {/* Segments Tab */}
      {tab === 'segments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCreateSegment(!showCreateSegment)} className={`flex items-center gap-2 ${pBtnPrimary}`}>
              <span className="material-icons text-lg">add</span>
              New Segment
            </button>
          </div>

          {showCreateSegment && (
            <form onSubmit={handleCreateSegment} className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h3 className="font-semibold">Create Segment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Segment Name</label>
                  <input value={segName} onChange={e => setSegName(e.target.value)} placeholder="e.g. Active Subscribers" className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Match</label>
                  <select value={segMatch} onChange={e => setSegMatch(e.target.value)} className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="all">All rules must match</option>
                    <option value="any">Any rule can match</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Rules</label>
                <div className="space-y-2 mt-1">
                  {segRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <select value={rule.field} onChange={e => updateRule(i, 'field', e.target.value)} className="text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50">
                        {SEGMENT_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select value={rule.operator} onChange={e => updateRule(i, 'operator', e.target.value)} className="text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50">
                        {(OPERATORS[rule.field] || OPERATORS.status).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input value={rule.value} onChange={e => updateRule(i, 'value', e.target.value)} placeholder="value" className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      {segRules.length > 1 && (
                        <button type="button" onClick={() => removeRule(i)} className="p-1 text-muted-foreground hover:text-red-500">
                          <span className="material-icons text-base">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addRule} className="mt-2 text-xs text-primary hover:underline flex items-center gap-1">
                  <span className="material-icons text-xs">add</span> Add rule
                </button>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={segSaving} className={`${pBtnPrimary}`}>
                  {segSaving ? 'Creating...' : 'Create Segment'}
                </button>
                <button type="button" onClick={() => setShowCreateSegment(false)} className={`${pBtnGhost}`}>Cancel</button>
              </div>
            </form>
          )}

          {segments.length === 0 && !showCreateSegment ? (
            <div className="text-center py-16 bg-muted/30 rounded-xl border border-border">
              <span className="material-icons text-5xl text-muted-foreground">filter_alt</span>
              <h3 className="mt-3 font-semibold text-lg">No segments yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Create segments to target specific groups of subscribers</p>
            </div>
          ) : (
            segments.map(seg => (
              <div key={seg.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm">{seg.name}</h3>
                  {seg.description && <p className="text-xs text-muted-foreground mt-0.5">{seg.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>{seg.rules.length} rule{seg.rules.length !== 1 ? 's' : ''}</span>
                    <span>Match: {seg.matchType}</span>
                    <span>{seg.subscriberCount} subscribers</span>
                  </div>
                </div>
                <button onClick={() => handleDeleteSegment(seg.id)} className="p-1 text-muted-foreground hover:text-red-500">
                  <span className="material-icons text-lg">delete_outline</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tags Tab */}
      {tab === 'tags' && (
        <div className="space-y-4">
          <form onSubmit={handleCreateTag} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Tag Name</label>
              <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="e.g. VIP, Newsletter, Lead" className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} className="mt-1 h-[38px] w-12 rounded-lg border border-border cursor-pointer" />
            </div>
            <button type="submit" disabled={tagSaving} className={`${pBtnPrimary} whitespace-nowrap`}>
              {tagSaving ? 'Adding...' : 'Add Tag'}
            </button>
          </form>

          {tags.length === 0 ? (
            <div className="text-center py-16 bg-muted/30 rounded-xl border border-border">
              <span className="material-icons text-5xl text-muted-foreground">label</span>
              <h3 className="mt-3 font-semibold text-lg">No tags yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Tags help you organize subscribers beyond just lists</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <div key={tag.id} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 group">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                  <span className="text-sm font-medium">{tag.name}</span>
                  <span className="text-xs text-muted-foreground">{tag.subscriberCount}</span>
                  <button onClick={() => handleDeleteTag(tag.id)} className="p-0.5 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-icons text-sm">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
