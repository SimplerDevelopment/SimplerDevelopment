'use client';

import { SiteFooterBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface SiteFooterBlockRenderProps {
  block: SiteFooterBlock;
}

export function SiteFooterBlockRender({ block }: SiteFooterBlockRenderProps) {
  const bg = block.backgroundColor || '#0f2140';
  const text = block.textColor || 'rgba(255,255,255,0.5)';
  const accent = block.accentColor || '#cfa122';

  return (
    <footer style={{ backgroundColor: bg, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12">
          {/* Brand column */}
          <div className="md:col-span-1">
            {block.logoUrl && (
              <div className="mb-4">
                <a href="/">
                  <img
                    src={block.logoUrl}
                    alt={block.logoAlt || ''}
                    className="h-10 w-auto"
                  />
                </a>
              </div>
            )}
            {block.tagline && (
              <p className="text-xs leading-relaxed mt-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {block.tagline}
              </p>
            )}
          </div>

          {/* Link groups */}
          {(block.linkGroups || []).map((group, i) => (
            <div key={i}>
              <h4
                className="text-xs tracking-[0.2em] uppercase mb-5"
                style={{ color: accent }}
              >
                {group.label}
              </h4>
              <ul className="space-y-3">
                {group.links.map((link, j) => (
                  <li key={j}>
                    <a
                      href={link.href}
                      className="text-sm transition-colors duration-300"
                      style={{ color: text }}
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
                style={{ color: accent }}
              >
                Contact
              </h4>
              <div className="space-y-3 text-sm" style={{ color: text }}>
                {block.contactInfo.address && (
                  <p style={{ whiteSpace: 'pre-line' }}>{block.contactInfo.address}</p>
                )}
                {block.contactInfo.phone && <p>{block.contactInfo.phone}</p>}
                {block.contactInfo.email && <p>{block.contactInfo.email}</p>}
              </div>

              {/* Social links */}
              {block.socialLinks && block.socialLinks.length > 0 && (
                <div className="mt-6">
                  {block.socialLinks.map((social, i) => (
                    <a
                      key={i}
                      href={social.url}
                      className="inline-flex items-center gap-2 text-sm transition-colors"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = accent; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label || social.platform}
                    >
                      <span className="material-icons text-base">
                        {social.platform === 'linkedin' ? 'open_in_new' : social.platform}
                      </span>
                      <span>{social.label || 'Follow us'}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        {(block.copyright || block.disclaimer) && (
          <div className="mt-16 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              {block.copyright && (
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {block.copyright}
                </p>
              )}
              {block.disclaimer && (
                <p className="text-[10px] leading-relaxed text-center sm:text-right max-w-xl" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {block.disclaimer}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
