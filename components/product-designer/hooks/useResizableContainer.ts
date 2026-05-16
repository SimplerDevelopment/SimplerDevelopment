// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
import { useState, useCallback, useRef, useEffect } from "react";

export interface UseResizableContainerOptions {
  initialDimensions: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  maintainAspectRatio?: boolean;
  onResize?: (dimensions: { width: number; height: number }) => void;
  disabled?: boolean;
}

export interface UseResizableContainerReturn {
  dimensions: { width: number; height: number };
  setDimensions: (dimensions: { width: number; height: number }) => void;
  isDragging: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  resizeHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
  };
  resetDimensions: () => void;
  setPresetSize: (preset: 'small' | 'medium' | 'large') => void;
}

const PRESET_SIZES = {
  small: { width: 200, height: 250 },
  medium: { width: 300, height: 400 },
  large: { width: 400, height: 500 }
};

export function useResizableContainer({
  initialDimensions,
  minWidth = 150,
  minHeight = 200,
  maxWidth = 600,
  maxHeight = 800,
  maintainAspectRatio = false,
  onResize,
  disabled = false
}: UseResizableContainerOptions): UseResizableContainerReturn {
  const [dimensions, setDimensionsInternal] = useState(initialDimensions);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ 
    x: 0, 
    y: 0, 
    width: 0, 
    height: 0 
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const aspectRatio = initialDimensions.width / initialDimensions.height;

  const setDimensions = useCallback((newDimensions: { width: number; height: number }) => {
    let { width, height } = newDimensions;
    
    // Apply constraints
    width = Math.max(minWidth, Math.min(width, maxWidth));
    height = Math.max(minHeight, Math.min(height, maxHeight));
    
    // Maintain aspect ratio if enabled
    if (maintainAspectRatio) {
      const currentRatio = width / height;
      if (currentRatio !== aspectRatio) {
        if (width / aspectRatio <= maxHeight) {
          height = width / aspectRatio;
        } else {
          width = height * aspectRatio;
        }
      }
    }
    
    const finalDimensions = { width: Math.round(width), height: Math.round(height) };
    setDimensionsInternal(finalDimensions);
    onResize?.(finalDimensions);
  }, [minWidth, minHeight, maxWidth, maxHeight, maintainAspectRatio, aspectRatio, onResize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      width: dimensions.width,
      height: dimensions.height
    });
  }, [disabled, dimensions]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    const newWidth = dragStart.width + deltaX;
    const newHeight = dragStart.height + deltaY;
    
    setDimensions({ width: newWidth, height: newHeight });
  }, [isDragging, dragStart, setDimensions]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const resetDimensions = useCallback(() => {
    setDimensions(initialDimensions);
  }, [initialDimensions, setDimensions]);

  const setPresetSize = useCallback((preset: 'small' | 'medium' | 'large') => {
    setDimensions(PRESET_SIZES[preset]);
  }, [setDimensions]);

  const resizeHandleProps = {
    onMouseDown: handleMouseDown,
    style: {
      cursor: isDragging ? 'nw-resize' : 'nw-resize',
      position: 'absolute' as const,
      right: '-6px',
      bottom: '-6px',
      width: '12px',
      height: '12px',
      background: '#3b82f6',
      borderRadius: '3px',
      border: '2px solid white',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
      opacity: disabled ? 0 : undefined,
      pointerEvents: disabled ? 'none' as const : undefined
    }
  };

  return {
    dimensions,
    setDimensions,
    isDragging,
    containerRef,
    resizeHandleProps,
    resetDimensions,
    setPresetSize
  };
}