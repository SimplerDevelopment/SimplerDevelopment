'use client';

import React, { useContext, memo, useMemo, useCallback } from "react";
import Draggable from "react-draggable";
import EditorContext from "./EditorContext";
import { FaRotate } from "react-icons/fa6";
import { RxSize } from "react-icons/rx";
import { BsX } from "react-icons/bs";
import { ArtLayer } from "./ArtLayer";
import { SimpleEnhancedTextLayer } from "./SimpleEnhancedTextLayer";
import { resolveIcon } from "./utils/iconResolver";
import type { LayerData, ProductSideData } from "./designerTypes";

export const Layer = memo(function Layer({ layer, side }: { layer: LayerData; side: ProductSideData | null }) {
  const {
    layers,
    updateLayer,
    setSelectedLayer,
    selectedLayers,
    setSelectedLayers,
    controlMode,
    styleOverrides,
    setStyleOverrides,
    setLayers,
    setControlMode,
  } = useContext(EditorContext);
  // Track initial positions for group drag
  const groupStartPositions = React.useRef<
    Record<string, { x: number; y: number }>
  >({});
  // Memoize color calculations to avoid recalculating on every render
  const layerColor = useMemo(() => {
    const colorOverride = styleOverrides[side?.id]?.[layer.id]?.color;
    return colorOverride || layer.color;
  }, [styleOverrides, side?.id, layer.id, layer.color]);
  
  // Memoize layer style to prevent object recreation
  const layerStyle = useMemo(() => ({
    width: layer.width,
    height: layer.height,
    color: layerColor,
    fontSize: layer.size,
    fontFamily: layer.font,
  }), [layer.width, layer.height, layerColor, layer.size, layer.font]);
  
  // Memoize position object
  const position = useMemo(() => ({
    x: layer.position.x,
    y: layer.position.y
  }), [layer.position.x, layer.position.y]);
  
  // Memoize transform style
  const transformStyle = useMemo(() => ({
    transform: `rotate(${layer.rotation}deg)`
  }), [layer.rotation]);
  const nodeRef = React.useRef(null);

  const handleDrag = useCallback((e, data) => {
    // Always allow dragging - no restrictions needed
    // Multi-drag: move all selected layers by the same delta
    if (selectedLayers.length > 1 && selectedLayers.includes(layer.id)) {
      const start = groupStartPositions.current[layer.id];
      const dx = data.x - start.x;
      const dy = data.y - start.y;
      const updatedLayers = layers.map((l) =>
        selectedLayers.includes(l.id)
          ? {
              ...l,
              position: {
                x: groupStartPositions.current[l.id].x + dx,
                y: groupStartPositions.current[l.id].y + dy,
              },
            }
          : l,
      );
      setLayers(updatedLayers);
    } else {
      updateLayer({ ...layer, position: { x: data.x, y: data.y } });
    }
  }, [selectedLayers, layer.id, updateLayer, layer, setLayers, layers]);
  const handleStart = useCallback(() => {
    if (selectedLayers.length > 1 && selectedLayers.includes(layer.id)) {
      const map: Record<string, { x: number; y: number }> = {};
      layers.forEach((l) => {
        if (selectedLayers.includes(l.id)) {
          map[l.id] = { x: l.position.x, y: l.position.y };
        }
      });
      groupStartPositions.current = map;
    }
  }, [selectedLayers, layer.id, layers]);

  // Memoize icon component resolution. Replaces dynamic require() with
  // an explicit pack map (see utils/iconResolver.ts).
  const IconComponent = useMemo(() => {
    if (layer.icon) return layer.icon;
    return resolveIcon(layer.iconPack, layer.iconName);
  }, [layer.icon, layer.iconName, layer.iconPack]);

  return (
    <Draggable
      nodeRef={nodeRef}
      position={position}
      onStart={handleStart}
      onDrag={handleDrag}
      onStop={handleDrag}
      enableUserSelectHack={false}
      disabled={false}
    >
      <div
        ref={nodeRef}
        className={`layer absolute cursor-pointer ${selectedLayers.includes(layer.id) ? "selected ring-2 ring-blue-500" : ""}`}
        data-layer-id={layer.id}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) {
            const newSelectedLayers = selectedLayers.includes(layer.id)
              ? selectedLayers.filter((id) => id !== layer.id)
              : [...selectedLayers, layer.id];
            setSelectedLayers(newSelectedLayers);
          } else {
            setSelectedLayers([layer.id]);
            setSelectedLayer(layer);
          }
        }}
        key={layer.id}
        style={layerStyle}
      >
        <div
          className="layerRotate"
          onMouseDown={(e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startRotation = layer.rotation;

            const handleMouseMove = (moveEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaY = moveEvent.clientY - startY;
              const delta = deltaY - deltaX;
              const newRotation = (startRotation + delta) % 360;
              if (
                selectedLayers.length > 1 &&
                selectedLayers.includes(layer.id)
              ) {
                const updatedLayers = layers.map((l) =>
                  selectedLayers.includes(l.id)
                    ? { ...l, rotation: newRotation }
                    : l,
                );
                setLayers(updatedLayers);
              } else {
                updateLayer({ ...layer, rotation: newRotation });
              }
            };

            const handleMouseUp = () => {
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }}
        >
          <FaRotate color={"red"} size={15} />
        </div>

        <div
          className="layerSize"
          onMouseDown={(e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startSize = layer.size;

            const handleMouseMove = (moveEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaY = moveEvent.clientY - startY;
              const delta = Math.max(deltaX, deltaY);
              const newSize = Math.max(1, startSize + delta);
              if (
                selectedLayers.length > 1 &&
                selectedLayers.includes(layer.id)
              ) {
                const updatedLayers = layers.map((l) =>
                  selectedLayers.includes(l.id) ? { ...l, size: newSize } : l,
                );
                setLayers(updatedLayers);
              } else {
                updateLayer({ ...layer, size: newSize });
              }
            };

            const handleMouseUp = () => {
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }}
        >
          <RxSize color={"red"} size={15} />
        </div>

        <div
          className="layerDelete"
          onClick={() => {
            setTimeout(() => {
              if (
                window.confirm("Are you sure you want to delete this layer?")
              ) {
                setControlMode("welcome");
                setSelectedLayer(null);
                const filteredLayers = layers.filter((l) => l.id !== layer.id);
                setLayers(filteredLayers);
              }
            }, 100);
          }}
        >
          <BsX color={"red"} size={15} />
        </div>

        <div style={transformStyle}>
          {["image"].includes(layer.type) && (
            <img src={layer.url} alt={`Layer ${layer.id}`} draggable={false} />
          )}
          {["art"].includes(layer.type) && (
            <ArtLayer layer={layer} key={layer.id} />
          )}
          {layer.type === "text" && (
            <SimpleEnhancedTextLayer
              layer={layer}
              side={side}
              isSelected={selectedLayers.includes(layer.id)}
            />
          )}
          {layer.type === "icon" &&
            IconComponent &&
            React.createElement(IconComponent, { size: layer.size })}
        </div>
      </div>
    </Draggable>
  );
});

// Add display name for better debugging
Layer.displayName = 'Layer';
