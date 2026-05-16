'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface PreviewSettings {
  defaultScale: number;
  previewDimensions: { width: number; height: number };
  showResizeControls: boolean;
  gridLayout: 'auto' | 'grid' | 'list' | 'comparison';
  maxPreviews: number;
  enableLayerControls: boolean;
  autoFitContent: boolean;
}

export interface PreviewContextValue {
  settings: PreviewSettings;
  updatePreviewSettings: (settings: Partial<PreviewSettings>) => void;
  resetToDefaults: () => void;
  
  // Current session state
  currentScale: number;
  setCurrentScale: (scale: number) => void;
  currentDimensions: { width: number; height: number };
  setCurrentDimensions: (dimensions: { width: number; height: number }) => void;
  currentLayout: 'auto' | 'grid' | 'list' | 'comparison';
  setCurrentLayout: (layout: 'auto' | 'grid' | 'list' | 'comparison') => void;
}

const defaultSettings: PreviewSettings = {
  defaultScale: 0.75,
  previewDimensions: { width: 300, height: 400 },
  showResizeControls: false,
  gridLayout: 'auto',
  maxPreviews: 12,
  enableLayerControls: false,
  autoFitContent: true
};

const PreviewContext = createContext<PreviewContextValue | null>(null);

export interface PreviewProviderProps {
  children: ReactNode;
  initialSettings?: Partial<PreviewSettings>;
}

export function PreviewProvider({ children, initialSettings = {} }: PreviewProviderProps) {
  const [settings, setSettings] = useState<PreviewSettings>({
    ...defaultSettings,
    ...initialSettings
  });
  
  // Session state
  const [currentScale, setCurrentScale] = useState(settings.defaultScale);
  const [currentDimensions, setCurrentDimensions] = useState(settings.previewDimensions);
  const [currentLayout, setCurrentLayout] = useState(settings.gridLayout);

  const updatePreviewSettings = useCallback((newSettings: Partial<PreviewSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...newSettings
    }));
    
    // Update current session state if relevant settings changed
    if (newSettings.defaultScale !== undefined) {
      setCurrentScale(newSettings.defaultScale);
    }
    if (newSettings.previewDimensions !== undefined) {
      setCurrentDimensions(newSettings.previewDimensions);
    }
    if (newSettings.gridLayout !== undefined) {
      setCurrentLayout(newSettings.gridLayout);
    }
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(defaultSettings);
    setCurrentScale(defaultSettings.defaultScale);
    setCurrentDimensions(defaultSettings.previewDimensions);
    setCurrentLayout(defaultSettings.gridLayout);
  }, []);

  const value: PreviewContextValue = {
    settings,
    updatePreviewSettings,
    resetToDefaults,
    currentScale,
    setCurrentScale,
    currentDimensions,
    setCurrentDimensions,
    currentLayout,
    setCurrentLayout
  };

  return (
    <PreviewContext.Provider value={value}>
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreviewContext(): PreviewContextValue {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error('usePreviewContext must be used within a PreviewProvider');
  }
  return context;
}

// Utility hook for preview settings only
export function usePreviewSettings() {
  const { settings, updatePreviewSettings, resetToDefaults } = usePreviewContext();
  return { settings, updatePreviewSettings, resetToDefaults };
}

// Utility hook for current session state only
export function usePreviewState() {
  const {
    currentScale,
    setCurrentScale,
    currentDimensions,
    setCurrentDimensions,
    currentLayout,
    setCurrentLayout
  } = usePreviewContext();
  
  return {
    scale: currentScale,
    setScale: setCurrentScale,
    dimensions: currentDimensions,
    setDimensions: setCurrentDimensions,
    layout: currentLayout,
    setLayout: setCurrentLayout
  };
}