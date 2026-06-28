// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext } from "react";
import { EditorContext } from "./EditorContext";
import { FontSelector } from "./FontSelector";
import { UserFriendlyTextEditor } from "./UserFriendlyTextEditor";

export const TextAndIconLayerEditor = ({ view, layer, handleInputChange }) => {
  const { setStyleOverrides, styleOverrides, side, style } =
    useContext(EditorContext);

  if (view === "styleSpecific") {
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Color</label>
        <input
          type="color"
          value={styleOverrides?.[side.id]?.[layer.id]?.color || layer.color}
          onChange={(e) => {
            const color = e.target.value;
            setStyleOverrides((prev) => {
              const newStyleOverrides = { ...prev };
              if (!newStyleOverrides[side.id]) newStyleOverrides[side.id] = {};
              if (!newStyleOverrides[side.id][layer.id])
                newStyleOverrides[side.id][layer.id] = {};
              newStyleOverrides[side.id][layer.id].color = color;
              return newStyleOverrides;
            });
          }}
          className="border border-gray-300 rounded w-full p-0"
        />
        <div className="mt-2">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={
                (styleOverrides?.[side.id]?.[layer.id]?.color ||
                  layer.color) === `#${style.htmlColor1}`
              }
              onChange={(e) => {
                const checked = e.target.checked;
                setStyleOverrides((prev) => {
                  const newOverrides = { ...prev };
                  if (!newOverrides[side.id]) newOverrides[side.id] = {};
                  if (!newOverrides[side.id][layer.id])
                    newOverrides[side.id][layer.id] = {};
                  if (checked) {
                    newOverrides[side.id][layer.id].color =
                      `#${style.htmlColor1}`;
                  } else {
                    delete newOverrides[side.id][layer.id].color;
                  }
                  return newOverrides;
                });
              }}
            />
            Match style color
          </label>
        </div>
      </div>
    );
  }

  return (
    <>
      {layer.type === "text" && (
        <UserFriendlyTextEditor
          view={view}
          layer={layer}
          handleInputChange={handleInputChange}
        />
      )}
      {layer.type !== "text" && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={layer.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className="border border-gray-300 rounded w-full p-2"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Size</label>
            <input
              type="number"
              value={layer.size}
              onChange={(e) => handleInputChange("size", parseInt(e.target.value))}
              className="border border-gray-300 rounded w-full p-2 mb-2"
            />
            <input
              type="range"
              min="1"
              max="500"
              value={layer.size}
              onChange={(e) => handleInputChange("size", parseInt(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Color</label>
            <input
              type="color"
              value={layer.color}
              onChange={(e) => handleInputChange("color", e.target.value)}
              className="border border-gray-300 rounded w-full p-0"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Rotation</label>
            <input
              type="number"
              value={layer.rotation}
              onChange={(e) =>
                handleInputChange("rotation", parseInt(e.target.value))
              }
              className="border border-gray-300 rounded w-full p-2 mb-2"
            />
            <input
              type="range"
              min="0"
              max="360"
              value={layer.rotation}
              onChange={(e) =>
                handleInputChange("rotation", parseInt(e.target.value))
              }
              className="w-full"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Position (X, Y)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={layer.position.x}
                onChange={(e) =>
                  handleInputChange("position", {
                    ...layer.position,
                    x: parseInt(e.target.value),
                  })
                }
                className="border border-gray-300 rounded w-full p-2"
              />
              <input
                type="number"
                value={layer.position.y}
                onChange={(e) =>
                  handleInputChange("position", {
                    ...layer.position,
                    y: parseInt(e.target.value),
                  })
                }
                className="border border-gray-300 rounded w-full p-2"
              />
            </div>
          </div>
        </>
      )}
    </>
  );
};
