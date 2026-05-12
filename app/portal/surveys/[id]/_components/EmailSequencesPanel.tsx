'use client';

/**
 * EmailSequencesPanel — manage per-survey post-submission email follow-up
 * sequences (DIST-01 / DIST-02).
 *
 * List + create form + per-row inline edit. Sequences are fired by the
 * cron worker at /api/cron/process-survey-email-followups every 15 minutes;
 * this panel just configures what gets queued.
 *
 * The opt-in gate (consentField) lives on the survey row itself and is
 * edited in the Settings tab — surfaced here as a status line so the
 * operator can tell whether their sequences will actually fire.
 */

import { useCallback, useEffect, useState } from 'react';
import type { SurveyField } from '@/components/admin/SurveyBuilder';
import { formatDelay } from '@/lib/surveys/email-followup-gate';

interface EmailSequence {
  id: number;
  surveyId: number;
  subject: string;
  bodyHtml: string;
  delayHours: number;
  conditionField: string | null;
  conditionValue: string | null;
  enabled: boolean;
  createdAt: string;
}

interface Props {
  surveyId: string;
  surveyFields: SurveyField[];
}

interface DraftSequence {
  subject: string;
  bodyHtml: string;
  delayHours: string; // string so the input is controlled
  conditionField: string;
  conditionValue: string;
  enabled: boolean;
}

const EMPTY_DRAFT: DraftSequence = {
  subject: '',
  bodyHtml: '<p>Thanks for your response!</p>',
  delayHours: '24',
  conditionField: '',
  conditionValue: '',
  enabled: true,
};

export default function EmailSequencesPanel({ surveyId, surveyFields }: Props) {
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DraftSequence>(EMPTY_DRAFT);

  // Per-row inline edit state. Only one row may be in "editing" mode at a
  // time — opening another collapses the first without saving.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<DraftSequence | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const fieldOptions = (surveyFields || []).filter(
    (f) => f.id && f.type !== 'heading' && f.type !== 'page_break' && f.type !== 'file',
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/email-sequences`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load sequences');
      setSequences(json.data as EmailSequence[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createSequence() {
    if (!draft.subject.trim()) { setError('Subject is required'); return; }
    if (!draft.bodyHtml.trim()) { setError('Body HTML is required'); return; }
    const delayHours = parseInt(draft.delayHours, 10);
    if (!Number.isFinite(delayHours) || delayHours < 0) {
      setError('Delay must be a non-negative integer (hours)');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/email-sequences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: draft.subject.trim(),
          bodyHtml: draft.bodyHtml,
          delayHours,
          conditionField: draft.conditionField || null,
          conditionValue: draft.conditionField ? draft.conditionValue : null,
          enabled: draft.enabled,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create sequence');
      setDraft(EMPTY_DRAFT);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  // Optimistic toggle: flip locally, then PUT. On failure we revert.
  async function toggleEnabled(seq: EmailSequence) {
    const optimistic = sequences.map((s) => (s.id === seq.id ? { ...s, enabled: !s.enabled } : s));
    setSequences(optimistic);
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/email-sequences/${seq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !seq.enabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to update sequence');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refresh();
    }
  }

  async function deleteSequence(seq: EmailSequence) {
    if (!confirm(`Delete the sequence "${seq.subject}"? This stops any future sends but cannot recover already-sent emails.`)) return;
    // Optimistic remove.
    const before = sequences;
    setSequences(before.filter((s) => s.id !== seq.id));
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/email-sequences/${seq.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to delete sequence');
      if (editingId === seq.id) {
        setEditingId(null);
        setEditDraft(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSequences(before);
    }
  }

  function startEditing(seq: EmailSequence) {
    setEditingId(seq.id);
    setEditDraft({
      subject: seq.subject,
      bodyHtml: seq.bodyHtml,
      delayHours: String(seq.delayHours),
      conditionField: seq.conditionField ?? '',
      conditionValue: seq.conditionValue ?? '',
      enabled: seq.enabled,
    });
  }

  async function saveEdit(seq: EmailSequence) {
    if (!editDraft) return;
    const delayHours = parseInt(editDraft.delayHours, 10);
    if (!Number.isFinite(delayHours) || delayHours < 0) {
      setError('Delay must be a non-negative integer (hours)');
      return;
    }
    setSavingId(seq.id);
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/email-sequences/${seq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: editDraft.subject.trim(),
          bodyHtml: editDraft.bodyHtml,
          delayHours,
          conditionField: editDraft.conditionField || null,
          conditionValue: editDraft.conditionField ? editDraft.conditionValue : null,
          enabled: editDraft.enabled,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to save sequence');
      setEditingId(null);
      setEditDraft(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="material-icons text-primary mt-0.5">forward_to_inbox</span>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Email Follow-up Sequences</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Send a follow-up email N hours after a respondent completes the survey. Sequences
              only fire when the respondent provided an email and (if configured) consented in
              the survey itself. Configure the consent field in <strong>Settings</strong>; the
              cron worker runs every 15 minutes. Placeholders supported in the body:{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{respondentName}'}</code>,{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{surveyTitle}'}</code>,{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{unsubscribeUrl}'}</code>.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
            <span className="material-icons text-lg">error</span>
            {error}
            <button onClick={() => setError('')} className="ml-auto">
              <span className="material-icons text-lg">close</span>
            </button>
          </div>
        )}

        {/* Create form */}
        <div className="space-y-3 pt-2 border-t border-border">
          <label className="block text-sm font-medium text-foreground">Add a sequence</label>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Subject</label>
              <input
                type="text"
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                placeholder="Thanks for your feedback"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Delay (hours after submission)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={draft.delayHours}
                onChange={(e) => setDraft((d) => ({ ...d, delayHours: e.target.value }))}
                placeholder="24"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Body HTML</label>
            <textarea
              value={draft.bodyHtml}
              onChange={(e) => setDraft((d) => ({ ...d, bodyHtml: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Only send when (optional)</label>
              <select
                value={draft.conditionField}
                onChange={(e) => setDraft((d) => ({ ...d, conditionField: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">(always send)</option>
                {fieldOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.label || f.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">…equals (case-sensitive)</label>
              <input
                type="text"
                value={draft.conditionValue}
                onChange={(e) => setDraft((d) => ({ ...d, conditionValue: e.target.value }))}
                placeholder="e.g. Yes"
                disabled={!draft.conditionField}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
            />
            Enabled
          </label>
          <div>
            <button
              type="button"
              onClick={createSequence}
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <span className="material-icons text-base">add</span>
              {creating ? 'Adding…' : 'Add sequence'}
            </button>
          </div>
        </div>
      </div>

      {/* Existing sequences */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {loading && (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <span className="material-icons animate-spin text-base">progress_activity</span>
            Loading…
          </div>
        )}
        {!loading && sequences.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No follow-up sequences configured yet.</div>
        )}
        {!loading && sequences.map((seq) => (
          <div key={seq.id} className="p-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className={`material-icons text-base mt-0.5 ${seq.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                {seq.enabled ? 'mail' : 'mail_outline'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground break-words">{seq.subject}</div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted">
                    <span className="material-icons text-sm">schedule</span>
                    {formatDelay(seq.delayHours)}
                  </span>
                  {seq.conditionField && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted">
                      <span className="material-icons text-sm">filter_list</span>
                      {seq.conditionField} = {seq.conditionValue ?? '""'}
                    </span>
                  )}
                  {!seq.enabled && (
                    <span className="px-2 py-0.5 rounded bg-muted text-amber-700 dark:text-amber-400">Paused</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => (editingId === seq.id ? setEditingId(null) : startEditing(seq))}
                  className="px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground"
                  title="Edit"
                >
                  <span className="material-icons text-base">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleEnabled(seq)}
                  className="px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground"
                  title={seq.enabled ? 'Pause' : 'Resume'}
                >
                  <span className="material-icons text-base">{seq.enabled ? 'pause' : 'play_arrow'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSequence(seq)}
                  className="px-2 py-1 text-xs rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                  title="Delete"
                >
                  <span className="material-icons text-base">delete</span>
                </button>
              </div>
            </div>

            {editingId === seq.id && editDraft && (
              <div className="mt-3 ml-7 border border-border rounded-lg p-3 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Subject</label>
                    <input
                      type="text"
                      value={editDraft.subject}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, subject: e.target.value } : d)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Delay (hours)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editDraft.delayHours}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, delayHours: e.target.value } : d)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Body HTML</label>
                  <textarea
                    value={editDraft.bodyHtml}
                    onChange={(e) => setEditDraft((d) => d ? { ...d, bodyHtml: e.target.value } : d)}
                    rows={6}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Only send when</label>
                    <select
                      value={editDraft.conditionField}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, conditionField: e.target.value } : d)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">(always send)</option>
                      {fieldOptions.map((f) => (
                        <option key={f.id} value={f.id}>{f.label || f.id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">…equals</label>
                    <input
                      type="text"
                      value={editDraft.conditionValue}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, conditionValue: e.target.value } : d)}
                      disabled={!editDraft.conditionField}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editDraft.enabled}
                    onChange={(e) => setEditDraft((d) => d ? { ...d, enabled: e.target.checked } : d)}
                  />
                  Enabled
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(seq)}
                    disabled={savingId === seq.id}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <span className="material-icons text-base">save</span>
                    {savingId === seq.id ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setEditDraft(null); }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
