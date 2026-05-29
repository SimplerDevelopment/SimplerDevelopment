import Link from 'next/link';
import type { NavItem } from '@/lib/actions/client-sites';

interface SiteFooterProps {
  siteName: string;
  navItems: NavItem[];
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  logoAlt: string;
  headingFont?: string;
  bodyFont?: string;
  basePath?: string;
  /** Optional contact strings rendered in the right column. */
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string[];
  /** Optional legal links rendered in the bottom bar. */
  legalLinks?: Array<{ label: string; href: string }>;
  /**
   * Optional compliance / trademark / licensing lines rendered in a
   * trust-row between the main grid and the bottom legal-links bar.
   * Each entry becomes its own short paragraph. Used by regulated
   * tenants (e.g. lenders, brokers) that have to surface a license
   * number or trademark notice in the footer.
   */
  complianceNotes?: string[];
  /**
   * Optional accreditation / security trust badges rendered alongside
   * the compliance notes. Common examples: BBB Accredited Business,
   * Secured-by-SSL, NMLS ID logo. Multi-tenant — any tenant that has
   * an accreditation can supply these.
   */
  trustBadges?: Array<{ src: string; alt: string; href?: string; width?: number; height?: number }>;
}

// Render a multi-column footer derived from the site's nav structure.
// Each top-level nav item becomes a column heading; its children become the
// links beneath. This is the universal default — sites that want a richer
// footer can override later (or set customLayout=true and ship their own).
export function SiteFooter({
  siteName,
  navItems,
  primaryColor,
  secondaryColor,
  logoUrl,
  logoAlt,
  headingFont,
  bodyFont,
  basePath = '',
  contactEmail,
  contactPhone,
  contactAddress,
  legalLinks,
  complianceNotes,
  trustBadges,
}: SiteFooterProps) {
  const headingFontStack = headingFont ? `"${headingFont}", sans-serif` : 'system-ui, sans-serif';
  const bodyFontStack = bodyFont ? `"${bodyFont}", sans-serif` : 'system-ui, sans-serif';

  // Only show top-level items that have children OR are NOT button-styled CTAs.
  // Button-style nav items ("Apply Now") don't belong in a footer column.
  const columnItems = navItems.filter(item => !item.isButton);
  const prefixHref = (href: string): string => {
    if (!href) return '#';
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return href;
    return `${basePath}${href.startsWith('/') ? href : '/' + href}`;
  };

  return (
    <footer
      style={{
        backgroundColor: '#f6f9fc',
        color: '#525f7f',
        borderTop: '1px solid #e8edf6',
        fontFamily: bodyFontStack,
      }}
    >
      {/* Main footer grid */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '56px 24px 32px 24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '32px',
            marginBottom: '40px',
          }}
        >
          {/* Brand column */}
          <div>
            {logoUrl ? (
              <Link href={prefixHref('/')} style={{ display: 'inline-block', marginBottom: '16px' }}>
                <img src={logoUrl} alt={logoAlt} style={{ height: '36px', width: 'auto' }} />
              </Link>
            ) : (
              <Link
                href={prefixHref('/')}
                style={{
                  display: 'inline-block',
                  fontFamily: headingFontStack,
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  color: secondaryColor,
                  textDecoration: 'none',
                  marginBottom: '16px',
                }}
              >
                {siteName}
              </Link>
            )}
            {(contactAddress && contactAddress.length > 0) && (
              <address style={{ fontStyle: 'normal', fontSize: '0.875rem', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                {contactAddress.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </address>
            )}
            {contactEmail && (
              <div style={{ fontSize: '0.875rem', margin: '0 0 4px 0' }}>
                <a href={`mailto:${contactEmail}`} style={{ color: primaryColor, textDecoration: 'none' }}>{contactEmail}</a>
              </div>
            )}
            {contactPhone && (
              <div style={{ fontSize: '0.875rem' }}>
                <a href={`tel:${contactPhone.replace(/[^\d+]/g, '')}`} style={{ color: secondaryColor, textDecoration: 'none', fontWeight: 600 }}>{contactPhone}</a>
              </div>
            )}
          </div>
          {/* Nav columns */}
          {columnItems.slice(0, 4).map(col => (
            <div key={col.id}>
              <div
                style={{
                  fontFamily: headingFontStack,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: secondaryColor,
                  margin: '0 0 16px 0',
                }}
              >
                {col.label}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {col.href && col.href !== '#' && (col.children?.length ?? 0) === 0 && (
                  <li style={{ marginBottom: '8px' }}>
                    <Link href={prefixHref(col.href)} style={{ color: '#525f7f', textDecoration: 'none', fontSize: '0.875rem' }}>
                      {col.label}
                    </Link>
                  </li>
                )}
                {(col.children || []).slice(0, 8).map(child => (
                  <li key={child.id} style={{ marginBottom: '8px' }}>
                    <Link href={prefixHref(child.href)} style={{ color: '#525f7f', textDecoration: 'none', fontSize: '0.875rem' }}>
                      {child.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Trust + compliance row — only renders when the tenant supplies
            compliance notes or accreditation badges. Sits between the main
            grid and the bottom legal bar so it reads as a clear "credentials"
            band rather than fine print. Common to regulated tenants
            (lenders, brokers, insurance, healthcare). */}
        {((complianceNotes && complianceNotes.length > 0) || (trustBadges && trustBadges.length > 0)) && (
          <div
            style={{
              borderTop: '1px solid #e8edf6',
              paddingTop: '20px',
              paddingBottom: '20px',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) auto',
              gap: '24px',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#4d5a73', lineHeight: '1.6' }}>
              {(complianceNotes || []).map((line, i) => (
                <p key={i} style={{ margin: '0 0 6px 0' }}>{line}</p>
              ))}
            </div>
            {trustBadges && trustBadges.length > 0 && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifySelf: 'end' }}>
                {trustBadges.map((badge, i) => {
                  const img = (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={badge.src}
                      alt={badge.alt}
                      width={badge.width ?? 100}
                      height={badge.height ?? 37}
                      loading="lazy"
                      style={{ height: 'auto', maxHeight: '48px', width: 'auto', objectFit: 'contain' }}
                    />
                  );
                  return badge.href ? (
                    <a key={i} href={badge.href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>
                      {img}
                    </a>
                  ) : (
                    <span key={i} style={{ display: 'inline-block' }}>{img}</span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Bottom bar */}
        <div
          style={{
            borderTop: '1px solid #e8edf6',
            paddingTop: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.75rem',
            color: '#4d5a73',
          }}
        >
          <div>© {new Date().getFullYear()} {siteName}. All rights reserved.</div>
          {legalLinks && legalLinks.length > 0 && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {legalLinks.map(l => (
                <Link key={l.href} href={prefixHref(l.href)} style={{ color: '#4d5a73', textDecoration: 'none' }}>
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
