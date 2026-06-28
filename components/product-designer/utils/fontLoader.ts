/**
 * Utility to load fonts into the browser's font cache
 */

import { DesignApi } from './designApi';

interface FontInfo {
  family: string;
  url?: string;
}

/**
 * Load a single font into the browser
 */
export const loadFont = async (fontFamily: string, fontUrl?: string): Promise<void> => {
  if (!fontFamily || fontFamily === 'Arial' || fontFamily === 'Helvetica' || fontFamily === 'sans-serif') {
    // Skip system fonts
    return;
  }

  try {
    // Check if font is already loaded
    const isLoaded = document.fonts.check(`12px "${fontFamily}"`);
    if (isLoaded) {
      return;
    }

    // If we have a font URL, load it
    if (fontUrl) {
      const font = new FontFace(fontFamily, `url(${fontUrl})`);
      await font.load();
      document.fonts.add(font);
    } else {
      // Wave 2I: was a hardcoded `http://localhost:3000/api/fonts?...` (!).
      // Now goes through the sd2026 storefront fonts endpoint when a siteId
      // has been wired via DesignApi.setSiteId(). If no siteId is available
      // (font lookup outside the editor) we silently bail — the font just
      // doesn't get registered, the layer still renders in the system font.
      if (!DesignApi.siteId) return;
      const response = await fetch(
        `/api/storefront/${DesignApi.siteId}/designs/fonts?search=${encodeURIComponent(fontFamily)}&limit=1`
      );

      if (response.ok) {
        const json = await response.json();
        const fonts = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
        if (fonts && fonts.length > 0) {
          const fontData = fonts[0];
          const url = fontData.files?.regular || fontData.menu;
          if (url) {
            const font = new FontFace(fontFamily, `url(${url})`);
            await font.load();
            document.fonts.add(font);
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to load font "${fontFamily}":`, error);
  }
};

/**
 * Load all fonts used in design layers
 */
import type { LayerData } from "../designerTypes";
export const loadDesignFonts = async (layers: LayerData[]): Promise<void> => {
  if (!layers || !Array.isArray(layers)) {
    return;
  }

  // Extract unique font families from all text layers
  const fontFamilies = new Set<string>();

  layers.forEach(layer => {
    if (layer.type === 'text' && layer.font) {
      fontFamilies.add(layer.font);
    }
  });

  // Load all fonts in parallel
  const loadPromises = Array.from(fontFamilies).map(fontFamily =>
    loadFont(fontFamily)
  );

  try {
    await Promise.all(loadPromises);
    console.log(`Loaded ${fontFamilies.size} fonts for design`);
  } catch (error) {
    console.error('Error loading design fonts:', error);
  }
};

/**
 * Preload commonly used fonts
 */
export const preloadCommonFonts = async (): Promise<void> => {
  const commonFonts = [
    'Roboto',
    'Open Sans',
    'Montserrat',
    'Lato',
    'Raleway',
    'Poppins',
    'Oswald',
    'Playfair Display'
  ];

  for (const fontFamily of commonFonts) {
    try {
      await loadFont(fontFamily);
    } catch (error) {
      // Silently continue if a font fails to load
    }
  }
};