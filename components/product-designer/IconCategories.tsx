// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React from "react";

export const IconCategories = ({ setView }) => {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Artwork Categories</h1>
      <div className="w-full max-w-3xl mb-4">
        <input
          type="text"
          placeholder="Search For Artwork"
          className="w-[95%] p-2 border border-gray-300 rounded"
        />
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-3xl">
        <button
          onClick={() => setView("emojis")}
          className="p-4 bg-gray-200 rounded flex flex-col items-center text-black"
        >
          Emojis
        </button>
        <button
          onClick={() => setView("shapes")}
          className="p-4 bg-gray-200 rounded flex flex-col items-center text-black"
        >
          Shapes & Symbols
        </button>
        <button
          onClick={() => setView("sports")}
          className="p-4 bg-gray-200 rounded flex flex-col items-center text-black"
        >
          Sports & Games
        </button>
        <button
          onClick={() => setView("letters")}
          className="p-4 bg-gray-200 rounded flex flex-col items-center text-black"
        >
          Letters & Numbers
        </button>
        <button
          onClick={() => setView("animals")}
          className="p-4 bg-gray-200 rounded flex flex-col items-center text-black"
        >
          Animals
        </button>
        <button
          onClick={() => setView("mascots")}
          className="p-4 bg-gray-200 rounded flex flex-col items-center text-black"
        >
          Mascots
        </button>
        <button
          onClick={() => setView("nature")}
          className="p-4 bg-gray-200 rounded flex flex-col items-center text-black"
        >
          Nature
        </button>
        <button
          onClick={() => setView("america")}
          className="p-4 bg-gray-200 rounded flex flex-col items-center text-black"
        >
          America
        </button>
      </div>
    </div>
  );
};
