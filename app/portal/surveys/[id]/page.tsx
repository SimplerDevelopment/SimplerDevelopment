'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SurveyBuilder, { SurveyField } from '@/components/admin/SurveyBuilder';
import Link from 'next/link';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import { SurveyRecommendationEditor } from '@/components/admin/SurveyRecommendationEditor';
import type { SurveyRecommendationConfig } from '@/lib/db/schema';
import ResponseAnalytics from './_components/ResponseAnalytics';

interface Survey {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  fields: SurveyField[];
  status: string;
  color: string;
  thankYouTitle: string;
  thankYouMessage: string;
  redirectUrl: string | null;
  requireEmail: boolean;
  allowMultiple: boolean;
  notifyOnResponse: boolean;
  notifyDigest: string;
  closesAt: string | null;
  maxResponses: number | null;
  linkedType: string | null;
  linkedId: number | null;
  recommendation: SurveyRecommendationConfig | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SurveyResponse {
  id: number;
  answers: Record<string, unknown>;
  respondentEmail: string | null;
  respondentName: string | null;
  source: string;
  completedAt: string | null;
  createdAt: string;
}

type Tab = 'overview' | 'edit' | 'recommendation' | 'responses' | 'analytics' | 'share' | 'settings';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, withEmail: 0 });
  const [tab, setTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFields, setEditFields] = useState<SurveyField[]>([]);
  const [editColor, setEditColor] = useState('#2563eb');
  const [editBrandingProfileId, setEditBrandingProfileId] = useState<number | null>(null);
  const [brandingProfiles, setBrandingProfiles] = useState<Array<{ id: number; name: string; isDefault: boolean; primaryColor: string | null; logoUrl: string | null }>>([]);
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

  const fetchSurvey = useCallback(async () => {
    const res = await fetch(`/api/portal/surveys/${id}`);
    const data = await res.json();
    if (data.success) {
      setSurvey(data.data);
      setEditTitle(data.data.title);
      setEditDescription(data.data.description || '');
      setEditFields(data.data.fields || []);
      setEditColor(data.data.color || '#2563eb');
      setEditBrandingProfileId(data.data.brandingProfileId || null);
      setEditRequireEmail(data.data.requireEmail);
      setEditAllowMultiple(data.data.allowMultiple);
      setEditNotify(data.data.notifyOnResponse);
      setEditDigest(data.data.notifyDigest || 'off');
      setEditThankYouTitle(data.data.thankYouTitle || 'Thank you!');
      setEditThankYouMessage(data.data.thankYouMessage || '');
      setEditRedirectUrl(data.data.redirectUrl || '');
      setEditClosesAt(data.data.closesAt ? data.data.closesAt.slice(0, 16) : '');
      setEditMaxResponses(data.data.maxResponses ? String(data.data.maxResponses) : '');
      setEditStyling((data.data as Record<string, unknown>).styling as Record<string, string | boolean | undefined> || {});
    }
    setLoading(false);
  }, [id]);

  const fetchResponses = useCallback(async () => {
    const res = await fetch(`/api/portal/surveys/${id}/responses`);
    const data = await res.json();
    if (data.success) {
      setResponses(data.data.responses);
      setStats(data.data.stats);
    }
  }, [id]);

  useEffect(() => { fetchSurvey(); }, [fetchSurvey]);
  useEffect(() => { if (tab === 'responses' || tab === 'overview' || tab === 'analytics') fetchResponses(); }, [tab, fetchResponses]);
  useEffect(() => {
    fetch('/api/portal/branding/profiles').then(r => r.json()).then(d => {
      if (d.success) setBrandingProfiles(d.data || []);
    }).catch(() => {});
  }, []);

  async function save(updates: Record<string, unknown>) {
    setSaving(true);
    setError('');
    const res = await fetch(`/api/portal/surveys/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message || 'Failed to save'); return false; }
    setSurvey(data.data);
    setSuccessMsg('Saved');
    setTimeout(() => setSuccessMsg(''), 2000);
    return true;
  }

  async function toggleStatus(newStatus: string) {
    if (newStatus === 'active' && (!survey?.fields || (survey.fields as unknown[]).length === 0)) {
      setError('Add at least one question before publishing');
      return;
    }
    await save({ status: newStatus });
  }

  async function handleDelete() {
    if (!confirm('Delete this survey and all responses? This cannot be undone.')) return;
    const res = await fetch(`/api/portal/surveys/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) router.push('/portal/surveys');
    else setError(data.message || 'Failed to delete');
  }

  function copyLink() {
    const url = `${window.location.origin}/s/${survey?.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyEmbed() {
    const url = `${window.location.origin}/s/${survey?.slug}`;
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
        <Link href="/portal/surveys" className="text-primary text-sm mt-2 inline-block">Back to Surveys</Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'dashboard' },
    { key: 'edit', label: 'Edit', icon: 'edit' },
    { key: 'recommendation', label: 'Recommendation', icon: 'recommend' },
    { key: 'responses', label: `Responses (${survey.responseCount})`, icon: 'people' },
    { key: 'analytics', label: 'Analytics', icon: 'bar_chart' },
    { key: 'share', label: 'Share & Embed', icon: 'share' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/s/${survey.slug}` : `/s/${survey.slug}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/portal/surveys" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <span className="material-icons text-xl text-muted-foreground">arrow_back</span>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="material-icons text-xl" style={{ color: survey.color || '#2563eb' }}>poll</span>
              <h1 className="text-2xl font-bold text-foreground">{survey.title}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[survey.status]}`}>
                {survey.status}
              </span>
            </div>
            {survey.description && <p className="text-muted-foreground text-sm mt-1">{survey.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {survey.status === 'draft' && (
            <button
              onClick={() => toggleStatus('active')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <span className="material-icons text-lg">publish</span>
              Publish
            </button>
          )}
          {survey.status === 'active' && (
            <button
              onClick={() => toggleStatus('closed')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <span className="material-icons text-lg">block</span>
              Close
            </button>
          )}
          {survey.status === 'closed' && (
            <button
              onClick={() => toggleStatus('active')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <span className="material-icons text-lg">play_arrow</span>
              Reopen
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <span className="material-icons text-lg">error</span>
          {error}
          <button onClick={() => setError('')} className="ml-auto"><span className="material-icons text-lg">close</span></button>
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
        {tabs.map((t) => (
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
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Responses</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.withEmail}</p>
              <p className="text-xs text-muted-foreground">With Email</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{(survey.fields as unknown[])?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid sm:grid-cols-3 gap-4">
            <button
              onClick={() => setTab('share')}
              className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
            >
              <span className="material-icons text-xl text-primary mb-2">share</span>
              <p className="font-medium text-foreground text-sm">Share Survey</p>
              <p className="text-xs text-muted-foreground">Get link, embed code, or email integration</p>
            </button>
            <button
              onClick={() => setTab('edit')}
              className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
            >
              <span className="material-icons text-xl text-primary mb-2">edit</span>
              <p className="font-medium text-foreground text-sm">Edit Questions</p>
              <p className="text-xs text-muted-foreground">Add, remove, or reorder questions</p>
            </button>
            <button
              onClick={() => setTab('responses')}
              className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
            >
              <span className="material-icons text-xl text-primary mb-2">analytics</span>
              <p className="font-medium text-foreground text-sm">View Responses</p>
              <p className="text-xs text-muted-foreground">See individual answers and analytics</p>
            </button>
          </div>

          {/* Recent Responses */}
          {responses.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="material-icons text-lg text-primary">schedule</span>
                Recent Responses
              </h3>
              <div className="space-y-2">
                {responses.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <span className="material-icons text-muted-foreground">person</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{r.respondentEmail || r.respondentName || 'Anonymous'}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.source} &middot; {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {r.completedAt && <span className="material-icons text-green-500 text-sm">check_circle</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Edit Tab ─── */}
      {tab === 'edit' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="material-icons text-primary">quiz</span>
              Questions
            </h3>
            <SurveyBuilder fields={editFields} onChange={setEditFields} />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => save({ title: editTitle, description: editDescription, fields: editFields })}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <><span className="material-icons text-lg animate-spin">progress_activity</span>Saving...</>
              ) : (
                <><span className="material-icons text-lg">save</span>Save Changes</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Recommendation Tab ─── */}
      {/* Drives the dynamic result slide rendered after the survey thank-you
          everywhere this survey is embedded (pitch decks today, /s/<slug>
          standalone surveys later). The editor saves directly to
          surveys.recommendation. */}
      {tab === 'recommendation' && (
        <SurveyRecommendationEditor
          config={survey.recommendation ?? undefined}
          surveyFields={editFields as unknown as Parameters<typeof SurveyRecommendationEditor>[0]['surveyFields']}
          onChange={(next) => save({ recommendation: next ?? null })}
        />
      )}

      {/* ─── Responses Tab ─── */}
      {tab === 'responses' && (
        <div className="space-y-4">
          {responses.length > 0 && (
            <div className="flex justify-end">
              <a
                href={`/api/portal/surveys/${id}/export`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <span className="material-icons text-lg">download</span>
                Export CSV
              </a>
            </div>
          )}
          {responses.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <span className="material-icons text-4xl text-muted-foreground/50">inbox</span>
              <p className="text-muted-foreground mt-2 text-sm">No responses yet</p>
              <p className="text-xs text-muted-foreground mt-1">Share your survey to start collecting responses</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Respondent</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Answers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {responses.map((r, i) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 text-foreground">
                          {r.respondentEmail || r.respondentName || <span className="text-muted-foreground italic">Anonymous</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {r.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <details className="cursor-pointer">
                            <summary className="text-primary text-xs hover:underline">View answers</summary>
                            <div className="mt-2 space-y-1">
                              {Object.entries(r.answers).map(([key, val]) => {
                                const field = (survey.fields as SurveyField[])?.find(f => f.id === key);
                                return (
                                  <div key={key} className="text-xs">
                                    <span className="font-medium text-foreground">{field?.label || key}:</span>{' '}
                                    <span className="text-muted-foreground">{String(val)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {tab === "analytics" && (
        <ResponseAnalytics survey={survey} responses={responses} stats={stats} />
      )}

      {/* ─── Share & Embed Tab ─── */}
      {tab === 'share' && (
        <div className="space-y-6">
          {/* Direct Link */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">link</span>
              Public Link
            </h3>
            <p className="text-sm text-muted-foreground">Share this link with anyone to collect responses</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={publicUrl}
                className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground font-mono"
              />
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <span className="material-icons text-lg">{copied ? 'check' : 'content_copy'}</span>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Embed Code */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">code</span>
              Embed on Website
            </h3>
            <p className="text-sm text-muted-foreground">Embed this survey on any website or your client sites</p>
            <div className="bg-muted border border-border rounded-lg p-3">
              <code className="text-xs text-foreground font-mono break-all">
                {`<iframe src="${publicUrl}?embed=1" width="100%" height="600" frameborder="0" style="border:none;border-radius:12px;"></iframe>`}
              </code>
            </div>
            <button
              onClick={copyEmbed}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <span className="material-icons text-lg">{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Copied!' : 'Copy Embed Code'}
            </button>
          </div>

          {/* Integration Links */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">hub</span>
              Integrations
            </h3>
            <p className="text-sm text-muted-foreground">Connect this survey to other tools for automatic distribution</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-lg text-primary">email</span>
                  <p className="font-medium text-foreground text-sm">Email Campaigns</p>
                </div>
                <p className="text-xs text-muted-foreground">Include survey link in email campaigns. Add <code className="bg-muted px-1 rounded">{`{{survey:${survey.slug}}}`}</code> to any email template.</p>
              </div>
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-lg text-primary">handshake</span>
                  <p className="font-medium text-foreground text-sm">CRM Deals & Proposals</p>
                </div>
                <p className="text-xs text-muted-foreground">Attach to a deal or proposal. Responses are linked to the contact record for follow-up.</p>
              </div>
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-lg text-primary">calendar_month</span>
                  <p className="font-medium text-foreground text-sm">Booking Follow-up</p>
                </div>
                <p className="text-xs text-muted-foreground">Send survey after a booking is completed. Set up in Automations with the &ldquo;booking.completed&rdquo; trigger.</p>
              </div>
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-lg text-primary">web</span>
                  <p className="font-medium text-foreground text-sm">Website Embed</p>
                </div>
                <p className="text-xs text-muted-foreground">Use the embed code above or add to your site via the website builder&apos;s custom HTML block.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Settings Tab ─── */}
      {tab === 'settings' && (
        <div className="space-y-6">
          {/* Appearance */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">palette</span>
              Appearance
            </h3>

            {/* Branding Profile */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Branding Profile</label>
              <select
                value={editBrandingProfileId || ''}
                onChange={(e) => setEditBrandingProfileId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="">None (use overrides below)</option>
                {brandingProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Select a branding profile as a base, then override individual values below.
                {brandingProfiles.length === 0 && (
                  <> <a href="/portal/branding" className="text-primary hover:underline">Create a branding profile</a> first.</>
                )}
              </p>
            </div>

            {/* Colors */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <span className="material-icons text-base text-muted-foreground">color_lens</span>
                Colors
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {([
                  { key: 'primaryColor', label: 'Primary', fallback: editColor || '#2563eb' },
                  { key: 'secondaryColor', label: 'Secondary', fallback: '#1e40af' },
                  { key: 'accentColor', label: 'Accent', fallback: '#f59e0b' },
                  { key: 'backgroundColor', label: 'Background', fallback: '#ffffff' },
                  { key: 'textColor', label: 'Text', fallback: '#111827' },
                  { key: 'formBg', label: 'Form Card', fallback: '#ffffff' },
                  { key: 'inputBg', label: 'Input Fields', fallback: '#ffffff' },
                  { key: 'inputTextColor', label: 'Input Text', fallback: '#111827' },
                  { key: 'inputOptionTextColor', label: 'Option Text', fallback: '#374151' },
                ] as const).map(({ key, label, fallback }) => (
                  <div key={key}>
                    <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(editStyling[key] as string) || fallback}
                        onChange={(e) => setEditStyling(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={(editStyling[key] as string) || ''}
                        onChange={(e) => setEditStyling(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={fallback}
                        className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fonts */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <span className="material-icons text-base text-muted-foreground">text_fields</span>
                Fonts
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Heading Font</label>
                  <GoogleFontPicker
                    value={(editStyling.headingFont as string) || ''}
                    onChange={(font) => setEditStyling(prev => ({ ...prev, headingFont: font }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
                  <GoogleFontPicker
                    value={(editStyling.bodyFont as string) || ''}
                    onChange={(font) => setEditStyling(prev => ({ ...prev, bodyFont: font }))}
                  />
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <span className="material-icons text-base text-muted-foreground">smart_button</span>
                Buttons
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Button Background</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(editStyling.buttonPrimaryBg as string) || editColor || '#2563eb'}
                      onChange={(e) => setEditStyling(prev => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                      className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={(editStyling.buttonPrimaryBg as string) || ''}
                      onChange={(e) => setEditStyling(prev => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                      placeholder="Auto"
                      className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Button Text</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(editStyling.buttonPrimaryText as string) || '#ffffff'}
                      onChange={(e) => setEditStyling(prev => ({ ...prev, buttonPrimaryText: e.target.value }))}
                      className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={(editStyling.buttonPrimaryText as string) || ''}
                      onChange={(e) => setEditStyling(prev => ({ ...prev, buttonPrimaryText: e.target.value }))}
                      placeholder="#ffffff"
                      className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Border Radius</label>
                  <select
                    value={(editStyling.buttonBorderRadius as string) || ''}
                    onChange={(e) => setEditStyling(prev => ({ ...prev, buttonBorderRadius: e.target.value }))}
                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Default</option>
                    <option value="0px">Square (0px)</option>
                    <option value="4px">Slight (4px)</option>
                    <option value="8px">Rounded (8px)</option>
                    <option value="12px">More Rounded (12px)</option>
                    <option value="9999px">Pill (full)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Layout */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <span className="material-icons text-base text-muted-foreground">view_quilt</span>
                Layout
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Card Border Radius</label>
                  <select
                    value={(editStyling.borderRadius as string) || ''}
                    onChange={(e) => setEditStyling(prev => ({ ...prev, borderRadius: e.target.value }))}
                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Default (8px)</option>
                    <option value="0px">Square (0px)</option>
                    <option value="4px">Slight (4px)</option>
                    <option value="12px">Rounded (12px)</option>
                    <option value="16px">More Rounded (16px)</option>
                    <option value="24px">Very Rounded (24px)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-6 mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editStyling.hideTitle}
                    onChange={(e) => setEditStyling(prev => ({ ...prev, hideTitle: e.target.checked }))}
                    className="rounded border-border accent-primary"
                  />
                  <span className="text-sm text-foreground">Hide title on public page</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editStyling.hideLogo}
                    onChange={(e) => setEditStyling(prev => ({ ...prev, hideLogo: e.target.checked }))}
                    className="rounded border-border accent-primary"
                  />
                  <span className="text-sm text-foreground">Hide logo</span>
                </label>
              </div>
            </div>

            {/* Preview */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Preview</h4>
              <div
                className="rounded-xl border p-6 flex items-center justify-center"
                style={{
                  backgroundColor: (editStyling.backgroundColor as string) || '#ffffff',
                  borderColor: ((editStyling.textColor as string) || '#111827') + '20',
                  borderRadius: (editStyling.borderRadius as string) || '8px',
                }}
              >
                <div
                  className="rounded-lg border p-4 w-full max-w-xs space-y-3"
                  style={{
                    backgroundColor: (editStyling.formBg as string) || '#ffffff',
                    borderColor: ((editStyling.textColor as string) || '#111827') + '15',
                  }}
                >
                  <p style={{
                    fontFamily: (editStyling.headingFont as string) ? `"${editStyling.headingFont}", sans-serif` : undefined,
                    color: (editStyling.textColor as string) || '#111827',
                    fontWeight: 600, fontSize: '0.95rem',
                  }}>
                    Survey Question
                  </p>
                  <div
                    className="rounded px-3 py-2 text-xs"
                    style={{
                      backgroundColor: (editStyling.inputBg as string) || '#f3f4f6',
                      color: ((editStyling.textColor as string) || '#111827') + '80',
                    }}
                  >
                    Your answer...
                  </div>
                  <button
                    className="w-full px-4 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: (editStyling.buttonPrimaryBg as string) || (editStyling.primaryColor as string) || editColor || '#2563eb',
                      color: (editStyling.buttonPrimaryText as string) || '#ffffff',
                      borderRadius: (editStyling.buttonBorderRadius as string) || '8px',
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Completion */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">celebration</span>
              Completion Screen
            </h3>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Thank You Title</label>
              <input
                type="text"
                value={editThankYouTitle}
                onChange={(e) => setEditThankYouTitle(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Thank You Message</label>
              <textarea
                value={editThankYouMessage}
                onChange={(e) => setEditThankYouMessage(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Redirect URL (optional)</label>
              <input
                type="url"
                value={editRedirectUrl}
                onChange={(e) => setEditRedirectUrl(e.target.value)}
                placeholder="https://example.com/thank-you"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-muted-foreground mt-1">If set, respondents will be redirected here instead of seeing the thank you screen</p>
            </div>
          </div>

          {/* Response Settings */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">tune</span>
              Response Settings
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editRequireEmail} onChange={(e) => setEditRequireEmail(e.target.checked)} className="rounded border-border" />
                <span className="text-sm text-foreground">Require respondent email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editAllowMultiple} onChange={(e) => setEditAllowMultiple(e.target.checked)} className="rounded border-border" />
                <span className="text-sm text-foreground">Allow multiple submissions per person</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editNotify} onChange={(e) => setEditNotify(e.target.checked)} className="rounded border-border" />
                <span className="text-sm text-foreground">Email notification on new response</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email Digest Summary</label>
              <select
                value={editDigest}
                onChange={(e) => setEditDigest(e.target.value)}
                className="w-full sm:w-48 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="off">Off</option>
                <option value="daily">Daily digest</option>
                <option value="weekly">Weekly digest</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">Receive a summary email with response stats and highlights</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Close Date (optional)</label>
                <input
                  type="datetime-local"
                  value={editClosesAt}
                  onChange={(e) => setEditClosesAt(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Max Responses (optional)</label>
                <input
                  type="number"
                  value={editMaxResponses}
                  onChange={(e) => setEditMaxResponses(e.target.value)}
                  placeholder="Unlimited"
                  min={1}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          {/* Save / Delete */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm transition-colors"
            >
              <span className="material-icons text-lg">delete</span>
              Delete Survey
            </button>
            <button
              onClick={() => save({
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
              })}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <><span className="material-icons text-lg animate-spin">progress_activity</span>Saving...</>
              ) : (
                <><span className="material-icons text-lg">save</span>Save Settings</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
