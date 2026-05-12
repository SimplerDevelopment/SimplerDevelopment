'use client';

/**
 * SurveySettings — appearance, completion, and response settings tab.
 *
 * Lifted verbatim from page.tsx. Renders the branding/colors/fonts/buttons
 * editor, the completion screen settings, and the response-rules block.
 * The Save handler is owned by the page (handed in via onSave) so the page
 * still controls the PUT payload shape.
 */

import { useEffect, useState } from 'react';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import type { BrandingProfile } from '../_lib/api';
import type { SurveyField } from '@/components/admin/SurveyBuilder';
import type { SurveyScoringConfig } from '@/lib/db/schema';

// SCORE-02: pipeline + stage list shape returned by /api/portal/crm/pipelines.
// The route already eager-loads stages alongside each pipeline so a single
// fetch covers both the pipeline-select and stage-select.
interface CrmPipelineSummary {
  id: number;
  name: string;
  stages: { id: number; name: string; sortOrder: number }[];
}

interface Props {
  saving: boolean;
  brandingProfiles: BrandingProfile[];

  editColor: string;
  editBrandingProfileId: number | null;
  setEditBrandingProfileId: (id: number | null) => void;

  editStyling: Record<string, string | boolean | undefined>;
  setEditStyling: (
    next:
      | Record<string, string | boolean | undefined>
      | ((prev: Record<string, string | boolean | undefined>) => Record<string, string | boolean | undefined>),
  ) => void;

  editThankYouTitle: string;
  setEditThankYouTitle: (v: string) => void;
  editThankYouMessage: string;
  setEditThankYouMessage: (v: string) => void;
  editRedirectUrl: string;
  setEditRedirectUrl: (v: string) => void;

  editRequireEmail: boolean;
  setEditRequireEmail: (v: boolean) => void;
  editAllowMultiple: boolean;
  setEditAllowMultiple: (v: boolean) => void;
  editPublishResults: boolean;
  setEditPublishResults: (v: boolean) => void;
  editCertificateEnabled: boolean;
  setEditCertificateEnabled: (v: boolean) => void;
  editNotify: boolean;
  setEditNotify: (v: boolean) => void;
  editDigest: string;
  setEditDigest: (v: string) => void;
  editClosesAt: string;
  setEditClosesAt: (v: string) => void;
  editMaxResponses: string;
  setEditMaxResponses: (v: string) => void;

  // editFields powers both DIST-02 (consent field dropdown) and SCORE-02 (auto-
  // route panel visibility — only shown when at least one field has scoring).
  editFields: SurveyField[];

  // SCORE-02: survey-level scoring config (auto-route-to-CRM). State is always
  // threaded so save() can clear stale configs when no field is scored.
  editScoringConfig: SurveyScoringConfig | null;
  setEditScoringConfig: (v: SurveyScoringConfig | null) => void;

  // DIST-02: opt-in gate field for follow-up email sequences. `null` means
  // "email presence is enough" (back-compat for surveys created before the
  // column existed).
  editConsentField: string | null;
  setEditConsentField: (v: string | null) => void;

  onSave: () => void;
  onDelete: () => void;
}

export default function SurveySettings(props: Props) {
  const {
    saving,
    brandingProfiles,
    editColor,
    editBrandingProfileId,
    setEditBrandingProfileId,
    editStyling,
    setEditStyling,
    editThankYouTitle,
    setEditThankYouTitle,
    editThankYouMessage,
    setEditThankYouMessage,
    editRedirectUrl,
    setEditRedirectUrl,
    editRequireEmail,
    setEditRequireEmail,
    editAllowMultiple,
    setEditAllowMultiple,
    editPublishResults,
    setEditPublishResults,
    editCertificateEnabled,
    setEditCertificateEnabled,
    editNotify,
    setEditNotify,
    editDigest,
    setEditDigest,
    editClosesAt,
    setEditClosesAt,
    editMaxResponses,
    setEditMaxResponses,
    editFields,
    editScoringConfig,
    setEditScoringConfig,
    editConsentField,
    setEditConsentField,
    onSave,
    onDelete,
  } = props;

  // SCORE-02: surface the auto-route panel only when the survey is "scorable"
  // — i.e. at least one field has a scoring rule. Saves users from setting up
  // a threshold against a survey that will always score 0.
  const hasAnyScoredField = (editFields || []).some((f) => !!f.scoring);

  const [pipelines, setPipelines] = useState<CrmPipelineSummary[]>([]);
  const [pipelinesLoaded, setPipelinesLoaded] = useState(false);

  // Lazy-load pipelines only once, only when the panel is actually visible.
  // The list endpoint also seeds a default pipeline on first call, so we want
  // to avoid hitting it for surveys that will never use auto-route.
  useEffect(() => {
    if (!hasAnyScoredField || pipelinesLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/portal/crm/pipelines');
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data.data)) {
          setPipelines(data.data as CrmPipelineSummary[]);
        }
      } catch {
        // Swallow — the panel just renders empty selects.
      } finally {
        if (!cancelled) setPipelinesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAnyScoredField, pipelinesLoaded]);

  const autoRoute = editScoringConfig?.autoRouteToCrm;
  const selectedPipeline = pipelines.find((p) => p.id === autoRoute?.pipelineId);

  return (
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
                {p.name}
                {p.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Select a branding profile as a base, then override individual values below.
            {brandingProfiles.length === 0 && (
              <>
                {' '}
                <a href="/portal/branding" className="text-primary hover:underline">
                  Create a branding profile
                </a>{' '}
                first.
              </>
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
            {(
              [
                { key: 'primaryColor', label: 'Primary', fallback: editColor || '#2563eb' },
                { key: 'secondaryColor', label: 'Secondary', fallback: '#1e40af' },
                { key: 'accentColor', label: 'Accent', fallback: '#f59e0b' },
                { key: 'backgroundColor', label: 'Background', fallback: '#ffffff' },
                { key: 'textColor', label: 'Text', fallback: '#111827' },
                { key: 'formBg', label: 'Form Card', fallback: '#ffffff' },
                { key: 'inputBg', label: 'Input Fields', fallback: '#ffffff' },
                { key: 'inputTextColor', label: 'Input Text', fallback: '#111827' },
                { key: 'inputOptionTextColor', label: 'Option Text', fallback: '#374151' },
              ] as const
            ).map(({ key, label, fallback }) => (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(editStyling[key] as string) || fallback}
                    onChange={(e) => setEditStyling((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={(editStyling[key] as string) || ''}
                    onChange={(e) => setEditStyling((prev) => ({ ...prev, [key]: e.target.value }))}
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
                onChange={(font) => setEditStyling((prev) => ({ ...prev, headingFont: font }))}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
              <GoogleFontPicker
                value={(editStyling.bodyFont as string) || ''}
                onChange={(font) => setEditStyling((prev) => ({ ...prev, bodyFont: font }))}
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
                  onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                  className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={(editStyling.buttonPrimaryBg as string) || ''}
                  onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonPrimaryBg: e.target.value }))}
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
                  onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonPrimaryText: e.target.value }))}
                  className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={(editStyling.buttonPrimaryText as string) || ''}
                  onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonPrimaryText: e.target.value }))}
                  placeholder="#ffffff"
                  className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Border Radius</label>
              <select
                value={(editStyling.buttonBorderRadius as string) || ''}
                onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonBorderRadius: e.target.value }))}
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
                onChange={(e) => setEditStyling((prev) => ({ ...prev, borderRadius: e.target.value }))}
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
                onChange={(e) => setEditStyling((prev) => ({ ...prev, hideTitle: e.target.checked }))}
                className="rounded border-border accent-primary"
              />
              <span className="text-sm text-foreground">Hide title on public page</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!editStyling.hideLogo}
                onChange={(e) => setEditStyling((prev) => ({ ...prev, hideLogo: e.target.checked }))}
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
              <p
                style={{
                  fontFamily: (editStyling.headingFont as string)
                    ? `"${editStyling.headingFont}", sans-serif`
                    : undefined,
                  color: (editStyling.textColor as string) || '#111827',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}
              >
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
                  backgroundColor:
                    (editStyling.buttonPrimaryBg as string) ||
                    (editStyling.primaryColor as string) ||
                    editColor ||
                    '#2563eb',
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
          <p className="text-xs text-muted-foreground mt-1">
            If set, respondents will be redirected here instead of seeing the thank you screen
          </p>
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
            <input
              type="checkbox"
              checked={editRequireEmail}
              onChange={(e) => setEditRequireEmail(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-foreground">Require respondent email</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editAllowMultiple}
              onChange={(e) => setEditAllowMultiple(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-foreground">Allow multiple submissions per person</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editNotify}
              onChange={(e) => setEditNotify(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-foreground">Email notification on new response</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editPublishResults}
              onChange={(e) => setEditPublishResults(e.target.checked)}
              className="rounded border-border mt-0.5"
            />
            <span className="text-sm text-foreground">
              Publish public results page
              <span className="block text-xs text-muted-foreground">
                Aggregated charts at <code className="px-1 py-0.5 rounded bg-muted text-[11px]">/s/&lt;slug&gt;/results</code>. No
                individual responses are exposed.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editCertificateEnabled}
              onChange={(e) => setEditCertificateEnabled(e.target.checked)}
              className="rounded border-border mt-0.5"
            />
            <span className="text-sm text-foreground">
              Offer completion certificate
              <span className="block text-xs text-muted-foreground">
                After submitting, respondents see a &ldquo;Download Certificate&rdquo; button on the thank-you screen.
                The PDF uses this survey&apos;s branding profile (logo, colors, fonts) and shows the respondent&apos;s
                name and completion date.
              </span>
            </span>
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
          <p className="text-xs text-muted-foreground mt-1">
            Receive a summary email with response stats and highlights
          </p>
        </div>

        {/* DIST-02: consent-field gate for follow-up email sequences. */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1 flex items-center gap-1.5">
            <span className="material-icons text-base text-muted-foreground">verified_user</span>
            Email Follow-up Consent Field
          </label>
          <select
            value={editConsentField ?? ''}
            onChange={(e) => setEditConsentField(e.target.value ? e.target.value : null)}
            className="w-full sm:w-72 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">(none — email presence is enough)</option>
            {(editFields || [])
              .filter((f) => f.id && f.type !== 'heading' && f.type !== 'page_break' && f.type !== 'file')
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label || f.id}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Follow-up email sequences only fire when this field&apos;s answer is truthy
            (e.g. a checkbox or &ldquo;Yes&rdquo; toggle). Leave unset to send follow-ups to anyone who
            provides an email address.
          </p>
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

      {/* SCORE-02: auto-route scored responses to a CRM deal. Hidden until at
          least one field has a scoring rule — otherwise the threshold could
          never fire. */}
      {hasAnyScoredField && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-2">
            <span className="material-icons text-primary">forward_to_inbox</span>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">Auto-route to CRM</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                When a response&apos;s score crosses your threshold (and an email is captured), automatically create a
                deal in the chosen CRM pipeline.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!autoRoute?.enabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                const current = editScoringConfig?.autoRouteToCrm;
                setEditScoringConfig({
                  ...editScoringConfig,
                  autoRouteToCrm: {
                    enabled,
                    minScore: current?.minScore ?? 0,
                    pipelineId: current?.pipelineId ?? 0,
                    stageId: current?.stageId ?? 0,
                    dealTitleTemplate: current?.dealTitleTemplate ?? 'Survey lead: {surveyTitle}',
                  },
                });
              }}
              className="rounded border-border mt-0.5"
            />
            <span className="text-sm text-foreground">
              Enable auto-route
              <span className="block text-xs text-muted-foreground">
                Best-effort — a CRM error will never fail the public survey submit.
              </span>
            </span>
          </label>

          {autoRoute?.enabled && (
            <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Minimum score</label>
                <input
                  type="number"
                  value={Number.isFinite(autoRoute.minScore) ? autoRoute.minScore : 0}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setEditScoringConfig({
                      ...editScoringConfig,
                      autoRouteToCrm: {
                        ...autoRoute,
                        minScore: Number.isFinite(n) ? n : 0,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">Deal is created when score is at least this value.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Pipeline</label>
                <select
                  value={autoRoute.pipelineId || ''}
                  onChange={(e) => {
                    const pid = Number(e.target.value);
                    setEditScoringConfig({
                      ...editScoringConfig,
                      autoRouteToCrm: {
                        ...autoRoute,
                        pipelineId: Number.isFinite(pid) ? pid : 0,
                        // Reset stage when pipeline changes — stale stage IDs
                        // would fail the ownership check at submit time.
                        stageId: 0,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a pipeline…</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {pipelinesLoaded && pipelines.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No CRM pipelines yet.{' '}
                    <a href="/portal/crm/pipelines" className="text-primary hover:underline">Create one</a>.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Stage</label>
                <select
                  value={autoRoute.stageId || ''}
                  onChange={(e) => {
                    const sid = Number(e.target.value);
                    setEditScoringConfig({
                      ...editScoringConfig,
                      autoRouteToCrm: {
                        ...autoRoute,
                        stageId: Number.isFinite(sid) ? sid : 0,
                      },
                    });
                  }}
                  disabled={!selectedPipeline}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="">Select a stage…</option>
                  {(selectedPipeline?.stages || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Deal title template</label>
                <input
                  type="text"
                  value={autoRoute.dealTitleTemplate ?? ''}
                  onChange={(e) => {
                    setEditScoringConfig({
                      ...editScoringConfig,
                      autoRouteToCrm: {
                        ...autoRoute,
                        dealTitleTemplate: e.target.value,
                      },
                    });
                  }}
                  placeholder="Survey lead: {surveyTitle}"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supports tokens: <code>{'{surveyTitle}'}</code>, <code>{'{respondentName}'}</code>,{' '}
                  <code>{'{respondentEmail}'}</code>, <code>{'{score}'}</code>.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save / Delete */}
      <div className="flex items-center justify-between">
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm transition-colors"
        >
          <span className="material-icons text-lg">delete</span>
          Delete Survey
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <span className="material-icons text-lg animate-spin">progress_activity</span>Saving...
            </>
          ) : (
            <>
              <span className="material-icons text-lg">save</span>Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
