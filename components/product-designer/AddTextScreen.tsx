// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext } from "react";
import EditorContext from "./EditorContext";

export const AddTextScreen = () => {
  const { addLayer, side } = useContext(EditorContext);
  const [text, setText] = React.useState("");
  const font = "Arial";
  const size = 60;
  const color = "#000000";
  const position = { x: 300, y: -500 };
  const rotation = 0;
  const handleTextChange = (e) => {
    setText(e.target.value);
  };
  const handleAddText = () => {
    if (text.trim() === "") return;
    addLayer({
      type: "text",
      text: text,
      font: font,
      size,
      color,
      position,
      rotation,
    });
  };

  return (
    <div>
      <h1
        style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "1rem" }}
      >
        Add Text
      </h1>
      <input
        type="text"
        onInput={handleTextChange}
        placeholder="Enter text here"
        style={{
          border: "1px solid #D1D5DB",
          width: "16rem",
          borderRadius: "0.375rem",
          padding: "0.5rem",
          marginBottom: "1rem",
        }}
      />
      <button
        onClick={handleAddText}
        style={{
          backgroundColor: "#2563EB",
          color: "#FFFFFF",
          padding: "0.5rem 1rem",
          borderRadius: "0.375rem",
        }}
      >
        Add To Design
      </button>
    </div>
  );
};
