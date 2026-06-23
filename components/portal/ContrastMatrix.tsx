'use client';

import { useMemo } from 'react';
import { analyzeContrast, defaultContrastPairs, type ContrastGrade } from '@/lib/branding/contrast';

interface ContrastMatrixProps {
  branding: {
    primaryColor?: string;
    textColor?: string;
    backgroundColor?: string;
    navBackground?: string;
    navTextColor?: string;
    linkColor?: string;
    buttonStyle?: { primaryBg?: string; primaryText?: string } | null;
  };
}

const GRADE_STYLES: Record<ContrastGrade, { label: string; bg: string; fg: string; title: string }> = {
  AAA: { label: 'AAA', bg: 'bg-emerald-100', fg: 'text-emerald-800', title: 'Passes WCAG AAA (ratio ≥ 7.0)' },
  AA: { label: 'AA', bg: 'bg-green-100', fg: 'text-green-800', title: 'Passes WCAG AA (ratio ≥ 4.5)' },
  'AA-large': { label: 'AA large', bg: 'bg-yellow-100', fg: 'text-yellow-800', title: 'Only passes AA for large text (ratio ≥ 3.0)' },
  fail: { label: 'Fail', bg: 'bg-red-100', fg: 'text-red-800', title: 'Does not meet WCAG AA (ratio < 3.0)' },
};

export function ContrastMatrix({ branding }: ContrastMatrixProps) {
  const rows = useMemo(() => {
    return defaultContrastPairs(branding).map((p) => ({
      ...p,
      result: analyzeContrast(p.fg, p.bg),
    }));
  }, [branding]);

  return (
    <div className="space-y-2" data-testid="contrast-matrix">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Accessibility — WCAG Contrast
        </h4>
        <a
          href="https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          WCAG reference →
        </a>
      </div>
      <div className="overflow-hidden rounded border border-border divide-y divide-border">
        {rows.map((row) => {
          const styles = GRADE_STYLES[row.result.normalText];
          const canPreview = row.fg && row.bg;
          return (
            <div
              key={row.id}
              className="flex items-center gap-3 px-3 py-2 text-xs bg-background"
              data-pair-id={row.id}
              data-grade={row.result.normalText}
              data-ratio={row.result.ratio.toFixed(2)}
            >
              <div
                className="w-16 h-8 rounded border border-border flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                style={{
                  backgroundColor: row.bg || '#f3f4f6',
                  color: row.fg || '#9ca3af',
                }}
              >
                {canPreview ? 'Aa' : '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">{row.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">{row.context}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`inline-block px-2 py-0.5 rounded font-medium ${styles.bg} ${styles.fg}`} title={styles.title}>
                  {styles.label}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {row.result.ratio > 0 ? `${row.result.ratio.toFixed(2)}:1` : '—'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">AA</strong> = 4.5:1 for body text, <strong className="text-foreground">AAA</strong> = 7.0:1.
        Large text (≥24px, or ≥19px bold) only needs 3.0:1 for AA.
      </p>
    </div>
  );
}
