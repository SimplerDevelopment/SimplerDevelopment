'use client';

import type { Canvas, FabricText } from 'fabric';

export interface GoogleFontSpec {
  family: string;
  variants?: string[];
  category?: string;
}

interface VirtualizedFont {
  layerId: string;
  googleFont: GoogleFontSpec;
  fabricObject: FabricText;
  lockedFontFamily: string;
}

const loadedFonts = new Set<string>();

/**
 * Inject a `<link>` for the requested Google Font (idempotent) and wait until
 * `document.fonts.ready` resolves so Fabric measures glyphs against the loaded
 * font face rather than a fallback.
 */
export async function loadGoogleFont(font: GoogleFontSpec): Promise<void> {
  if (typeof window === 'undefined') return;
  if (loadedFonts.has(font.family)) return;
  loadedFonts.add(font.family);

  const familyParam = font.family.replace(/\s+/g, '+');
  const variants = font.variants?.length ? font.variants.join(',') : '400';
  const href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${variants}&display=swap`;

  if (!document.querySelector(`link[data-font-family="${font.family}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-font-family', font.family);
    document.head.appendChild(link);
  }

  try {
    if ('fonts' in document) {
      await document.fonts.load(`16px "${font.family}"`);
      await document.fonts.ready;
    }
  } catch {
    // Non-fatal — fall back to default.
  }
}

/**
 * Locks a Fabric text object's `fontFamily` to a chosen Google font. Any
 * subsequent attempt to set `fontFamily` is silently rerouted back to the
 * locked value — Fabric's internal text-editing code path otherwise resets
 * the font during edits.
 */
class FontVirtualizer {
  private virtualizedFonts = new Map<string, VirtualizedFont>();
  private canvas: Canvas | null = null;
  private isIntercepting = false;

  setCanvas(canvas: Canvas) {
    this.canvas = canvas;
    this.setupInterception();
  }

  async registerGoogleFont(
    layerId: string,
    fabricObject: FabricText,
    googleFont: GoogleFontSpec
  ): Promise<void> {
    await loadGoogleFont(googleFont);
    const lockedFontFamily = googleFont.family;
    this.virtualizedFonts.set(layerId, {
      layerId,
      googleFont,
      fabricObject,
      lockedFontFamily,
    });
    this.virtualizeFabricObject(fabricObject, lockedFontFamily);
  }

  unregisterFont(layerId: string): void {
    const v = this.virtualizedFonts.get(layerId);
    if (!v) return;
    this.devirtualizeFabricObject(v.fabricObject);
    this.virtualizedFonts.delete(layerId);
  }

  hasVirtualizedFont(layerId: string): boolean {
    return this.virtualizedFonts.has(layerId);
  }

  async updateVirtualizedFont(
    layerId: string,
    newGoogleFont: GoogleFontSpec
  ): Promise<void> {
    const v = this.virtualizedFonts.get(layerId);
    if (!v) return;
    await loadGoogleFont(newGoogleFont);
    v.googleFont = newGoogleFont;
    v.lockedFontFamily = newGoogleFont.family;
    (v.fabricObject as unknown as { _virtualizedFontFamily: string })._virtualizedFontFamily =
      newGoogleFont.family;
    v.fabricObject.set({ fontFamily: newGoogleFont.family });
  }

  clear(): void {
    this.virtualizedFonts.forEach((v) => this.devirtualizeFabricObject(v.fabricObject));
    this.virtualizedFonts.clear();
  }

  private virtualizeFabricObject(fabricObject: FabricText, lockedFontFamily: string): void {
    const obj = fabricObject as unknown as {
      _virtualizedFontFamily?: string;
      _isVirtualized?: boolean;
    };
    obj._virtualizedFontFamily = lockedFontFamily;
    obj._isVirtualized = true;

    Object.defineProperty(fabricObject, 'fontFamily', {
      get() {
        return (
          (this as { _virtualizedFontFamily?: string })._virtualizedFontFamily ||
          lockedFontFamily
        );
      },
      set(value: string) {
        // Ignore attempts to change away from the locked font.
        void value;
        (this as { _virtualizedFontFamily?: string })._virtualizedFontFamily =
          lockedFontFamily;
      },
      configurable: true,
      enumerable: true,
    });

    fabricObject.set({ fontFamily: lockedFontFamily });
  }

  private devirtualizeFabricObject(fabricObject: FabricText): void {
    const obj = fabricObject as unknown as {
      _virtualizedFontFamily?: string;
      _isVirtualized?: boolean;
      fontFamily?: string;
    };
    if (!obj._isVirtualized) return;
    const currentFamily = obj.fontFamily;
    delete obj.fontFamily;
    delete obj._virtualizedFontFamily;
    delete obj._isVirtualized;
    Object.defineProperty(fabricObject, 'fontFamily', {
      writable: true,
      configurable: true,
      enumerable: true,
      value: currentFamily,
    });
  }

  private setupInterception(): void {
    if (!this.canvas || this.isIntercepting) return;
    this.isIntercepting = true;
    const originalRenderAll = this.canvas.renderAll.bind(this.canvas);
    this.canvas.renderAll = () => {
      this.enforceVirtualizedFonts();
      return originalRenderAll();
    };
  }

  private enforceVirtualizedFonts(): void {
    this.virtualizedFonts.forEach((v) => {
      const locked = (v.fabricObject as unknown as { _virtualizedFontFamily?: string })
        ._virtualizedFontFamily;
      if (locked && v.fabricObject.fontFamily !== locked) {
        v.fabricObject.set({ fontFamily: locked });
      }
    });
  }
}

let globalFontVirtualizer: FontVirtualizer | null = null;

export function getFontVirtualizer(canvas?: Canvas): FontVirtualizer {
  if (!globalFontVirtualizer) {
    globalFontVirtualizer = new FontVirtualizer();
  }
  if (canvas) globalFontVirtualizer.setCanvas(canvas);
  return globalFontVirtualizer;
}

export function initializeFontVirtualization(canvas: Canvas): FontVirtualizer {
  return getFontVirtualizer(canvas);
}

export { FontVirtualizer };
