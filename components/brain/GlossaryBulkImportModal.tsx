'use client';

/**
 * GlossaryBulkImportModal — paste-and-import flow.
 *
 * Accepts EITHER:
 *   - Line-delimited "term: definition" (one per line; optional "[category]" prefix
 *     like "[Auth] SSO: single sign-on …" puts the line in that category).
 *   - A JSON array of objects matching the backend's BulkImportArgs.terms shape.
 *
 * Strategy:
 *   1. Parse client-side and show a per-row preview table.
 *   2. "Confirm import" POSTs to /api/portal/brain/glossary/bulk-import.
 *   3. Show the create/update/error summary returned by the server.
 *   4. On dismissal, call `onImported()` so the parent refreshes the list.
 *
 * Note: the backend doesn't have a `dry-run` flag, so the preview is purely
 * client-side parsing — what you see is what gets POSTed.
 */

import { useMemo, useState } from 'react';

interface ParsedRow {
  term: string;
  definition: string;
  category?: string | null;
  shortDefinition?: string | null;
  aliases?: string[];
}

interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
  format: 'json' | 'lines' | 'empty';
}

interface ImportResult {
  created: number;
  updated: number;
  errors: Array<{ term: string; message: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

function parseInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { rows: [], errors: [], format: 'empty' };

  // Try JSON first.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const rows: ParsedRow[] = [];
      const errors: string[] = [];
      arr.forEach((item, idx) => {
        if (!item || typeof item !== 'object') {
          errors.push(`Row ${idx + 1}: must be an object.`);
          return;
        }
        if (typeof item.term !== 'string' || !item.term.trim()) {
          errors.push(`Row ${idx + 1}: missing "term".`);
          return;
        }
        if (typeof item.definition !== 'string' || !item.definition.trim()) {
          errors.push(`Row ${idx + 1}: missing "definition".`);
          return;
        }
        rows.push({
          term: item.term.trim(),
          definition: item.definition.trim(),
          shortDefinition: typeof item.shortDefinition === 'string' ? item.shortDefinition.trim() : null,
          category: typeof item.category === 'string' ? item.category.trim() : null,
          aliases: Array.isArray(item.aliases)
            ? item.aliases.filter((a: unknown): a is string => typeof a === 'string' && !!a.trim()).map((a: string) => a.trim())
            : [],
        });
      });
      return { rows, errors, format: 'json' };
    } catch (e) {
      return { rows: [], errors: [`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`], format: 'json' };
    }
  }

  // Otherwise treat as one-per-line "term: definition", optional "[Category] " prefix.
  const lines = trimmed.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (!t) return;
    let category: string | null = null;
    let rest = t;
    const catMatch = /^\[([^\]]+)\]\s*(.+)$/.exec(t);
    if (catMatch) {
      category = catMatch[1].trim();
      rest = catMatch[2];
    }
    const colon = rest.indexOf(':');
    if (colon < 0) {
      errors.push(`Line ${idx + 1}: missing ":" separator.`);
      return;
    }
    const term = rest.slice(0, colon).trim();
    const definition = rest.slice(colon + 1).trim();
    if (!term) {
      errors.push(`Line ${idx + 1}: missing term.`);
      return;
    }
    if (!definition) {
      errors.push(`Line ${idx + 1}: missing definition.`);
      return;
    }
    rows.push({ term, definition, category });
  });
  return { rows, errors, format: 'lines' };
}

export default function GlossaryBulkImportModal({ open, onClose, onImported }: Props) {
  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const parsed = useMemo(() => parseInput(raw), [raw]);

  if (!open) return null;

  const handleConfirm = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/portal/brain/glossary/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: parsed.rows }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setSubmitError(json.message || 'Bulk import failed.');
        setSubmitting(false);
        return;
      }
      setResult(json.data as ImportResult);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onImported();
    setRaw('');
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">upload</span>
            Bulk import glossary terms
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Close"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {!result && (
            <>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Two accepted formats:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>One per line: <code className="bg-muted px-1 rounded text-[10px]">term: definition</code> (optional <code className="bg-muted px-1 rounded text-[10px]">[Category]</code> prefix)</li>
                  <li>JSON array: <code className="bg-muted px-1 rounded text-[10px]">{`[{"term": "...", "definition": "...", "category": "...", "aliases": ["..."]}]`}</code></li>
                </ul>
                <p>Existing terms (matched by slug) are updated. Bulk import caps at 200 terms per call.</p>
              </div>

              <textarea
                value={raw}
                onChange={e => setRaw(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder={`SSO: Single sign-on — one login covers all our internal tools.\n[Auth] MFA: Multi-factor authentication required for all admin accounts.\n[Billing] NRR: Net revenue retention — see annual board deck.`}
              />

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="material-icons text-[14px]">data_object</span>
                  Detected format: <strong className="text-foreground capitalize">{parsed.format}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="material-icons text-[14px]">check_circle</span>
                  {parsed.rows.length} valid row{parsed.rows.length === 1 ? '' : 's'}
                </span>
                {parsed.errors.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <span className="material-icons text-[14px]">error_outline</span>
                    {parsed.errors.length} parse error{parsed.errors.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {parsed.errors.length > 0 && (
                <ul className="bg-destructive/5 border border-destructive/20 rounded-md p-2 text-xs text-destructive space-y-0.5 max-h-24 overflow-y-auto">
                  {parsed.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}

              {parsed.rows.length > 0 && (
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Term</th>
                        <th className="text-left px-2 py-1.5 font-medium">Definition</th>
                        <th className="text-left px-2 py-1.5 font-medium">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border max-h-48 overflow-y-auto">
                      {parsed.rows.slice(0, 50).map((row, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 font-medium text-foreground">{row.term}</td>
                          <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[24rem]" title={row.definition}>
                            {row.definition.length > 80 ? row.definition.slice(0, 80) + '…' : row.definition}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.category ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.rows.length > 50 && (
                    <div className="px-2 py-1 text-[11px] text-muted-foreground bg-muted/30 border-t border-border">
                      Preview shows first 50 of {parsed.rows.length} rows.
                    </div>
                  )}
                </div>
              )}

              {submitError && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive flex items-start gap-2">
                  <span className="material-icons text-base">error_outline</span>
                  <span>{submitError}</span>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                <span className="material-icons text-base">check_circle</span>
                <div>
                  <div className="font-medium">Bulk import complete.</div>
                  <div className="text-xs mt-0.5">
                    {result.created} created · {result.updated} updated · {result.errors.length} error{result.errors.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="border border-destructive/30 rounded-md">
                  <div className="bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">Per-row errors</div>
                  <ul className="divide-y divide-border max-h-48 overflow-y-auto text-xs">
                    {result.errors.map((e, i) => (
                      <li key={i} className="px-3 py-1.5">
                        <span className="font-medium text-foreground">{e.term || '<unnamed>'}</span>
                        <span className="text-muted-foreground ml-2">— {e.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-muted/20">
          {!result ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || parsed.rows.length === 0}
                onClick={handleConfirm}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting
                  ? <><span className="material-icons text-base animate-spin">progress_activity</span>Importing…</>
                  : <><span className="material-icons text-base">cloud_upload</span>Confirm import {parsed.rows.length > 0 ? `(${parsed.rows.length})` : ''}</>
                }
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleDone}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span className="material-icons text-base">done</span>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
