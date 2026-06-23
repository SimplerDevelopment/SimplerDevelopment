// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext } from "react";
import EditorContext from "./EditorContext";
import { Tabs } from "./Tabs";

export const LayerListScreen = () => {
  const {
    layers,
    setSelectedLayer,
    style,
    removeLayer,
    setControlMode,
    setLayers,
  } = useContext(EditorContext);
  const sides = Array.from(new Set(style?.sides?.map((side) => side.side) || []));
  const [currentSide, setCurrentSide] = React.useState(sides[0]);

  const handleLayerClick = (layer) => {
    setSelectedLayer(layer);
    setControlMode("layer");
  };

  const handleDeleteClick = (layer) => {
    window.confirm("Are you sure you want to delete this layer?") &&
      removeLayer(layer);
  };

  const moveLayer = (index, direction) => {
    const sideLayers = layers.filter((layer) => layer.side === currentSide);
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sideLayers.length) return;
    const updatedLayers = [...sideLayers];
    const [movedLayer] = updatedLayers.splice(index, 1);
    updatedLayers.splice(newIndex, 0, movedLayer);
    setLayers(
      layers.map((layer) =>
        layer.side === currentSide ? updatedLayers.shift() : layer,
      ),
    );
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Layers</h1>
      <Tabs {...{ sides, setCurrentSide, currentSide, layers }} />
      <div className="flex flex-col">
        {layers.filter((layer) => layer.side === currentSide).length ? (
          layers
            .filter((layer) => layer.side === currentSide)
            .map((layer, index, filteredLayers) => (
              <div
                key={layer.id}
                className={`py-2 px-2 border-b border-gray-300 flex justify-between items-center cursor-pointer ${
                  layer.selected ? "bg-blue-200" : ""
                }`}
              >
                <div onClick={() => handleLayerClick(layer)}>
                  {layer.type === "text" && (
                    <span className="mr-2">🖌️ {layer.text}</span>
                  )}
                  {layer.type === "icon" && (
                    <span className="mr-2">🖌️ {layer.name}</span>
                  )}
                  {layer.type === "image" && (
                    <span className="mr-2">🖼️ Image ID:{layer.id}</span>
                  )}
                </div>
                <div>
                  {index > 0 && (
                    <button
                      onClick={() => moveLayer(index, -1)}
                      className="mr-2"
                    >
                      ⬆️
                    </button>
                  )}
                  {index < filteredLayers.length - 1 && (
                    <button
                      onClick={() => moveLayer(index, 1)}
                      className="mr-2"
                    >
                      ⬇️
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteClick(layer)}
                    className="text-red-500 underline bg-none border-none cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
        ) : (
          <div className="p-2 border-b border-gray-300 cursor-pointer">
            No layers added yet.
          </div>
        )}
      </div>
    </div>
  );
};
