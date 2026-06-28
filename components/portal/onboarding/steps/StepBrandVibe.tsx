'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { BRAND_TONES, COLOR_PRESETS } from '@/lib/onboarding/types';
import { obLabel, obHint, obPill, obPillSoft, obInput, obPrimaryBtn } from '../ob-styles';

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
        <label className={obLabel}>
          Tone <span className="font-normal text-muted-foreground">— up to {MAX_TONES}</span>
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
                className={`${obPill} ${active ? obPillSoft : ''}`}
              >
                <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'text-bottom', marginRight: 4 }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
        <p className={obHint}>
          <span className="material-icons" style={{ fontSize: 15 }}>info</span>
          {tones.length} / {MAX_TONES} selected
        </p>
      </div>

      <div>
        <label className={obLabel}>Primary color</label>
        <div className="flex flex-wrap items-center gap-2.5">
          {COLOR_PRESETS.map((c) => {
            const active = color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => chooseColor(c)}
                data-testid={`onboarding-color-${c.replace('#', '')}`}
                aria-label={`Pick color ${c}`}
                className={`relative h-10 w-10 rounded-xl transition-all hover:scale-105 ${
                  active
                    ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-105'
                    : ''
                }`}
                style={{ backgroundColor: c }}
              >
                {active && (
                  <span
                    className="material-icons absolute inset-0 flex items-center justify-center text-white"
                    style={{ fontSize: 18, textShadow: '0 1px 3px rgba(0,0,0,.4)' }}
                  >
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-10 w-10 flex-none rounded-xl border border-border"
            style={{ backgroundColor: color }}
            aria-label="Color preview"
          />
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={applyCustomColor}
            placeholder="#hex"
            data-testid="onboarding-color-custom"
            className={`${obInput} max-w-[160px] font-mono`}
            maxLength={7}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[13px] text-muted-foreground">
          {color}
        </p>
        <button
          type="button"
          onClick={() => next({ brandTones: tones, primaryColor: color })}
          data-testid="onboarding-brand-next"
          className={obPrimaryBtn}
        >
          Continue
          <span className="material-icons" style={{ fontSize: 18 }}>arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
