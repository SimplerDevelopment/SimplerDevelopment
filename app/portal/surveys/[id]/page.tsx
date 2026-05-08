'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { SurveyField } from '@/components/admin/SurveyBuilder';
import { SurveyRecommendationEditor } from '@/components/admin/SurveyRecommendationEditor';
import EditTab from './_components/EditTab';
import ResponseAnalytics from './_components/ResponseAnalytics';
import ResponsesTab from './_components/ResponsesTab';
import ShareTab from './_components/ShareTab';
import SurveyHeader from './_components/SurveyHeader';
import SurveyOverviewTab from './_components/SurveyOverviewTab';
import SurveySettings from './_components/SurveySettings';
import VariantsPanel from './_components/VariantsPanel';
import WebhooksPanel from './_components/WebhooksPanel';
import { useSurvey } from './_hooks/useSurvey';
import { type ResponseFilters } from './_lib/api';

type Tab = 'overview' | 'edit' | 'recommendation' | 'variants' | 'responses' | 'analytics' | 'share' | 'webhooks' | 'settings';

const TABS: { key: Tab; label: (responseCount: number) => string; icon: string }[] = [
  { key: 'overview', label: () => 'Overview', icon: 'dashboard' },
  { key: 'edit', label: () => 'Edit', icon: 'edit' },
  { key: 'recommendation', label: () => 'Recommendation', icon: 'recommend' },
  { key: 'variants', label: () => 'Variants', icon: 'science' },
  { key: 'responses', label: (n) => `Responses (${n})`, icon: 'people' },
  { key: 'analytics', label: () => 'Analytics', icon: 'bar_chart' },
  { key: 'share', label: () => 'Share & Embed', icon: 'share' },
  { key: 'webhooks', label: () => 'Webhooks', icon: 'webhook' },
  { key: 'settings', label: () => 'Settings', icon: 'settings' },
];

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    survey,
    responses,
    stats,
    sourcesPresent,
    brandingProfiles,
    loading,
    saving,
    error,
    setError,
    successMsg,
    refreshResponses,
    save,
    remove,
  } = useSurvey(id);

  // Response filters live in the URL so refresh + share works. The page
  // serves as the single source of truth — useSurvey is told to refetch
  // whenever filters change.
  const filters = useMemo<ResponseFilters>(() => ({
    from: searchParams?.get('from') || null,
    to: searchParams?.get('to') || null,
    source: searchParams?.get('source') || null,
    q: searchParams?.get('q') || null,
  }), [searchParams]);

  const setFilters = useCallback((next: ResponseFilters) => {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (next.from) sp.set('from', next.from); else sp.delete('from');
    if (next.to) sp.set('to', next.to); else sp.delete('to');
    if (next.source) sp.set('source', next.source); else sp.delete('source');
    if (next.q) sp.set('q', next.q); else sp.delete('q');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const [tab, setTab] = useState<Tab>('overview');

  // Editable fields hydrated from the loaded survey.
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFields, setEditFields] = useState<SurveyField[]>([]);
  const [editColor, setEditColor] = useState('#2563eb');
  const [editBrandingProfileId, setEditBrandingProfileId] = useState<number | null>(null);
  const [editRequireEmail, setEditRequireEmail] = useState(false);
  const [editAllowMultiple, setEditAllowMultiple] = useState(true);
  const [editNotify, setEditNotify] = useState(true);
  const [editDigest, setEditDigest] = useState('off');
  const [editThankYouTitle, setEditThankYouTitle] = useState('');
  const [editThankYouMessage, setEditThankYouMessage] = useState('');
  const [editRedirectUrl, setEditRedirectUrl] = useState('');
  const [editClosesAt, setEditClosesAt] = useState('');
  const [editMaxResponses, setEditMaxResponses] = useState('');
  const [editStyling, setEditStyling] = useState<Record<string, string | boolean | undefined>>({});
  const [copied, setCopied] = useState(false);

  // Hydrate editable fields whenever the survey reloads. The set-state-in-
  // effect lint warning is unavoidable for this "snapshot loaded server data
  // into local edit buffers" pattern — same shape the page used pre-refactor.
  useEffect(() => {
    if (!survey) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setEditTitle(survey.title);
    setEditDescription(survey.description || '');
    setEditFields(survey.fields || []);
    setEditColor(survey.color || '#2563eb');
    setEditBrandingProfileId(survey.brandingProfileId ?? null);
    setEditRequireEmail(survey.requireEmail);
    setEditAllowMultiple(survey.allowMultiple);
    setEditNotify(survey.notifyOnResponse);
    setEditDigest(survey.notifyDigest || 'off');
    setEditThankYouTitle(survey.thankYouTitle || 'Thank you!');
    setEditThankYouMessage(survey.thankYouMessage || '');
    setEditRedirectUrl(survey.redirectUrl || '');
    setEditClosesAt(survey.closesAt ? survey.closesAt.slice(0, 16) : '');
    setEditMaxResponses(survey.maxResponses ? String(survey.maxResponses) : '');
    setEditStyling((survey.styling as Record<string, string | boolean | undefined>) || {});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [survey]);

  // Refetch responses when the tabs that surface them are visited and when
  // the URL-driven filters change. Overview + analytics intentionally pass
  // unfiltered fetches (they show survey-wide totals), while the responses
  // tab fetches with the current filter set.
  useEffect(() => {
    if (tab === 'responses') {
      refreshResponses(filters);
    } else if (tab === 'overview' || tab === 'analytics') {
      refreshResponses();
    }
  }, [tab, refreshResponses, filters]);

  async function toggleStatus(newStatus: string) {
    if (newStatus === 'active' && (!survey?.fields || (survey.fields as unknown[]).length === 0)) {
      setError('Add at least one question before publishing');
      return;
    }
    await save({ status: newStatus });
  }

  async function handleDelete() {
    if (!confirm('Delete this survey and all responses? This cannot be undone.')) return;
    const result = await remove();
    if (result.success) router.push('/portal/surveys');
  }

  function copyLink() {
    if (!survey) return;
    navigator.clipboard.writeText(`${window.location.origin}/s/${survey.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyEmbed() {
    if (!survey) return;
    const url = `${window.location.origin}/s/${survey.slug}`;
    const code = `<iframe src="${url}?embed=1" width="100%" height="600" frameborder="0" style="border:none;border-radius:12px;"></iframe>`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-20">
        <span className="material-icons text-3xl animate-spin text-primary">progress_activity</span>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="max-w-5xl mx-auto text-center py-20">
        <span className="material-icons text-5xl text-muted-foreground/50">error_outline</span>
        <p className="mt-3 text-muted-foreground">Survey not found</p>
        <Link href="/portal/surveys" className="text-primary text-sm mt-2 inline-block">
          Back to Surveys
        </Link>
      </div>
    );
  }

  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/s/${survey.slug}` : `/s/${survey.slug}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SurveyHeader survey={survey} onToggleStatus={toggleStatus} />

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <span className="material-icons text-lg">error</span>
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <span className="material-icons text-lg">close</span>
          </button>
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
          <span className="material-icons text-lg">check_circle</span>
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-lg">{t.icon}</span>
            {t.label(survey.responseCount)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <SurveyOverviewTab survey={survey} responses={responses} stats={stats} setTab={setTab} />
      )}

      {tab === 'edit' && (
        <EditTab
          saving={saving}
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          editDescription={editDescription}
          setEditDescription={setEditDescription}
          editFields={editFields}
          setEditFields={setEditFields}
          onSave={() => save({ title: editTitle, description: editDescription, fields: editFields })}
        />
      )}

      {tab === 'recommendation' && (
        <SurveyRecommendationEditor
          config={survey.recommendation ?? undefined}
          surveyFields={editFields as unknown as Parameters<typeof SurveyRecommendationEditor>[0]['surveyFields']}
          onChange={(next) => save({ recommendation: next ?? null })}
        />
      )}

      {tab === 'variants' && <VariantsPanel surveyId={id} />}

      {tab === 'responses' && (
        <ResponsesTab
          surveyId={id}
          survey={survey}
          responses={responses}
          filters={filters}
          onFiltersChange={setFilters}
          sourcesPresent={sourcesPresent}
        />
      )}

      {tab === 'analytics' && <ResponseAnalytics survey={survey} responses={responses} stats={stats} />}

      {tab === 'share' && (
        <ShareTab
          survey={survey}
          publicUrl={publicUrl}
          copied={copied}
          onCopyLink={copyLink}
          onCopyEmbed={copyEmbed}
        />
      )}

      {tab === 'webhooks' && <WebhooksPanel surveyId={id} />}

      {tab === 'settings' && (
        <SurveySettings
          saving={saving}
          brandingProfiles={brandingProfiles}
          editColor={editColor}
          editBrandingProfileId={editBrandingProfileId}
          setEditBrandingProfileId={setEditBrandingProfileId}
          editStyling={editStyling}
          setEditStyling={setEditStyling}
          editThankYouTitle={editThankYouTitle}
          setEditThankYouTitle={setEditThankYouTitle}
          editThankYouMessage={editThankYouMessage}
          setEditThankYouMessage={setEditThankYouMessage}
          editRedirectUrl={editRedirectUrl}
          setEditRedirectUrl={setEditRedirectUrl}
          editRequireEmail={editRequireEmail}
          setEditRequireEmail={setEditRequireEmail}
          editAllowMultiple={editAllowMultiple}
          setEditAllowMultiple={setEditAllowMultiple}
          editNotify={editNotify}
          setEditNotify={setEditNotify}
          editDigest={editDigest}
          setEditDigest={setEditDigest}
          editClosesAt={editClosesAt}
          setEditClosesAt={setEditClosesAt}
          editMaxResponses={editMaxResponses}
          setEditMaxResponses={setEditMaxResponses}
          onSave={() =>
            save({
              color: editColor,
              brandingProfileId: editBrandingProfileId,
              styling: editStyling,
              thankYouTitle: editThankYouTitle,
              thankYouMessage: editThankYouMessage,
              redirectUrl: editRedirectUrl,
              requireEmail: editRequireEmail,
              allowMultiple: editAllowMultiple,
              notifyOnResponse: editNotify,
              notifyDigest: editDigest,
              closesAt: editClosesAt || null,
              maxResponses: editMaxResponses ? parseInt(editMaxResponses, 10) : null,
            })
          }
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
