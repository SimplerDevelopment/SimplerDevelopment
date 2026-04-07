'use client';

import type { PitchDeckTheme, PitchDeckDecisionOption } from '@/lib/db/schema';

interface Props {
  title: string;
  options: PitchDeckDecisionOption[];
  theme: PitchDeckTheme;
  onChoose: (pathGroup: string) => void;
}

/**
 * Full-screen decision point that blocks navigation until the viewer picks a path.
 * Renders each option as a large clickable card.
 */
export function DecisionSlideRenderer({ title, options, theme, onChoose }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8">
      <div className="w-full max-w-3xl space-y-10">
        {/* Title */}
        <div className="text-center">
          <h2
            className="text-3xl md:text-4xl font-bold"
            style={{ fontFamily: theme.headingFont, color: theme.textColor }}
          >
            {title}
          </h2>
        </div>

        {/* Options grid */}
        <div className={`grid gap-4 ${options.length === 2 ? 'grid-cols-1 md:grid-cols-2' : options.length === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChoose(opt.pathGroup)}
              className="group text-left p-6 md:p-8 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                borderColor: `${theme.textColor}15`,
                backgroundColor: `${theme.textColor}05`,
                fontFamily: theme.bodyFont,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.accentColor;
                e.currentTarget.style.backgroundColor = `${theme.accentColor}10`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${theme.textColor}15`;
                e.currentTarget.style.backgroundColor = `${theme.textColor}05`;
              }}
            >
              {opt.icon && (
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${theme.accentColor}15` }}
                >
                  <span className="material-icons text-2xl" style={{ color: theme.accentColor }}>
                    {opt.icon}
                  </span>
                </div>
              )}
              <h3
                className="text-xl font-semibold mb-2"
                style={{ fontFamily: theme.headingFont, color: theme.textColor }}
              >
                {opt.label}
              </h3>
              {opt.description && (
                <p className="text-sm opacity-50" style={{ color: theme.textColor }}>
                  {opt.description}
                </p>
              )}
              <div className="flex items-center gap-1 mt-4 text-sm font-medium opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: theme.accentColor }}>
                <span>Continue</span>
                <span className="material-icons text-base">arrow_forward</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
