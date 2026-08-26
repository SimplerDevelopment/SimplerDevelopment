'use client';

// Settings panel for the `RoiCalculatorBlock` block type, extracted from
// the SectionsPanel monolith (same pattern as NavigationSettings.tsx).
// Every field on types/blocks/components.ts's RoiCalculatorBlock is
// author-configurable here so the block stays universal across service
// businesses rather than hardcoding one client's assumptions (PUX-117).
//
// Labels use htmlFor/id (unlike NavigationSettings.tsx's plain sibling
// <label>) so each field is accessibly associated and test-queryable via
// getByLabelText — this panel has many same-named "Default/Min/Max/Step"
// labels repeated across the two sliders, which would otherwise be
// ambiguous without a stable id per field.
import type { RoiCalculatorBlock } from '@/types/blocks';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

export function RoiCalculatorBlockSettings({ block, onChange }: { block: RoiCalculatorBlock; onChange: (updates: Partial<RoiCalculatorBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="roi-title" className="block text-sm font-medium text-foreground mb-1">Title</label>
        <input
          id="roi-title"
          type="text"
          value={block.title || ''}
          onChange={(e) => onChange({ title: e.target.value || undefined })}
          className={inputClass}
          placeholder="Calculate Your ROI"
        />
      </div>
      <div>
        <label htmlFor="roi-description" className="block text-sm font-medium text-foreground mb-1">Description</label>
        <input
          id="roi-description"
          type="text"
          value={block.description || ''}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          className={inputClass}
          placeholder="See how much time and revenue you can recover."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
        <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          Primary Slider
          <span className="block text-xs font-normal text-muted-foreground mt-0.5">e.g. clinicians, reps, technicians completing the workflow.</span>
        </label>
        <div>
          <label htmlFor="roi-unit-label" className="block text-sm font-medium text-foreground mb-1">Label</label>
          <input
            id="roi-unit-label"
            type="text"
            value={block.unitLabel || ''}
            onChange={(e) => onChange({ unitLabel: e.target.value || undefined })}
            className={inputClass}
            placeholder="FTE clinicians completing SOC"
          />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label htmlFor="roi-unit-default" className="block text-sm font-medium text-foreground mb-1">Default</label>
            <input id="roi-unit-default" type="number" value={block.unitDefault ?? 100} onChange={(e) => onChange({ unitDefault: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-unit-min" className="block text-sm font-medium text-foreground mb-1">Min</label>
            <input id="roi-unit-min" type="number" value={block.unitMin ?? 10} onChange={(e) => onChange({ unitMin: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-unit-max" className="block text-sm font-medium text-foreground mb-1">Max</label>
            <input id="roi-unit-max" type="number" value={block.unitMax ?? 1000} onChange={(e) => onChange({ unitMax: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-unit-step" className="block text-sm font-medium text-foreground mb-1">Step</label>
            <input id="roi-unit-step" type="number" value={block.unitStep ?? 10} onChange={(e) => onChange({ unitStep: Number(e.target.value) })} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          Secondary Slider
          <span className="block text-xs font-normal text-muted-foreground mt-0.5">Minutes saved per visit.</span>
        </label>
        <div>
          <label htmlFor="roi-minutes-label" className="block text-sm font-medium text-foreground mb-1">Label</label>
          <input
            id="roi-minutes-label"
            type="text"
            value={block.minutesLabel || ''}
            onChange={(e) => onChange({ minutesLabel: e.target.value || undefined })}
            className={inputClass}
            placeholder="Minutes saved per visit"
          />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label htmlFor="roi-minutes-default" className="block text-sm font-medium text-foreground mb-1">Default</label>
            <input id="roi-minutes-default" type="number" value={block.minutesDefault ?? 45} onChange={(e) => onChange({ minutesDefault: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-minutes-min" className="block text-sm font-medium text-foreground mb-1">Min</label>
            <input id="roi-minutes-min" type="number" value={block.minutesMin ?? 15} onChange={(e) => onChange({ minutesMin: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-minutes-max" className="block text-sm font-medium text-foreground mb-1">Max</label>
            <input id="roi-minutes-max" type="number" value={block.minutesMax ?? 90} onChange={(e) => onChange({ minutesMax: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-minutes-step" className="block text-sm font-medium text-foreground mb-1">Step</label>
            <input id="roi-minutes-step" type="number" value={block.minutesStep ?? 5} onChange={(e) => onChange({ minutesStep: Number(e.target.value) })} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          Assumptions
          <span className="block text-xs font-normal text-muted-foreground mt-0.5">Tunable, transparent inputs driving the four live outputs.</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="roi-visits-per-unit-per-week" className="block text-sm font-medium text-foreground mb-1">Visits Per Unit / Week</label>
            <input id="roi-visits-per-unit-per-week" type="number" value={block.visitsPerUnitPerWeek ?? 25} onChange={(e) => onChange({ visitsPerUnitPerWeek: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-weeks-per-year" className="block text-sm font-medium text-foreground mb-1">Weeks Per Year</label>
            <input id="roi-weeks-per-year" type="number" value={block.weeksPerYear ?? 46} onChange={(e) => onChange({ weeksPerYear: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-capture-rate" className="block text-sm font-medium text-foreground mb-1">Capture Rate</label>
            <input id="roi-capture-rate" type="number" step={0.01} min={0} max={1} value={block.captureRate ?? 0.06} onChange={(e) => onChange({ captureRate: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-hours-per-admission" className="block text-sm font-medium text-foreground mb-1">Hours Per Admission</label>
            <input id="roi-hours-per-admission" type="number" value={block.hoursPerAdmission ?? 5} onChange={(e) => onChange({ hoursPerAdmission: Number(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="roi-revenue-per-admission" className="block text-sm font-medium text-foreground mb-1">Revenue Per Admission</label>
            <input id="roi-revenue-per-admission" type="number" value={block.revenuePerAdmission ?? 2500} onChange={(e) => onChange({ revenuePerAdmission: Number(e.target.value) })} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          CTA Button
          <span className="block text-xs font-normal text-muted-foreground mt-0.5">Optional — renders under the calculator results when both text and link are set.</span>
        </label>
        <div>
          <label htmlFor="roi-cta-text" className="block text-sm font-medium text-foreground mb-1">Text</label>
          <input id="roi-cta-text" type="text" value={block.ctaText || ''} onChange={(e) => onChange({ ctaText: e.target.value || undefined })} className={inputClass} placeholder="Get Started" />
        </div>
        <div>
          <label htmlFor="roi-cta-link" className="block text-sm font-medium text-foreground mb-1">Link</label>
          <input id="roi-cta-link" type="url" value={block.ctaLink || ''} onChange={(e) => onChange({ ctaLink: e.target.value || undefined })} className={inputClass} placeholder="https://..." />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={block.ctaNewTab ?? false}
            onChange={(e) => onChange({ ctaNewTab: e.target.checked || undefined })}
            className="h-4 w-4 rounded border-border text-primary"
          />
          Open in new tab
        </label>
      </div>
    </div>
  );
}
