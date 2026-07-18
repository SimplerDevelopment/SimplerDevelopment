// Messaging tab: company identity, brand voice, key messaging, company details, social proof, additional context.

'use client';

import { useState } from 'react';
import { INPUT_CLASS, LABEL_CLASS, type MessagingData } from '../_lib/types';

interface Props {
  messaging: MessagingData;
  updateMessaging: (field: string, value: unknown) => void;
  openRewrite: (field: string, label: string) => void;
}

export function MessagingTab({ messaging, updateMessaging, openRewrite }: Props) {
  const [newDifferentiator, setNewDifferentiator] = useState('');

  const addDifferentiator = () => {
    const val = newDifferentiator.trim();
    if (!val) return;
    updateMessaging('keyDifferentiators', [...messaging.keyDifferentiators, val]);
    setNewDifferentiator('');
  };

  const removeDifferentiator = (index: number) => {
    updateMessaging(
      'keyDifferentiators',
      messaging.keyDifferentiators.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">chat</span>
          Messaging
        </h2>
        <p className="text-sm text-muted-foreground">
          Company messaging used in proposals, pitch decks, and AI-generated content for this brand profile.
        </p>
      </div>

      {/* Company Identity */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">business</span>
          Company Identity
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Company Name</label>
            <input
              type="text"
              value={messaging.companyName}
              onChange={(e) => updateMessaging('companyName', e.target.value)}
              placeholder="Acme Corp"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Tagline</label>
            <input
              type="text"
              value={messaging.tagline}
              onChange={(e) => updateMessaging('tagline', e.target.value)}
              placeholder="Building the future, today"
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <FieldWithRewrite
          field="missionStatement"
          label="Mission Statement"
          value={messaging.missionStatement}
          onChange={(v) => updateMessaging('missionStatement', v)}
          openRewrite={openRewrite}
          placeholder="What is your company's mission?"
        />
        <FieldWithRewrite
          field="visionStatement"
          label="Vision Statement"
          value={messaging.visionStatement}
          onChange={(v) => updateMessaging('visionStatement', v)}
          openRewrite={openRewrite}
          placeholder="What is your long-term vision?"
        />
        <FieldWithRewrite
          field="valueProposition"
          label="Value Proposition"
          value={messaging.valueProposition}
          onChange={(v) => updateMessaging('valueProposition', v)}
          openRewrite={openRewrite}
          placeholder="What unique value do you provide to customers?"
        />
      </div>

      {/* Brand Voice */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">record_voice_over</span>
          Brand Voice
        </h3>
        <div>
          <label className={LABEL_CLASS}>Tone of Voice</label>
          <input
            type="text"
            value={messaging.toneOfVoice}
            onChange={(e) => updateMessaging('toneOfVoice', e.target.value)}
            placeholder="e.g. Professional, Approachable, Innovative"
            className={INPUT_CLASS}
          />
        </div>
        <FieldWithRewrite
          field="brandPersonality"
          label="Brand Personality"
          value={messaging.brandPersonality}
          onChange={(v) => updateMessaging('brandPersonality', v)}
          openRewrite={openRewrite}
          placeholder="Describe how your brand should come across in communications"
        />
        <FieldWithRewrite
          field="writingStyle"
          label="Writing Style Guidelines"
          value={messaging.writingStyle}
          onChange={(v) => updateMessaging('writingStyle', v)}
          openRewrite={openRewrite}
          placeholder="Preferred language, formatting, and communication style"
        />

        {/* Tone Axes — structured signal that AI can reason about */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <label className={`${LABEL_CLASS} mb-0`}>Tone Axes</label>
            <span className="text-[10px] text-muted-foreground">
              Drag toward one side — feeds AI copy generation
            </span>
          </div>
          <div className="space-y-3">
            {[
              { key: 'formal' as const, low: 'Casual', high: 'Formal' },
              { key: 'playful' as const, low: 'Serious', high: 'Playful' },
              { key: 'traditional' as const, low: 'Innovative', high: 'Traditional' },
              { key: 'authoritative' as const, low: 'Friendly', high: 'Authoritative' },
            ].map(({ key, low, high }) => {
              const value = messaging.toneAxes[key] ?? 0;
              return (
                <div key={key} data-testid={`tone-axis-${key}`}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-muted-foreground">{low}</span>
                    <span className="text-foreground font-medium">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                    <span className="text-muted-foreground">{high}</span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={value}
                    onChange={(e) =>
                      updateMessaging('toneAxes', { ...messaging.toneAxes, [key]: parseFloat(e.target.value) })
                    }
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
                    <span>−1</span>
                    <span className={value === 0 ? 'text-muted-foreground' : 'text-primary'}>
                      {value > 0 ? '+' : ''}
                      {value.toFixed(1)}
                    </span>
                    <span>+1</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Voice Samples — short exemplars used as style anchors for AI */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <label className={`${LABEL_CLASS} mb-0`}>Voice Samples</label>
            <span className="text-[10px] text-muted-foreground">3–5 examples ground AI in your actual voice</span>
          </div>
          <div className="space-y-2" data-testid="voice-samples-list">
            {messaging.voiceSamples.map((sample, idx) => (
              <div key={idx} className="flex gap-2 items-start" data-testid={`voice-sample-${idx}`}>
                <input
                  type="text"
                  value={sample.context}
                  onChange={(e) => {
                    const next = [...messaging.voiceSamples];
                    next[idx] = { ...next[idx], context: e.target.value };
                    updateMessaging('voiceSamples', next);
                  }}
                  placeholder="Context (e.g. tweet, email subject)"
                  className={`${INPUT_CLASS} w-44 flex-shrink-0`}
                />
                <textarea
                  value={sample.text}
                  onChange={(e) => {
                    const next = [...messaging.voiceSamples];
                    next[idx] = { ...next[idx], text: e.target.value };
                    updateMessaging('voiceSamples', next);
                  }}
                  placeholder="Sample text written in your brand voice"
                  rows={2}
                  className={`${INPUT_CLASS} flex-1 resize-y`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = messaging.voiceSamples.filter((_, i) => i !== idx);
                    updateMessaging('voiceSamples', next);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                  title="Remove sample"
                  data-testid={`voice-sample-remove-${idx}`}
                >
                  <span className="material-icons text-base">close</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateMessaging('voiceSamples', [...messaging.voiceSamples, { context: '', text: '' }])}
              className="text-xs text-primary hover:underline flex items-center gap-1"
              data-testid="voice-sample-add"
            >
              <span className="material-icons text-sm">add</span>
              Add sample
            </button>
          </div>
        </div>
      </div>

      {/* Key Messaging */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">campaign</span>
          Key Messaging
        </h3>
        <FieldWithRewrite
          field="elevatorPitch"
          label="Elevator Pitch"
          value={messaging.elevatorPitch}
          onChange={(v) => updateMessaging('elevatorPitch', v)}
          openRewrite={openRewrite}
          placeholder="A concise 30-second pitch about your company"
        />
        <FieldWithRewrite
          field="boilerplate"
          label="Boilerplate Description"
          value={messaging.boilerplate}
          onChange={(v) => updateMessaging('boilerplate', v)}
          openRewrite={openRewrite}
          placeholder="Standard company description for press releases, proposals, etc."
        />
        <div>
          <label className={LABEL_CLASS}>Key Differentiators</label>
          <div className="space-y-2">
            {messaging.keyDifferentiators.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm">
                  {item}
                </span>
                <button
                  onClick={() => removeDifferentiator(i)}
                  className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
                >
                  <span className="material-icons text-base">close</span>
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDifferentiator}
                onChange={(e) => setNewDifferentiator(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDifferentiator()}
                placeholder="Add a differentiator"
                className={INPUT_CLASS}
              />
              <button
                onClick={addDifferentiator}
                disabled={!newDifferentiator.trim()}
                className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <span className="material-icons text-base">add</span>
              </button>
            </div>
          </div>
        </div>
        <FieldWithRewrite
          field="targetAudience"
          label="Target Audience"
          value={messaging.targetAudience}
          onChange={(v) => updateMessaging('targetAudience', v)}
          openRewrite={openRewrite}
          placeholder="Who are your ideal customers? Demographics, needs, pain points"
        />
      </div>

      {/* Company Details */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">info</span>
          Company Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Industry</label>
            <input
              type="text"
              value={messaging.industry}
              onChange={(e) => updateMessaging('industry', e.target.value)}
              placeholder="e.g. SaaS, Healthcare, Fintech"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Year Founded</label>
            <input
              type="text"
              value={messaging.yearFounded}
              onChange={(e) => updateMessaging('yearFounded', e.target.value)}
              placeholder="e.g. 2020"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Company Size</label>
            <input
              type="text"
              value={messaging.companySize}
              onChange={(e) => updateMessaging('companySize', e.target.value)}
              placeholder="e.g. 50-100 employees"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Headquarters</label>
            <input
              type="text"
              value={messaging.headquarters}
              onChange={(e) => updateMessaging('headquarters', e.target.value)}
              placeholder="City, State / Country"
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS}>Website URL</label>
          <input
            type="text"
            value={messaging.websiteUrl}
            onChange={(e) => updateMessaging('websiteUrl', e.target.value)}
            placeholder="https://example.com"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* Social Proof */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">verified</span>
          Social Proof
        </h3>
        <FieldWithRewrite
          field="socialProof"
          label="Testimonials, Awards & Press"
          value={messaging.socialProof}
          onChange={(v) => updateMessaging('socialProof', v)}
          openRewrite={openRewrite}
          placeholder="Notable testimonials, awards, or press mentions"
        />
        <FieldWithRewrite
          field="keyClients"
          label="Key Clients / Partners"
          value={messaging.keyClients}
          onChange={(v) => updateMessaging('keyClients', v)}
          openRewrite={openRewrite}
          placeholder="Notable clients or partners you can reference"
        />
        <FieldWithRewrite
          field="certifications"
          label="Certifications & Accreditations"
          value={messaging.certifications}
          onChange={(v) => updateMessaging('certifications', v)}
          openRewrite={openRewrite}
          placeholder="Industry certifications, compliance standards, etc."
        />
      </div>

      {/* Additional Context */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">lightbulb</span>
          Additional Context
        </h3>
        <FieldWithRewrite
          field="additionalContext"
          label="Anything else the AI should know"
          value={messaging.additionalContext}
          onChange={(v) => updateMessaging('additionalContext', v)}
          openRewrite={openRewrite}
          placeholder="Any other information that would be helpful when generating proposals, pitch decks, or other content"
          minHeight="min-h-[120px]"
        />
      </div>
    </div>
  );
}

interface FieldWithRewriteProps {
  field: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  openRewrite: (field: string, label: string) => void;
  placeholder: string;
  minHeight?: string;
}

function FieldWithRewrite({
  field,
  label,
  value,
  onChange,
  openRewrite,
  placeholder,
  minHeight = 'min-h-[80px]',
}: FieldWithRewriteProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={`${LABEL_CLASS} mb-0`}>{label}</label>
        <button
          type="button"
          onClick={() => openRewrite(field, label)}
          className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors"
          title="Rewrite with AI"
        >
          <span className="material-icons text-sm">auto_awesome</span>
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_CLASS} ${minHeight} resize-y`}
      />
    </div>
  );
}
