'use client';

// AI Content Studio — client operator for the Content Engine endpoints.
// Tabs: Pack (blog + LinkedIn + ads + optional cover) / Video (plan + render
// job) / Ads lead test (portal-authenticated intake probe). All server output
// stays draft; links point at the human review surfaces.

import { useRef, useState } from 'react';
import Link from 'next/link';
import { formatNumber } from '@/lib/portal-utils';

interface SiteOption {
  id: number;
  name: string;
  domain: string | null;
}

interface PackResult {
  postId: number | null;
  linkedinId: number | null;
  title: string;
  slug: string;
  adVariants: Array<{ headline: string; body: string; cta: string }>;
  imagePrompt: string;
  coverImage: string | null;
  mediaId: number | null;
}

interface Scene {
  index: number;
  kind: string;
  heading: string;
  body: string;
  durationSec: number;
}

interface PlanResult {
  title: string;
  scenes: Scene[];
  totalDurationSec: number;
  linkedinCaption: string;
  videoBlock: { type: string; url: string; caption: string };
}

interface RenderJobResult {
  jobId: string;
  driver: string;
  available: boolean;
  unavailableReason?: string;
  steps: string[];
  notes: string[];
}

type Tab = 'pack' | 'video' | 'ads';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

const inputCls =
  'w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40';
const btnPrimary =
  'inline-flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50';
const btnGhost =
  'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent';

export default function AiContentStudio({ sites }: { sites: SiteOption[] }) {
  const [tab, setTab] = useState<Tab>('pack');
  const [busy, setBusy] = useState(false);
  // Synchronous guard: setBusy (state) lands after re-render, so two clicks
  // in the same tick would both pass a `busy` check and double-submit.
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const [siteId, setSiteId] = useState<number | ''>(sites[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [withImage, setWithImage] = useState(false);
  const [pack, setPack] = useState<PackResult | null>(null);

  const [videoTitle, setVideoTitle] = useState('');
  const [videoMarkdown, setVideoMarkdown] = useState('');
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [job, setJob] = useState<RenderJobResult | null>(null);

  const [leadEmail, setLeadEmail] = useState('');
  const [leadName, setLeadName] = useState('');
  const [leadCampaign, setLeadCampaign] = useState('');
  const [leadResult, setLeadResult] = useState<{ contactId: number; created: boolean } | null>(null);

  async function run<T>(fn: () => Promise<T>, done: (v: T) => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      done(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const tabs: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'pack', label: 'Content pack', icon: 'auto_awesome' },
    { key: 'video', label: 'Video plan', icon: 'videocam' },
    { key: 'ads', label: 'Ads lead test', icon: 'ads_click' },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-border flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setError(null); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base align-middle mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-card border border-border rounded-lg px-5 py-4 text-sm text-destructive">
          <span className="material-icons text-base align-middle mr-1">error_outline</span>
          {error}
        </div>
      )}

      {tab === 'pack' && (
        <section className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium">Website</span>
              <select
                className={inputCls}
                value={siteId}
                onChange={(e) => setSiteId(e.target.value ? parseInt(e.target.value, 10) : '')}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.domain ? ` (${s.domain})` : ''}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Topic *</span>
              <input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. How to choose a CRM" />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Audience</span>
              <input className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Small agencies" />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Tone</span>
              <input className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. Practical, no hype" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} />
            Also render a cover image (billable, slower)
          </label>
          <button
            className={btnPrimary}
            disabled={busy || !siteId || topic.trim().length < 3}
            onClick={() => run(() => postJson<PackResult>('/api/portal/ai/content/generate', {
              siteId, brief: { topic, audience: audience || undefined, tone: tone || undefined, language: 'en' }, generateImage: withImage,
            }), setPack)}
          >
            <span className="material-icons text-base">auto_awesome</span>
            {busy ? 'Generating…' : 'Generate pack'}
          </button>

          {pack && (
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="font-semibold">{pack.title}</h3>
              <div className="flex flex-wrap gap-2 text-sm">
                {pack.postId && typeof siteId === 'number' && (
                  <Link className={btnGhost} href={`/portal/websites/${siteId}/posts/${pack.postId}/edit`}>Review blog draft</Link>
                )}
                {pack.linkedinId && (
                  <Link className={btnGhost} href="/portal/publishing/board">Review LinkedIn draft</Link>
                )}
              </div>
              {pack.coverImage && (
                <p className="text-xs text-muted-foreground">Cover: <span className="font-mono">{pack.coverImage}</span></p>
              )}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Ad variants ({formatNumber(pack.adVariants.length)})</h4>
                {pack.adVariants.map((a, i) => (
                  <div key={i} className="text-sm border border-border rounded-lg p-3">
                    <p className="font-medium">{a.headline}</p>
                    <p className="text-muted-foreground">{a.body}</p>
                    <p className="text-xs mt-1">CTA: {a.cta}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'video' && (
        <section className="bg-card border border-border rounded-lg p-5 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Title *</span>
            <input className={inputCls} value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Blog markdown *</span>
            <textarea className={inputCls} rows={6} value={videoMarkdown} onChange={(e) => setVideoMarkdown(e.target.value)} placeholder="## Point one&#10;## Point two" />
          </label>
          <div className="flex gap-2">
            <button
              className={btnPrimary}
              disabled={busy || videoTitle.trim().length < 3 || videoMarkdown.trim().length < 20}
              onClick={() => run(
                () => postJson<PlanResult>('/api/portal/ai/video/plan', { title: videoTitle, blogMarkdown: videoMarkdown }),
                (p) => { setPlan(p); setJob(null); },
              )}
            >
              <span className="material-icons text-base">videocam</span>
              {busy ? 'Planning…' : 'Build plan'}
            </button>
            {plan && (
              <button
                className={btnGhost}
                disabled={busy}
                onClick={() => run(() => postJson<RenderJobResult>('/api/portal/ai/video/render', { plan }), setJob)}
              >
                Create render job
              </button>
            )}
          </div>

          {plan && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                {formatNumber(plan.scenes.length)} scenes · {formatNumber(plan.totalDurationSec)}s total
              </p>
              {plan.scenes.map((s) => (
                <div key={s.index} className="text-sm border border-border rounded-lg p-3">
                  <p className="font-medium">[{s.kind}] {s.heading} <span className="text-muted-foreground">· {formatNumber(s.durationSec)}s</span></p>
                  <p className="text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          )}
          {job && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-sm">Job <span className="font-mono">{job.jobId}</span> ({job.driver})</p>
              <ol className="text-sm list-decimal ml-5 space-y-1">
                {job.steps.map((st, i) => <li key={i}>{st}</li>)}
              </ol>
              {job.notes.map((n, i) => <p key={i} className="text-xs text-muted-foreground">{n}</p>)}
            </div>
          )}
        </section>
      )}

      {tab === 'ads' && (
        <section className="bg-card border border-border rounded-lg p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Probe the portal-authenticated lead intake (same validation as the signed provider webhook).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block text-sm">
              <span className="font-medium">Email *</span>
              <input className={inputCls} value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} placeholder="lead@acme.com" />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Name</span>
              <input className={inputCls} value={leadName} onChange={(e) => setLeadName(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Campaign ref</span>
              <input className={inputCls} value={leadCampaign} onChange={(e) => setLeadCampaign(e.target.value)} placeholder="promo" />
            </label>
          </div>
          <button
            className={btnPrimary}
            disabled={busy || !leadEmail.includes('@')}
            onClick={() => run(() => postJson<{ contactId: number; created: boolean }>('/api/portal/ads/leads', {
              provider: 'mock', campaignRef: leadCampaign || undefined,
              contact: { email: leadEmail, displayName: leadName || undefined },
            }), setLeadResult)}
          >
            <span className="material-icons text-base">ads_click</span>
            {busy ? 'Sending…' : 'Send test lead'}
          </button>
          {leadResult && (
            <p className="text-sm">
              Contact <span className="font-mono">{formatNumber(leadResult.contactId)}</span> · {leadResult.created ? 'created' : 'already existed'} — check the CRM.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
