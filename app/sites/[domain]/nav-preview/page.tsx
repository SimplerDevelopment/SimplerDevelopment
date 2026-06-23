'use client';

import { useEffect, useState } from 'react';

interface NavItem {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  sortOrder: number;
  openInNewTab: boolean;
  isButton: boolean;
}

interface Branding {
  logoUrl: string;
  logoAlt: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  navTemplate: string;
  navPosition: string;
  navBackground: string;
  navTextColor: string;
}

export default function NavPreviewPage() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    window.parent.postMessage({
      source: 'sd-editor-iframe',
      type: 'NAV_PREVIEW_READY',
      payload: {},
      timestamp: Date.now(),
    }, '*');

    function handleMessage(event: MessageEvent) {
      if (event.data?.source !== 'sd-editor-parent') return;
      if (event.data?.type === 'NAV_UPDATE') {
        const { items: newItems, branding: newBranding } = event.data.payload;
        if (newItems) setItems(newItems);
        if (newBranding) setBranding(newBranding);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const topItems = items
    .filter(i => !i.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const bg = branding?.navBackground || '#ffffff';
  const textColor = branding?.navTextColor || '#111827';
  const primaryColor = branding?.primaryColor || '#2563eb';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: branding?.backgroundColor || '#f9fafb' }}>
      <header
        style={{
          backgroundColor: bg,
          color: textColor,
          borderBottom: '1px solid rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.logoAlt || ''} style={{ height: 36, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize: 18, fontWeight: 700, color: textColor }}>Site Logo</div>
          )}

          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {topItems.map(item => {
              if (item.isButton) {
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    style={{
                      backgroundColor: primaryColor,
                      color: '#fff',
                      padding: '8px 16px',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    {item.label}
                  </a>
                );
              }
              return (
                <a
                  key={item.id}
                  href={item.href}
                  style={{ color: textColor, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 1rem' }}>
        <div style={{ backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 12, padding: '4rem 2rem', textAlign: 'center' }}>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Page content area</p>
        </div>
      </div>
    </div>
  );
}
