'use client';

// "New SEO project" modal — mirrors the NewExperimentModal pattern
// (components/portal/NewExperimentModal.tsx): a controlled open/close dialog
// that loads its own picker data and POSTs directly to the resource route.
// The website picker reuses GET /api/portal/cms/websites (the same endpoint
// the experiment picker uses to list hosted sites) — there's no SEO-specific
// "list my websites" endpoint, and there doesn't need to be one.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pBtnPrimary, pInput, pSelect } from '@/components/portal/portal-ui';
import type { WebsiteOption } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create, before navigating to the new project. */
  onCreated: () => void;
}

export function NewSeoProjectDialog({ open, onClose, onCreated }: Props) {
  const router = useRouter();

  const [startUrl, setStartUrl] = useState('');
  const [name, setName] = useState('');
  const [websiteId, setWebsiteId] = useState('');
  const [websites, setWebsites] = useState<WebsiteOption[]>([]);
  const [websitesLoading, setWebsitesLoading] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [maxPages, setMaxPages] = useState(200);
  const [maxDepth, setMaxDepth] = useState(5);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Load the hosted-website picker options whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setWebsitesLoading(true);
    fetch('/api/portal/cms/websites')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) setWebsites(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWebsitesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset all form state on close so the next open starts fresh.
  useEffect(() => {
    if (open) return;
    setStartUrl('');
    setName('');
    setWebsiteId('');
    setAdvancedOpen(false);
    setMaxPages(200);
    setMaxDepth(5);
    setSubmitError('');
    setSubmitting(false);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startUrl.trim()) {
      setSubmitError('A website URL is required.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/portal/seo/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrl: startUrl.trim(),
          name: name.trim() || undefined,
          websiteId: websiteId ? Number(websiteId) : undefined,
          maxPages,
          maxDepth,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        // Surfaces the API's 400 (invalid URL) / 409 (duplicate domain) message verbatim.
        setSubmitError(json.message || 'Failed to create project.');
        setSubmitting(false);
        return;
      }
      onCreated();
      router.push(`/portal/seo/${json.data.id}`);
    } catch {
      setSubmitError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">travel_explore</span>
            New SEO project
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Close"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="seo-start-url" className="block text-xs font-medium text-muted-foreground mb-1">
              Website URL
            </label>
            <input
              id="seo-start-url"
              type="url"
              required
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://example.com"
              className={pInput}
            />
          </div>

          <div>
            <label htmlFor="seo-project-name" className="block text-xs font-medium text-muted-foreground mb-1">
              Project name <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              id="seo-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to the domain"
              className={pInput}
            />
          </div>

          {!websitesLoading && websites.length > 0 && (
            <div>
              <label htmlFor="seo-website" className="block text-xs font-medium text-muted-foreground mb-1">
                Link to a hosted website <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <select
                id="seo-website"
                value={websiteId}
                onChange={(e) => setWebsiteId(e.target.value)}
                className={pSelect}
              >
                <option value="">None — external domain</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={advancedOpen}
            >
              <span className="material-icons text-sm">{advancedOpen ? 'expand_less' : 'expand_more'}</span>
              Advanced crawl settings
            </button>
            {advancedOpen && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label htmlFor="seo-max-pages" className="block text-xs font-medium text-muted-foreground mb-1">
                    Max pages
                  </label>
                  <input
                    id="seo-max-pages"
                    type="number"
                    min={10}
                    max={1000}
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value))}
                    className={pInput}
                  />
                </div>
                <div>
                  <label htmlFor="seo-max-depth" className="block text-xs font-medium text-muted-foreground mb-1">
                    Max depth
                  </label>
                  <input
                    id="seo-max-depth"
                    type="number"
                    min={1}
                    max={10}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                    className={pInput}
                  />
                </div>
              </div>
            )}
          </div>

          {submitError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {submitError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={pBtnPrimary}>
              {submitting ? (
                <>
                  <span className="material-icons animate-spin text-base">progress_activity</span>
                  Creating…
                </>
              ) : (
                <>
                  <span className="material-icons text-base">add</span>
                  Create project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
