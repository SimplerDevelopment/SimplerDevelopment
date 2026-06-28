'use client';

import React, { useEffect, useState, useRef, useContext } from "react";
import EditorContext from "./EditorContext";

// Wave 2I: routes paged font lookups through the sd2026 storefront font
// endpoint at /api/storefront/${websiteId}/designs/fonts so URLs are
// website-scoped and don't depend on the legacy /api/fonts service.
interface FontOption {
  value: string;
  label: string;
  fontUrl?: string;
}

// Loads a remote font into document.fonts so the preview text renders in it.
const loadFontFace = (fontFamily: string, fontUrl?: string) => {
  if (typeof document === "undefined" || !fontUrl) return;
  try {
    const font = new FontFace(fontFamily, `url(${fontUrl})`);
    font.load().then(() => {
      document.fonts.add(font);
    }).catch(() => {
      // ignore — font load failures are non-fatal
    });
  } catch {
    // ignore
  }
};

export const FontSelector = ({ text, onChange }: { text?: string; onChange: (k: string, v: string) => void }) => {
  const limit = 10;
  const { websiteId } = useContext(EditorContext);
  const [selectedFont, setSelectedFont] = useState<FontOption | null>(null);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<FontOption[]>([]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchFonts = async (q: string, p: number) => {
    try {
      setLoading(true);
      // Wave 2I: was `/api/fonts?...` — now goes through the sd2026
      // storefront fonts endpoint. Falls back gracefully if no siteId.
      const base = websiteId
        ? `/api/storefront/${websiteId}/designs/fonts`
        : '/api/fonts';
      const response = await fetch(
        `${base}?page=${p}&limit=${limit}&search=${encodeURIComponent(q)}`
      );
      const json = await response.json();
      const data = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      const next: FontOption[] = data.map((font: { family: string; files?: { regular?: string }; menu?: string }) => ({
        value: font.family,
        label: font.family,
        fontUrl: font.files?.regular || font.menu,
      }));
      setOptions((prev) => (p === 1 ? next : [...prev, ...next]));
    } catch (err) {
      console.error("Failed to load fonts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setPage(1);
      fetchFonts(search, 1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  useEffect(() => {
    options.forEach((o) => loadFontFace(o.value, o.fontUrl));
  }, [options]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (typeof document === "undefined") return;
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const select = (opt: FontOption) => {
    setSelectedFont(opt);
    loadFontFace(opt.value, opt.fontUrl);
    onChange("font", opt.value);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative" style={{ zIndex: 9 }}>
      <input
        type="text"
        value={open ? search : (selectedFont?.label ?? search)}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        placeholder="Search fonts..."
        className="border border-gray-300 rounded px-3 py-2 w-full text-sm"
        style={{ fontFamily: selectedFont?.value ?? undefined }}
      />
      {open && (
        <div className="absolute left-0 right-0 mt-1 max-h-64 overflow-auto rounded border border-gray-200 bg-white shadow-lg">
          {loading && options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No fonts found</div>
          ) : (
            <>
              {options.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => select(opt)}
                  className="block w-full text-left px-3 py-2 hover:bg-gray-100"
                  style={{ fontFamily: opt.value }}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  fetchFonts(search, next);
                }}
                className="block w-full text-center px-3 py-2 text-sm text-blue-600 hover:bg-gray-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
