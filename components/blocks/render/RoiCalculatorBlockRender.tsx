'use client';

import { useState } from 'react';
import { RoiCalculatorBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { resolveBrandSentinel } from '@/lib/branding/sentinel';

interface RoiCalculatorBlockRenderProps {
  block: RoiCalculatorBlock;
}

function formatCurrency(n: number): string {
  if (!isFinite(n)) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

export function RoiCalculatorBlockRender({ block }: RoiCalculatorBlockRenderProps) {
  // ── Config with sensible defaults (defaults land near a 100-clinician agency) ──
  const unitLabel = block.unitLabel ?? 'FTE clinicians completing SOC';
  const unitMin = block.unitMin ?? 10;
  const unitMax = block.unitMax ?? 1000;
  const unitStep = block.unitStep ?? 10;
  const unitDefault = block.unitDefault ?? 100;

  const minutesLabel = block.minutesLabel ?? 'Minutes saved per visit';
  const minutesMin = block.minutesMin ?? 15;
  const minutesMax = block.minutesMax ?? 90;
  const minutesStep = block.minutesStep ?? 5;
  const minutesDefault = block.minutesDefault ?? 45;

  const visitsPerUnitPerWeek = block.visitsPerUnitPerWeek ?? 25;
  const weeksPerYear = block.weeksPerYear ?? 46;
  const captureRate = block.captureRate ?? 0.06;
  const hoursPerAdmission = block.hoursPerAdmission ?? 5;
  const revenuePerAdmission = block.revenuePerAdmission ?? 2500;

  const accent = resolveBrandSentinel(block.accentColor) || block.accentColor || 'var(--brand-accent, #2563eb)';

  const [units, setUnits] = useState(unitDefault);
  const [minutes, setMinutes] = useState(minutesDefault);

  // ── Transparent model ──────────────────────────────────────────────
  const savedHoursPerYear = units * visitsPerUnitPerWeek * (minutes / 60) * weeksPerYear;
  const capacityHours = savedHoursPerYear * captureRate;
  const additionalAdmissions = capacityHours / hoursPerAdmission;
  const additionalRevenue = additionalAdmissions * revenuePerAdmission;
  const revenuePerUnit = units > 0 ? additionalRevenue / units : 0;

  const results = [
    { value: formatCurrency(additionalRevenue), label: 'Additional revenue potential per year', primary: true },
    { value: `+${formatNumber(additionalAdmissions)}`, label: 'Additional admissions per year' },
    { value: formatNumber(capacityHours), label: 'Clinician hours added to capacity' },
    { value: formatCurrency(revenuePerUnit), label: 'Revenue potential per clinician per year' },
  ];

  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility,
        block.responsive.fontSize
      )
    : '';

  const sliderStyle = { accentColor: accent } as React.CSSProperties;

  return (
    <div className={responsiveClasses}>
      {block.title && (
        <h2
          data-editable-field="title"
          className="text-3xl md:text-4xl font-bold text-center mb-3"
          style={getElementCSS(block.elementStyles, 'title')}
          dangerouslySetInnerHTML={{ __html: block.title }}
        />
      )}
      {block.description && (
        <p
          data-editable-field="description"
          className="text-center text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-10"
          style={getElementCSS(block.elementStyles, 'description')}
          dangerouslySetInnerHTML={{ __html: block.description }}
        />
      )}

      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 rounded-2xl"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          boxShadow: '0 20px 60px rgba(15,23,42,0.08)',
          padding: '32px',
          ...getElementCSS(block.elementStyles, 'card'),
        }}
      >
        {/* ── Inputs ──────────────────────────────────────────── */}
        <div>
          <div className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: accent }}>
            Your Agency
          </div>

          <label className="block mb-7">
            <span className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-medium text-slate-600">{unitLabel}</span>
              <span className="text-xl font-bold" style={{ color: accent }}>{formatNumber(units)}</span>
            </span>
            <input
              type="range"
              min={unitMin}
              max={unitMax}
              step={unitStep}
              value={units}
              onChange={(e) => setUnits(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={sliderStyle}
              aria-label={unitLabel}
            />
          </label>

          <label className="block mb-2">
            <span className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-medium text-slate-600">{minutesLabel}</span>
              <span className="text-xl font-bold" style={{ color: accent }}>{minutes} min</span>
            </span>
            <input
              type="range"
              min={minutesMin}
              max={minutesMax}
              step={minutesStep}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={sliderStyle}
              aria-label={minutesLabel}
            />
          </label>

          <p className="text-xs text-slate-400 mt-6 leading-relaxed">
            Assumes ~{visitsPerUnitPerWeek} visits/clinician/week across {weeksPerYear} working weeks, with{' '}
            {Math.round(captureRate * 100)}% of recovered time reinvested as new admissions
            (~{hoursPerAdmission} hrs each at {formatCurrency(revenuePerAdmission)} revenue per admission).
          </p>
        </div>

        {/* ── Results ─────────────────────────────────────────── */}
        <div>
          <div className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: accent }}>
            Your ROI
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {results.map((r, i) => (
              <div
                key={i}
                className="rounded-xl p-5"
                style={
                  r.primary
                    ? { background: accent, color: '#FFFFFF' }
                    : { background: '#F7F9FC', border: '1px solid #EEF2F7' }
                }
              >
                <div
                  className="text-2xl md:text-3xl font-extrabold tracking-tight"
                  style={{ color: r.primary ? '#FFFFFF' : accent }}
                >
                  {r.value}
                </div>
                <div
                  className="text-sm mt-1 leading-snug"
                  style={{ color: r.primary ? 'rgba(255,255,255,0.85)' : '#64748B' }}
                >
                  {r.label}
                </div>
              </div>
            ))}
          </div>

          {block.ctaText && block.ctaLink && (
            <a
              href={block.ctaLink}
              target={block.ctaNewTab ? '_blank' : undefined}
              rel={block.ctaNewTab ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center justify-center gap-2 mt-7 px-7 py-3 rounded-lg font-semibold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: accent }}
            >
              {block.ctaText}
              <span className="material-icons" style={{ fontSize: '1.1em' }}>arrow_forward</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
