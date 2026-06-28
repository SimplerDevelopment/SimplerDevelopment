'use client';

import React, { useContext, useState } from "react";
import { BsX, BsCart3, BsCloudArrowUp, BsCheck2, BsFiles } from "react-icons/bs";
import { IoDuplicateOutline } from "react-icons/io5";
import { ColorPicker } from "./ProductDesigner";
import { EditorContext } from "./EditorContext";
import { DesignApi } from "./utils/designApi";
import type { LayerData, ProductData, ProductSideData, ProductStyleData, StyleOverridesMap } from "./designerTypes";

interface CartContextValue {
  isAdminMode?: boolean;
  [key: string]: unknown;
}

// Module-level fallback so useContext is always called unconditionally
const _FallbackTopBarCartCtx = React.createContext<CartContextValue | null>(null);

interface DesignerTopBarProps {
  sortedSizes: React.ReactNode;
  layers: LayerData[];
  styleOverrides: StyleOverridesMap;
  designName: string;
  setLoadModalOpen: (open: boolean) => void;
  userId?: string | number;
  product: ProductData | null;
  setStyle: (style: ProductStyleData) => void;
  style: ProductStyleData | null;
  setCarouselMode: (mode: boolean) => void;
  setHoveredStyleId: (id: number | null) => void;
  setHoveredStyleIndex: (index: number) => void;
  carouselMode: boolean;
  hoveredStyleId: number | null;
  selectedLayer: LayerData | null;
  updateLayer: (layer: LayerData) => void;
  removeLayer: (layer: LayerData) => void;
  addLayer: (layer: LayerData) => void;
  setSelectedLayer: (layer: LayerData | null) => void;
  setSide: (side: ProductSideData) => void;
  lastClickedCarouselStyle: ProductStyleData | null;
  cartMode: boolean;
  setCartMode: (mode: boolean) => void;
  CartContext?: React.Context<CartContextValue | null>;
}

export const DesignerTopBar = ({ 
  sortedSizes, 
  layers, 
  styleOverrides, 
  designName, 
  setLoadModalOpen, 
  userId, 
  product, 
  setStyle, 
  style, 
  setCarouselMode, 
  setHoveredStyleId, 
  setHoveredStyleIndex, 
  carouselMode, 
  hoveredStyleId, 
  selectedLayer, 
  updateLayer, 
  removeLayer, 
  addLayer, 
  setSelectedLayer, 
  setSide, 
  lastClickedCarouselStyle, 
  cartMode, 
  setCartMode, 
  CartContext 
}: DesignerTopBarProps) => {
  const { setStyleOverrides, side, saveDesign, designState, currentDesignId } = useContext(EditorContext);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  
  // Get admin context if available (always call useContext unconditionally — rules-of-hooks)
  const cartContext = useContext(CartContext ?? _FallbackTopBarCartCtx);
  const isAdminMode = cartContext?.isAdminMode ?? false;
  
  // Use lastClickedCarouselStyle when available (from last clicked carousel item), otherwise use the regular style
  const effectiveStyle = lastClickedCarouselStyle || style;
  
  // Use the side from the effective style context when available
  const effectiveSide = lastClickedCarouselStyle ?
    (lastClickedCarouselStyle.sides?.find((s: ProductSideData) => s.side === selectedLayer?.side) || lastClickedCarouselStyle.sides?.[0] || side) :
    side;

  const handleLayerInputChange = (field: string, value: unknown) => {
    const layer = layers.find((l: LayerData) => l.id === selectedLayer?.id);
    if (layer) {
      updateLayer({ ...layer, [field]: value });
    }
  };

  const handleSaveDesign = async () => {
    if (!layers.length) return; // Don't save empty designs
    
    // If this is a new design (no currentDesignId) and no name is set, prompt for name
    const currentName = designState?.name || designName || "";
    if (!currentDesignId && (!currentName || currentName === "Untitled Design")) {
      // Set default name and open Save As modal for new designs
      setSaveAsName("Untitled Design");
      setSaveAsModalOpen(true);
      return;
    }
    
    setIsSaving(true);
    setSaveSuccess(false);
    
    try {
      await saveDesign();
      setSaveSuccess(true);
      
      // Clear success state after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save design:', error);
      alert('Failed to save design. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAs = () => {
    if (!layers.length) return; // Don't save empty designs
    
    // Set default name to current design name with " (Copy)" if it exists
    const currentName = designState?.name || designName || "Untitled Design";
    const defaultName = currentDesignId ? `${currentName} (Copy)` : currentName;
    setSaveAsName(defaultName);
    setSaveAsModalOpen(true);
  };

  const confirmSaveAs = async () => {
    if (!saveAsName.trim()) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveAsModalOpen(false);
    
    try {
      if (currentDesignId) {
        // If we have a current design, clone it with the new name
        const clonedDesign = await DesignApi.cloneDesign(currentDesignId, saveAsName.trim());
        console.log('Design cloned successfully:', clonedDesign);
        
        // Show success message
        alert(`Design saved as "${clonedDesign.name}" successfully!`);
        
      } else {
        // If no current design, create a new one with the specified name
        await saveDesign(saveAsName.trim());
        console.log('New design created with name:', saveAsName.trim());
      }
      
      setSaveSuccess(true);
      
      // Clear success state after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save design as:', error);
      alert('Failed to save design. Please try again.');
    } finally {
      setIsSaving(false);
      setSaveAsName("");
    }
  };

  return (
    <div className="sticky top-0 z-30 bg-surface-primary border-b border-border-primary shadow-lg backdrop-blur-md dark:bg-gray-900 dark:border-gray-800">
      {/* Main TopBar Row */}
      <div className="flex items-center justify-between px-6 py-4 min-h-[72px]">
      <div className="flex flex-1 items-center gap-8">
        <div className="flex items-center gap-3">
        <div className="w-2 h-8 bg-gradient-to-b from-primary-500 to-accent-500 rounded-full shadow-sm"></div>
        <h1 className="text-2xl font-bold text-text-primary dark:text-white">
          {product?.name}
        </h1>
        </div>
        {!cartMode && (
        <div className="flex items-center gap-8 mx-auto">
          {/* Style (color) toggle options */}
          <div className="flex items-center gap-4">
          <ColorPicker {...{ product, setStyle, style, setCarouselMode, setHoveredStyleId, setHoveredStyleIndex, carouselMode, hoveredStyleId }} />
          </div>
          
          <div className="flex items-center gap-4">
          <div className="text-sm font-semibold text-text-secondary dark:text-gray-300">
            Available Sizes:
          </div>
          <div className="flex flex-wrap gap-2">
            {sortedSizes}
          </div>
          </div>
        </div>
        )}
      </div>

      {!cartMode && (
        <div className="flex items-center gap-3">
        {Boolean(userId) && (
          <button
          onClick={() => setLoadModalOpen(true)}
          className="btn-secondary dark:bg-gray-800 dark:text-gray-200"
          type="button"
          >
          Load Design
          </button>
        )}
        
        {/* Save Design Buttons */}
        {layers.length > 0 && (
          <div className="flex items-center gap-3">
          <button
            onClick={handleSaveDesign}
            disabled={isSaving || designState?.isAutoSaving}
            data-testid="designer-save-button"
            className={`${
            saveSuccess
              ? 'btn-success dark:bg-green-700'
              : designState?.hasUnsavedChanges
              ? 'btn-primary dark:bg-blue-700'
              : 'btn-secondary opacity-60 cursor-default dark:bg-gray-700'
            } ${(isSaving || designState?.isAutoSaving) ? 'cursor-not-allowed opacity-75' : ''}`}
            title={
            saveSuccess
              ? 'Design saved successfully!'
              : designState?.hasUnsavedChanges
              ? 'Save your current design'
              : 'Design is up to date'
            }
            type="button"
          >
            {isSaving || designState?.isAutoSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Saving...</span>
            </>
            ) : saveSuccess ? (
            <>
              <BsCheck2 size={16} />
              <span>Saved!</span>
            </>
            ) : (
            <>
              <BsCloudArrowUp size={16} />
              <span>{designState?.hasUnsavedChanges ? 'Save Design' : 'Saved'}</span>
            </>
            )}
          </button>

          {/* Save As Button */}
          <button
            onClick={handleSaveAs}
            disabled={isSaving || designState?.isAutoSaving}
            className="btn flex items-center gap-2 bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 active:bg-primary-800 px-6 py-2.5 dark:bg-blue-700 dark:hover:bg-blue-800"
            title="Save a copy of this design with a new name"
            type="button"
          >
            <BsFiles size={16} />
            <span>Save As</span>
          </button>
          </div>
        )}
        
        {/* Add to Cart/Store Button */}
        <button
          onClick={() => setCartMode(true)}
          className="btn-success flex items-center gap-3 px-6 py-2.5 text-sm font-semibold dark:bg-green-700 dark:hover:bg-green-800"
          type="button"
        >
          <BsCart3 size={18} />
          <span>{isAdminMode ? 'Add To Store' : 'Add to Cart'}</span>
        </button>
        </div>
      )}
      </div>
      
      {/* Layer Controls Row - Show when carousel is active and we have a last clicked carousel style */}
      {!cartMode && carouselMode && lastClickedCarouselStyle && selectedLayer && (
      <div className="flex items-center justify-between px-6 py-4 bg-surface-secondary border-t border-border-primary dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full shadow-sm"></div>
          <span className="text-sm font-semibold text-text-primary dark:text-white">
          Layer: {(selectedLayer?.name || selectedLayer?.text || 'Unnamed')?.slice(0, 25)}
          {(selectedLayer?.name || selectedLayer?.text || 'Unnamed')?.length > 25 && '...'}
          </span>
        </div>
        {lastClickedCarouselStyle && (
          <span className="status-info dark:text-gray-300">
          Style: {lastClickedCarouselStyle.name}
          </span>
        )}
        </div>
      
        <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-text-secondary dark:text-gray-300">Side:</label>
        <select
          value={selectedLayer?.side || ""}
          onChange={(e) => {
          handleLayerInputChange("side", e.target.value);
          const nSide = effectiveStyle.sides.find((s: ProductSideData) => s.side === e.target.value);
          if (nSide) {
            setSide(nSide);
          }
          }}
          className="input py-2 text-sm dark:bg-gray-900 dark:text-white"
        >
          {effectiveStyle?.sides?.map((s: ProductSideData) => (
          <option key={s.id} value={s.side}>
            {s.side}
          </option>
          ))}
        </select>
        </div>

        {/* Style-specific controls for text/icon layers */}
        {selectedLayer && ["text", "icon"].includes(selectedLayer.type) && (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-text-secondary dark:text-gray-300">Color:</label>
          <div className="relative">
            <input
            type="color"
            value={styleOverrides?.[effectiveSide?.id]?.[selectedLayer.id]?.color || selectedLayer.color || "#000000"}
            onChange={(e) => {
              const color = e.target.value;
              setStyleOverrides((prev: StyleOverridesMap) => {
              const newStyleOverrides = { ...prev };
              if (!newStyleOverrides[effectiveSide?.id]) newStyleOverrides[effectiveSide?.id] = {};
              if (!newStyleOverrides[effectiveSide?.id][selectedLayer.id])
                newStyleOverrides[effectiveSide?.id][selectedLayer.id] = {};
              newStyleOverrides[effectiveSide?.id][selectedLayer.id].color = color;
              return newStyleOverrides;
              });
            }}
            className="w-10 h-10 border-2 border-border-primary rounded-lg cursor-pointer hover:border-border-focus transition-all duration-200 shadow-sm hover:shadow-md bg-surface-primary dark:bg-gray-900 dark:border-gray-700"
            />
          </div>
          </div>

          <label className="flex items-center gap-3 text-sm cursor-pointer hover:bg-surface-secondary/50 px-2 py-1 rounded-lg transition-colors duration-200 dark:hover:bg-gray-700">
          <input
            type="checkbox"
            checked={
            (styleOverrides?.[effectiveSide?.id]?.[selectedLayer.id]?.color ||
              selectedLayer.color) === `#${effectiveStyle?.htmlColor1}`
            }
            onChange={(e) => {
            const checked = e.target.checked;
            setStyleOverrides((prev: StyleOverridesMap) => {
              const newOverrides = { ...prev };
              if (!newOverrides[effectiveSide?.id]) newOverrides[effectiveSide?.id] = {};
              if (!newOverrides[effectiveSide?.id][selectedLayer.id])
              newOverrides[effectiveSide?.id][selectedLayer.id] = {};
              if (checked) {
              newOverrides[effectiveSide?.id][selectedLayer.id].color =
                `#${effectiveStyle?.htmlColor1}`;
              } else {
              delete newOverrides[effectiveSide?.id][selectedLayer.id].color;
              }
              return newOverrides;
            });
            }}
            className="w-4 h-4 text-primary-600 bg-surface-secondary border-border-primary rounded focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-0 transition-colors duration-200 dark:bg-gray-800 dark:border-gray-600"
          />
          <span className="text-text-primary font-medium dark:text-white">Match style color</span>
          </label>
        </div>
        )}

        <div className="flex items-center gap-3 ml-auto">
        <button
          onClick={() => {
          const layer = layers.find((l: LayerData) => l.id === selectedLayer?.id);
          if (layer) {
            const newLayer = { ...layer, id: Date.now() };
            addLayer(newLayer);
          }
          }}
          className="btn flex items-center gap-2 bg-success-600 text-white hover:bg-success-700 focus:ring-success-500 active:bg-success-800 text-sm dark:bg-green-700 dark:hover:bg-green-800"
          title="Duplicate Layer"
          type="button"
        >
          <IoDuplicateOutline size={16} />
          <span>Duplicate</span>
        </button>
        
        <button
          onClick={() => {
          removeLayer(selectedLayer);
          setSelectedLayer(null);
          }}
          className="btn-error flex items-center gap-2 text-sm dark:bg-red-700 dark:hover:bg-red-800"
          title="Delete Layer"
          type="button"
        >
          <BsX size={18} />
          <span>Delete</span>
        </button>
        </div>
      </div>
      )}

      {/* Save As Modal */}
      {saveAsModalOpen && (
      <div
        style={{ zIndex: 1000 }}
        className="fixed inset-0 flex items-center justify-center bg-surface-backdrop/80 backdrop-blur-sm dark:bg-black/80"
      >
        <div className="card-elevated backdrop-blur-md p-8 rounded-2xl max-w-lg w-full mx-4 dark:bg-gray-900 dark:text-white">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center shadow-lg">
          <BsFiles size={20} className="text-white" />
          </div>
          <div>
          <h3 className="text-xl font-bold text-text-primary dark:text-white">
            {currentDesignId ? 'Save As New Design' : 'Name Your Design'}
          </h3>
          <p className="text-sm text-text-secondary dark:text-gray-300">
            {currentDesignId 
            ? 'Create a copy with a new name'
            : 'Give your design a memorable name'
            }
          </p>
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-semibold text-text-primary mb-3 dark:text-white">
          Design Name
          </label>
          <input
          type="text"
          value={saveAsName}
          onChange={(e) => setSaveAsName(e.target.value)}
          className="input w-full py-3 dark:bg-gray-800 dark:text-white"
          placeholder="Enter design name..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && saveAsName.trim()) {
            confirmSaveAs();
            } else if (e.key === 'Escape') {
            setSaveAsModalOpen(false);
            setSaveAsName("");
            }
          }}
          />
        </div>
        
        <div className="flex justify-end gap-3">
          <button
          onClick={() => {
            setSaveAsModalOpen(false);
            setSaveAsName("");
          }}
          className="btn-secondary dark:bg-gray-800 dark:text-gray-200"
          type="button"
          >
          Cancel
          </button>
          <button
          onClick={confirmSaveAs}
          disabled={!saveAsName.trim() || isSaving}
          className="btn-primary flex items-center gap-3 px-6 dark:bg-blue-700 dark:hover:bg-blue-800"
          type="button"
          >
          {isSaving ? (
            <>
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            <span>Saving...</span>
            </>
          ) : (
            <>
            <BsFiles size={16} />
            <span>Save Design</span>
            </>
          )}
          </button>
        </div>
        </div>
      </div>
      )}
    </div>
  );
};
