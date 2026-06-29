'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { StepProps } from './types';
import { FEATURE_CATALOG } from '@/lib/onboarding/types';
import { obPrimaryBtn } from '../ob-styles';

interface Particle {
  id: number;
  left: number;
  delay: number;
  color: string;
  rotate: number;
}

function makeParticles(count = 30): Particle[] {
  const colors = ['#2563eb', '#7c3aed', '#16a34a', '#ea580c', '#db2777', '#ca8a04'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    color: colors[i % colors.length],
    rotate: Math.random() * 360,
  }));
}

export function StepDone({ state, finish }: StepProps) {
  const [particles] = useState<Particle[]>(() => makeParticles());
  const picked = state.answers.featuresInterested ?? [];
  const pickedMeta = FEATURE_CATALOG.filter((f) => picked.includes(f.id));
  const firstFeature = pickedMeta[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') void finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  return (
    <div className="relative flex flex-col items-center justify-center text-center overflow-hidden py-4">
      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 -top-4">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute block h-[14px] w-[8px] rounded-sm opacity-[0.85]"
            style={{ left: `${p.left}%`, backgroundColor: p.color }}
            initial={{ y: -40, opacity: 0, rotate: 0 }}
            animate={{ y: 420, opacity: [0, 0.9, 0.9, 0], rotate: p.rotate }}
            transition={{ duration: 3.2, delay: p.delay, ease: 'linear' }}
          />
        ))}
      </div>

      {/* Emerald badge */}
      <motion.div
        initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'backOut' }}
        className="relative mb-5 grid h-[84px] w-[84px] place-items-center rounded-full bg-emerald-500/[0.14]"
      >
        <span className="material-icons text-emerald-500" style={{ fontSize: 46 }}>auto_awesome</span>
      </motion.div>

      <h2 className="text-[2.1rem] font-extrabold tracking-[-0.028em] leading-[1.06]">Nicely done.</h2>
      <p className="mt-3 text-[15px] text-muted-foreground max-w-[46ch] mx-auto leading-relaxed">
        Your workspace is dialed in.{firstFeature ? ` First stop: ${firstFeature.label}.` : ''} You can change anything from <strong>Settings → Branding</strong>.
      </p>

      {pickedMeta.length > 0 && (
        <div className="mt-[18px] flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto" data-testid="onboarding-done-picks">
          {pickedMeta.slice(0, 6).map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
            >
              <span className="material-icons text-[14px] text-primary">{f.icon}</span>
              {f.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-[26px]">
        <button
          type="button"
          onClick={() => void finish()}
          data-testid="onboarding-done-go-dashboard"
          className={obPrimaryBtn}
        >
          Take me to my dashboard
          <span className="material-icons text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
