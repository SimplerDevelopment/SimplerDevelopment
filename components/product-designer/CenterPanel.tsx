// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useState, useContext, memo, useCallback, useRef } from "react";
import { EditorContext } from "./EditorContext";
import { SideTabs } from "./SideTabs";
import { MainView } from "./MainView";
// Removed unused imports

interface CenterPanelProps {
  zoom: number;
  setZoom: (value: number | ((prev: number) => number)) => void;
  top: number;
  setTop: (value: number | ((prev: number) => number)) => void;
  left: number;
  setLeft: (value: number | ((prev: number) => number)) => void;
}

export const CenterPanel = memo(function CenterPanel({ zoom, setZoom, top, setTop, left, setLeft }: CenterPanelProps) {
  const { controlMode, carouselMode } = useContext(EditorContext);
  // Removed unused state
  
  const setZoomCallback = useCallback((value) => {
    setZoom(typeof value === 'function' ? value : () => value);
  }, [setZoom]);

  const setTopCallback = useCallback((value) => {
    setTop(typeof value === 'function' ? value : () => value);
  }, [setTop]);

  const setLeftCallback = useCallback((value) => {
    setLeft(typeof value === 'function' ? value : () => value);
  }, [setLeft]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, left: 0, top: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start dragging if not clicking on a layer or other interactive element
    const target = e.target as HTMLElement;
    if (target.closest('.layer') || target.closest('button') || e.shiftKey) {
      return;
    }
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      left: left,
      top: top
    });
    e.preventDefault();
  }, [left, top]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    setLeft(dragStart.left + deltaX);
    setTop(dragStart.top + deltaY);
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Removed sortedStyles - no longer needed
  
  // Color mode removed - no longer needed

  return (
    <div className="centerPanel">
      {!carouselMode && (
        <SideTabs
          setZoom={setZoomCallback}
          setTop={setTopCallback}
          setLeft={setLeftCallback}
        />
      )}
      <div
        ref={containerRef}
        className="absolute w-full h-full"
        style={{
          userSelect: "none",
          cursor: isDragging ? 'grabbing' : 'grab',
          width:500,
        }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="relative"
          style={{
            transform: `scale(${zoom})`,
            top: top,
            left: left,
          }}
        >
          <MainView />
        </div>
      </div>
    </div>
  );
});
