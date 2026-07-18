// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useEffect, useRef, useState, useCallback } from "react";

// Tags are served from /api/product-categories with server-side search +
// pagination — the 5.5M categories.json is NO LONGER imported here, so it stays
// out of this route's client bundle. We fetch only the slice we render.
const PAGE_SIZE = 20;

export const ArtCategories = ({ setView }) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tags, setTags] = useState([]);      // loaded slice (accumulates on load-more)
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadMoreRef = useRef(null);
  const reqId = useRef(0);                    // guards against stale responses

  // Debounce the search box (200ms) before hitting the API.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(id);
  }, [search]);

  const fetchPage = useCallback(async (q, offset) => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (q) params.set("search", q);
      const res = await fetch(`/api/product-categories?${params.toString()}`);
      const json = await res.json();
      if (myReq !== reqId.current) return;   // a newer request superseded this one
      if (json.success) {
        setTotal(json.pagination.total);
        setTags((prev) => (offset === 0 ? json.data : [...prev, ...json.data]));
      }
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  // Reset to page 0 whenever the (debounced) search term changes.
  useEffect(() => {
    fetchPage(debouncedSearch, 0);
  }, [debouncedSearch, fetchPage]);

  const handleLoadMore = () => {
    if (loading || tags.length >= total) return;
    fetchPage(debouncedSearch, tags.length);
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
  }, [loadMoreRef, tags.length, total, loading, debouncedSearch]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Artwork Categories</h1>
      <div className="w-full max-w-md mb-4">
        <input
          onChange={(e) => setSearch(e.target.value)}
          type="text"
          placeholder="Search For Artwork"
          className="w-[95%] p-2 border border-gray-300 rounded"
        />
      </div>
      <div className="flex flex-wrap gap-4">
        {tags.map((tag) => (
          <button
            key={tag.tag}
            onClick={() => setView(tag.tag)}
            className="p-4 bg-gray-200 rounded flex flex-col items-center text-black w-[48%]"
          >
            {tag.tag} ({tag.count})
          </button>
        ))}
      </div>
      {tags.length < total && (
        <div ref={loadMoreRef} className="mt-4 text-center">
          <button
            onClick={handleLoadMore}
            className="py-3 px-6 bg-transparent text-white border-none rounded cursor-pointer w-full"
          >
            {loading ? "Loading…" : "Loading More"}
          </button>
        </div>
      )}
    </div>
  );
};
