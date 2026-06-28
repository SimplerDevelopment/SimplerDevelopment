// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useEffect, useRef } from "react";
import tags from "./static/categories";

export const ArtCategories = ({ setView }) => {
  const artTags = tags.tags;
  const [search, setSearch] = React.useState("");
  const [visibleCount, setVisibleCount] = React.useState(20);
  const loadMoreRef = useRef(null);

  const filteredTags = artTags.filter((tag) =>
    search.length > 0
      ? tag.tag.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  const visibleTags = filteredTags.slice(0, visibleCount);

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 20);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 1.0 },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [loadMoreRef, visibleCount]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Artwork Categories</h1>
      <div className="w-full max-w-md mb-4">
        <input
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(20); // reset count when search changes
          }}
          type="text"
          placeholder="Search For Artwork"
          className="w-[95%] p-2 border border-gray-300 rounded"
        />
      </div>
      <div className="flex flex-wrap gap-4">
        {visibleTags.map((tag) => (
          <button
            key={tag.tag}
            onClick={() => setView(tag.tag)}
            className="p-4 bg-gray-200 rounded flex flex-col items-center text-black w-[48%]"
          >
            {tag.tag} ({tag.count})
          </button>
        ))}
      </div>
      {visibleCount < filteredTags.length && (
        <div ref={loadMoreRef} className="mt-4 text-center">
          <button
            onClick={handleLoadMore}
            className="py-3 px-6 bg-transparent text-white border-none rounded cursor-pointer w-full"
          >
            Loading More
          </button>
        </div>
      )}
    </div>
  );
};
