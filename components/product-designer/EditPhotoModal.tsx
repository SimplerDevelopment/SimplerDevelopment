'use client';

import React, { useContext } from "react";
import { EditorContext } from "./EditorContext";
import { BsX } from "react-icons/bs";

// Stubbed for the sd2026 port. Original used @toast-ui/react-image-editor
// plus a local Python service at localhost:8000 for color/background ops.
// Both are out of scope for Wave 1B — when revisited, wire to the sd2026
// image service.
// TODO(designer): restore image-edit functionality after Wave 2.
export const EditPhotoModal = ({ selectedLayer: _selectedLayer }: { selectedLayer?: any }) => {
  const { setShowModal } = useContext(EditorContext);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
      <div className="bg-white p-6 rounded-lg shadow-lg w-1/3 relative">
        <h2 className="text-lg font-bold mb-4">Edit Photo</h2>
        <p className="text-gray-700">Image editing coming soon.</p>
        <button
          onClick={() => setShowModal(false)}
          className="absolute top-4 right-4 text-gray-700 p-2 rounded bg-transparent cursor-pointer"
          aria-label="Close"
        >
          <BsX size={28} />
        </button>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setShowModal(false)}
            className="bg-blue-500 text-white px-4 py-2 rounded cursor-pointer border-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
