'use client';

import React, { useState, useMemo } from "react";
import { IconList } from "./IconList";

// Import only essential icon packs upfront (reduced from 12 to 3)
import * as FaIcons from "react-icons/fa";
import * as BsIcons from "react-icons/bs";
import * as AiIcons from "react-icons/ai";

export const IconPicker = ({ setView }: { setView: (view: string) => void }) => {
  const [search, setSearch] = useState("");
  const [showAllIcons, setShowAllIcons] = useState(false);
  const [additionalIcons, setAdditionalIcons] = useState<Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>>({});
  const [loadingAdditional, setLoadingAdditional] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [iconsPerPage] = useState(50); // Show 50 icons per page

  // Core icon sets (always available)
  const coreIconSets = useMemo(() => ({
    ...FaIcons,
    ...BsIcons,
    ...AiIcons,
  }), []);

  // Load additional icon libraries on demand
  const loadAdditionalIcons = async () => {
    if (Object.keys(additionalIcons).length > 0) return; // Already loaded
    await Promise.resolve(); // Yield to avoid synchronous setState in effect

    setLoadingAdditional(true);
    try {
      const [BiIcons, GiIcons, IoIcons, MdIcons, RiIcons] = await Promise.all([
        import("react-icons/bi"),
        import("react-icons/gi"),
        import("react-icons/io"),
        import("react-icons/md"),
        import("react-icons/ri")
      ]);

      setAdditionalIcons({
        ...BiIcons,
        ...GiIcons,
        ...IoIcons,
        ...MdIcons,
        ...RiIcons,
      } as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>);
    } catch (error) {
      console.error("Error loading additional icons:", error);
    } finally {
      setLoadingAdditional(false);
    }
  };

  // Auto-load when searching
  React.useEffect(() => {
    void (async () => {
      await Promise.resolve(); // Yield to avoid synchronous setState in effect
      if (search.length > 2 && Object.keys(additionalIcons).length === 0) {
        await loadAdditionalIcons();
      }
    })();
  }, [search, additionalIcons]);

  // Filter and paginate icons
  const { paginatedIcons, totalPages, filteredCount } = useMemo(() => {
    const allIcons = showAllIcons || search.length > 2
      ? { ...coreIconSets, ...additionalIcons }
      : coreIconSets;

    // Convert to array and filter by search term
    const iconArray = Object.entries(allIcons).filter(([name, component]) => {
      if (typeof component !== 'function') return false;
      return search.length === 0 || name.toLowerCase().includes(search.toLowerCase());
    });

    // Calculate pagination
    const totalIcons = iconArray.length;
    const totalPages = Math.ceil(totalIcons / iconsPerPage);
    const startIndex = (currentPage - 1) * iconsPerPage;
    const endIndex = startIndex + iconsPerPage;

    // Get icons for current page
    const pageIcons = iconArray.slice(startIndex, endIndex);
    const paginatedIconSet = Object.fromEntries(pageIcons);

    return {
      paginatedIcons: paginatedIconSet,
      totalPages,
      filteredCount: totalIcons
    };
  }, [coreIconSets, additionalIcons, showAllIcons, search, currentPage, iconsPerPage]);

  // Reset to page 1 when search changes
  React.useEffect(() => {
    void (async () => {
      await Promise.resolve();
      setCurrentPage(1);
    })();
  }, [search]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => setView("categories")}
          className="text-blue-500 cursor-pointer bg-transparent border-none p-0 hover:text-blue-700 underline-none"
        >
          Back
        </button>
        <h1 className="text-xl font-semibold">Icon Picker</h1>
        <div></div>
      </div>
      <h1 className="text-xl font-semibold mb-4">Select Artwork</h1>
      <div className="w-full max-w-lg mb-4">
        <input
          type="text"
          placeholder="Search For Artwork"
          className="w-[95%] p-2 border border-gray-300 rounded-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!showAllIcons && Object.keys(additionalIcons).length === 0 && (
          <button
            onClick={() => {
              setShowAllIcons(true);
              loadAdditionalIcons();
            }}
            className="mt-2 text-sm text-blue-500 hover:text-blue-700"
            disabled={loadingAdditional}
          >
            {loadingAdditional ? "Loading..." : "Load all icon libraries"}
          </button>
        )}
        {loadingAdditional && (
          <div className="text-sm text-gray-500 mt-1">Loading additional icons...</div>
        )}
      </div>

      {/* Results info */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {Object.keys(paginatedIcons).length} of {filteredCount} icons
        {search && ` matching "${search}"`}
      </div>

      {/* Paginated icon list */}
      <IconList iconSets={paginatedIcons} search="" />

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 pb-4">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>

          <div className="flex items-center gap-1">
            {/* Show page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1 text-sm border rounded ${
                    currentPage === pageNum
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
