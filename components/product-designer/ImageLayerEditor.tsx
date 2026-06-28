// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useState, useContext } from "react";
import { EditorContext } from "./EditorContext";
import { BsImage } from "react-icons/bs";
import { SvgColorExtractor } from "./SvgColorExtractor";

export const ImageLayerEditor = ({ layer, handleInputChange }) => {
  const { setShowModal } = useContext(EditorContext);

  const openModal = () => setShowModal(true);
  const closeModal = () => setShowModal(false);

  return (
    <>
      {layer.type === "image" && (
        <button
          onClick={openModal}
          className="bg-blue-600 w-full text-white py-2 px-4 rounded flex items-center gap-2 justify-center"
        >
          <BsImage size={40} /> Edit Photo
        </button>
      )}

      {/* {layer.type === "art" && <SvgColorExtractor layer={layer} /> } */}

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

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Width</label>
        <input
          type="number"
          value={layer.width}
          onChange={(e) => handleInputChange("width", parseInt(e.target.value))}
          className="border border-gray-300 rounded w-full p-2 mb-2"
        />
        <input
          type="range"
          min="0"
          max="1000"
          value={layer.width}
          onChange={(e) => handleInputChange("width", parseInt(e.target.value))}
          className="w-full"
        />
      </div>
    </>
  );
};
