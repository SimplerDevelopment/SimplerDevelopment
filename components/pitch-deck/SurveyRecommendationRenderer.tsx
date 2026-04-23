'use client';

import type {
  PitchDeckTheme,
  SurveyRecommendationConfig,
  SurveyRecommendationOffering,
} from '@/lib/db/schema';

interface Props {
  config: SurveyRecommendationConfig;
  answers: Record<string, unknown>;
  theme: PitchDeckTheme;
}

interface Computed {
  primary: SurveyRecommendationOffering | null;
  secondary: SurveyRecommendationOffering | null;
  alsoAlso: SurveyRecommendationOffering | null;
  cleanSweep: boolean;
  hybrid: SurveyRecommendationConfig['hybrid'] | null;
  hybridOfferings: SurveyRecommendationOffering[];
  narrative: string;
}

function findOffering(config: SurveyRecommendationConfig, key: string | null | undefined) {
  if (!key) return null;
  return config.offerings.find((o) => o.key === key) ?? null;
}

function compute(config: SurveyRecommendationConfig, answers: Record<string, unknown>): Computed {
  // Hybrid check first — explicit rule short-circuits the vote logic.
  if (config.hybrid) {
    const matchedAll = Object.entries(config.hybrid.whenAnswers).every(
      ([fieldId, expected]) => answers[fieldId] === expected,
    );
    if (matchedAll) {
      const hybridOfferings = config.hybrid.offeringKeys
        .map((k) => findOffering(config, k))
        .filter((o): o is SurveyRecommendationOffering => o !== null);
      const names = hybridOfferings.map((o) => o.name);
      const joined = names.length === 2 ? `${names[0]} and ${names[1]}` : names.join(', ');
      return {
        primary: null,
        secondary: null,
        alsoAlso: null,
        cleanSweep: false,
        hybrid: config.hybrid,
        hybridOfferings,
        narrative: `Two of these fit together for you — **${joined}**, in sequence.`,
      };
    }
  }

  // Vote tally per offering key.
  const votes: Record<string, number> = {};
  for (const q of config.questions) {
    const ans = answers[q.fieldId];
    if (typeof ans !== 'string') continue;
    const offeringKey = q.optionToOffering[ans];
    if (!offeringKey) continue;
    votes[offeringKey] = (votes[offeringKey] ?? 0) + 1;
  }

  let primaryKey: string | null = null;
  let max = 0;
  for (const [k, v] of Object.entries(votes)) {
    if (v > max) {
      max = v;
      primaryKey = k;
    }
  }

  // Apply overrides — first match wins.
  if (config.overrides) {
    for (const rule of config.overrides) {
      const matches = rule.whenAnyAnswer.some(({ fieldId, values }) => {
        const ans = answers[fieldId];
        return typeof ans === 'string' && values.includes(ans);
      });
      if (matches) {
        primaryKey = rule.forceOfferingKey;
        break;
      }
    }
  }

  // Secondary = next-highest non-primary, only if not a clean sweep.
  let secondaryKey: string | null = null;
  let secondaryVotes = 0;
  for (const [k, v] of Object.entries(votes)) {
    if (k === primaryKey) continue;
    if (v > secondaryVotes) {
      secondaryVotes = v;
      secondaryKey = k;
    }
  }
  const cleanSweep = max === config.questions.length;
  if (cleanSweep) secondaryKey = null;

  // Always-also bottom card — suppressed if it's already primary or secondary.
  let alsoAlsoKey = config.alwaysAlsoOfferingKey ?? null;
  if (alsoAlsoKey && (alsoAlsoKey === primaryKey || alsoAlsoKey === secondaryKey)) {
    alsoAlsoKey = null;
  }

  const primary = findOffering(config, primaryKey);
  const secondary = findOffering(config, secondaryKey);
  const alsoAlso = findOffering(config, alsoAlsoKey);

  // Build narrative from per-question context phrases.
  let narrative = config.narrativeTemplate ?? "Based on what you shared, **{{primary}}** is the right starting point.";
  for (const q of config.questions) {
    const ans = answers[q.fieldId];
    const phrase = typeof ans === 'string' ? q.context?.[ans] ?? '' : '';
    narrative = narrative.replaceAll(`{{${q.fieldId}Context}}`, phrase);
  }
  narrative = narrative.replaceAll('{{primary}}', primary?.name ?? '');
  // Re-capitalize sentence starts after interpolated lowercase phrases.
  narrative = narrative.replace(/(^|[.!?]\s+)([a-z])/g, (_m, lead, ch) => lead + ch.toUpperCase());

  return {
    primary,
    secondary,
    alsoAlso,
    cleanSweep,
    hybrid: null,
    hybridOfferings: [],
    narrative,
  };
}

function renderNarrative(text: string, theme: PitchDeckTheme) {
  // Tiny markdown-ish: **x** → bold accent
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={i} style={{ color: theme.primaryColor }}>
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function SurveyRecommendationRenderer({ config, answers, theme }: Props) {
  const result = compute(config, answers);

  const accent = theme.accentColor || '#C46A3D';
  const primaryColor = theme.primaryColor || '#005652';
  const textColor = theme.textColor || '#171615';
  const bodyFont = theme.bodyFont || 'Roboto';
  const headingFont = theme.headingFont || bodyFont;

  const eyebrow = config.eyebrow || "Here's where this lands";

  return (
    <div
      className="flex flex-col items-center min-h-screen px-6 py-12 overflow-y-auto"
      style={{ fontFamily: bodyFont, color: textColor }}
    >
      <div className="w-full max-w-[680px]">
        <div
          style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: theme.primaryColor,
            opacity: 0.7,
            marginBottom: 14,
          }}
        >
          {eyebrow}
        </div>

        <p
          style={{
            fontFamily: headingFont,
            fontSize: '1.0625rem',
            lineHeight: 1.65,
            color: textColor,
            marginBottom: 24,
          }}
        >
          {renderNarrative(result.narrative, theme)}
        </p>

        {/* Hybrid path */}
        {result.hybrid && (
          <div
            style={{
              backgroundColor: primaryColor,
              borderRadius: 14,
              padding: '24px 26px',
              color: '#fff',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                padding: '5px 12px',
                borderRadius: 20,
                marginBottom: 14,
              }}
            >
              Two offerings, one sequence
            </div>
            <h3
              style={{
                fontFamily: headingFont,
                fontSize: '1.625rem',
                fontWeight: 700,
                lineHeight: 1.2,
                margin: 0,
                color: '#fff',
              }}
            >
              {result.hybrid.title}
            </h3>
            <div style={{ width: 36, height: 3, background: accent, borderRadius: 2, margin: '12px 0 14px' }} />
            <p
              style={{
                fontSize: '0.9375rem',
                lineHeight: 1.7,
                color: 'rgba(255,255,255,0.9)',
                marginBottom: 18,
              }}
            >
              {result.hybrid.body}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {result.hybridOfferings.map((o) => (
                <div
                  key={o.key}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    borderLeft: `4px solid ${accent}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#fff' }}>{o.name}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                      {o.duration}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff' }}>{o.price}</div>
                </div>
              ))}
            </div>
            <BookButton url={config.bookUrl} variant="onPrimary" theme={theme} />
          </div>
        )}

        {/* Primary card */}
        {result.primary && (
          <div
            style={{
              backgroundColor: primaryColor,
              borderRadius: 14,
              padding: '24px 26px',
              color: '#fff',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.7)',
                marginBottom: 6,
              }}
            >
              Best fit
            </div>
            <h3
              style={{
                fontFamily: headingFont,
                fontSize: '1.5rem',
                fontWeight: 700,
                lineHeight: 1.2,
                margin: 0,
                color: '#fff',
              }}
            >
              {result.primary.name}
            </h3>
            <div style={{ width: 36, height: 3, background: accent, borderRadius: 2, margin: '10px 0 12px' }} />
            <p
              style={{
                fontSize: '0.875rem',
                lineHeight: 1.65,
                color: 'rgba(255,255,255,0.9)',
                marginBottom: 14,
              }}
            >
              {result.primary.tagline}
            </p>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
              <div
                style={{
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.7)',
                  marginBottom: 4,
                }}
              >
                You get
              </div>
              <div style={{ fontSize: '0.875rem', color: '#fff', lineHeight: 1.6 }}>{result.primary.youGet}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{result.primary.price}</span>
              <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.7)' }}>{result.primary.duration}</span>
            </div>
            <BookButton url={config.bookUrl} variant="onPrimary" theme={theme} />
          </div>
        )}

        {/* Secondary alt card */}
        {result.secondary && (
          <div
            style={{
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.08)',
              borderLeft: `4px solid ${theme.primaryColor}66`,
              borderRadius: 10,
              padding: '18px 20px',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: `${theme.primaryColor}AA`,
                marginBottom: 5,
              }}
            >
              Also came up
            </div>
            <h4 style={{ fontFamily: headingFont, fontSize: '1.0625rem', fontWeight: 700, color: textColor, margin: '0 0 6px' }}>
              {result.secondary.name}
            </h4>
            <p style={{ fontSize: '0.8125rem', color: '#5a6b69', lineHeight: 1.6, margin: '0 0 8px' }}>
              {result.secondary.tagline}
            </p>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: theme.primaryColor }}>
              {result.secondary.price} / {result.secondary.duration}
            </div>
          </div>
        )}

        {/* Always-also (e.g. advisory) */}
        {result.alsoAlso && (
          <div
            style={{
              background: '#E2EDEA',
              border: '1px solid rgba(0,0,0,0.08)',
              borderLeft: `4px solid ${theme.primaryColor}`,
              borderRadius: 10,
              padding: '18px 20px',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: theme.primaryColor,
                marginBottom: 5,
              }}
            >
              Also worth considering
            </div>
            <h4 style={{ fontFamily: headingFont, fontSize: '1.0625rem', fontWeight: 700, color: textColor, margin: '0 0 6px' }}>
              {result.alsoAlso.name}
            </h4>
            <p style={{ fontSize: '0.8125rem', color: '#3e5553', lineHeight: 1.6, margin: 0 }}>
              {result.alsoAlso.tagline}
            </p>
          </div>
        )}

        {/* Closing line */}
        <p style={{ fontSize: '0.875rem', color: '#4a5c5a', lineHeight: 1.65, marginTop: 8 }}>
          {result.cleanSweep
            ? 'Your answers were consistent across the board. If the fit feels right, booking a call is the right next step.'
            : "It's okay if more than one of these resonated. Book a call and let me know what stood out — I'll help figure out the right first move."}
        </p>
      </div>
    </div>
  );
}

function BookButton({
  url,
  variant,
  theme,
}: {
  url: string;
  variant: 'onPrimary' | 'standalone';
  theme: PitchDeckTheme;
}) {
  const isOnPrimary = variant === 'onPrimary';
  const bg = isOnPrimary ? '#fff' : theme.primaryColor;
  const fg = isOnPrimary ? theme.primaryColor : '#fff';
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderRadius: 10,
        background: bg,
        color: fg,
        textDecoration: 'none',
        fontFamily: theme.bodyFont || 'Roboto',
        width: '100%',
      }}
    >
      <span>
        <span
          style={{
            display: 'block',
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            opacity: 0.7,
            marginBottom: 2,
          }}
        >
          Ready to talk
        </span>
        <span style={{ fontSize: '0.9375rem', fontWeight: 700 }}>Book a 30-minute call</span>
      </span>
      <span style={{ fontSize: '1.125rem' }}>→</span>
    </a>
  );
}
