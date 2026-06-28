'use client';

import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import EditorContext from "./EditorContext";

// Wave 2I: legacy `/api/get-art-by-tag` was tag-based with server-side
// pagination. The sd2026 storefront design-assets endpoint
// (`/api/storefront/${websiteId}/designs/assets?type=art&category=`) returns
// the full filtered list in one shot. We paginate client-side so the
// existing infinite-scroll UI keeps working without an API rewrite.
//
// `view` here doubles as the asset category for now. If the editor needs a
// distinct tag taxonomy, expose `tags` filtering in the assets endpoint.

interface ArtworkItem {
  id: string | number;
  name: string;
  title: string;
  source: string;
}

export const ArtPicker = ({ setView, view }: { setView: (view: string) => void; view: string }) => {
  const { addLayer, websiteId } = useContext(EditorContext);
  const [search, setSearch] = useState("");
  const [allArtworks, setAllArtworks] = useState<ArtworkItem[]>([]);
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const observerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef(""); // used to track live search between pages
  const limit = 10;

  const fetchArtworks = async (pageToFetch: number, searchQuery: string) => {
    await Promise.resolve(); // Yield to avoid synchronous setState in effect
    try {
      setLoading(true);
      // Fetch full list once per (view, search) combo; paginate client-side.
      let pool = allArtworks;
      if (pageToFetch === 1) {
        if (!websiteId) {
          // TODO(designer): no fallback art store wired — just no-op so the
          // editor doesn't crash without a websiteId.
          pool = [];
        } else {
          const url = `/api/storefront/${websiteId}/designs/assets?type=art${
            view ? `&category=${encodeURIComponent(view)}` : ''
          }`;
          const response = await fetch(url);
          if (!response.ok) throw new Error("Network response was not ok");
          const json = await response.json();
          const data = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
          // Normalize sd2026 shape -> editor shape (id, name, source, title).
          pool = (data as Record<string, unknown>[])
            .filter((a) =>
              !searchQuery ||
              `${a.name ?? ''}`.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((a) => ({
              id: a.id as string | number,
              name: a.name as string,
              title: a.name as string,
              source: a.imageUrl as string,
            }));
          setAllArtworks(pool);
        }
      }
      const slice = pool.slice(0, pageToFetch * limit);
      setArtworks(slice);
      setHasMore(slice.length < pool.length);
    } catch (error) {
      console.error("Error fetching artworks:", error);
    } finally {
      setLoading(false);
    }
  };

  // Reset on view or search change
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      setPage(1);
      setHasMore(true);
      searchRef.current = search;
      fetchArtworks(1, search);
    })();
  }, [view, search]);

  // Load next page
  useEffect(() => {
    if (page === 1) return; // already handled in the reset
    fetchArtworks(page, searchRef.current);
  }, [page]);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loading) {
        setPage((prev) => prev + 1);
      }
    },
    [hasMore, loading],
  );

  useEffect(() => {
    const option = {
      root: null,
      rootMargin: "100px",
      threshold: 0,
    };
    const observer = new IntersectionObserver(handleObserver, option);
    if (observerRef.current) observer.observe(observerRef.current);

    return () => {
      if (observerRef.current) observer.unobserve(observerRef.current);
    };
  }, [handleObserver]);

  return (
    <div>
      {/* Header and search */}
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => setView("categories")}
          className="text-blue-500 cursor-pointer bg-none border-none p-0 underline"
        >
          Back
        </button>
        <h1 className="text-xl font-semibold">Art Picker</h1>
        <div />
      </div>

      <input
        type="text"
        placeholder="Search For Artwork"
        className="w-[90%] max-w-[28rem] p-2 mb-4 border border-gray-300 rounded-md"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Artworks */}
      <div className="flex flex-wrap gap-4">
        {artworks.map((artwork) => (
          <button
            key={artwork.id}
            onClick={() =>
              addLayer({
                type: "art",
                url: artwork.source.replace("/detail/", "/download/"),
                name: artwork.name,
                position: { x: 0, y: -300 },
                width: 350,
                rotation: 0,
                color: "#000",
              })
            }
            className="p-4 bg-gray-200 rounded-md flex flex-col items-center text-black w-[45%]"
          >
            <img
              src={artwork.source.replace("/detail/", "/download/")}
              alt={artwork.name}
              className="w-full rounded-md"
            />
            <span className="mt-2">{artwork.title}</span>
          </button>
        ))}
      </div>

      {/* Observer trigger */}
      <div ref={observerRef} className="h-px" />

      {/* Loading */}
      {loading && (
        <div className="text-center mt-4">
          <p>Loading more...</p>
        </div>
      )}
    </div>
  );
};
