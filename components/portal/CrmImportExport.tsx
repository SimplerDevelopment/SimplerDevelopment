'use client';

import { useState, useRef } from 'react';

interface CrmImportExportProps {
  entityType: 'contact' | 'company' | 'deal';
  currentFilters?: Record<string, string>;
  onImportComplete?: () => void;
}

interface PreviewData {
  headers: string[];
  sampleRows: string[][];
}

const FIELD_OPTIONS: Record<string, { value: string; label: string }[]> = {
  contact: [
    { value: '', label: 'Skip' },
    { value: 'firstName', label: 'First Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'title', label: 'Job Title' },
    { value: 'source', label: 'Source' },
    { value: 'status', label: 'Status' },
    { value: 'address', label: 'Address' },
    { value: 'notes', label: 'Notes' },
  ],
  company: [
    { value: '', label: 'Skip' },
    { value: 'name', label: 'Name' },
    { value: 'domain', label: 'Domain' },
    { value: 'industry', label: 'Industry' },
    { value: 'size', label: 'Size' },
    { value: 'phone', label: 'Phone' },
    { value: 'website', label: 'Website' },
    { value: 'address', label: 'Address' },
    { value: 'notes', label: 'Notes' },
  ],
  deal: [
    { value: '', label: 'Skip' },
    { value: 'title', label: 'Title' },
    { value: 'value', label: 'Value' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'notes', label: 'Notes' },
    { value: 'expectedCloseDate', label: 'Expected Close Date' },
  ],
};

export default function CrmImportExport({ entityType, currentFilters, onImportComplete }: CrmImportExportProps) {
  const [showImport, setShowImport] = useState(false);
  const [step, setStep] = useState<'upload' | 'map' | 'importing' | 'done'>('upload');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  async function handleFileSelect(f: File) {
    setFile(f);
    setError('');
    const formData = new FormData();
    formData.append('file', f);

    const res = await fetch('/api/portal/crm/import/preview', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      setError('Failed to upload file. Please try again.');
      return;
    }
    const d = await res.json();
    if (!d.success) {
      setError(d.message || 'Failed to preview file');
      return;
    }

    setPreview(d.data);

    // Auto-map headers that match field names
    const autoMapping: Record<string, string> = {};
    const fields = FIELD_OPTIONS[entityType];
    for (const header of d.data.headers) {
      const normalized = header.toLowerCase().replace(/[\s_-]+/g, '');
      const match = fields.find(f => f.value && f.value.toLowerCase() === normalized);
      if (match) autoMapping[header] = match.value;
    }
    setMapping(autoMapping);
    setStep('map');
  }

  async function handleImport() {
    if (!file) return;
    setStep('importing');
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('mapping', JSON.stringify(mapping));
    if (skipDuplicates) formData.append('skipDuplicates', '1');

    const res = await fetch('/api/portal/crm/import', {
      method: 'POST',
      body: formData,
    });
    const d = await res.json();
    if (!d.success) {
      setError(d.message || 'Import failed');
      setStep('map');
      return;
    }

    setResult(d.data);
    setStep('done');
    onImportComplete?.();
  }

  async function handleExport() {
    setExporting(true);
    const params = new URLSearchParams({ entityType });
    if (currentFilters) {
      for (const [k, v] of Object.entries(currentFilters)) {
        if (v) params.set(k, v);
      }
    }

    try {
      const res = await fetch(`/api/portal/crm/export?${params}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-${entityType}s-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed. Please try again.');
    }
    setExporting(false);
  }

  function reset() {
    setShowImport(false);
    setStep('upload');
    setPreview(null);
    setMapping({});
    setFile(null);
    setError('');
    setResult(null);
  }

  return (
    <>
      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          {exporting ? (
            <span className="material-icons animate-spin text-base">refresh</span>
          ) : (
            <span className="material-icons text-base">download</span>
          )}
          Export
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">upload</span>
          Import
        </button>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={reset}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold text-foreground">Import {entityType}s</h3>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                <span className="material-icons text-base">close</span>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <span className="material-icons text-base">error</span>
                  {error}
                </div>
              )}

              {step === 'upload' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Upload a CSV file to import {entityType}s.</p>
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <span className="material-icons text-3xl text-muted-foreground mb-2 block">upload_file</span>
                    <p className="text-sm font-medium text-foreground">Click to select CSV file</p>
                    <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                  />
                </div>
              )}

              {step === 'map' && preview && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Map CSV columns to {entityType} fields.</p>

                  <div className="space-y-2">
                    {preview.headers.map(header => (
                      <div key={header} className="flex items-center gap-3">
                        <span className="text-sm text-foreground font-medium w-40 truncate shrink-0">{header}</span>
                        <span className="material-icons text-sm text-muted-foreground">arrow_forward</span>
                        <select
                          value={mapping[header] || ''}
                          onChange={e => setMapping(m => ({ ...m, [header]: e.target.value }))}
                          className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                          {FIELD_OPTIONS[entityType].map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Preview table */}
                  {preview.sampleRows.length > 0 && (
                    <div className="overflow-x-auto border border-border rounded-lg">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/40">
                            {preview.headers.map(h => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sampleRows.slice(0, 3).map((row, i) => (
                            <tr key={i} className="border-t border-border">
                              {row.map((cell, j) => (
                                <td key={j} className="px-3 py-1.5 text-foreground truncate max-w-[150px]">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {entityType === 'contact' && (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={e => setSkipDuplicates(e.target.checked)}
                        className="rounded border-border"
                      />
                      Skip duplicate emails
                    </label>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={reset}
                      className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImport}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <span className="material-icons text-sm">upload</span>
                      Import
                    </button>
                  </div>
                </div>
              )}

              {step === 'importing' && (
                <div className="flex flex-col items-center py-8">
                  <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
                  <p className="text-sm text-muted-foreground mt-3">Importing {entityType}s...</p>
                </div>
              )}

              {step === 'done' && result && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-100 border border-green-200 rounded-lg px-3 py-2">
                    <span className="material-icons text-base">check_circle</span>
                    {result.imported} {entityType}(s) imported successfully.
                    {result.skipped > 0 && ` ${result.skipped} skipped.`}
                  </div>

                  {result.errors.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                      {result.errors.map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={reset}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
