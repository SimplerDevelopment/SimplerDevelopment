'use client';

import Link from 'next/link';
import { SiteFooterBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { SocialIcon } from '@/lib/icons/social-icons';

interface SiteFooterBlockRenderProps {
  block: SiteFooterBlock;
}

/**
 * Heuristic: a footer with explicit white/light background should default text
 * to dark; otherwise stay with the historical white-on-navy defaults. Callers
 * can always override via `textColor` / `accentColor` / `elementStyles.*`.
 */
function isLightBg(bg: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // perceptual luminance — light when above ~200/255 average
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}

export function SiteFooterBlockRender({ block }: SiteFooterBlockRenderProps) {
  const bg = block.backgroundColor || '#0f2140';
  const light = isLightBg(bg);
  const text = block.textColor || (light ? '#3D4A57' : 'rgba(255,255,255,0.5)');
  const accent = block.accentColor || (light ? '#0A3A5C' : '#cfa122');
  const subtleText = light ? 'rgba(60,72,90,0.65)' : 'rgba(255,255,255,0.4)';
  const copyrightText = light ? 'rgba(60,72,90,0.55)' : 'rgba(255,255,255,0.25)';
  const borderTone = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';

  return (
    <footer style={{ backgroundColor: bg, borderTop: `1px solid ${borderTone}` }}>
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12">
          {/* Brand column */}
          <div className="md:col-span-1">
            {(block.logoUrl || block.wordmark) && (
              <div className="mb-4">
                <a href="/" className="inline-flex items-center gap-3">
                  {block.logoUrl && (
                    <img
                      src={block.logoUrl}
                      alt={block.logoAlt || ''}
                      className="h-10 w-auto"
                      style={getElementCSS(block.elementStyles, 'logo')}
                    />
                  )}
                  {block.wordmark && (
                    <span
                      className="text-xs font-semibold uppercase tracking-[0.18em] leading-tight"
                      style={{ color: accent, ...getElementCSS(block.elementStyles, 'wordmark') }}
                    >
                      {block.wordmark.split('\n').map((line, i) => (
                        <span key={i} style={{ display: 'block' }}>
                          {line}
                        </span>
                      ))}
                    </span>
                  )}
                </a>
              </div>
            )}
            {block.tagline && (
              <p
                className="text-xs leading-relaxed mt-4"
                style={{ color: subtleText, ...getElementCSS(block.elementStyles, 'tagline') }}
              >
                {block.tagline}
              </p>
            )}
            {block.ctaText && block.ctaUrl && (
              <Link
                href={block.ctaUrl}
                className="inline-flex items-center justify-center mt-6 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-[0.1em] transition-colors"
                style={{
                  backgroundColor: accent,
                  color: light ? '#FFFFFF' : '#0A3A5C',
                  ...getElementCSS(block.elementStyles, 'cta'),
                }}
              >
                {block.ctaText}
              </Link>
            )}
          </div>

          {/* Link groups */}
          {(block.linkGroups || []).map((group, i) => (
            <div key={i}>
              <h4
                className="text-xs tracking-[0.2em] uppercase mb-5"
                style={{ color: accent, ...getElementCSS(block.elementStyles, 'linkGroupLabel') }}
              >
                {group.label}
              </h4>
              <ul className="space-y-3">
                {group.links.map((link, j) => (
                  <li key={j}>
                    <a
                      href={link.href}
                      className="text-sm transition-colors duration-300"
                      style={{ color: text, ...getElementCSS(block.elementStyles, 'link') }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = accent; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = text; }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact column */}
          {block.contactInfo && (
            <div>
              <h4
                className="text-xs tracking-[0.2em] uppercase mb-5"
                style={{ color: accent, ...getElementCSS(block.elementStyles, 'linkGroupLabel') }}
              >
                Contact
              </h4>
              <div className="space-y-3 text-sm" style={{ color: text }}>
                {block.contactInfo.address && (
                  <p style={{ whiteSpace: 'pre-line', ...getElementCSS(block.elementStyles, 'contactLine') }}>{block.contactInfo.address}</p>
                )}
                {block.contactInfo.phone && (
                  <p style={getElementCSS(block.elementStyles, 'contactLine')}>{block.contactInfo.phone}</p>
                )}
                {block.contactInfo.email && (
                  <p style={getElementCSS(block.elementStyles, 'contactLine')}>{block.contactInfo.email}</p>
                )}
              </div>

              {/* Social links */}
              {block.socialLinks && block.socialLinks.length > 0 && (
                <div className="mt-6">
                  {block.socialLinks.map((social, i) => (
                    <a
                      key={i}
                      href={social.url}
                      className="inline-flex items-center gap-2 text-sm transition-colors"
                      style={{ color: 'rgba(255,255,255,0.4)', ...getElementCSS(block.elementStyles, 'socialIcon') }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = accent; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label || social.platform}
                    >
                      <SocialIcon platform={social.platform} size={16} />
                      <span>{social.label || 'Follow us'}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        {(block.copyright || block.disclaimer || (!block.contactInfo && (block.socialLinks?.length ?? 0) > 0)) && (
          <div className="mt-16 pt-8" style={{ borderTop: `1px solid ${borderTone}` }}>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              {block.copyright && (
                <p
                  className="text-xs"
                  style={{ color: copyrightText, ...getElementCSS(block.elementStyles, 'copyright') }}
                >
                  {block.copyright}
                </p>
              )}
              {block.disclaimer && (
                <p
                  className="text-[10px] leading-relaxed text-center sm:text-right max-w-xl"
                  style={{ color: copyrightText, ...getElementCSS(block.elementStyles, 'copyright') }}
                >
                  {block.disclaimer}
                </p>
              )}
              {/* Social icons in bottom bar when no contact column */}
              {!block.contactInfo && (block.socialLinks?.length ?? 0) > 0 && (
                <div className="flex items-center gap-3">
                  {(block.socialLinks ?? []).map((social, i) => (
                    <a
                      key={i}
                      href={social.url}
                      className="inline-flex items-center justify-center rounded-full transition-colors"
                      style={{
                        width: 32,
                        height: 32,
                        backgroundColor: accent,
                        color: light ? '#FFFFFF' : '#0A3A5C',
                        ...getElementCSS(block.elementStyles, 'socialIcon'),
                      }}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label || social.platform}
                    >
                      <SocialIcon platform={social.platform} size={16} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
