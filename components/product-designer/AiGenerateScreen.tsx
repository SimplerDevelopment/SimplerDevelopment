'use client';

import React, { useContext } from "react";
import EditorContext from "./EditorContext";
import { FaSpinner } from "react-icons/fa";

export const AiGenerateScreen = () => {
  const { addLayer } = useContext(EditorContext);
  const [prompt, setPrompt] = React.useState("");
  const [image, setImage] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleTextChange = (e: React.FormEvent<HTMLTextAreaElement>) => {
    setPrompt((e.target as HTMLTextAreaElement).value);
  };

  const handleSubmitPrompt = async () => {
    // TODO(designer): replace with sd2026 endpoint when available — there is
    // no storefront text→image AI endpoint yet (Wave 2I scope was thumbnail
    // upload, not generative AI). For now the UI loads but submit returns
    // gracefully without crashing.
    setLoading(true);
    try {
      const response = await fetch(
        "/api/generate-image?prompt=" + encodeURIComponent(prompt),
      );
      if (!response.ok) {
        console.error("Error generating image: endpoint not yet wired in sd2026");
        setLoading(false);
        return;
      }
      const data = await response.json();
      const imageUrl = data?.url ?? null;
      if (imageUrl) setImage(imageUrl);
    } catch (err) {
      console.warn('AI image generation not available:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Generate AI Image</h1>
      <textarea
        onInput={handleTextChange}
        placeholder="Enter text here"
        className="border border-gray-300 w-full rounded-md p-2 mb-4 resize-none"
        rows={4}
      />
      <button
        onClick={handleSubmitPrompt}
        className="bg-blue-600 text-white py-2 px-4 rounded-md w-full"
      >
        Generate Image
      </button>
      <hr />
      <div className="flex flex-col items-center mt-4">
        {loading && (
          <div className="flex items-center justify-center mb-4">
            <FaSpinner className="animate-spin" size={24} />
            <span className="ml-2">Generating...</span>
          </div>
        )}
        {image && (
          <>
            <img
              src={image}
              alt="Generated"
              className="w-64 h-64 mb-4 object-cover"
            />
            <button
              onClick={() =>
                addLayer({
                  type: "image",
                  name: prompt,
                  url: image,
                  width: 147,
                  position: { x: 232, y: -347 },
                })
              }
              className="bg-green-600 text-white py-2 px-4 rounded-md w-full"
            >
              Add to Design
            </button>
          </>
        )}
      </div>
    </div>
  );
};
