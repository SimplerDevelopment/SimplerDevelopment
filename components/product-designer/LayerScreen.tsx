'use client';

import React, { useContext } from "react";
import EditorContext from "./EditorContext";
import { WelcomeScreen } from "./WelcomeScreen";
import { TextAndIconLayerEditor } from "./TextAndIconLayerEditor";
import { ImageLayerEditor } from "./ImageLayerEditor";
import { IoDuplicateOutline } from "react-icons/io5";
import { BsX } from "react-icons/bs";
import type { ProductSideData } from "./designerTypes";

export const LayerScreen = () => {
  const {
    selectedLayer,
    updateLayer,
    layers,
    removeLayer,
    setSide,
    setControlMode,
    addLayer,
    setSelectedLayer,
    style,
  } = useContext(EditorContext);
  const [view, setView] = React.useState("general");
  if (!selectedLayer) return <WelcomeScreen />;
  const layer = layers.find((layer) => layer.id === selectedLayer.id);
  const handleInputChange = (field: string, value: unknown) => {
    updateLayer({ ...layer, [field]: value });
  };

  return (
    <div className="p-4">
      <button
        onClick={() => {
          setControlMode("layerList");
          setSelectedLayer(null);
        }}
        className="flex items-center gap-0 text-blue-500 font-medium mb-3 cursor-pointer p-0 bg-transparent border-none"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Layers
      </button>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setView("general")}
          className={`px-4 py-2 border border-gray-300 rounded ${
            view === "general"
              ? "bg-blue-500 text-white"
              : "bg-white text-black"
          } cursor-pointer`}
        >
          General
        </button>
        <button
          onClick={() => setView("styleSpecific")}
          className={`px-4 py-2 border border-gray-300 rounded ${
            view === "styleSpecific"
              ? "bg-blue-500 text-white"
              : "bg-white text-black"
          } cursor-pointer`}
        >
          Style Specific
        </button>
      </div>
      {view === "general" && (
        <div>
          {/* General view content goes here */}
          <p>General settings for the layer.</p>
        </div>
      )}
      {view === "styleSpecific" && (
        <div>
          {/* Style-specific settings for adjustable properties like color */}
          <p>Style-specific settings for the layer.</p>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Edit Layer</h1>
        <button
          onClick={() => removeLayer(selectedLayer)}
          className="flex items-center gap-1 text-red-500 font-medium cursor-pointer p-0 border-none bg-transparent"
        >
          Delete Layer
          <BsX size={50} />
        </button>
      </div>
      <h3 className="mb-4">
        <small>Current Layer: </small>
        <u title={layer?.name || layer?.text}>
          {(layer?.name || layer?.text)?.length > 35
            ? `${(layer?.name || layer?.text)?.slice(0, 35)}...`
            : layer?.name || layer?.text}
        </u>
      </h3>

      <div className="mb-4">
        <button
          onClick={() => {
            const newLayer = { ...layer, id: Date.now() }; // Create a duplicate with a new unique ID
            addLayer(newLayer);
          }}
          className="flex items-center gap-2 text-emerald-500 font-medium cursor-pointer p-0 bg-transparent border-none"
        >
          <IoDuplicateOutline size={30} />
          Duplicate Layer
        </button>
      </div>

      <div className="mb-4">
        <label className="block mb-2">
          <small>Change Layer Side:</small>
        </label>
        <select
          value={layer?.side || ""}
          onChange={(e) => {
            handleInputChange("side", e.target.value);
            const nSide = style?.sides?.find(
              (side: ProductSideData) => side.side === e.target.value,
            );
            if (nSide) {
              setSide(nSide);
            }
          }}
          className="p-2 border border-gray-300 rounded w-full"
        >
          {style?.sides && Array.isArray(style.sides) && style.sides.length > 0 ? (
            style.sides.map((side: ProductSideData, idx: number) => (
              <option key={side?.id ?? idx} value={side?.side || ''}>
                <b>{side?.side || 'Unknown'}</b>
              </option>
            ))
          ) : (
            <option value="">No sides available</option>
          )}
        </select>
      </div>

      {Boolean(layer?.type) && (
        <>
          {["text", "icon"].includes(layer?.type) ? (
            <TextAndIconLayerEditor
              view={view}
              layer={layer}
              handleInputChange={handleInputChange}
            />
          ) : (
            <ImageLayerEditor
              layer={layer}
              handleInputChange={handleInputChange}
            />
          )}
        </>
      )}
    </div>
  );
};
