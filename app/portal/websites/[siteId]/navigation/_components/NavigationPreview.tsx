// ─── NavigationPreview: iframe live preview + viewport + zoom controls ─────

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  VIEWPORT_WIDTHS,
  type Branding,
  type NavItem,
  type Viewport,
} from '../_lib/types';

interface Props {
  items: NavItem[];
  branding: Branding;
  sitePreviewUrl: string | null;
}

export function NavigationPreview({ items, branding, sitePreviewUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [useLocalhost, setUseLocalhost] = useState(false);
  const [localPort, setLocalPort] = useState('3003');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [zoom, setZoom] = useState(100);

  // Hydrate localhost preference + auto-fit zoom on mount. localStorage is
  // not available during SSR, so this has to be an effect, not lazy init.
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration */
  useEffect(() => {
    setUseLocalhost(localStorage.getItem('editor-use-localhost') === 'true');
    setLocalPort(localStorage.getItem('editor-local-port') || '3003');
    requestAnimationFrame(() => {
      if (previewContainerRef.current) {
        const containerWidth = previewContainerRef.current.clientWidth - 32;
        if (1440 > containerWidth) {
          setZoom(Math.floor((containerWidth / 1440) * 100));
        }
      }
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Listen for iframe ready signal
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.data?.source === 'sd-editor-iframe' &&
        event.data?.type === 'NAV_PREVIEW_READY'
      ) {
        setIframeReady(true);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Send nav data on changes
  useEffect(() => {
    if (!iframeReady || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        source: 'sd-editor-parent',
        type: 'NAV_UPDATE',
        payload: { items, branding },
        timestamp: Date.now(),
      },
      '*',
    );
  }, [items, branding, iframeReady]);

  const previewUrl = useLocalhost
    ? `http://localhost:${localPort}/nav-preview`
    : sitePreviewUrl !== null
      ? `${sitePreviewUrl}/nav-preview`
      : null;

  const handleViewportChange = (next: Viewport) => {
    setViewport(next);
    // Auto-fit zoom when switching viewports
    if (previewContainerRef.current) {
      const containerWidth = previewContainerRef.current.clientWidth - 32;
      const vpWidth = VIEWPORT_WIDTHS[next];
      if (vpWidth > containerWidth) {
        setZoom(Math.floor((containerWidth / vpWidth) * 100));
      } else {
        setZoom(100);
      }
    }
  };

  return (
    <div className="flex-1 bg-muted/30 flex flex-col relative overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/50 shrink-0">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Live Preview
        </span>
        <div className="flex items-center gap-3">
          <ViewportToggle viewport={viewport} onChange={handleViewportChange} />
          <div className="h-4 w-px bg-border" />
          <LocalhostToggle
            useLocalhost={useLocalhost}
            localPort={localPort}
            onToggle={() => {
              const next = !useLocalhost;
              setUseLocalhost(next);
              localStorage.setItem('editor-use-localhost', String(next));
              setIframeReady(false);
            }}
            onPortChange={(v) => {
              setLocalPort(v);
              localStorage.setItem('editor-local-port', v);
              setIframeReady(false);
            }}
          />
        </div>
      </div>
      <div
        ref={previewContainerRef}
        className="flex-1 flex items-start justify-center overflow-auto p-4"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom((z) => Math.min(200, Math.max(30, z + (e.deltaY > 0 ? -5 : 5))));
        }}
      >
        {previewUrl ? (
          <div
            className="bg-card shadow-lg rounded-lg overflow-hidden transition-all duration-300 origin-top"
            style={{
              width: `${VIEWPORT_WIDTHS[viewport]}px`,
              height: `${10000 / zoom}%`,
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
            }}
          >
            <iframe
              ref={iframeRef}
              src={previewUrl}
              className="w-full h-full border-0"
              title="Navigation Preview"
              onLoad={() => {
                setTimeout(() => {
                  if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage(
                      {
                        source: 'sd-editor-parent',
                        type: 'NAV_INIT',
                        payload: { items, branding },
                        timestamp: Date.now(),
                      },
                      '*',
                    );
                  }
                }, 500);
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full w-full">
            <div className="text-center text-muted-foreground">
              <span className="material-icons text-3xl mb-2 block">preview</span>
              <p className="text-sm">
                {useLocalhost
                  ? `Start the site on localhost:${localPort}`
                  : 'Site not yet deployed'}
              </p>
            </div>
          </div>
        )}
      </div>

      <ZoomControls zoom={zoom} onChange={setZoom} />
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function ViewportToggle({
  viewport,
  onChange,
}: {
  viewport: Viewport;
  onChange: (v: Viewport) => void;
}) {
  const presets = [
    { id: 'desktop' as const, icon: 'computer', w: '1440px' },
    { id: 'tablet' as const, icon: 'tablet', w: '768px' },
    { id: 'mobile' as const, icon: 'phone_iphone', w: '375px' },
  ];
  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
      {presets.map((vp) => (
        <button
          key={vp.id}
          type="button"
          onClick={() => onChange(vp.id)}
          className={`rounded p-1.5 transition-colors ${
            viewport === vp.id
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={`${vp.id.charAt(0).toUpperCase() + vp.id.slice(1)} (${vp.w})`}
        >
          <span className="material-icons text-sm">{vp.icon}</span>
        </button>
      ))}
    </div>
  );
}

function LocalhostToggle({
  useLocalhost,
  localPort,
  onToggle,
  onPortChange,
}: {
  useLocalhost: boolean;
  localPort: string;
  onToggle: () => void;
  onPortChange: (v: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
          useLocalhost
            ? 'bg-orange-500/15 text-orange-600'
            : 'text-muted-foreground hover:bg-accent'
        }`}
      >
        <span className="material-icons text-sm">{useLocalhost ? 'lan' : 'cloud'}</span>
        {useLocalhost ? 'Local' : 'Prod'}
      </button>
      {useLocalhost && (
        <input
          type="text"
          value={localPort}
          onChange={(e) => onPortChange(e.target.value.replace(/\D/g, ''))}
          className="w-12 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground font-mono text-center"
        />
      )}
    </>
  );
}

function ZoomControls({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-card/90 backdrop-blur border border-border rounded-lg px-2 py-1 shadow-lg z-10">
      <button
        type="button"
        onClick={() => onChange(Math.max(30, zoom - 10))}
        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={zoom <= 30}
      >
        <span className="material-icons text-sm">remove</span>
      </button>
      <button
        type="button"
        onClick={() => onChange(100)}
        className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground min-w-[3rem] text-center"
      >
        {zoom}%
      </button>
      <button
        type="button"
        onClick={() => onChange(Math.min(200, zoom + 10))}
        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={zoom >= 200}
      >
        <span className="material-icons text-sm">add</span>
      </button>
    </div>
  );
}
