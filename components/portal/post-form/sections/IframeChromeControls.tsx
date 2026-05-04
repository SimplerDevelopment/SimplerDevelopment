// Iframe-mode toolbar controls: viewport picker, prod/local toggle, and undo/redo.
'use client';

export function IframeViewportControls({
  iframeViewport,
  setIframeViewport,
  useLocalhost,
  setUseLocalhost,
  localPort,
  setLocalPort,
}: {
  iframeViewport: 'desktop' | 'tablet' | 'mobile';
  setIframeViewport: (vp: 'desktop' | 'tablet' | 'mobile') => void;
  useLocalhost: boolean;
  setUseLocalhost: (v: boolean) => void;
  localPort: string;
  setLocalPort: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        {(['desktop', 'tablet', 'mobile'] as const).map((vp) => (
          <button
            key={vp}
            type="button"
            onClick={() => setIframeViewport(vp)}
            className={`rounded p-1.5 ${
              iframeViewport === vp ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent'
            }`}
            title={vp.charAt(0).toUpperCase() + vp.slice(1)}
          >
            <span className="material-icons text-lg">
              {vp === 'desktop' ? 'computer' : vp === 'tablet' ? 'tablet' : 'phone_iphone'}
            </span>
          </button>
        ))}
      </div>
      <div className="h-5 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setUseLocalhost(!useLocalhost)}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
            useLocalhost ? 'bg-orange-500/15 text-orange-600' : 'text-muted-foreground hover:bg-accent'
          }`}
          title={useLocalhost ? `Using localhost:${localPort}` : 'Switch to localhost'}
        >
          <span className="material-icons text-sm">{useLocalhost ? 'lan' : 'cloud'}</span>
          {useLocalhost ? 'Local' : 'Prod'}
        </button>
        {useLocalhost && (
          <input
            type="text"
            value={localPort}
            onChange={(e) => setLocalPort(e.target.value.replace(/\D/g, ''))}
            className="w-12 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground font-mono text-center"
            title="Local port number"
          />
        )}
      </div>
    </div>
  );
}

export function UndoRedoControls({
  undoRedo,
}: {
  undoRedo: { sendUndo: () => void; sendRedo: () => void; canUndo: boolean; canRedo: boolean };
}) {
  return (
    <div className="flex items-center gap-0.5 ml-1">
      <button
        type="button"
        onClick={undoRedo.sendUndo}
        disabled={!undoRedo.canUndo}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${undoRedo.canUndo ? 'hover:bg-accent text-foreground' : 'text-muted-foreground/30 cursor-default'}`}
        title="Undo (Cmd+Z)"
      >
        <span className="material-icons text-lg">undo</span>
      </button>
      <button
        type="button"
        onClick={undoRedo.sendRedo}
        disabled={!undoRedo.canRedo}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${undoRedo.canRedo ? 'hover:bg-accent text-foreground' : 'text-muted-foreground/30 cursor-default'}`}
        title="Redo (Cmd+Shift+Z)"
      >
        <span className="material-icons text-lg">redo</span>
      </button>
    </div>
  );
}
