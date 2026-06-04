import { useState, useCallback, useMemo } from "react";
import { calculateFitScale, getPresetScales } from "../utils/layerTransforms";

export interface UsePreviewScaleOptions {
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  contentSize?: { width: number; height: number };
  containerSize?: { width: number; height: number };
}

export interface UsePreviewScaleReturn {
  scale: number;
  setScale: (scale: number) => void;
  presetScales: { name: string; scale: number }[];
  fitToContainer: () => void;
  resetScale: () => void;
  scaleUp: () => void;
  scaleDown: () => void;
  canScaleUp: boolean;
  canScaleDown: boolean;
}

export function usePreviewScale({
  initialScale = 1,
  minScale = 0.25,
  maxScale = 2,
  contentSize,
  containerSize
}: UsePreviewScaleOptions = {}): UsePreviewScaleReturn {
  const [scale, setScaleInternal] = useState(initialScale);
  
  const presetScales = useMemo(() => getPresetScales(), []);
  
  const setScale = useCallback((newScale: number) => {
    const clampedScale = Math.min(Math.max(newScale, minScale), maxScale);
    setScaleInternal(clampedScale);
  }, [minScale, maxScale]);

  const fitToContainer = useCallback(() => {
    if (contentSize && containerSize) {
      const fitScale = calculateFitScale(contentSize, containerSize, maxScale);
      setScale(fitScale);
    }
  }, [contentSize, containerSize, maxScale, setScale]);

  const resetScale = useCallback(() => {
    setScale(initialScale);
  }, [initialScale, setScale]);

  const scaleUp = useCallback(() => {
    const currentIndex = presetScales.findIndex(preset => preset.scale >= scale);
    const nextIndex = Math.min(currentIndex + 1, presetScales.length - 1);
    setScale(presetScales[nextIndex].scale);
  }, [scale, presetScales, setScale]);

  const scaleDown = useCallback(() => {
    const currentIndex = presetScales.findIndex(preset => preset.scale >= scale);
    const prevIndex = Math.max(currentIndex - 1, 0);
    setScale(presetScales[prevIndex].scale);
  }, [scale, presetScales, setScale]);

  const canScaleUp = scale < maxScale;
  const canScaleDown = scale > minScale;

  return {
    scale,
    setScale,
    presetScales,
    fitToContainer,
    resetScale,
    scaleUp,
    scaleDown,
    canScaleUp,
    canScaleDown
  };
}