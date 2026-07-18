// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext, useState, useRef, useEffect, useMemo, memo } from "react";
import EditorContext from "./EditorContext";
import { Layer } from "./Layer";
import { ArtLayer } from "./ArtLayer";
import { SimpleEnhancedTextLayer } from "./SimpleEnhancedTextLayer";

interface ScalableMainViewProps {
  overrideSide?: any;
  overrideLayers?: any[];
  scale?: number;
  width?: number | string;
  height?: number | string;
  className?: string;
  showControls?: boolean;
  disabled?: boolean;
}

export const ScalableMainView = memo(function ScalableMainView({ 
  overrideSide = null, 
  overrideLayers = null,
  scale = 1,
  width = "100%",
  height = "100%",
  className = "",
  showControls = false,
  disabled = false
}: ScalableMainViewProps) {
  // Safely get context values with fallbacks
  const contextValue = useContext(EditorContext);
  const { 
    side = null, 
    layers = [], 
    selectedLayers = [], 
    setSelectedLayers = () => {}, 
    setSelectedLayer = () => {} 
  } = contextValue || {};
  
  const [selecting, setSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sideInUse = overrideSide || side;
  const layersInUse = overrideLayers || layers;
  
  // Memoize filtered layers to avoid re-filtering on every render
  const filteredLayers = useMemo(() => {
    if (!sideInUse) return [];
    
    // First try exact side match
    const exactMatches = layersInUse.filter((layer) => layer.side === sideInUse.side);
    if (exactMatches.length > 0) {
      return exactMatches;
    }
    
    // If no exact matches and we're in preview/carousel mode, use fallback logic
    if (overrideLayers && overrideLayers.length > 0) {
      // Most common case: show layers from the "front" side regardless of target side
      const frontLayers = layersInUse.filter((layer) => layer.side === "front");
      if (frontLayers.length > 0) {
        return frontLayers;
      }
      
      // If no front layers, show all layers (design might be on a different side)
      return layersInUse;
    }
    
    return [];
  }, [layersInUse, sideInUse?.side, overrideLayers]);

  // Use filtered layers directly - scaling is handled by CSS transform
  const layersToRender = filteredLayers;

  useEffect(() => {
    if (!showControls || disabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!selecting || !containerRef.current || !selectionBox) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currX = (e.clientX - rect.left) / scale;
      const currY = (e.clientY - rect.top) / scale;
      const x = Math.min(currX, selectionBox.x);
      const y = Math.min(currY, selectionBox.y);
      const w = Math.abs(currX - selectionBox.x);
      const h = Math.abs(currY - selectionBox.y);
      setSelectionBox({ x, y, width: w, height: h });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!selecting || !containerRef.current || !selectionBox) return;
      // If no drag (zero-size), skip rectangle selection to allow shift+click toggles
      if (selectionBox.width === 0 && selectionBox.height === 0) {
        setSelecting(false);
        setSelectionBox(null);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const selRect = {
        top: rect.top + selectionBox.y * scale,
        left: rect.left + selectionBox.x * scale,
        right: rect.left + (selectionBox.x + selectionBox.width) * scale,
        bottom: rect.top + (selectionBox.y + selectionBox.height) * scale,
      };
      const hits: string[] = [];
      document.querySelectorAll(".layer").forEach((el) => {
        const dr = el.getBoundingClientRect();
        if (
          dr.left < selRect.right &&
          dr.right > selRect.left &&
          dr.top < selRect.bottom &&
          dr.bottom > selRect.top
        ) {
          const lid = el.getAttribute("data-layer-id");
          if (lid) hits.push(lid);
        }
      });
      setSelectedLayers(hits);
      setSelectedLayer(null);
      setSelecting(false);
      setSelectionBox(null);
    };

    if (selecting) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [selecting, selectionBox, setSelectedLayers, setSelectedLayer, scale, showControls, disabled]);

  const containerStyle = useMemo(() => ({
    width,
    height,
    position: 'relative' as const,
    overflow: 'hidden' // Prevent scaled content from overflowing
  }), [width, height]);

  const scaledContainerStyle = useMemo(() => ({
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    width: '600px', // Fixed size that gets scaled
    height: '400px', // Fixed size that gets scaled
    position: 'relative' as const
  }), [scale]);

  const mainViewStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
    position: 'relative' as const
  }), []);

  return (
    <div className={`scalable-main-view ${className}`} style={containerStyle}>
      <div style={scaledContainerStyle}>
        <div
        id="scaleableMainViewContainer"
        className="mainViewContainer" ref={containerRef}>
          <div
            className="mainView"
            style={mainViewStyle}
            onMouseDown={(e) => {
              if (!showControls || disabled) return;
              
              if (e.shiftKey && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const x = (e.clientX - rect.left) / scale;
                const y = (e.clientY - rect.top) / scale;
                setSelectionBox({ x, y, width: 0, height: 0 });
                setSelecting(true);
              } else if (!e.shiftKey) {
                setSelectedLayers([]);
                setSelectedLayer(null);
              }
            }}
          >
            {sideInUse && (
              <img
                src={sideInUse.imageFilePath}
                alt={sideInUse.side}
                className="w-full h-full object-contain scale-100"
                draggable="false"
              />
            )}
            {layersToRender.map((layer) => (
              <ScaledLayer 
                key={layer.id}
                layer={layer} 
                side={sideInUse} 
                disabled={disabled || !showControls}
              />
            ))}
          </div>
          {selecting && selectionBox && showControls && !disabled && (
            <div
              className="absolute border border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
              style={{
                left: selectionBox.x,
                top: selectionBox.y,
                width: selectionBox.width,
                height: selectionBox.height,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
});

// Scaled layer component that handles individual layer scaling
const ScaledLayer = memo(function ScaledLayer({ 
  layer, 
  side, 
  disabled 
}: { 
  layer: any; 
  side: any; 
  disabled: boolean;
}) {
  const contextValue = useContext(EditorContext);
  
  if (disabled) {
    // For disabled mode, render a simplified non-interactive version
    return (
      <div
        className="layer absolute"
        data-layer-id={layer.id}
        style={{
          left: layer.position.x,
          top: layer.position.y,
          width: layer.width,
          height: layer.height,
          color: layer.color,
          fontSize: layer.size,
          fontFamily: layer.font,
          transform: `rotate(${layer.rotation}deg)`,
          pointerEvents: 'none'
        }}
      >
        {layer.type === "image" && (
          <img src={layer.url} alt={`Layer ${layer.id}`} draggable={false} />
        )}
        {layer.type === "art" && contextValue && (
          <ArtLayer layer={layer} key={layer.id} />
        )}
        {layer.type === "art" && !contextValue && (
          // Fallback for art layers when no context is available
          <img src={layer.url} alt={`Art Layer ${layer.id}`} draggable={false} />
        )}
        {layer.type === "text" && (
          <SimpleEnhancedTextLayer
            layer={layer}
            side={side}
            isSelected={false}
          />
        )}
        {layer.type === "icon" && layer.iconName && (
          <div title={layer.iconName}>⚪</div>
        )}
      </div>
    );
  }

  // For interactive mode, use the full Layer component if context is available
  if (contextValue) {
    return <Layer layer={layer} side={side} />;
  }

  // Fallback for interactive mode without context
  return (
    <div
      className="layer absolute cursor-pointer"
      data-layer-id={layer.id}
      style={{
        left: layer.position.x,
        top: layer.position.y,
        width: layer.width,
        height: layer.height,
        color: layer.color,
        fontSize: layer.size,
        fontFamily: layer.font,
        transform: `rotate(${layer.rotation}deg)`
      }}
    >
      {layer.type === "image" && (
        <img src={layer.url} alt={`Layer ${layer.id}`} draggable={false} />
      )}
      {layer.type === "art" && (
        <img src={layer.url} alt={`Art Layer ${layer.id}`} draggable={false} />
      )}
      {layer.type === "text" && (
        <span>{layer.text}</span>
      )}
      {layer.type === "icon" && layer.iconName && (
        <div title={layer.iconName}>⚪</div>
      )}
    </div>
  );
});