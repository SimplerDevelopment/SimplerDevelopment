'use client';

import { motion } from 'framer-motion';
import type { StepProps } from './types';
import { obPrimaryBtn, obChip, obChipOn } from '../ob-styles';

export function StepWelcome({ state, next }: StepProps) {
  const firstName = state.prefill.name.split(' ')[0] || 'there';
  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'backOut' }}
        className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-foreground text-background"
      >
        <span className="material-icons" style={{ fontSize: 44 }}>waving_hand</span>
      </motion.div>
      <h2 className="text-xl sm:text-2xl font-semibold">Hey {firstName}, welcome aboard.</h2>
      <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
        We&apos;ll ask a handful of quick questions to tailor the platform — your brand, the tools you care about,
        and how to connect Claude. About 2 minutes, then you&apos;re free to explore.
      </p>

      <ul className="mt-8 mx-auto max-w-md text-left space-y-3">
        {[
          { icon: 'palette', label: 'Drop in your brand vibe' },
          { icon: 'checklist', label: 'Pick what you want to use' },
          { icon: 'auto_awesome', label: 'Hook up Claude in one click' },
        ].map((row, i) => (
          <motion.li
            key={row.icon}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className={`${obChip} ${obChipOn}`}>
              <span className="material-icons text-lg">{row.icon}</span>
            </span>
            <span className="text-sm font-medium">{row.label}</span>
          </motion.li>
        ))}
      </ul>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => next()}
          data-testid="onboarding-welcome-start"
          className={obPrimaryBtn}
        >
          Let&apos;s go
          <span className="material-icons text-base transition group-hover:translate-x-0.5">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
