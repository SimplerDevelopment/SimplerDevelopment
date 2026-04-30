'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import MediaPicker from '@/components/admin/MediaPicker';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NavItem {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  sortOrder: number;
  openInNewTab: boolean;
  isButton: boolean;
  // Mega menu fields
  description?: string;
  icon?: string;
  featuredImage?: string;
  columnGroup?: number;
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

const TEMPLATES = [
  { id: 'classic', label: 'Classic', description: 'Logo left, links right' },
  { id: 'centered', label: 'Centered', description: 'Logo centered, links below' },
  { id: 'minimal', label: 'Minimal', description: 'Clean and simple' },
  { id: 'modern', label: 'Modern', description: 'Bold with accent line' },
  { id: 'transparent', label: 'Transparent', description: 'Overlay on hero' },
  { id: 'mega', label: 'Mega Menu', description: 'Full-width dropdowns' },
  { id: 'none', label: 'None', description: 'Hide the top navigation entirely' },
];

const DEFAULT_BRANDING: Branding = {
  logoUrl: '',
  logoAlt: '',
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  navTemplate: 'classic',
  navPosition: 'top',
  navBackground: '#ffffff',
  navTextColor: '#111827',
};

let nextTempId = -1;

// ─── Component ───────────────────────────────────────────────────────────────

export default function NavigationEditorPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/websites/${siteId}`;

  const [items, setItems] = useState<NavItem[]>([]);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'items' | 'branding'>('items');
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [sitePreviewUrl, setSitePreviewUrl] = useState<string | null>(null);
  const [useLocalhost, setUseLocalhost] = useState(false);
  const [localPort, setLocalPort] = useState('3003');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [zoom, setZoom] = useState(100);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Hydrate localhost preference and auto-fit zoom
  useEffect(() => {
    setUseLocalhost(localStorage.getItem('editor-use-localhost') === 'true');
    setLocalPort(localStorage.getItem('editor-local-port') || '3003');
    // Auto-fit desktop viewport on mount
    requestAnimationFrame(() => {
      if (previewContainerRef.current) {
        const containerWidth = previewContainerRef.current.clientWidth - 32;
        if (1440 > containerWidth) {
          setZoom(Math.floor((containerWidth / 1440) * 100));
        }
      }
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTemplateDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load data
  useEffect(() => {
    Promise.all([
      fetch(`${base}/navigation`).then(r => r.json()),
      fetch(`${base}/branding`).then(r => r.json()),
      fetch(`/api/portal/websites/${siteId}/status`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([navRes, brandRes, statusRes]) => {
      if (navRes.success) setItems(navRes.data);
      if (brandRes.success) setBranding({ ...DEFAULT_BRANDING, ...brandRes.data });
      if (statusRes?.success) {
        const s = statusRes.data;
        const domain = s.vercelDomain || (s.subdomain ? `${s.subdomain}.simplerdevelopment.com` : null);
        // If the portal is being accessed ON the tenant's own host, use a
        // same-origin path — middleware will rewrite /nav-preview to
        // /sites/{host}/nav-preview. Otherwise (portal on the main app host),
        // hit the /sites/{domain}/... renderer directly.
        const onTenantHost = !!domain && typeof window !== 'undefined' && window.location.host === domain;
        const url = onTenantHost ? '' : (domain ? `/sites/${domain}` : null);
        setSitePreviewUrl(url);
      }
    }).finally(() => setLoading(false));
  }, [base, siteId]);

  // Listen for iframe ready signal
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.source === 'sd-editor-iframe' && event.data?.type === 'NAV_PREVIEW_READY') {
        setIframeReady(true);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Send nav data to iframe on changes
  useEffect(() => {
    if (!iframeReady || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({
      source: 'sd-editor-parent',
      type: 'NAV_UPDATE',
      payload: { items, branding },
      timestamp: Date.now(),
    }, '*');
  }, [items, branding, iframeReady]);

  const previewUrl = useLocalhost ? `http://localhost:${localPort}/nav-preview` : sitePreviewUrl !== null ? `${sitePreviewUrl}/nav-preview` : null;

  // Save all
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([
        fetch(`${base}/navigation`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: items.map((item, i) => ({ ...item, sortOrder: i })) }),
        }),
        fetch(`${base}/branding`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(branding),
        }),
      ]);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [base, items, branding]);

  const isMega = branding.navTemplate === 'mega';

  // Nav item CRUD
  const addItem = (parentId: number | null = null, defaults?: Partial<NavItem>) => {
    const newItem: NavItem = {
      id: nextTempId--,
      label: defaults?.label || 'New Link',
      href: defaults?.href || '/',
      parentId,
      sortOrder: items.length,
      openInNewTab: false,
      isButton: false,
      ...defaults,
    };
    setItems(prev => [...prev, newItem]);
    setEditingId(newItem.id);
    setDirty(true);
  };

  const addColumn = (parentId: number) => {
    const columnCount = items.filter(i => i.parentId === parentId).length;
    addItem(parentId, { label: `Column ${columnCount + 1}`, href: '#' });
  };

  const addMegaItem = (columnId: number) => {
    addItem(columnId, { label: 'New Item', href: '/' });
  };

  const updateItem = (id: number, updates: Partial<NavItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    setDirty(true);
  };

  const removeItem = (id: number) => {
    // Recursively remove children and grandchildren
    const idsToRemove = new Set<number>();
    const collect = (parentId: number) => {
      idsToRemove.add(parentId);
      items.filter(i => i.parentId === parentId).forEach(i => collect(i.id));
    };
    collect(id);
    setItems(prev => prev.filter(item => !idsToRemove.has(item.id)));
    setDirty(true);
  };

  const moveItem = (id: number, direction: -1 | 1) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
    setDirty(true);
  };

  const updateBranding = (updates: Partial<Branding>) => {
    setBranding(prev => ({ ...prev, ...updates }));
    setDirty(true);
  };

  // Separate top-level and children
  const topItems = items.filter(i => !i.parentId);
  const childrenOf = (parentId: number) => items.filter(i => i.parentId === parentId);

  const selectedTemplate = TEMPLATES.find(t => t.id === branding.navTemplate) || TEMPLATES[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Navigation Editor</h1>
            <p className="text-sm text-muted-foreground">Customize your site navigation, branding, and layout</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Template dropdown in header */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setTemplateDropdownOpen(!templateDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-background hover:bg-muted/50 transition-colors"
            >
              <TemplateIconSmall template={selectedTemplate.id} />
              <span className="text-sm font-medium text-foreground">{selectedTemplate.label}</span>
              <span className="material-icons text-base text-muted-foreground">
                {templateDropdownOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {templateDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-[340px] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-border">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Navigation Template</span>
                </div>
                <div className="p-2 grid grid-cols-2 gap-2">
                  {TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      onClick={() => {
                        updateBranding({ navTemplate: tmpl.id });
                        setTemplateDropdownOpen(false);
                      }}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all ${
                        branding.navTemplate === tmpl.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/30 hover:bg-muted/30'
                      }`}
                    >
                      <TemplatePreview
                        template={tmpl.id}
                        active={branding.navTemplate === tmpl.id}
                        branding={branding}
                      />
                      <div>
                        <div className="text-xs font-semibold text-foreground">{tmpl.label}</div>
                        <div className="text-[10px] text-muted-foreground leading-tight">{tmpl.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <span className="material-icons text-base">{saving ? 'refresh' : 'save'}</span>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Main: Editor + Preview */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel: Editor (collapsible) */}
        <div className={`flex-shrink-0 border-r border-border bg-background overflow-y-auto transition-all duration-300 ${leftPanelOpen ? 'w-[420px]' : 'w-0 border-r-0'}`}>
          <div className={`w-[420px] ${leftPanelOpen ? '' : 'hidden'}`}>
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('items')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'items'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base mr-1.5 align-middle">menu</span>
              Menu Items
            </button>
            <button
              onClick={() => setActiveTab('branding')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'branding'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base mr-1.5 align-middle">palette</span>
              Branding
            </button>
          </div>

          {activeTab === 'items' ? (
            <div className="p-4 space-y-2">
              {topItems.map((item) => (
                <div key={item.id}>
                  {/* Level 0: Nav Link */}
                  <NavItemRow
                    item={item}
                    editing={editingId === item.id}
                    onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                    onUpdate={(updates) => updateItem(item.id, updates)}
                    onRemove={() => removeItem(item.id)}
                    onMoveUp={() => moveItem(item.id, -1)}
                    onMoveDown={() => moveItem(item.id, 1)}
                    onAddChild={() => isMega ? addColumn(item.id) : addItem(item.id)}
                    depth={0}
                    isMegaMenu={isMega}
                    siteId={siteId}
                  />
                  {childrenOf(item.id).map((child) => (
                    <div key={child.id}>
                      {/* Level 1: Column (mega) or Dropdown Item (regular) */}
                      <NavItemRow
                        item={child}
                        editing={editingId === child.id}
                        onEdit={() => setEditingId(editingId === child.id ? null : child.id)}
                        onUpdate={(updates) => updateItem(child.id, updates)}
                        onRemove={() => removeItem(child.id)}
                        onMoveUp={() => moveItem(child.id, -1)}
                        onMoveDown={() => moveItem(child.id, 1)}
                        onAddChild={isMega ? () => addMegaItem(child.id) : undefined}
                        depth={1}
                        isMegaMenu={isMega}
                        siteId={siteId}
                      />
                      {/* Level 2: Mega Menu Items (only in mega mode) */}
                      {isMega && childrenOf(child.id).map((megaItem) => (
                        <NavItemRow
                          key={megaItem.id}
                          item={megaItem}
                          editing={editingId === megaItem.id}
                          onEdit={() => setEditingId(editingId === megaItem.id ? null : megaItem.id)}
                          onUpdate={(updates) => updateItem(megaItem.id, updates)}
                          onRemove={() => removeItem(megaItem.id)}
                          onMoveUp={() => moveItem(megaItem.id, -1)}
                          onMoveDown={() => moveItem(megaItem.id, 1)}
                          depth={2}
                          isMegaMenu={isMega}
                          siteId={siteId}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))}

              <button
                onClick={() => addItem()}
                className="w-full py-2.5 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-icons text-base">add</span>
                Add Menu Item
              </button>
            </div>
          ) : (
            <BrandingPanel
              branding={branding}
              onChange={updateBranding}
              siteId={siteId}
            />
          )}
          </div>
        </div>

        {/* Left panel toggle */}
        <button
          type="button"
          onClick={() => setLeftPanelOpen(prev => !prev)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-6 h-12 flex items-center justify-center bg-background border border-border border-l-0 rounded-r-lg shadow-sm hover:bg-muted transition-colors"
          style={{ left: leftPanelOpen ? '420px' : '0px', transition: 'left 0.3s' }}
          title={leftPanelOpen ? 'Collapse panel' : 'Expand panel'}
        >
          <span className="material-icons text-sm text-muted-foreground">
            {leftPanelOpen ? 'chevron_left' : 'chevron_right'}
          </span>
        </button>

        {/* Right Panel: Live iframe Preview */}
        <div className="flex-1 bg-muted/30 flex flex-col relative overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/50 shrink-0">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Live Preview</span>
            <div className="flex items-center gap-3">
              {/* Viewport presets */}
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                {([
                  { id: 'desktop' as const, icon: 'computer', w: '1440px' },
                  { id: 'tablet' as const, icon: 'tablet', w: '768px' },
                  { id: 'mobile' as const, icon: 'phone_iphone', w: '375px' },
                ] as const).map(vp => (
                  <button
                    key={vp.id}
                    type="button"
                    onClick={() => {
                      setViewport(vp.id);
                      // Auto-fit zoom when switching viewports
                      if (previewContainerRef.current) {
                        const containerWidth = previewContainerRef.current.clientWidth - 32; // minus padding
                        const vpWidth = vp.id === 'desktop' ? 1440 : vp.id === 'tablet' ? 768 : 375;
                        if (vpWidth > containerWidth) {
                          setZoom(Math.floor((containerWidth / vpWidth) * 100));
                        } else {
                          setZoom(100);
                        }
                      }
                    }}
                    className={`rounded p-1.5 transition-colors ${
                      viewport === vp.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={`${vp.id.charAt(0).toUpperCase() + vp.id.slice(1)} (${vp.w})`}
                  >
                    <span className="material-icons text-sm">{vp.icon}</span>
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Localhost toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !useLocalhost;
                  setUseLocalhost(next);
                  localStorage.setItem('editor-use-localhost', String(next));
                  setIframeReady(false);
                }}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  useLocalhost ? 'bg-orange-500/15 text-orange-600' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="material-icons text-sm">{useLocalhost ? 'lan' : 'cloud'}</span>
                {useLocalhost ? 'Local' : 'Prod'}
              </button>
              {useLocalhost && (
                <input
                  type="text"
                  value={localPort}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    setLocalPort(v);
                    localStorage.setItem('editor-local-port', v);
                    setIframeReady(false);
                  }}
                  className="w-12 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground font-mono text-center"
                />
              )}
            </div>
          </div>
          <div
            ref={previewContainerRef}
            className="flex-1 flex items-start justify-center overflow-auto p-4"
            onWheel={(e) => {
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              setZoom(z => Math.min(200, Math.max(30, z + (e.deltaY > 0 ? -5 : 5))));
            }}
          >
            {previewUrl ? (
              <div
                className="bg-card shadow-lg rounded-lg overflow-hidden transition-all duration-300 origin-top"
                style={{
                  width: viewport === 'desktop' ? '1440px' : viewport === 'tablet' ? '768px' : '375px',
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
                        iframeRef.current.contentWindow.postMessage({
                          source: 'sd-editor-parent',
                          type: 'NAV_INIT',
                          payload: { items, branding },
                          timestamp: Date.now(),
                        }, '*');
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
                    {useLocalhost ? `Start the site on localhost:${localPort}` : 'Site not yet deployed'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-card/90 backdrop-blur border border-border rounded-lg px-2 py-1 shadow-lg z-10">
            <button type="button" onClick={() => setZoom(z => Math.max(30, z - 10))} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={zoom <= 30}>
              <span className="material-icons text-sm">remove</span>
            </button>
            <button type="button" onClick={() => setZoom(100)} className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground min-w-[3rem] text-center">
              {zoom}%
            </button>
            <button type="button" onClick={() => setZoom(z => Math.min(200, z + 10))} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={zoom >= 200}>
              <span className="material-icons text-sm">add</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Nav Item Row ────────────────────────────────────────────────────────────

function NavItemRow({
  item,
  editing,
  onEdit,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddChild,
  depth = 0,
  isMegaMenu = false,
  siteId,
}: {
  item: NavItem;
  editing: boolean;
  onEdit: () => void;
  onUpdate: (updates: Partial<NavItem>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddChild?: () => void;
  depth?: number;
  isMegaMenu?: boolean;
  siteId?: string;
}) {
  // Determine the role of this item in mega menu mode
  const megaRole = isMegaMenu ? (depth === 0 ? 'nav-link' : depth === 1 ? 'column' : 'mega-item') : null;
  const roleIcon = megaRole === 'column' ? 'view_column' : megaRole === 'mega-item' ? 'link' : undefined;
  const roleLabel = megaRole === 'column' ? 'Column' : megaRole === 'mega-item' ? 'Item' : undefined;

  return (
    <div className={`${depth === 1 ? 'ml-6' : depth === 2 ? 'ml-12' : ''}`}>
      <div
        className={`rounded-lg border transition-colors ${
          editing ? 'border-primary bg-primary/5' : megaRole === 'column' ? 'border-border bg-muted/30 hover:border-primary/30' : 'border-border bg-card hover:border-primary/30'
        }`}
      >
        {/* Collapsed row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="material-icons text-base text-muted-foreground cursor-grab">drag_indicator</span>
          {roleIcon && (
            <span className="material-icons text-sm text-muted-foreground">{roleIcon}</span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground truncate">{item.label}</span>
              {item.isButton && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-none">
                  Button
                </span>
              )}
              {roleLabel && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground leading-none">
                  {roleLabel}
                </span>
              )}
            </div>
            {megaRole !== 'column' && (
              <span className="text-xs text-muted-foreground truncate block">{item.href}</span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={onMoveUp} className="p-1 hover:bg-muted rounded" title="Move up">
              <span className="material-icons text-sm text-muted-foreground">keyboard_arrow_up</span>
            </button>
            <button onClick={onMoveDown} className="p-1 hover:bg-muted rounded" title="Move down">
              <span className="material-icons text-sm text-muted-foreground">keyboard_arrow_down</span>
            </button>
            <button onClick={onEdit} className="p-1 hover:bg-muted rounded" title="Edit">
              <span className="material-icons text-sm text-muted-foreground">{editing ? 'expand_less' : 'edit'}</span>
            </button>
            <button onClick={onRemove} className="p-1 hover:bg-destructive/10 rounded" title="Remove">
              <span className="material-icons text-sm text-destructive">delete</span>
            </button>
          </div>
        </div>

        {/* Expanded edit form */}
        {editing && (
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
            {/* Column edit: just a label */}
            {megaRole === 'column' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Column Heading</label>
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) => onUpdate({ label: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
                    placeholder="e.g. Products, Resources"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Featured Image</label>
                  <MediaPicker
                    value={item.featuredImage || ''}
                    onChange={(url) => onUpdate({ featuredImage: url })}
                    label="Column Image"
                    mimeTypeFilter="image"
                    apiEndpoint={siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media'}
                  />
                </div>
                {onAddChild && (
                  <button
                    onClick={onAddChild}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <span className="material-icons text-sm">add</span>
                    Add menu item
                  </button>
                )}
              </>
            ) : (
              <>
                {/* Nav link / mega item edit: full fields */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) => onUpdate({ label: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">URL</label>
                  <input
                    type="text"
                    value={item.href}
                    onChange={(e) => onUpdate({ href: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground font-mono"
                    placeholder="/about"
                  />
                </div>

                {/* Mega item extra fields */}
                {megaRole === 'mega-item' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                      <textarea
                        value={item.description || ''}
                        onChange={(e) => onUpdate({ description: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
                        placeholder="Short description shown under the link"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Icon</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.icon || ''}
                          onChange={(e) => onUpdate({ icon: e.target.value })}
                          className="flex-1 px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
                          placeholder="e.g. rocket_launch"
                        />
                        {item.icon && (
                          <span className="material-icons text-xl text-muted-foreground">{item.icon}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Featured Image</label>
                      <MediaPicker
                        value={item.featuredImage || ''}
                        onChange={(url) => onUpdate({ featuredImage: url })}
                        label="Featured Image"
                        mimeTypeFilter="image"
                        apiEndpoint={siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media'}
                      />
                    </div>
                  </>
                )}

                {/* Standard nav options (not for mega items) */}
                {megaRole !== 'mega-item' && (
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={item.openInNewTab}
                        onChange={(e) => onUpdate({ openInNewTab: e.target.checked })}
                        className="rounded border-border"
                      />
                      Open in new tab
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={item.isButton}
                        onChange={(e) => onUpdate({ isButton: e.target.checked })}
                        className="rounded border-border accent-primary"
                      />
                      Display as button
                    </label>
                  </div>
                )}

                {depth === 0 && onAddChild && (
                  <button
                    onClick={onAddChild}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <span className="material-icons text-sm">add</span>
                    {isMegaMenu ? 'Add column' : 'Add dropdown item'}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Branding Panel ──────────────────────────────────────────────────────────

function BrandingPanel({
  branding,
  onChange,
  siteId,
}: {
  branding: Branding;
  onChange: (updates: Partial<Branding>) => void;
  siteId: string;
}) {
  return (
    <div className="p-4 space-y-6">
      {/* Logo */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base">image</span>
          Logo
        </h3>
        <MediaPicker
          value={branding.logoUrl}
          onChange={(url) => onChange({ logoUrl: url })}
          label="Site Logo"
          apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
        />
        <div className="mt-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Logo Alt Text</label>
          <input
            type="text"
            value={branding.logoAlt}
            onChange={(e) => onChange({ logoAlt: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
            placeholder="Company name"
          />
        </div>
      </div>

      {/* Brand Colors */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base">palette</span>
          Brand Colors
        </h3>
        <div className="space-y-3">
          <ColorField label="Primary" value={branding.primaryColor} onChange={(v) => onChange({ primaryColor: v })} />
          <ColorField label="Secondary" value={branding.secondaryColor} onChange={(v) => onChange({ secondaryColor: v })} />
          <ColorField label="Accent" value={branding.accentColor} onChange={(v) => onChange({ accentColor: v })} />
        </div>
      </div>

      {/* Nav Colors */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base">format_color_fill</span>
          Navigation Colors
        </h3>
        <div className="space-y-3">
          <ColorField label="Background" value={branding.navBackground} onChange={(v) => onChange({ navBackground: v })} />
          <ColorField label="Text" value={branding.navTextColor} onChange={(v) => onChange({ navTextColor: v })} />
        </div>
      </div>

      {/* Site Colors */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base">web</span>
          Site Colors
        </h3>
        <div className="space-y-3">
          <ColorField label="Background" value={branding.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
          <ColorField label="Text" value={branding.textColor} onChange={(v) => onChange({ textColor: v })} />
        </div>
      </div>
    </div>
  );
}

// ─── Color Field ─────────────────────────────────────────────────────────────

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const colorForInput = value && value.startsWith('#') && value.length >= 7 ? value.slice(0, 7) : '#ffffff';
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={colorForInput}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-md border border-border cursor-pointer flex-shrink-0 p-0.5"
      />
      <div className="flex-1">
        <label className="block text-xs font-medium text-muted-foreground mb-0.5">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
        />
      </div>
    </div>
  );
}

// ─── Template Icon (small, for header dropdown trigger) ─────────────────────

function TemplateIconSmall({ template }: { template: string }) {
  return (
    <div className="w-6 h-4 rounded border border-border flex-shrink-0 bg-muted/30" style={{ padding: 2 }}>
      {template === 'classic' && (
        <div className="flex items-center justify-between h-full">
          <div className="w-1.5 h-1 rounded-sm bg-foreground/30" />
          <div className="flex gap-px">
            <div className="w-1 h-0.5 rounded-sm bg-foreground/20" />
            <div className="w-1 h-0.5 rounded-sm bg-foreground/20" />
          </div>
        </div>
      )}
      {template === 'centered' && (
        <div className="flex flex-col items-center justify-center h-full gap-px">
          <div className="w-2 h-0.5 rounded-sm bg-foreground/30" />
          <div className="flex gap-px">
            <div className="w-1 h-px rounded-sm bg-foreground/20" />
            <div className="w-1 h-px rounded-sm bg-foreground/20" />
          </div>
        </div>
      )}
      {template === 'minimal' && (
        <div className="flex items-center justify-between h-full">
          <div className="w-1.5 h-1 rounded-sm bg-foreground/30" />
          <div className="w-1 h-1 rounded-sm bg-foreground/20" />
        </div>
      )}
      {template === 'modern' && (
        <div className="h-full flex flex-col">
          <div className="h-px w-full bg-foreground/30" />
          <div className="flex items-center justify-between flex-1">
            <div className="w-1.5 h-0.5 rounded-sm bg-foreground/30" />
            <div className="flex gap-px">
              <div className="w-1 h-px rounded-sm bg-foreground/20" />
              <div className="w-1 h-px rounded-sm bg-foreground/20" />
            </div>
          </div>
        </div>
      )}
      {template === 'transparent' && (
        <div className="flex items-center justify-between h-full opacity-50">
          <div className="w-1.5 h-1 rounded-sm bg-foreground/30" />
          <div className="flex gap-px">
            <div className="w-1 h-0.5 rounded-sm bg-foreground/20" />
            <div className="w-1 h-0.5 rounded-sm bg-foreground/20" />
          </div>
        </div>
      )}
      {template === 'mega' && (
        <div className="h-full flex flex-col gap-px">
          <div className="flex items-center justify-between">
            <div className="w-1.5 h-0.5 rounded-sm bg-foreground/30" />
            <div className="flex gap-px">
              <div className="w-1 h-px rounded-sm bg-foreground/20" />
              <div className="w-1 h-px rounded-sm bg-foreground/20" />
            </div>
          </div>
          <div className="flex-1 border-t border-foreground/10 flex gap-px pt-px">
            <div className="flex-1 bg-foreground/8 rounded-sm" />
            <div className="flex-1 bg-foreground/8 rounded-sm" />
            <div className="flex-1 bg-foreground/8 rounded-sm" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Template Preview (graphical, for dropdown grid) ────────────────────────

function TemplatePreview({ template, active, branding }: { template: string; active: boolean; branding: Branding }) {
  const primary = branding.primaryColor;
  const accent = branding.accentColor;
  const navBg = branding.navBackground;
  const navText = branding.navTextColor;
  const borderCls = active ? 'ring-2 ring-primary/30' : '';

  return (
    <div className={`w-full h-16 rounded-md border border-border overflow-hidden bg-white ${borderCls}`}>
      {template === 'classic' && (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-2 py-1.5" style={{ backgroundColor: navBg }}>
            <div className="w-6 h-3 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div className="w-4 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-4 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-4 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-5 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            </div>
          </div>
          <div className="flex-1 bg-gray-50" />
        </div>
      )}
      {template === 'centered' && (
        <div className="h-full flex flex-col">
          <div className="flex flex-col items-center gap-1 px-2 py-1.5" style={{ backgroundColor: navBg }}>
            <div className="w-8 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-3 h-0.5 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-3 h-0.5 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
            </div>
          </div>
          <div className="flex-1 bg-gray-50" />
        </div>
      )}
      {template === 'minimal' && (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-2 py-1.5" style={{ backgroundColor: navBg }}>
            <div className="w-6 h-3 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
            </div>
          </div>
          <div className="flex-1 bg-gray-50" />
        </div>
      )}
      {template === 'modern' && (
        <div className="h-full flex flex-col">
          <div className="h-1" style={{ backgroundColor: accent }} />
          <div className="flex items-center justify-between px-2 py-1" style={{ backgroundColor: navBg }}>
            <div className="w-6 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-5 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            </div>
          </div>
          <div className="flex-1 bg-gray-50" />
        </div>
      )}
      {template === 'transparent' && (
        <div className="h-full flex flex-col" style={{ background: `linear-gradient(135deg, ${primary}, ${branding.secondaryColor})` }}>
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="w-6 h-3 rounded-sm bg-white/70" />
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 rounded-sm bg-white/50" />
              <div className="w-3 h-1 rounded-sm bg-white/50" />
              <div className="w-5 h-2.5 rounded-sm bg-white/20" />
            </div>
          </div>
          <div className="flex-1" />
        </div>
      )}
      {template === 'mega' && (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-2 py-1" style={{ backgroundColor: navBg }}>
            <div className="w-6 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
              <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: navText, opacity: 0.4 }} />
            </div>
          </div>
          <div className="border-t border-gray-200 px-2 py-1 flex gap-2 bg-gray-50">
            <div className="flex-1 space-y-0.5">
              <div className="w-full h-0.5 rounded bg-gray-300" />
              <div className="w-3/4 h-0.5 rounded bg-gray-200" />
              <div className="w-1/2 h-0.5 rounded bg-gray-200" />
            </div>
            <div className="flex-1 space-y-0.5">
              <div className="w-full h-0.5 rounded bg-gray-300" />
              <div className="w-3/4 h-0.5 rounded bg-gray-200" />
              <div className="w-1/2 h-0.5 rounded bg-gray-200" />
            </div>
            <div className="flex-1 space-y-0.5">
              <div className="w-full h-0.5 rounded bg-gray-300" />
              <div className="w-3/4 h-0.5 rounded bg-gray-200" />
              <div className="w-1/2 h-0.5 rounded bg-gray-200" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Preview ────────────────────────────────────────────────────────────

function NavPreview({
  items,
  childrenOf,
  branding,
}: {
  items: NavItem[];
  childrenOf: (parentId: number) => NavItem[];
  branding: Branding;
}) {
  const template = branding.navTemplate;
  const navStyle = {
    backgroundColor: template === 'transparent' ? 'transparent' : branding.navBackground,
    color: branding.navTextColor,
  };
  const pageStyle = {
    backgroundColor: branding.backgroundColor,
    color: branding.textColor,
    minHeight: 400,
  };

  const logoEl = branding.logoUrl ? (
    <img src={branding.logoUrl} alt={branding.logoAlt || 'Logo'} className="h-8 w-auto object-contain" />
  ) : (
    <div className="text-lg font-bold" style={{ color: branding.primaryColor }}>Logo</div>
  );

  // Separate regular links from button items
  const linkItems = items.filter(i => !i.isButton);
  const buttonItems = items.filter(i => i.isButton);

  const renderLink = (item: NavItem, textColorOverride?: string) => {
    const children = childrenOf(item.id);
    const isMega = template === 'mega' && children.length > 0;

    return (
      <div key={item.id} className="relative group">
        <span
          className="text-sm font-medium hover:opacity-70 cursor-pointer transition-opacity flex items-center gap-1"
          style={textColorOverride ? { color: textColorOverride } : undefined}
        >
          {item.label}
          {children.length > 0 && <span className="material-icons text-xs">expand_more</span>}
        </span>
        {children.length > 0 && !isMega && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] hidden group-hover:block z-10">
            {children.map((child) => (
              <span key={child.id} className="block px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                {child.label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderButton = (item: NavItem, style?: 'solid' | 'ghost-white') => (
    <button
      key={item.id}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
        style === 'ghost-white'
          ? 'bg-white/20 backdrop-blur hover:bg-white/30 text-white'
          : 'text-white'
      }`}
      style={style !== 'ghost-white' ? { backgroundColor: branding.primaryColor } : undefined}
    >
      {item.label}
    </button>
  );

  // Mega menu panel (shown below nav for mega template)
  const megaDropdownItems = linkItems.filter(i => childrenOf(i.id).length > 0);

  return (
    <div style={pageStyle}>
      {/* Nav Bar */}
      {template === 'classic' && (
        <nav style={navStyle} className="px-6 py-4 flex items-center justify-between border-b border-black/5">
          {logoEl}
          <div className="flex items-center gap-6">
            {linkItems.map((item) => renderLink(item))}
            {buttonItems.map((item) => renderButton(item))}
          </div>
        </nav>
      )}

      {template === 'centered' && (
        <nav style={navStyle} className="px-6 py-4 flex flex-col items-center gap-3 border-b border-black/5">
          {logoEl}
          <div className="flex items-center gap-6">
            {linkItems.map((item) => renderLink(item))}
            {buttonItems.map((item) => renderButton(item))}
          </div>
        </nav>
      )}

      {template === 'minimal' && (
        <nav style={navStyle} className="px-6 py-4 flex items-center justify-between border-b border-black/5">
          {logoEl}
          <div className="flex items-center gap-6">
            {linkItems.map((item) => renderLink(item))}
            {buttonItems.map((item) => renderButton(item))}
          </div>
        </nav>
      )}

      {template === 'modern' && (
        <>
          <div className="h-1" style={{ backgroundColor: branding.accentColor }} />
          <nav style={navStyle} className="px-6 py-4 flex items-center justify-between">
            {logoEl}
            <div className="flex items-center gap-6">
              {linkItems.map((item) => renderLink(item))}
              {buttonItems.map((item) => renderButton(item))}
            </div>
          </nav>
        </>
      )}

      {template === 'transparent' && (
        <div className="relative">
          <div className="absolute inset-0 h-64" style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }} />
          <nav className="relative px-6 py-4 flex items-center justify-between" style={{ color: '#ffffff' }}>
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.logoAlt || 'Logo'} className="h-8 w-auto object-contain brightness-0 invert" />
            ) : (
              <div className="text-lg font-bold text-white">Logo</div>
            )}
            <div className="flex items-center gap-6 text-white">
              {linkItems.map((item) => renderLink(item, '#ffffff'))}
              {buttonItems.map((item) => renderButton(item, 'ghost-white'))}
            </div>
          </nav>
        </div>
      )}

      {template === 'mega' && (
        <div className="relative">
          <nav style={navStyle} className="px-6 py-4 flex items-center justify-between border-b border-black/5">
            {logoEl}
            <div className="flex items-center gap-6">
              {linkItems.map((item) => renderLink(item))}
              {buttonItems.map((item) => renderButton(item))}
            </div>
          </nav>
          {/* Mega menu panel preview */}
          {megaDropdownItems.length > 0 && (
            <div
              className="px-6 py-4 border-b border-black/5"
              style={{ backgroundColor: branding.navBackground }}
            >
              <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(megaDropdownItems.length, 4)}, 1fr)` }}>
                {megaDropdownItems.map((parent) => (
                  <div key={parent.id}>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: branding.primaryColor }}>
                      {parent.label}
                    </div>
                    <div className="space-y-1">
                      {childrenOf(parent.id).map((child) => (
                        <div key={child.id} className="text-sm cursor-pointer hover:opacity-70 transition-opacity" style={{ color: branding.navTextColor }}>
                          {child.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {template === 'none' && (
        <div className="px-6 py-3 text-xs uppercase tracking-wider opacity-50 border-b border-dashed" style={{ color: branding.textColor }}>
          Top navigation is hidden on this site
        </div>
      )}

      {/* Page body placeholder */}
      <div className="p-8 space-y-6" style={template === 'transparent' ? { position: 'relative', zIndex: 1, paddingTop: 120 } : undefined}>
        <div className="text-center py-12 space-y-4">
          <h1 className="text-3xl font-bold" style={{ color: branding.textColor }}>Welcome to Your Site</h1>
          <p className="text-lg opacity-60 max-w-xl mx-auto">
            This is a preview of how your navigation will look on your website.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <div className="px-6 py-2.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: branding.primaryColor }}>
              Primary Action
            </div>
            <div className="px-6 py-2.5 rounded-lg text-sm font-medium border-2" style={{ borderColor: branding.primaryColor, color: branding.primaryColor }}>
              Secondary
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border p-4 space-y-2" style={{ borderColor: branding.primaryColor + '20' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: branding.accentColor + '20' }}>
                <span className="material-icons text-base" style={{ color: branding.accentColor }}>star</span>
              </div>
              <div className="h-3 rounded w-2/3" style={{ backgroundColor: branding.textColor + '15' }} />
              <div className="h-2 rounded w-full" style={{ backgroundColor: branding.textColor + '08' }} />
              <div className="h-2 rounded w-4/5" style={{ backgroundColor: branding.textColor + '08' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
