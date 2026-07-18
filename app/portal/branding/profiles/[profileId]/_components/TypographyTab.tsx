// Typography tab: default heading/body fonts plus per-element font/size/weight/spacing controls.

'use client';

import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import {
  DEFAULT_TYPOGRAPHY,
  ELEMENT_LABELS,
  INPUT_CLASS,
  LABEL_CLASS,
  WEIGHT_OPTIONS,
  type ElementTypography,
  type ProfileData,
} from '../_lib/types';

interface Props {
  profile: ProfileData;
  update: (updates: Partial<ProfileData>) => void;
  updateTypo: (el: string, updates: Partial<ElementTypography>) => void;
}

export function TypographyTab({ profile, update, updateTypo }: Props) {
  const getTypo = (el: string): ElementTypography => ({
    ...DEFAULT_TYPOGRAPHY[el],
    ...(profile?.typography?.[el] || {}),
  });

  const resolveFont = (el: string): string => {
    const t = getTypo(el);
    if (t.font) return t.font;
    const info = ELEMENT_LABELS[el];
    if (info?.category === 'heading') return profile.headingFont || '';
    return profile.bodyFont || '';
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
        <span className="material-icons text-base">text_fields</span>
        Typography
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Set default fonts for headings and body, then fine-tune each element.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div>
          <label className={LABEL_CLASS}>Default Heading Font</label>
          <p className="text-[11px] text-muted-foreground mb-2">Applied to H1-H6 unless overridden below.</p>
          <GoogleFontPicker
            value={profile.headingFont}
            onChange={(font) => update({ headingFont: font })}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Default Body Font</label>
          <p className="text-[11px] text-muted-foreground mb-2">Applied to paragraphs, blockquotes, captions.</p>
          <GoogleFontPicker value={profile.bodyFont} onChange={(font) => update({ bodyFont: font })} />
        </div>
      </div>

      {(['heading', 'body', 'ui'] as const).map((category) => (
        <div key={category} className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 capitalize flex items-center gap-2">
            <span className="material-icons text-sm">
              {category === 'heading' ? 'title' : category === 'body' ? 'notes' : 'smart_button'}
            </span>
            {category === 'heading' ? 'Headings' : category === 'body' ? 'Body Text' : 'UI Elements'}
          </h3>
          <div className="space-y-3">
            {Object.entries(ELEMENT_LABELS)
              .filter(([, info]) => info.category === category)
              .map(([el, info]) => {
                const t = getTypo(el);
                const font = resolveFont(el);
                return (
                  <div key={el} className="rounded-lg border border-border p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            {info.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{info.desc}</span>
                        </div>
                        {font && (
                          <link
                            rel="stylesheet"
                            href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@300;400;500;600;700;800&display=swap`}
                          />
                        )}
                        <p
                          className="truncate"
                          style={{
                            fontFamily: font ? `"${font}", sans-serif` : undefined,
                            fontSize: t.size,
                            fontWeight: t.weight,
                            lineHeight: t.lineHeight,
                            letterSpacing: t.letterSpacing,
                          }}
                        >
                          The quick brown fox jumps over the lazy dog
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-3 mt-3 pt-3 border-t border-border/50">
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Font Family</label>
                        <GoogleFontPicker
                          value={t.font || ''}
                          onChange={(font) => updateTypo(el, { font: font || undefined })}
                        />
                        {!t.font && font && (
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">Inherited: {font}</span>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Size</label>
                        <input
                          type="text"
                          value={t.size || ''}
                          onChange={(e) => updateTypo(el, { size: e.target.value })}
                          className={`${INPUT_CLASS} text-xs`}
                          placeholder="1rem"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Weight</label>
                        <select
                          value={t.weight || '400'}
                          onChange={(e) => updateTypo(el, { weight: e.target.value })}
                          className={`${INPUT_CLASS} text-xs`}
                        >
                          {WEIGHT_OPTIONS.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Line Height</label>
                        <input
                          type="text"
                          value={t.lineHeight || ''}
                          onChange={(e) => updateTypo(el, { lineHeight: e.target.value })}
                          className={`${INPUT_CLASS} text-xs`}
                          placeholder="1.5"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Char Spacing</label>
                        <input
                          type="text"
                          value={t.letterSpacing || ''}
                          onChange={(e) => updateTypo(el, { letterSpacing: e.target.value })}
                          className={`${INPUT_CLASS} text-xs`}
                          placeholder="-0.02em"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
