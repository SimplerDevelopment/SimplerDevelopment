'use client';

import React, { useState, useContext } from "react";
import { EditorContext } from "./EditorContext";
import { FaImage } from "react-icons/fa";

// TODO(designer): replace this Supabase-based upload with the sd2026 storefront
// upload endpoint (Wave 1C will wire it). For now we POST to a placeholder URL
// that the host page can override later.
const supabase = null;

export const UploadScreen = () => {
  const { addLayer } = useContext(EditorContext);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.size <= 5 * 1024 * 1024) {
      setFile(selectedFile);
      setMessage("");
    } else {
      setMessage("File size exceeds 5 MB.");
    }
  };

  const uploadFile = async () => {
    if (!file) {
      setMessage("Please select a file first.");
      return;
    }

    if (!name.trim()) {
      setMessage("Please enter a name.");
      return;
    }

    try {
      setUploading(true);
      setMessage("Uploading...");

      const fileName = `${Date.now()}-${file.name}`;

      // Upload disabled in this port — Wave 1C will replace with the sd2026
      // storefront upload endpoint. For now, just use an object URL so the
      // layer renders locally.
      const fileUrl =
        typeof window !== "undefined" && file
          ? URL.createObjectURL(file)
          : "";

      addLayer({
        id: fileName,
        type: "image",
        url: fileUrl,
        width: 300,
        height: "auto",
        position: {
          x: 0,
          y: 0,
        },
        rotation: 0,
      });

      if (!fileUrl) {
        throw new Error("Failed to retrieve file URL.");
      }

      console.log("File URL:", fileUrl);
      setMessage(`Upload successful! File URL: ${fileUrl}`);

      setMessage("Upload successful!");
      setFile(null);
      setName("");
      setUploadProgress(100);
    } catch (error: unknown) {
      console.error("Error uploading file:", error instanceof Error ? error.message : error);
      setMessage("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Choose File To Upload</h1>
      <p className="text-lg mb-4">High resolution artwork will look best.</p>
      <div className="mb-4">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700"
        >
          Name
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter layer name"
        />
      </div>
      <div className="border-2 border-dashed border-gray-300 p-6 rounded-lg mb-4">
        <div className="flex flex-col items-center">
          <input
            type="file"
            accept=".jpg, .png, .eps, .ai, .pdf"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer w-16 h-11 bg-gray-200 rounded-full flex items-center justify-center mb-2"
          >
            <FaImage size={46} className="text-gray-400" />
          </label>
          <p className="text-lg">
            Drag & Drop or{" "}
            <label
              htmlFor="file-upload"
              className="text-blue-600 underline cursor-pointer"
            >
              Browse Your Computer
            </label>
          </p>
          <p className="text-sm text-gray-400">
            JPG, PNG, EPS, AI, PDF (Max 5 MB)
          </p>
          {file && (
            <p className="text-sm text-green-600 mt-2">Selected: {file.name}</p>
          )}
        </div>
      </div>
      {uploading && (
        <div className="flex items-center mb-2">
          <div className="w-full bg-gray-100 rounded h-2">
            <div
              className="bg-blue-600 h-2 rounded"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="ml-2 text-sm">{Math.round(uploadProgress)}%</p>
        </div>
      )}
      <button
        onClick={uploadFile}
        disabled={uploading}
        className={`px-4 py-2 rounded text-white ${uploading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 cursor-pointer"} border-0`}
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>
      {message && <p className="mt-2 text-sm">{message}</p>}
      <p className="text-sm mb-2">
        Have a file type not listed above?{" "}
        <span className="text-blue-600 underline">Email it to us</span> and
        we&apos;ll review it before production.
      </p>
    </div>
  );
};
