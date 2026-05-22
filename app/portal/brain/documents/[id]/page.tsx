'use client';

/**
 * Brain Documents — detail page.
 *
 * Header: title, status / category chips, owner, last-published date.
 * Action row: Edit draft (always) · Publish (when a draft body is non-empty)
 *   · Archive (when status=published) · Unarchive (when archived) · Delete
 *   (with the 409 has_acks dance — surface ack count + offer force).
 *
 * Body sections:
 *   - Summary / description (if the current published version has one)
 *   - Current published version body (full markdown render). Falls back to
 *     a "draft only" hint when no version has been published yet.
 *   - Version history (clickable to inline-load a specific version's body)
 *   - Links panel (tabbed, six entity types)
 *   - Required-reads + assignments panel
 *   - Compliance card (summary partition; click to expand to per-person)
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownView from '@/components/portal/MarkdownView';
import DocumentVersionHistory from '@/components/brain/DocumentVersionHistory';
import DocumentLinksPanel from '@/components/brain/DocumentLinksPanel';
import DocumentRequiredReadsPanel from '@/components/brain/DocumentRequiredReadsPanel';
import DocumentComplianceCard from '@/components/brain/DocumentComplianceCard';
import type {
  BrainDocument,
  BrainDocumentVersion,
  VersionSlim,
  ResolvedDocumentLink,
} from '@/lib/brain/documents';
import type { ComplianceReport } from '@/lib/brain/document-acks';

interface DetailData {
  document: BrainDocument;
  currentPublishedVersion?: BrainDocumentVersion;
  currentDraftVersion?: BrainDocumentVersion;
  versions: VersionSlim[];
  links: ResolvedDocumentLink[];
}

const STATUS_STYLES = {
  draft: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  published: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
} as const;

const STATUS_ICONS = {
  draft: 'edit_note',
  published: 'check_circle',
  archived: 'archive',
} as const;

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(d);
  }
}

export default function BrainDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const documentId = parseInt(id, 10);
  const router = useRouter();

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Inline version body viewer.
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [selectedVersionBody, setSelectedVersionBody] = useState<BrainDocumentVersion | null>(null);
  const [selectedVersionLoading, setSelectedVersionLoading] = useState(false);

  // Compliance report (lazy, only when section is expanded? — we just always load it on mount).
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);

  // Owner name (mentionable-users directory).
  const [users, setUsers] = useState<Array<{ id: number; name: string | null }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}?includeBody=true`);
      const json = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'Failed to load document.');
      } else {
        setData(json.data as DetailData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() defers setState into async IIFE; trigger fires synchronously by design
  useEffect(() => { load(); }, [load]);

  const loadCompliance = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/compliance-report`);
      const json = await r.json();
      if (r.ok && json.success && json.data) {
        setCompliance(json.data as ComplianceReport);
      }
    } catch { /* non-fatal */ }
  }, [documentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadCompliance defers setState into async IIFE
  useEffect(() => { loadCompliance(); }, [loadCompliance]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/mentionable-users');
        const json = await r.json();
        if (cancelled || !json.success) return;
        setUsers(json.data ?? []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Inline-load a specific version's body when the user clicks one in the history.
  const handleSelectVersion = useCallback(async (versionId: number) => {
    setSelectedVersionId(versionId);
    setSelectedVersionBody(null);
    setSelectedVersionLoading(true);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/versions/${versionId}`);
      const json = await r.json();
      if (r.ok && json.success && json.data) {
        setSelectedVersionBody(json.data as BrainDocumentVersion);
      }
    } finally {
      setSelectedVersionLoading(false);
    }
  }, [documentId]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    setBusyAction('publish');
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/publish`, { method: 'POST' });
      const json = await r.json();
      if (!r.ok || !json.success) {
        alert(json.message || 'Publish failed.');
        return;
      }
      load();
      loadCompliance();
    } finally {
      setBusyAction(null);
    }
  };

  const handleArchive = async () => {
    const reason = window.prompt('Optional reason for archiving:');
    if (reason === null) return; // cancelled
    setBusyAction('archive');
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        alert(json.message || 'Archive failed.');
        return;
      }
      load();
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnarchive = async () => {
    setBusyAction('unarchive');
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/unarchive`, { method: 'POST' });
      const json = await r.json();
      if (!r.ok || !json.success) {
        alert(json.message || 'Unarchive failed.');
        return;
      }
      load();
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = useCallback(async (force = false) => {
    if (!data) return;
    if (!force) {
      if (!confirm(`Delete "${data.document.title}"? This cannot be undone.`)) return;
    }
    setBusyAction('delete');
    try {
      const url = `/api/portal/brain/documents/${documentId}${force ? '?force=true' : ''}`;
      const r = await fetch(url, { method: 'DELETE' });
      const json = await r.json();
      if (r.status === 409 && (json?.code === 'DOCUMENT_HAS_ACKS' || /ack/i.test(json?.message ?? ''))) {
        const ackCount = json?.ackCount ?? 0;
        if (
          confirm(
            `This document has ${ackCount} acknowledgment${ackCount === 1 ? '' : 's'} on it. ` +
            `Force delete anyway? You will lose the ack history.`,
          )
        ) {
          await handleDelete(true);
        }
        return;
      }
      if (!r.ok || !json.success) {
        alert(json.message || 'Delete failed.');
        return;
      }
      router.push('/portal/brain/documents');
    } finally {
      setBusyAction(null);
    }
  }, [data, documentId, router]);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex items-center justify-center text-muted-foreground text-sm">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load this document
          </div>
          <p>{error ?? 'Not found'}</p>
          <Link href="/portal/brain/documents" className="inline-flex items-center gap-1 mt-3 text-xs underline">
            <span className="material-icons text-sm">arrow_back</span>
            Back to documents
          </Link>
        </div>
      </div>
    );
  }

  const { document, currentPublishedVersion, currentDraftVersion, versions, links } = data;
  const ownerName = document.ownerId
    ? users.find((u) => u.id === document.ownerId)?.name ?? `User #${document.ownerId}`
    : null;

  const hasDraftWithBody = !!(currentDraftVersion && currentDraftVersion.body && currentDraftVersion.body.trim());
  const canPublish = hasDraftWithBody && document.status !== 'archived';

  // Inline-loaded version body — falls back to currentPublishedVersion if user hasn't picked one.
  const displayedVersion: BrainDocumentVersion | undefined =
    selectedVersionId !== null && selectedVersionBody
      ? selectedVersionBody
      : currentPublishedVersion;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-5">
      <nav className="text-xs text-muted-foreground flex items-center gap-1">
        <Link href="/portal/brain/documents" className="hover:text-foreground inline-flex items-center gap-0.5">
          <span className="material-icons text-sm">description</span>
          Documents
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span className="truncate">{document.title}</span>
      </nav>

      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground break-words">{document.title}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide rounded border ${STATUS_STYLES[document.status]}`}>
              <span className="material-icons text-[12px]">{STATUS_ICONS[document.status]}</span>
              {document.status}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-muted text-muted-foreground">
              <span className="material-icons text-[12px]">label</span>
              {document.category}
            </span>
            {ownerName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-muted text-muted-foreground">
                <span className="material-icons text-[12px]">person</span>
                {ownerName}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground" title="Last published">
              <span className="material-icons text-[12px]">schedule</span>
              Published {formatDate(document.publishedAt)}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded bg-muted/50 text-muted-foreground" title="Stable slug">
              /{document.slug}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Link
            href={`/portal/brain/documents/${document.id}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">edit</span>
            Edit draft
          </Link>
          {canPublish && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busyAction === 'publish'
                ? <span className="material-icons text-base animate-spin">progress_activity</span>
                : <span className="material-icons text-base">publish</span>}
              Publish
            </button>
          )}
          {document.status === 'published' && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
            >
              <span className="material-icons text-base">archive</span>
              Archive
            </button>
          )}
          {document.status === 'archived' && (
            <button
              type="button"
              onClick={handleUnarchive}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
            >
              <span className="material-icons text-base">unarchive</span>
              Unarchive
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDelete()}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {busyAction === 'delete'
              ? <span className="material-icons text-base animate-spin">progress_activity</span>
              : <span className="material-icons text-base">delete</span>}
            Delete
          </button>
        </div>
      </header>

      {/* Summary / description */}
      {(displayedVersion?.summary ?? '').trim() && (
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Summary</h2>
          <p className="text-sm text-foreground whitespace-pre-wrap">{displayedVersion?.summary}</p>
        </section>
      )}

      {/* Current / selected version body */}
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {selectedVersionId !== null && displayedVersion
              ? `Version v${displayedVersion.versionNumber}`
              : 'Current published version'}
          </h2>
          {selectedVersionId !== null && (
            <button
              type="button"
              onClick={() => { setSelectedVersionId(null); setSelectedVersionBody(null); }}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              <span className="material-icons text-sm">close</span>
              Back to current
            </button>
          )}
        </div>
        {selectedVersionLoading ? (
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <span className="material-icons animate-spin text-sm">progress_activity</span>
            Loading version…
          </div>
        ) : displayedVersion && displayedVersion.body ? (
          <div className="text-sm text-foreground leading-relaxed">
            <MarkdownView>{displayedVersion.body}</MarkdownView>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No published version yet — only a draft exists.{' '}
            <Link href={`/portal/brain/documents/${document.id}/edit`} className="underline hover:text-foreground">
              Open the editor
            </Link>{' '}to add content and publish.
          </p>
        )}
      </section>

      {/* Version history */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold text-foreground mb-3 inline-flex items-center gap-2">
          <span className="material-icons text-base text-primary">history</span>
          Version history
          <span className="text-xs text-muted-foreground font-normal">({versions.length})</span>
        </h2>
        <DocumentVersionHistory
          versions={versions}
          currentPublishedVersionId={document.currentPublishedVersionId}
          selectedVersionId={selectedVersionId}
          onSelectVersion={handleSelectVersion}
        />
      </section>

      {/* Links panel */}
      <DocumentLinksPanel
        documentId={document.id}
        links={links}
        onChanged={() => load()}
      />

      {/* Required-reads + compliance */}
      <DocumentRequiredReadsPanel
        documentId={document.id}
        versions={versions}
        onChanged={() => loadCompliance()}
      />

      {compliance && <DocumentComplianceCard report={compliance} />}
    </div>
  );
}
