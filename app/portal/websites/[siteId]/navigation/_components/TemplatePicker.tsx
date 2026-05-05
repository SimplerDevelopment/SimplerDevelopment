// ─── TemplatePicker: header dropdown trigger + grid of template previews ────

'use client';

import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, type Branding, type NavTemplate } from '../_lib/types';

interface Props {
  branding: Branding;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplatePicker({ branding, onSelectTemplate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = TEMPLATES.find((t) => t.id === branding.navTemplate) || TEMPLATES[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-background hover:bg-muted/50 transition-colors"
      >
        <TemplateIconSmall template={selected.id} />
        <span className="text-sm font-medium text-foreground">{selected.label}</span>
        <span className="material-icons text-base text-muted-foreground">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Navigation Template
            </span>
          </div>
          <div className="p-2 grid grid-cols-2 gap-2">
            {TEMPLATES.map((tmpl) => (
              <TemplateGridButton
                key={tmpl.id}
                template={tmpl}
                active={branding.navTemplate === tmpl.id}
                branding={branding}
                onClick={() => {
                  onSelectTemplate(tmpl.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateGridButton({
  template,
  active,
  branding,
  onClick,
}: {
  template: NavTemplate;
  active: boolean;
  branding: Branding;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all ${
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-primary/30 hover:bg-muted/30'
      }`}
    >
      <TemplatePreview template={template.id} active={active} branding={branding} />
      <div>
        <div className="text-xs font-semibold text-foreground">{template.label}</div>
        <div className="text-[10px] text-muted-foreground leading-tight">{template.description}</div>
      </div>
    </button>
  );
}

// ─── Template Icon (small, for header dropdown trigger) ─────────────────────

function TemplateIconSmall({ template }: { template: string }) {
  return (
    <div
      className="w-6 h-4 rounded border border-border flex-shrink-0 bg-muted/30"
      style={{ padding: 2 }}
    >
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

function TemplatePreview({
  template,
  active,
  branding,
}: {
  template: string;
  active: boolean;
  branding: Branding;
}) {
  const primary = branding.primaryColor;
  const accent = branding.accentColor;
  const navBg = branding.navBackground;
  const navText = branding.navTextColor;
  const borderCls = active ? 'ring-2 ring-primary/30' : '';

  return (
    <div
      className={`w-full h-16 rounded-md border border-border overflow-hidden bg-white ${borderCls}`}
    >
      {template === 'classic' && (
        <div className="h-full flex flex-col">
          <div
            className="flex items-center justify-between px-2 py-1.5"
            style={{ backgroundColor: navBg }}
          >
            <div className="w-6 h-3 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div
                className="w-4 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div
                className="w-4 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div className="w-5 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            </div>
          </div>
          <div className="flex-1 bg-gray-50" />
        </div>
      )}
      {template === 'centered' && (
        <div className="h-full flex flex-col">
          <div
            className="flex flex-col items-center gap-1 px-2 py-1.5"
            style={{ backgroundColor: navBg }}
          >
            <div className="w-8 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-0.5 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div
                className="w-3 h-0.5 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div
                className="w-3 h-0.5 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
            </div>
          </div>
          <div className="flex-1 bg-gray-50" />
        </div>
      )}
      {template === 'minimal' && (
        <div className="h-full flex flex-col">
          <div
            className="flex items-center justify-between px-2 py-1.5"
            style={{ backgroundColor: navBg }}
          >
            <div className="w-6 h-3 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div
                className="w-3 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
            </div>
          </div>
          <div className="flex-1 bg-gray-50" />
        </div>
      )}
      {template === 'modern' && (
        <div className="h-full flex flex-col">
          <div className="h-1" style={{ backgroundColor: accent }} />
          <div
            className="flex items-center justify-between px-2 py-1"
            style={{ backgroundColor: navBg }}
          >
            <div className="w-6 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div
                className="w-3 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div className="w-5 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            </div>
          </div>
          <div className="flex-1 bg-gray-50" />
        </div>
      )}
      {template === 'transparent' && (
        <div
          className="h-full flex flex-col"
          style={{
            background: `linear-gradient(135deg, ${primary}, ${branding.secondaryColor})`,
          }}
        >
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
          <div
            className="flex items-center justify-between px-2 py-1"
            style={{ backgroundColor: navBg }}
          >
            <div className="w-6 h-2.5 rounded-sm" style={{ backgroundColor: primary }} />
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div
                className="w-3 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
              <div
                className="w-3 h-1 rounded-sm"
                style={{ backgroundColor: navText, opacity: 0.4 }}
              />
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
