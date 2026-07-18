'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface DesignTokens {
  colors: TokenColor[];
  fonts: TokenFont[];
  spacing: TokenSpacing[];
  radii: TokenRadius[];
}

export interface TokenColor {
  name: string;
  value: string; // hex
}

export interface TokenFont {
  name: string;
  value: string; // CSS font-family or class
}

export interface TokenSpacing {
  name: string;
  value: string; // e.g., "8px", "1rem"
}

export interface TokenRadius {
  name: string;
  value: string; // e.g., "4px", "9999px"
}

const DEFAULT_TOKENS: DesignTokens = {
  colors: [
    { name: 'White', value: '#ffffff' },
    { name: 'Black', value: '#000000' },
    { name: 'Gray 50', value: '#fafafa' },
    { name: 'Gray 100', value: '#f5f5f4' },
    { name: 'Gray 200', value: '#e7e5e4' },
    { name: 'Gray 500', value: '#78716c' },
    { name: 'Gray 800', value: '#292524' },
    { name: 'Gray 900', value: '#1c1917' },
    { name: 'Blue', value: '#2563eb' },
    { name: 'Green', value: '#10b981' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Red', value: '#ef4444' },
  ],
  fonts: [
    { name: 'System Sans', value: 'system-ui, sans-serif' },
    { name: 'Serif', value: 'Georgia, serif' },
    { name: 'Mono', value: 'ui-monospace, monospace' },
  ],
  spacing: [
    { name: 'XS', value: '4px' },
    { name: 'SM', value: '8px' },
    { name: 'MD', value: '16px' },
    { name: 'LG', value: '24px' },
    { name: 'XL', value: '32px' },
    { name: '2XL', value: '48px' },
    { name: '3XL', value: '64px' },
  ],
  radii: [
    { name: 'None', value: '0' },
    { name: 'SM', value: '4px' },
    { name: 'MD', value: '8px' },
    { name: 'LG', value: '12px' },
    { name: 'XL', value: '16px' },
    { name: 'Full', value: '9999px' },
  ],
};

const STORAGE_KEY = 'sd-design-tokens';

interface DesignTokensContextValue {
  tokens: DesignTokens;
  updateTokens: (tokens: DesignTokens) => void;
  addColor: (color: TokenColor) => void;
  removeColor: (index: number) => void;
  updateColor: (index: number, color: TokenColor) => void;
  resetToDefaults: () => void;
}

const DesignTokensContext = createContext<DesignTokensContextValue | null>(null);

export function DesignTokensProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_TOKENS);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DesignTokens;
        setTokens({ ...DEFAULT_TOKENS, ...parsed });
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist to localStorage
  const persist = useCallback((t: DesignTokens) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    } catch {
      // ignore
    }
  }, []);

  const updateTokens = useCallback((newTokens: DesignTokens) => {
    setTokens(newTokens);
    persist(newTokens);
  }, [persist]);

  const addColor = useCallback((color: TokenColor) => {
    setTokens((prev) => {
      const updated = { ...prev, colors: [...prev.colors, color] };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const removeColor = useCallback((index: number) => {
    setTokens((prev) => {
      const updated = { ...prev, colors: prev.colors.filter((_, i) => i !== index) };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateColor = useCallback((index: number, color: TokenColor) => {
    setTokens((prev) => {
      const colors = [...prev.colors];
      colors[index] = color;
      const updated = { ...prev, colors };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const resetToDefaults = useCallback(() => {
    setTokens(DEFAULT_TOKENS);
    persist(DEFAULT_TOKENS);
  }, [persist]);

  return (
    <DesignTokensContext.Provider value={{ tokens, updateTokens, addColor, removeColor, updateColor, resetToDefaults }}>
      {children}
    </DesignTokensContext.Provider>
  );
}

export function useDesignTokens() {
  const ctx = useContext(DesignTokensContext);
  if (!ctx) {
    // Return defaults if outside provider (e.g., in public pages)
    return {
      tokens: DEFAULT_TOKENS,
      updateTokens: () => {},
      addColor: () => {},
      removeColor: () => {},
      updateColor: () => {},
      resetToDefaults: () => {},
    };
  }
  return ctx;
}
