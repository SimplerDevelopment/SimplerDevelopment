'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { BRAND_TONES, COLOR_PRESETS } from '@/lib/onboarding/types';

const MAX_TONES = 3;

export function StepBrandVibe({ state, setAnswers, next }: StepProps) {
  const [tones, setTones] = useState<string[]>(state.answers.brandTones ?? []);
  const [color, setColor] = useState<string>(state.answers.primaryColor ?? COLOR_PRESETS[0]);
  const [custom, setCustom] = useState<string>('');

  const toggleTone = (id: string) => {
    // Update both local + parent state from the event handler. Calling
    // setAnswers() inside the setTones updater ran it during render →
    // "Cannot update a component while rendering another".
    const has = tones.includes(id);
    const updated = has ? tones.filter((t) => t !== id) : [...tones, id].slice(0, MAX_TONES);
    setTones(updated);
    setAnswers({ brandTones: updated });
  };

  const chooseColor = (c: string) => {
    setColor(c);
    setAnswers({ primaryColor: c });
  };

  const applyCustomColor = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(custom)) {
      chooseColor(custom);
      setCustom('');
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <label className="block text-sm font-medium mb-2">
          Pick up to {MAX_TONES} words that describe your brand
        </label>
        <div className="flex flex-wrap gap-2">
          {BRAND_TONES.map((t) => {
            const active = tones.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTone(t.id)}
                data-testid={`onboarding-tone-${t.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-all ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background/60 hover:border-primary/40'
                }`}
              >
                <span className="material-icons text-base">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{tones.length} / {MAX_TONES} selected</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Primary brand color</label>
        <div className="flex flex-wrap items-center gap-2">
          {COLOR_PRESETS.map((c) => {
            const active = color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => chooseColor(c)}
                data-testid={`onboarding-color-${c.replace('#', '')}`}
                aria-label={`Pick color ${c}`}
                className={`relative h-9 w-9 rounded-lg transition-all ${active ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/30 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c }}
              >
                {active && (
                  <span className="material-icons absolute inset-0 m-auto text-white text-base" style={{ width: 16, height: 16 }}>check</span>
                )}
              </button>
            );
          })}
          <div className="flex items-center gap-1 ml-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={applyCustomColor}
              placeholder="#hex"
              data-testid="onboarding-color-custom"
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs font-mono"
              maxLength={7}
            />
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border p-3 flex items-center gap-3" aria-label="Color preview">
          <div className="h-12 w-12 rounded-md" style={{ backgroundColor: color }} />
          <div>
            <p className="text-xs text-muted-foreground">Preview</p>
            <p className="text-sm font-medium" style={{ color }}>This will be your accent</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={() => next({ brandTones: tones, primaryColor: color })}
          data-testid="onboarding-brand-next"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          Continue
          <span className="material-icons text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
