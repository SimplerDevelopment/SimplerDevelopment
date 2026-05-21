'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { StepProps } from './types';
import { FEATURE_CATALOG } from '@/lib/onboarding/types';

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
    <div className="relative text-center overflow-hidden">
      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 -top-4">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute block h-2 w-2 rounded-sm"
            style={{ left: `${p.left}%`, backgroundColor: p.color }}
            initial={{ y: -20, opacity: 0, rotate: 0 }}
            animate={{ y: 400, opacity: [0, 1, 1, 0], rotate: p.rotate }}
            transition={{ duration: 2.2, delay: p.delay, ease: 'easeOut' }}
          />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'backOut' }}
        className="relative mx-auto mb-6 inline-flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30"
      >
        <span className="material-icons" style={{ fontSize: 56 }}>auto_awesome</span>
      </motion.div>

      <h2 className="text-2xl font-bold">Nicely done.</h2>
      <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
        Your workspace is dialed in. {firstFeature ? `Want to start with ${firstFeature.label.toLowerCase()}? ` : ''}
        You can change anything from <strong>Settings → Branding</strong>.
      </p>

      {pickedMeta.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto" data-testid="onboarding-done-picks">
          {pickedMeta.slice(0, 6).map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-3 py-1 text-xs"
            >
              <span className="material-icons text-sm text-primary">{f.icon}</span>
              {f.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
        <button
          type="button"
          onClick={() => void finish()}
          data-testid="onboarding-done-go-dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          Take me to my dashboard
          <span className="material-icons text-base">east</span>
        </button>
      </div>
    </div>
  );
}
