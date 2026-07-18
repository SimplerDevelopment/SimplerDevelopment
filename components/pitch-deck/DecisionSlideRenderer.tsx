'use client';

import type {
  PitchDeckTheme,
  PitchDeckDecisionOption,
  PitchDeckDecisionCover,
} from '@/lib/db/schema';

interface Props {
  title: string;
  options: PitchDeckDecisionOption[];
  theme: PitchDeckTheme;
  onChoose: (pathGroup: string) => void;
  /** When set, renders the cover-style layout instead of the simple grid. */
  cover?: PitchDeckDecisionCover;
}

/**
 * Full-screen decision point that blocks navigation until the viewer picks a path.
 *
 * Three layouts, picked from `cover`:
 *  - centered (TF2 Qualifier v4 cover): single-column, off-white background,
 *    logo → rule → headline → body → stacked route buttons. Used when `cover`
 *    is set without an `image`.
 *  - two-column (TF1 v8 cover): wordmark/eyebrow on left, headshot on right,
 *    decision options as compact pills below the about block. Used when
 *    `cover.image` is set.
 *  - simple (default): centered title + option grid. Used when no `cover` is
 *    set at all.
 */
export function DecisionSlideRenderer({ title, options, theme, onChoose, cover }: Props) {
  if (cover && hasCoverContent(cover)) {
    if (cover.image) {
      return <TwoColumnCover title={title} options={options} theme={theme} onChoose={onChoose} cover={cover} />;
    }
    return <CenteredCover title={title} options={options} theme={theme} onChoose={onChoose} cover={cover} />;
  }
  return <SimpleLayout title={title} options={options} theme={theme} onChoose={onChoose} />;
}

function hasCoverContent(c: PitchDeckDecisionCover): boolean {
  return Boolean(
    c.logo || c.wordmark || c.eyebrow || c.headline || c.punchline ||
    c.intro || c.body || c.about || c.image
  );
}

function SimpleLayout({ title, options, theme, onChoose }: Omit<Props, 'cover'>) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8">
      <div className="w-full max-w-3xl space-y-10">
        <div className="text-center">
          <h2
            className="text-3xl md:text-4xl font-bold"
            style={{ fontFamily: theme.headingFont, color: theme.textColor }}
          >
            {title}
          </h2>
        </div>

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
              {opt.eyebrow && (
                <div
                  className="text-[10px] font-bold uppercase mb-1.5"
                  style={{ letterSpacing: 2, color: `${theme.accentColor}b3` }}
                >
                  {opt.eyebrow}
                </div>
              )}
              <h3
                className="text-base font-bold mb-2"
                style={{ fontFamily: theme.headingFont, color: theme.textColor, lineHeight: 1.2 }}
              >
                {opt.label}
              </h3>
              {opt.description && (
                <p className="text-xs opacity-60" style={{ color: theme.textColor, lineHeight: 1.5 }}>
                  {opt.description}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CoverProps {
  title: string;
  options: PitchDeckDecisionOption[];
  theme: PitchDeckTheme;
  onChoose: (pathGroup: string) => void;
  cover: PitchDeckDecisionCover;
}

/**
 * TF2 Qualifier v4-style centered cover: single column, off-white bg.
 *
 * Stack: logo → rust rule → headline → body → stacked route buttons.
 * Each button has a small uppercase "label" eyebrow (from `option.description`)
 * above a bold "title" (from `option.label`) and an arrow on the right.
 */
function CenteredCover({ options, theme, onChoose, cover }: CoverProps) {
  const bg = cover.backgroundColor ?? theme.backgroundColor;
  const fg = cover.textColor ?? theme.textColor;
  // `accent` colors the rule + logo tint (rust in CY).
  const accent = cover.accentColor ?? theme.accentColor;
  // `primary` colors the primary route button (dark teal in CY) and the
  // secondary button's hover/border. Falls back to theme primary so a deck
  // doesn't have to set it explicitly.
  const primary = theme.primaryColor;
  const muted = cover.mutedColor ?? `${fg}b3`;
  const headingFont = theme.headingFont;
  const bodyFont = theme.bodyFont;

  return (
    <div
      className="w-full"
      style={{
        backgroundColor: bg,
        color: fg,
        fontFamily: bodyFont,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px 72px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 680 }}>
        {cover.logo && (
          <CoverLogo src={cover.logo} color={fg} />
        )}

        <div
          style={{
            width: 40,
            height: 3,
            background: accent,
            borderRadius: 2,
            marginBottom: 24,
          }}
        />

        {cover.headline && (
          <h1
            style={{
              fontFamily: headingFont,
              fontSize: 34,
              fontWeight: 900,
              lineHeight: 1.1,
              color: fg,
              letterSpacing: '-0.5px',
              margin: '0 0 14px',
            }}
          >
            {cover.headline}
          </h1>
        )}

        {cover.body && (
          <div
            style={{
              fontSize: 16,
              color: muted,
              lineHeight: 1.7,
              marginBottom: 36,
              maxWidth: 540,
              whiteSpace: 'pre-line',
            }}
          >
            {cover.body}
          </div>
        )}

        {options.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {options.map((opt, idx) => (
              <RouteButton
                key={opt.id}
                option={opt}
                primary={idx === 0}
                fg={fg}
                muted={muted}
                primaryColor={primary}
                bg={bg}
                headingFont={headingFont}
                onClick={() => onChoose(opt.pathGroup)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface RouteButtonProps {
  option: PitchDeckDecisionOption;
  primary: boolean;
  fg: string;
  muted: string;
  primaryColor: string;
  bg: string;
  headingFont: string;
  onClick: () => void;
}

/**
 * Full-width route button matching the TF2 Qualifier welcome screen:
 *  - primary: dark-teal bg, off-white text
 *  - secondary: white bg, dark text, soft teal border
 *  - small uppercase "rb-label" eyebrow above bold "rb-title"
 *  - arrow on the right
 *
 * Both buttons share the same uppercase eyebrow color (soft-teal in TF2),
 * which we approximate as a 60% mix of primaryColor.
 */
function RouteButton({
  option,
  primary,
  fg,
  muted,
  primaryColor,
  bg,
  headingFont,
  onClick,
}: RouteButtonProps) {
  // 26 hex = ~15% opacity for the secondary border, matching TF2's
  // rgba(0,86,82,0.15) wash.
  const baseBg = primary ? primaryColor : '#fff';
  const baseBorder = primary ? primaryColor : `${primaryColor}26`;
  const titleColor = primary ? bg : fg;
  // Soft-teal eyebrow on both buttons (TF2 uses --soft-teal for both
  // primary.rb-label and secondary.rb-label).
  const labelColor = primary ? `${bg}b3` : muted;
  const arrowColor = primary ? `${bg}b3` : muted;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        borderRadius: 12,
        border: primary ? 'none' : `2px solid ${baseBorder}`,
        background: baseBg,
        cursor: 'pointer',
        fontFamily: headingFont,
        textAlign: 'left',
        textDecoration: 'none',
        width: '100%',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (primary) {
          e.currentTarget.style.opacity = '0.88';
        } else {
          e.currentTarget.style.borderColor = primaryColor;
        }
        e.currentTarget.style.transform = 'translateX(3px)';
      }}
      onMouseLeave={(e) => {
        if (primary) {
          e.currentTarget.style.opacity = '1';
        } else {
          e.currentTarget.style.borderColor = baseBorder;
        }
        e.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      <div>
        {option.description && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: labelColor,
              marginBottom: 3,
            }}
          >
            {option.description}
          </div>
        )}
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.2,
            color: titleColor,
          }}
        >
          {option.label}
        </div>
      </div>
      <span
        style={{
          fontSize: 18,
          flexShrink: 0,
          marginLeft: 16,
          opacity: 0.7,
          color: titleColor,
        }}
      >
        →
      </span>
    </button>
  );
}

/**
 * Logo renderer — accepts either a URL (http(s)://, data:, or absolute path)
 * or a raw inline SVG markup string. Inline SVGs let the logo inherit
 * `currentColor` for fill, which the centered cover uses to tint the mark.
 */
function CoverLogo({ src, color }: { src: string; color: string }) {
  const isInlineSvg = src.trim().startsWith('<svg');
  if (isInlineSvg) {
    // Force the inline SVG to render at 260px wide so the cover slide
    // matches the TF2 welcome screen's `.welcome-logo { width: 260px }`.
    // Inline SVGs without an explicit `width` attribute expand to their
    // intrinsic size, which can be larger than the viewBox suggests.
    const constrained = src.replace(
      /<svg(\s+[^>]*?)?>/i,
      (match, attrs) => {
        const cleaned = (attrs || '')
          .replace(/\s+width="[^"]*"/i, '')
          .replace(/\s+height="[^"]*"/i, '');
        return `<svg${cleaned} width="260" height="auto" style="display:block;">`;
      },
    );
    return (
      <div
        style={{
          width: 260,
          marginBottom: 28,
          color, // currentColor fallback for fill
          display: 'block',
        }}
        dangerouslySetInnerHTML={{ __html: constrained }}
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={{ width: 260, height: 'auto', marginBottom: 28, display: 'block' }}
    />
  );
}

/**
 * TF1 v8-style two-column cover: logo/wordmark + eyebrow + headline + light
 * punchline + rule + intro + body + about on the left, headshot card on the
 * right, decision options as compact horizontal pills below the about block.
 */
function TwoColumnCover({ title, options, theme, onChoose, cover }: CoverProps) {
  const bg = cover.backgroundColor ?? theme.backgroundColor;
  const fg = cover.textColor ?? theme.textColor;
  const accent = cover.accentColor ?? theme.accentColor;
  const muted = cover.mutedColor ?? `${fg}b3`;
  const soft = cover.softColor ?? muted;
  const headingFont = theme.headingFont;
  const bodyFont = theme.bodyFont;

  const aboutParas = cover.about ? splitParagraphs(cover.about) : [];

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center"
      style={{
        backgroundColor: bg,
        color: fg,
        fontFamily: bodyFont,
        padding: '52px 80px 92px',
      }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: 1020,
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          gap: 52,
          alignItems: 'center',
        }}
      >
        <div>
          {cover.logo && <CoverLogo src={cover.logo} color={fg} />}

          {cover.wordmark && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 4,
                textTransform: 'uppercase',
                marginBottom: 28,
                color: muted,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
              {cover.wordmark}
            </div>
          )}

          {cover.eyebrow && (
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14, color: muted }}>
              {cover.eyebrow}
            </div>
          )}

          {cover.headline && (
            <h1 style={{ fontFamily: headingFont, fontSize: 40, fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.5px', color: fg, margin: '0 0 6px' }}>
              {cover.headline}
            </h1>
          )}

          {cover.punchline && (
            <h2 style={{ fontFamily: headingFont, fontSize: 40, fontWeight: 300, lineHeight: 1.08, letterSpacing: '-0.5px', color: soft, margin: '0 0 20px' }}>
              {cover.punchline}
            </h2>
          )}

          <div style={{ width: 44, height: 3, background: accent, borderRadius: 2, margin: '20px 0 16px' }} />

          {cover.intro && (
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: muted, marginBottom: 12 }}>
              {cover.intro}
            </div>
          )}

          {cover.body && (
            <div style={{ fontSize: 16, fontWeight: 400, color: soft, lineHeight: 1.65, maxWidth: 460, marginBottom: 20, whiteSpace: 'pre-line' }}>
              {cover.body}
            </div>
          )}

          {aboutParas.length > 0 && (
            <div style={{ fontSize: 14, color: muted, lineHeight: 1.8, maxWidth: 460, borderTop: `1px solid ${fg}1a`, paddingTop: 18, marginTop: 4 }}>
              {aboutParas.map((p, i) => (
                <p key={i} style={{ marginBottom: i < aboutParas.length - 1 ? 8 : 0 }}>{p}</p>
              ))}
            </div>
          )}

          {options.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 560, marginTop: 14 }}>
              {options.map((opt, idx) => (
                <CoverOptionPill
                  key={opt.id}
                  option={opt}
                  primary={idx === 0}
                  fg={fg}
                  muted={muted}
                  accent={accent}
                  headingFont={headingFont}
                  onClick={() => onChoose(opt.pathGroup)}
                />
              ))}
            </div>
          )}
        </div>

        {cover.image && (
          <div style={{ position: 'relative' }}>
            <div style={{ width: 280, height: 348, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.45)', margin: '0 auto' }}>
              <img src={cover.image} alt={cover.imageAlt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CoverOptionPillProps {
  option: PitchDeckDecisionOption;
  primary: boolean;
  fg: string;
  muted: string;
  accent: string;
  headingFont: string;
  onClick: () => void;
}

function CoverOptionPill({ option, primary, fg, muted, accent, headingFont, onClick }: CoverOptionPillProps) {
  const baseBg = primary ? accent : 'transparent';
  const baseBorder = primary ? accent : `${fg}40`;
  const titleColor = primary ? '#fff' : fg;
  const arrowColor = primary ? 'rgba(255,255,255,0.85)' : muted;

  return (
    <button
      type="button"
      onClick={onClick}
      title={option.description}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 999,
        border: `1.5px solid ${baseBorder}`,
        background: baseBg,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: headingFont,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.4,
        color: titleColor,
        lineHeight: 1.2,
        transition: 'opacity 0.2s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.9';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {option.icon && (
        <span className="material-icons" style={{ fontSize: 16, color: titleColor, opacity: 0.9, flexShrink: 0 }}>
          {option.icon}
        </span>
      )}
      <span>{option.label}</span>
      <span className="material-icons" style={{ fontSize: 14, color: arrowColor, flexShrink: 0 }}>
        arrow_forward
      </span>
    </button>
  );
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}
