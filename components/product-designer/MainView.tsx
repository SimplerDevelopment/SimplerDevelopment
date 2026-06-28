'use client';

import React, { useContext, useState, useRef, useEffect, useMemo, memo } from "react";
import EditorContext from "./EditorContext";
import { Layer } from "./Layer";

export const MainView = memo(function MainView({ overRideSide = null }: { overRideSide?: any }) {
  const { side, layers, selectedLayers, setSelectedLayers, setSelectedLayer } =
    useContext(EditorContext);
  const [selecting, setSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sideInUse = overRideSide || side;
  
  // Memoize filtered layers to avoid re-filtering on every render
  const filteredLayers = useMemo(() => {
    if (!sideInUse) return [];
    return layers.filter((layer) => layer.side === sideInUse.side);
  }, [layers, sideInUse?.side]);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!selecting || !containerRef.current || !selectionBox) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currX = e.clientX - rect.left;
      const currY = e.clientY - rect.top;
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
        top: rect.top + selectionBox.y,
        left: rect.left + selectionBox.x,
        right: rect.left + selectionBox.x + selectionBox.width,
        bottom: rect.top + selectionBox.y + selectionBox.height,
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
  }, [selecting, selectionBox, setSelectedLayers, setSelectedLayer]);


  return (
    <div
    id="productEditorMainView"
    className="mainViewContainer" ref={containerRef}>
      <div
        className="mainView"
        onMouseDown={(e) => {
          if (e.shiftKey && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
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
        {filteredLayers.map((layer) => (
          <Layer layer={layer} side={sideInUse} key={layer.id} />
        ))}
      </div>
      {selecting && selectionBox && (
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
  );
});
