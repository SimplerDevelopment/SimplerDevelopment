'use client';

import { useState } from 'react';
import { PageSettings } from '@/types/blocks';

interface PageSettingsPanelProps {
  settings: PageSettings;
  onChange: (updates: Partial<PageSettings>) => void;
}

const maxWidthPresets = [
  { value: '', label: 'Full width' },
  { value: '640px', label: 'Small (640px)' },
  { value: '768px', label: 'Medium (768px)' },
  { value: '1024px', label: 'Large (1024px)' },
  { value: '1200px', label: 'XL (1200px)' },
  { value: '1440px', label: '2XL (1440px)' },
];

const spacingPresets = [
  { value: '', label: 'None' },
  { value: '0.5rem', label: '8px' },
  { value: '1rem', label: '16px' },
  { value: '1.5rem', label: '24px' },
  { value: '2rem', label: '32px' },
  { value: '3rem', label: '48px' },
  { value: '4rem', label: '64px' },
  { value: '6rem', label: '96px' },
  { value: '8rem', label: '128px' },
];

export function PageSettingsPanel({ settings, onChange }: PageSettingsPanelProps) {
  return (
    <div className="space-y-5">
      <div className="pb-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Page Settings</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Styles applied to the page container
        </p>
      </div>

      {/* Max Width */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Max Width</label>
        <select
          value={settings.maxWidth || ''}
          onChange={(e) => onChange({ maxWidth: e.target.value || undefined })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          {maxWidthPresets.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Background */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Background Color</label>
        <div className="flex gap-2">
          <input
            type="color"
            value={settings.backgroundColor || '#ffffff'}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
            className="w-10 h-9 rounded border border-border cursor-pointer"
          />
          <input
            type="text"
            value={settings.backgroundColor || ''}
            onChange={(e) => onChange({ backgroundColor: e.target.value || undefined })}
            placeholder="transparent"
            className="flex-1 text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono"
          />
          {settings.backgroundColor && (
            <button
              type="button"
              onClick={() => onChange({ backgroundColor: undefined })}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Background Image */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Background Image</label>
        <input
          type="text"
          value={settings.backgroundImage || ''}
          onChange={(e) => onChange({ backgroundImage: e.target.value || undefined })}
          placeholder="URL or /path/to/image.jpg"
          className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground"
        />
        {settings.backgroundImage && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1">Size</label>
              <select
                value={settings.backgroundSize || 'cover'}
                onChange={(e) => onChange({ backgroundSize: e.target.value as PageSettings['backgroundSize'] })}
                className="w-full text-xs rounded border border-border bg-background px-2 py-1 text-foreground"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1">Position</label>
              <select
                value={settings.backgroundPosition || 'center'}
                onChange={(e) => onChange({ backgroundPosition: e.target.value })}
                className="w-full text-xs rounded border border-border bg-background px-2 py-1 text-foreground"
              >
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Text Color */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Text Color</label>
        <div className="flex gap-2">
          <input
            type="color"
            value={settings.color || '#000000'}
            onChange={(e) => onChange({ color: e.target.value })}
            className="w-10 h-9 rounded border border-border cursor-pointer"
          />
          <input
            type="text"
            value={settings.color || ''}
            onChange={(e) => onChange({ color: e.target.value || undefined })}
            placeholder="inherit"
            className="flex-1 text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono"
          />
        </div>
      </div>

      {/* Font Family */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Font Family</label>
        <select
          value={settings.fontFamily || ''}
          onChange={(e) => onChange({ fontFamily: e.target.value || undefined })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="">Default</option>
          <option value="font-sans">Sans Serif</option>
          <option value="font-serif">Serif</option>
          <option value="font-mono">Monospace</option>
        </select>
      </div>

      {/* Padding */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Padding</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Top</label>
            <select
              value={settings.paddingTop || ''}
              onChange={(e) => onChange({ paddingTop: e.target.value || undefined })}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1 text-foreground"
            >
              {spacingPresets.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Bottom</label>
            <select
              value={settings.paddingBottom || ''}
              onChange={(e) => onChange({ paddingBottom: e.target.value || undefined })}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1 text-foreground"
            >
              {spacingPresets.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Left</label>
            <select
              value={settings.paddingLeft || ''}
              onChange={(e) => onChange({ paddingLeft: e.target.value || undefined })}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1 text-foreground"
            >
              {spacingPresets.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Right</label>
            <select
              value={settings.paddingRight || ''}
              onChange={(e) => onChange({ paddingRight: e.target.value || undefined })}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1 text-foreground"
            >
              {spacingPresets.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* CSS Class */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">CSS Class</label>
        <input
          type="text"
          value={settings.cssClass || ''}
          onChange={(e) => onChange({ cssClass: e.target.value || undefined })}
          placeholder="e.g., dark-theme prose"
          className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground"
        />
      </div>
    </div>
  );
}
