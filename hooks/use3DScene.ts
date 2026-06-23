'use client';

import { useEffect, useState } from 'react';

/**
 * Hook for managing Three.js scene state and optimization
 */
export function use3DScene() {
  const [supportsWebGL, setSupportsWebGL] = useState(true);
  const [isLowPerformance, setIsLowPerformance] = useState(false);

  useEffect(() => {
    // Check WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
      setSupportsWebGL(false);
      return;
    }

    // Simple performance detection
    // Check for mobile or low-end devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const hasLowMemory = (navigator as any).deviceMemory && (navigator as any).deviceMemory < 4;

    setIsLowPerformance(isMobile || hasLowMemory);
  }, []);

  return {
    supportsWebGL,
    isLowPerformance,
    // Recommended frame loop mode based on performance
    frameloopMode: isLowPerformance ? 'demand' as const : 'always' as const,
  };
}
