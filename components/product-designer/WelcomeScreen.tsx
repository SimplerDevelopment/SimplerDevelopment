'use client';

import React, { useContext } from "react";
import EditorContext from "./EditorContext";
import { BsUpload, BsFonts, BsStar, BsImages, BsMagic } from "react-icons/bs";

export const WelcomeScreen = () => {
  const { setControlMode, layers } = useContext(EditorContext);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">
        {layers.length ? "What's next?" : "Start here:"}
      </h1>
      <p>Add text, art, images, or generate new ones...</p>
      <div className="grid grid-cols-2 gap-6 font-bold">
        <button
          className="flex flex-col items-center text-black"
          onClick={() => setControlMode("upload")}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2">
            <BsUpload size={32} />
          </div>
          <p className="text-lg text-black">Upload</p>
        </button>
        <button
          className="flex flex-col items-center"
          onClick={() => setControlMode("text")}
          data-testid="welcome-add-text"
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2">
            <BsFonts size={32} />
          </div>
          <p className="text-lg text-black">Add Text</p>
        </button>
        <button
          className="flex flex-col items-center"
          onClick={() => setControlMode("icon")}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2">
            <BsStar size={32} />
          </div>
          <p className="text-lg text-black">Add Icon</p>
        </button>
        <button
          className="flex flex-col items-center"
          onClick={() => setControlMode("art")}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2">
            <BsImages size={32} />
          </div>
          <p className="text-lg text-black">Add Art</p>
        </button>
        <button
          className="flex flex-col items-center"
          onClick={() => setControlMode("generate")}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2">
            <BsMagic size={32} />
          </div>
          <p className="text-lg text-black">Generate Image (AI)</p>
        </button>
      </div>
    </div>
  );
};
