'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface PromptInfo {
  id: number;
  key: string;
  title: string;
  description: string | null;
  activeVersionId: number | null;
  scheduleCron: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EvalCase {
  id: number;
  datasetId: number;
  caseKey: string;
  input: unknown;
  expected: unknown;
  mockOutput: unknown;
  enabled: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAge(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return new Date(iso).toLocaleString();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function truncateJson(val: unknown, maxLen = 60): string {
  const str = JSON.stringify(val);
  if (!str) return '—';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

// ─── Edit-row component ───────────────────────────────────────────────────────

interface EditRowProps {
  c: EvalCase;
  isAdmin: boolean;
  onToggle: (id: number, current: boolean) => Promise<void>;
  onSave: (id: number, patch: Partial<Pick<EvalCase, 'caseKey' | 'input' | 'expected' | 'mockOutput' | 'order'>>) => Promise<void>;
}

function CaseRow({ c, isAdmin, onToggle, onSave }: EditRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit form state
  const [editKey, setEditKey] = useState(c.caseKey);
  const [editOrder, setEditOrder] = useState(String(c.order));
  const [editInput, setEditInput] = useState(JSON.stringify(c.input, null, 2));
  const [editExpected, setEditExpected] = useState(c.expected !== null ? JSON.stringify(c.expected, null, 2) : '');
  const [editMock, setEditMock] = useState(c.mockOutput !== null ? JSON.stringify(c.mockOutput, null, 2) : '');

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isAdmin || toggling) return;
    setToggling(true);
    await onToggle(c.id, c.enabled);
    setToggling(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);

    const parsedInput = tryParseJson(editInput);
    if (!parsedInput.ok) {
      setSaveError('input: invalid JSON');
      return;
    }

    let parsedExpected: unknown = null;
    if (editExpected.trim() !== '') {
      const r = tryParseJson(editExpected);
      if (!r.ok) {
        setSaveError('expected: invalid JSON');
        return;
      }
      parsedExpected = r.value;
    }

    let parsedMock: unknown = null;
    if (editMock.trim() !== '') {
      const r = tryParseJson(editMock);
      if (!r.ok) {
        setSaveError('mockOutput: invalid JSON');
        return;
      }
      parsedMock = r.value;
    }

    const orderNum = parseInt(editOrder, 10);
    if (isNaN(orderNum)) {
      setSaveError('order: must be a number');
      return;
    }

    if (!editKey.trim()) {
      setSaveError('caseKey is required');
      return;
    }

    setSaving(true);
    await onSave(c.id, {
      caseKey: editKey.trim(),
      input: parsedInput.value,
      expected: parsedExpected,
      mockOutput: parsedMock,
      order: orderNum,
    });
    setSaving(false);
  }

  return (
    <React.Fragment>
      <tr
        className="hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Expand chevron */}
        <td className="px-3 py-2 text-xs text-muted-foreground w-6">
          <span
            className={`material-icons text-sm leading-none transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            expand_more
          </span>
        </td>

        {/* Order */}
        <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{c.order}</td>

        {/* Case key */}
        <td className="px-3 py-2 text-xs font-mono text-foreground">{c.caseKey}</td>

        {/* Enabled toggle / indicator */}
        <td className="px-3 py-2 text-xs">
          {isAdmin ? (
            <button
              onClick={handleToggle}
              disabled={toggling}
              title={c.enabled ? 'Disable case' : 'Enable case'}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={
                c.enabled
                  ? { background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }
                  : { background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }
              }
            >
              <span className="material-icons text-xs leading-none">
                {toggling ? 'refresh' : c.enabled ? 'toggle_on' : 'toggle_off'}
              </span>
              {c.enabled ? 'enabled' : 'disabled'}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium">
              <span
                className={`material-icons text-xs leading-none ${c.enabled ? 'text-green-700' : 'text-red-700'}`}
              >
                {c.enabled ? 'check_circle' : 'cancel'}
              </span>
              <span className={c.enabled ? 'text-green-700' : 'text-red-700'}>
                {c.enabled ? 'enabled' : 'disabled'}
              </span>
            </span>
          )}
        </td>

        {/* Input preview */}
        <td className="px-3 py-2 text-xs text-muted-foreground font-mono max-w-[280px] truncate">
          {truncateJson(c.input)}
        </td>

        {/* Edit action (admin) */}
        {isAdmin && (
          <td className="px-3 py-2 text-xs">
            <span
              className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand to edit"
            >
              <span className="material-icons text-base leading-none">edit</span>
            </span>
          </td>
        )}

        {/* Updated */}
        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {fmtAge(c.updatedAt)}
        </td>
      </tr>

      {/* Expanded row */}
      {expanded && (
        <tr>
          <td colSpan={isAdmin ? 7 : 6} className="bg-muted/30 px-6 py-4">
            {isAdmin ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* caseKey */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Case key
                    </label>
                    <input
                      type="text"
                      value={editKey}
                      onChange={(e) => setEditKey(e.target.value)}
                      className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  {/* order */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Order
                    </label>
                    <input
                      type="number"
                      value={editOrder}
                      onChange={(e) => setEditOrder(e.target.value)}
                      className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* input */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    input (JSON)
                  </label>
                  <textarea
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    rows={6}
                    className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  />
                </div>

                {/* expected */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    expected (JSON, optional)
                  </label>
                  <textarea
                    value={editExpected}
                    onChange={(e) => setEditExpected(e.target.value)}
                    rows={4}
                    className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                    placeholder="Leave empty to clear"
                  />
                </div>

                {/* mockOutput */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    mockOutput (JSON, optional)
                  </label>
                  <textarea
                    value={editMock}
                    onChange={(e) => setEditMock(e.target.value)}
                    rows={4}
                    className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                    placeholder="Leave empty to clear"
                  />
                </div>

                {saveError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {saveError}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className={`material-icons text-base leading-none ${saving ? 'animate-spin' : ''}`}>
                      {saving ? 'refresh' : 'save'}
                    </span>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              /* Read-only view for non-admin staff */
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Case key</div>
                    <div className="text-xs font-mono text-foreground">{c.caseKey}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Order</div>
                    <div className="text-xs text-foreground">{c.order}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">input</div>
                  <pre className="text-xs font-mono bg-background border border-border rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {JSON.stringify(c.input, null, 2)}
                  </pre>
                </div>

                {c.expected !== null && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">expected</div>
                    <pre className="text-xs font-mono bg-background border border-border rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                      {JSON.stringify(c.expected, null, 2)}
                    </pre>
                  </div>
                )}

                {c.mockOutput !== null && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">mockOutput</div>
                    <pre className="text-xs font-mono bg-background border border-border rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                      {JSON.stringify(c.mockOutput, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

// ─── Add-case panel ───────────────────────────────────────────────────────────

interface AddCasePanelProps {
  datasetId: number | null;
  onCreated: () => void;
}

function AddCasePanel({ datasetId, onCreated }: AddCasePanelProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [caseKey, setCaseKey] = useState('');
  const [orderStr, setOrderStr] = useState('0');
  const [inputStr, setInputStr] = useState('{}');
  const [expectedStr, setExpectedStr] = useState('');
  const [mockStr, setMockStr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);

    if (!caseKey.trim()) {
      setSaveError('caseKey is required');
      return;
    }

    const parsedInput = tryParseJson(inputStr);
    if (!parsedInput.ok) {
      setSaveError('input: invalid JSON');
      return;
    }

    let parsedExpected: unknown = undefined;
    if (expectedStr.trim() !== '') {
      const r = tryParseJson(expectedStr);
      if (!r.ok) {
        setSaveError('expected: invalid JSON');
        return;
      }
      parsedExpected = r.value;
    }

    let parsedMock: unknown = undefined;
    if (mockStr.trim() !== '') {
      const r = tryParseJson(mockStr);
      if (!r.ok) {
        setSaveError('mockOutput: invalid JSON');
        return;
      }
      parsedMock = r.value;
    }

    const orderNum = parseInt(orderStr, 10);
    if (isNaN(orderNum)) {
      setSaveError('order: must be a number');
      return;
    }

    if (datasetId === null) {
      setSaveError('No dataset available. Seed a dataset first.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/eval-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId,
          caseKey: caseKey.trim(),
          input: parsedInput.value,
          ...(parsedExpected !== undefined && { expected: parsedExpected }),
          ...(parsedMock !== undefined && { mockOutput: parsedMock }),
          order: orderNum,
        }),
      });
      const d = await res.json();
      if (!d.success) {
        setSaveError(d.message ?? 'Failed to create case');
        setSaving(false);
        return;
      }
      // Reset form and close
      setCaseKey('');
      setOrderStr('0');
      setInputStr('{}');
      setExpectedStr('');
      setMockStr('');
      setOpen(false);
      onCreated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
    }
    setSaving(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={datasetId === null}
        title={datasetId === null ? 'No dataset seeded yet' : 'Add a new eval case'}
        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-border bg-background text-foreground hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span className="material-icons text-base leading-none">add</span>
        Add case
      </button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons text-muted-foreground text-lg">add_circle_outline</span>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Add case
          </h3>
        </div>
        <button
          onClick={() => { setOpen(false); setSaveError(null); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-icons text-base leading-none">close</span>
        </button>
      </div>

      {datasetId === null && (
        <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded p-3">
          A dataset must be seeded before adding cases.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Case key <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={caseKey}
              onChange={(e) => setCaseKey(e.target.value)}
              className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. summarize_simple"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Order
            </label>
            <input
              type="number"
              value={orderStr}
              onChange={(e) => setOrderStr(e.target.value)}
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            input (JSON) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={inputStr}
            onChange={(e) => setInputStr(e.target.value)}
            rows={5}
            className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            expected (JSON, optional)
          </label>
          <textarea
            value={expectedStr}
            onChange={(e) => setExpectedStr(e.target.value)}
            rows={4}
            className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            placeholder="Leave empty to omit"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            mockOutput (JSON, optional)
          </label>
          <textarea
            value={mockStr}
            onChange={(e) => setMockStr(e.target.value)}
            rows={4}
            className="w-full text-xs font-mono border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            placeholder="Leave empty to omit"
          />
        </div>

        {saveError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {saveError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || datasetId === null}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className={`material-icons text-base leading-none ${saving ? 'animate-spin' : ''}`}>
              {saving ? 'refresh' : 'add'}
            </span>
            {saving ? 'Creating…' : 'Create case'}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setSaveError(null); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PromptCasesPage() {
  const params = useParams();
  const promptId = Number(params.id);
  const { data: session } = useSession();

  const isAdmin =
    session?.user != null &&
    (session.user as { role?: string }).role === 'admin';

  // Prompt info
  const [prompt, setPrompt] = useState<PromptInfo | null>(null);
  const [promptLoading, setPromptLoading] = useState(true);
  const [promptErr, setPromptErr] = useState<string | null>(null);

  // Cases
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesErr, setCasesErr] = useState<string | null>(null);

  // Derived: datasetId from first case (needed for create)
  const datasetId = cases[0]?.datasetId ?? null;

  // ── Fetch prompt ───────────────────────────────────────────────────────────

  const loadPrompt = useCallback(() => {
    setPromptLoading(true);
    setPromptErr(null);
    fetch(`/api/admin/prompts/${promptId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPrompt(d.data?.prompt ?? null);
        } else {
          setPromptErr(d.message ?? 'Failed to load prompt');
        }
      })
      .catch((e) => setPromptErr(e instanceof Error ? e.message : 'Failed to load prompt'))
      .finally(() => setPromptLoading(false));
  }, [promptId]);

  useEffect(() => {
    // Mount fetch — the one extra render from the synchronous loading-state set
    // is intentional and harmless for a page-load fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPrompt();
  }, [loadPrompt]);

  // ── Fetch cases (runs after prompt is loaded) ──────────────────────────────

  const loadCases = useCallback(
    (suiteKey: string) => {
      setCasesLoading(true);
      setCasesErr(null);
      fetch(`/api/admin/eval-cases?suiteId=${encodeURIComponent(suiteKey)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setCases(Array.isArray(d.data) ? d.data : []);
          } else {
            // 404 on dataset = no cases yet, not an error worth showing
            if (d.message?.includes('not found')) {
              setCases([]);
            } else {
              setCasesErr(d.message ?? 'Failed to load cases');
            }
          }
        })
        .catch((e) => setCasesErr(e instanceof Error ? e.message : 'Failed to load cases'))
        .finally(() => setCasesLoading(false));
    },
    [],
  );

  useEffect(() => {
    if (prompt?.key) {
      // Cases fetch fires once the prompt resolves; the synchronous loading-state
      // set is the intended mount-style behavior.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadCases(prompt.key);
    }
  }, [prompt?.key, loadCases]);

  // ── Toggle enabled ─────────────────────────────────────────────────────────

  async function handleToggle(id: number, current: boolean) {
    try {
      const res = await fetch(`/api/admin/eval-cases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !current }),
      });
      const d = await res.json();
      if (d.success) {
        setCases((prev) =>
          prev.map((c) => (c.id === id ? { ...c, enabled: !current } : c)),
        );
      }
    } catch {
      // silently ignore; the optimistic UI did not fire
    }
  }

  // ── Save edits ─────────────────────────────────────────────────────────────

  async function handleSave(
    id: number,
    patch: Partial<Pick<EvalCase, 'caseKey' | 'input' | 'expected' | 'mockOutput' | 'order'>>,
  ) {
    const res = await fetch(`/api/admin/eval-cases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const d = await res.json();
    if (d.success && d.data) {
      setCases((prev) => prev.map((c) => (c.id === id ? (d.data as EvalCase) : c)));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Back link */}
      <Link
        href={`/admin/prompts/${promptId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Back to prompt
      </Link>

      {/* Heading */}
      {promptLoading && !prompt ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
        </div>
      ) : promptErr ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {promptErr}
        </div>
      ) : prompt == null ? null : (
        <>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{prompt.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-xs text-muted-foreground font-mono">{prompt.key}</code>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Eval test cases</p>
          </div>

          {/* Cases section */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="material-icons text-muted-foreground text-lg">dataset</span>
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Cases
                </h2>
                {!casesLoading && (
                  <span className="text-xs text-muted-foreground">({cases.length})</span>
                )}
              </div>
              {isAdmin && prompt && (
                <AddCasePanel
                  datasetId={datasetId}
                  onCreated={() => loadCases(prompt.key)}
                />
              )}
            </div>

            {casesErr && (
              <div className="bg-red-50 border-b border-red-200 px-4 py-3 text-xs text-red-800">
                {casesErr}
              </div>
            )}

            {casesLoading ? (
              <div className="flex items-center justify-center py-12">
                <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
              </div>
            ) : cases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-muted-foreground">
                <span className="material-icons text-4xl text-muted-foreground/40">dataset</span>
                <div className="text-sm">No cases found for this suite.</div>
                {isAdmin && datasetId === null && (
                  <div className="text-xs text-muted-foreground/70 max-w-xs">
                    A dataset must be seeded first before cases can be added.
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 py-2 w-6"></th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Order
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Case key
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Enabled
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Input preview
                      </th>
                      {isAdmin && (
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Edit
                        </th>
                      )}
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cases.map((c) => (
                      <CaseRow
                        key={c.id}
                        c={c}
                        isAdmin={isAdmin}
                        onToggle={handleToggle}
                        onSave={handleSave}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
