'use client';

import React, { useContext, memo, lazy, Suspense } from "react";
import { EditorContext } from "./EditorContext";
import { BsPlus, BsLayers } from "react-icons/bs";
// Lazy load heavy components that are only shown conditionally

const LayerScreen = lazy(() => import("./LayerScreen").then(m => ({ default: m.LayerScreen })));
const AddIcon = lazy(() => import("./AddIcon").then(m => ({ default: m.AddIcon })));
const AddArt = lazy(() => import("./AddArt").then(m => ({ default: m.AddArt })));
const AddTextScreen = lazy(() => import("./AddTextScreen").then(m => ({ default: m.AddTextScreen })));
const UploadScreen = lazy(() => import("./UploadScreen").then(m => ({ default: m.UploadScreen })));
const WelcomeScreen = lazy(() => import("./WelcomeScreen").then(m => ({ default: m.WelcomeScreen })));
const LayerListScreen = lazy(() => import("./LayerListScreen").then(m => ({ default: m.LayerListScreen })));
const AiGenerateScreen = lazy(() => import("./AiGenerateScreen").then(m => ({ default: m.AiGenerateScreen })));

export const LeftPanel = () => {
  const { controlMode, setControlMode } = useContext(EditorContext);

  return (
    <div className="leftPanel">
      <div className="leftNav ">
        <button
          className="navItem add"
          onClick={() => setControlMode("welcome")}
          aria-label="Add"
          title="Add"
        >
          <BsPlus size={36} />
        </button>

        <button
          className="navItem layer"
          onClick={() => setControlMode("layerList")}
          aria-label="Layers"
          title="Layers"
        >
          <BsLayers size={28} />
        </button>
      </div>
      <div>
        <LeftPanelContent controlMode={controlMode} />
      </div>
    </div>
  );
};

const LeftPanelContent = memo(({ controlMode }: { controlMode: string }) => {
  return (
    <div className="leftPanelContent">
      <Suspense fallback={<div className="p-4 animate-pulse">Loading...</div>}>
        {controlMode === "welcome" && <WelcomeScreen />}
        {controlMode === "upload" && <UploadScreen />}
        {controlMode === "text" && <AddTextScreen />}
        {controlMode === "icon" && <AddIcon />}
        {controlMode === "art" && <AddArt />}
        {/* Color mode removed */}
        {controlMode === "layer" && <LayerScreen />}
        {controlMode === "layerList" && <LayerListScreen />}
        {controlMode === "generate" && <AiGenerateScreen />}
      </Suspense>
    </div>
  );
});
