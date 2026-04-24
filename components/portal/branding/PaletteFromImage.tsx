'use client';

import { useRef, useState } from 'react';
import { extractPalette, type PaletteColor } from '@/lib/branding/palette-extract';
import { autoAssignRoles, type RoleAssignment } from '@/lib/branding/palette-assign';

type Role = keyof RoleAssignment | 'none';

const ROLE_LABELS: Record<Exclude<Role, 'none'>, string> = {
  primaryColor: 'Primary',
  secondaryColor: 'Secondary',
  accentColor: 'Accent',
  backgroundColor: 'Background',
  textColor: 'Text',
};

const ROLE_OPTIONS: Role[] = ['none', 'primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor'];

interface Props {
  onApply: (assignment: RoleAssignment) => void;
}

export function PaletteFromImage({ onApply }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [assignments, setAssignments] = useState<Map<string, Role>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file (PNG, JPG, WebP, SVG).');
      return;
    }
    setError(null);
    setLoading(true);
    setPalette([]);
    setAssignments(new Map());

    try {
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setFileName(file.name);
      const extracted = await extractPalette(file, 8);
      setPalette(extracted);

      // Auto-assign roles and set suggestions
      const roles = autoAssignRoles(extracted);
      const initial = new Map<string, Role>();
      for (const color of extracted) {
        const role = (Object.keys(roles) as Array<keyof RoleAssignment>).find(
          (k) => roles[k] === color.hex,
        );
        initial.set(color.hex, role ?? 'none');
      }
      setAssignments(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const setRole = (hex: string, role: Role) => {
    const next = new Map(assignments);
    if (role !== 'none') {
      // A role can only be filled by one color — clear any other swatch holding it
      for (const [k, v] of next) {
        if (v === role && k !== hex) next.set(k, 'none');
      }
    }
    next.set(hex, role);
    setAssignments(next);
  };

  const apply = () => {
    const result: RoleAssignment = {};
    for (const [hex, role] of assignments) {
      if (role !== 'none') result[role] = hex;
    }
    onApply(result);
  };

  const anyAssigned = Array.from(assignments.values()).some((v) => v !== 'none');

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className="material-icons text-base text-primary">colorize</span>
        <div className="text-sm font-medium text-foreground">Extract palette from image</div>
        <div className="text-xs text-muted-foreground ml-auto">Logo, mood board, or reference photo</div>
      </div>

      <div className="p-4 space-y-4">
        {!imageUrl && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'
            }`}
          >
            <span className="material-icons text-4xl text-muted-foreground">image</span>
            <div className="text-sm font-medium text-foreground mt-2">Drop an image or click to upload</div>
            <div className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP, SVG — processed locally in your browser</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        )}

        {imageUrl && (
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="h-24 w-24 object-contain rounded-md border border-border bg-muted" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-foreground truncate">{fileName}</div>
              {loading && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <span className="material-icons text-sm animate-spin">refresh</span>
                  Extracting colors…
                </div>
              )}
              {!loading && palette.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">{palette.length} colors found — adjust role assignments below.</div>
              )}
            </div>
            <button
              onClick={() => {
                setImageUrl(null);
                setFileName(null);
                setPalette([]);
                setAssignments(new Map());
                setError(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <span className="material-icons text-sm">close</span>
              Clear
            </button>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {palette.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {palette.map((c) => (
                <div key={c.hex} className="rounded-md border border-border overflow-hidden bg-background">
                  <div className="h-16" style={{ backgroundColor: c.hex }} />
                  <div className="p-2 space-y-1.5">
                    <code className="font-mono text-[11px] text-foreground">{c.hex.toUpperCase()}</code>
                    <select
                      value={assignments.get(c.hex) ?? 'none'}
                      onChange={(e) => setRole(c.hex, e.target.value as Role)}
                      className="w-full text-xs px-2 py-1 rounded border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r === 'none' ? '—' : ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground mr-auto">
                Applying overwrites the current values. You still need to Save.
              </div>
              <button
                onClick={apply}
                disabled={!anyAssigned}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <span className="material-icons text-base">done</span>
                Apply to profile
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
