// AI tools: collapsible "Generate with AI" panel and the field-level rewrite modal.

'use client';

import { useState } from 'react';
import { generateMessaging, generateTheme, rewriteField } from '../_lib/api';
import {
  INPUT_CLASS,
  type ButtonStyle,
  type DarkModeOverrides,
  type MessagingData,
  type ProfileData,
} from '../_lib/types';

interface GeneratorProps {
  profile: ProfileData;
  update: (updates: Partial<ProfileData>) => void;
  setMessaging: (updater: (prev: MessagingData) => MessagingData) => void;
}

export function AIGeneratorPanel({ profile, update, setMessaging }: GeneratorProps) {
  const [aiDescription, setAiDescription] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTargets, setAiTargets] = useState({ visual: true, messaging: true });

  const generateWithAI = async () => {
    if (!aiDescription.trim() || !profile) return;
    if (!aiTargets.visual && !aiTargets.messaging) return;
    setAiGenerating(true);
    try {
      const fetches: Promise<Response>[] = [];
      if (aiTargets.visual) fetches.push(generateTheme(aiDescription.trim()));
      if (aiTargets.messaging) fetches.push(generateMessaging(aiDescription.trim()));
      const results = await Promise.all(fetches);
      let idx = 0;
      if (aiTargets.visual) {
        const data = await results[idx++].json();
        if (data.success) {
          const t = data.data as Partial<ProfileData> & { darkMode?: DarkModeOverrides; buttonStyle?: ButtonStyle };
          update({
            primaryColor: t.primaryColor || profile.primaryColor,
            secondaryColor: t.secondaryColor || profile.secondaryColor,
            accentColor: t.accentColor || profile.accentColor,
            backgroundColor: t.backgroundColor || profile.backgroundColor,
            textColor: t.textColor || profile.textColor,
            navBackground: t.navBackground || profile.navBackground,
            navTextColor: t.navTextColor || profile.navTextColor,
            headingFont: t.headingFont || profile.headingFont,
            bodyFont: t.bodyFont || profile.bodyFont,
            borderRadius: t.borderRadius || profile.borderRadius,
            linkColor: t.linkColor || profile.linkColor,
            linkHoverColor: t.linkHoverColor || profile.linkHoverColor,
            buttonStyle: t.buttonStyle || profile.buttonStyle,
            darkMode: t.darkMode || profile.darkMode,
          });
        }
      }
      if (aiTargets.messaging) {
        const data = await results[idx++].json();
        if (data.success) {
          const m = data.data as Partial<MessagingData>;
          setMessaging((prev) => ({
            ...prev,
            companyName: m.companyName || prev.companyName,
            tagline: m.tagline || prev.tagline,
            missionStatement: m.missionStatement || prev.missionStatement,
            visionStatement: m.visionStatement || prev.visionStatement,
            valueProposition: m.valueProposition || prev.valueProposition,
            toneOfVoice: m.toneOfVoice || prev.toneOfVoice,
            brandPersonality: m.brandPersonality || prev.brandPersonality,
            writingStyle: m.writingStyle || prev.writingStyle,
            elevatorPitch: m.elevatorPitch || prev.elevatorPitch,
            boilerplate: m.boilerplate || prev.boilerplate,
            keyDifferentiators: m.keyDifferentiators?.length ? m.keyDifferentiators : prev.keyDifferentiators,
            targetAudience: m.targetAudience || prev.targetAudience,
            industry: m.industry || prev.industry,
            yearFounded: m.yearFounded || prev.yearFounded,
            companySize: m.companySize || prev.companySize,
            headquarters: m.headquarters || prev.headquarters,
            websiteUrl: m.websiteUrl || prev.websiteUrl,
            socialProof: m.socialProof || prev.socialProof,
            keyClients: m.keyClients || prev.keyClients,
            certifications: m.certifications || prev.certifications,
            additionalContext: m.additionalContext || prev.additionalContext,
          }));
        }
      }
      setShowAiPanel(false);
    } catch {
      /* ignore */
    } finally {
      setAiGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setShowAiPanel(!showAiPanel)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
      >
        <span className="material-icons text-base text-primary">auto_awesome</span>
        Generate with AI
        <span
          className="material-icons text-sm text-muted-foreground ml-auto transition-transform"
          style={{ transform: showAiPanel ? 'rotate(180deg)' : undefined }}
        >
          expand_more
        </span>
      </button>
      {showAiPanel && (
        <div className="px-4 pb-4 space-y-3 border-t border-border">
          <p className="text-xs text-muted-foreground pt-3">
            Describe your brand, company, audience, and personality. AI will generate content for the selected
            sections.
          </p>
          <textarea
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            placeholder={
              'e.g. "We\'re a boutique web development agency building custom SaaS platforms for small businesses. Modern, approachable, and professional. Founded in 2020, based in Philadelphia."'
            }
            className={`${INPUT_CLASS} h-24 resize-none`}
            disabled={aiGenerating}
          />
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-muted-foreground">Apply to:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={aiTargets.visual}
                onChange={(e) => setAiTargets((prev) => ({ ...prev, visual: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary"
                disabled={aiGenerating}
              />
              <span className="text-sm text-foreground">Visual Identity</span>
              <span className="text-[10px] text-muted-foreground">(colors, fonts, buttons, style)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={aiTargets.messaging}
                onChange={(e) => setAiTargets((prev) => ({ ...prev, messaging: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary"
                disabled={aiGenerating}
              />
              <span className="text-sm text-foreground">Messaging</span>
              <span className="text-[10px] text-muted-foreground">(company info, voice, pitch)</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={generateWithAI}
              disabled={aiGenerating || !aiDescription.trim() || (!aiTargets.visual && !aiTargets.messaging)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {aiGenerating ? (
                <>
                  <span className="material-icons animate-spin text-base">autorenew</span>Generating...
                </>
              ) : (
                <>
                  <span className="material-icons text-base">auto_awesome</span>Generate
                </>
              )}
            </button>
            {!aiTargets.visual && !aiTargets.messaging && (
              <span className="text-xs text-destructive">Select at least one section</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface RewriteModalProps {
  modal: { field: string; label: string } | null;
  messaging: MessagingData;
  onAccept: (field: string, value: string) => void;
  onClose: () => void;
}

export function RewriteModal({ modal, messaging, onAccept, onClose }: RewriteModalProps) {
  const [rewritePrompt, setRewritePrompt] = useState('');
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewritePreview, setRewritePreview] = useState('');

  if (!modal) return null;

  const runRewrite = async () => {
    if (!modal || !rewritePrompt.trim()) return;
    setRewriteLoading(true);
    setRewritePreview('');
    try {
      const companyContext = [messaging.companyName, messaging.tagline, messaging.industry]
        .filter(Boolean)
        .join(' - ');
      const data = await rewriteField({
        fieldName: modal.field,
        fieldLabel: modal.label,
        currentValue: (messaging as unknown as Record<string, unknown>)[modal.field] || '',
        prompt: rewritePrompt.trim(),
        companyContext,
      });
      if (data.success && data.data) setRewritePreview(data.data);
    } catch {
      /* ignore */
    }
    setRewriteLoading(false);
  };

  const accept = () => {
    if (!modal || !rewritePreview) return;
    onAccept(modal.field, rewritePreview);
    setRewritePrompt('');
    setRewritePreview('');
  };

  const close = () => {
    setRewritePrompt('');
    setRewritePreview('');
    onClose();
  };

  const currentValue = (messaging as unknown as Record<string, unknown>)[modal.field];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="material-icons text-base text-primary">auto_awesome</span>
            <h3 className="text-sm font-semibold text-foreground">Rewrite: {modal.label}</h3>
          </div>
          <button
            onClick={close}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {Boolean(currentValue) && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Current value</label>
              <div className="px-3 py-2 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap">
                {String(currentValue)}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">What should AI do?</label>
            <textarea
              value={rewritePrompt}
              onChange={(e) => setRewritePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), runRewrite())}
              placeholder={
                'e.g. "Make it more concise" or "Write this for a tech-savvy audience" or "Generate from scratch for a fitness brand"'
              }
              className={`${INPUT_CLASS} h-20 resize-none`}
              autoFocus
              disabled={rewriteLoading}
            />
          </div>
          {rewritePreview && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Preview</label>
              <div className="px-3 py-2 rounded-md border border-primary/30 bg-primary/5 text-sm text-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                {rewritePreview}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          {rewritePreview ? (
            <>
              <button
                onClick={runRewrite}
                disabled={rewriteLoading || !rewritePrompt.trim()}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
              >
                {rewriteLoading ? 'Regenerating...' : 'Regenerate'}
              </button>
              <button
                onClick={accept}
                className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Accept
              </button>
            </>
          ) : (
            <button
              onClick={runRewrite}
              disabled={rewriteLoading || !rewritePrompt.trim()}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {rewriteLoading ? (
                <>
                  <span className="material-icons animate-spin text-sm">autorenew</span>Generating...
                </>
              ) : (
                <>
                  <span className="material-icons text-sm">auto_awesome</span>Generate
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
