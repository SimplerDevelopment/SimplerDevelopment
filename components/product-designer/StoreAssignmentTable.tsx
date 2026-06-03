'use client';

import React, { useCallback, useState, useContext, useMemo } from 'react';
import { BsCheck2, BsX } from 'react-icons/bs';
import { HTMLEditor } from './components/HTMLEditor';
import { EditorContext } from './EditorContext';
import { MainView } from './MainView';

export interface StoreAssignmentSelection {
  storeIds: number[];
  customDescription?: string;
  catalogId: number;
  designId?: number;
  designName?: string;
}

interface StoreAssignmentTableProps {
  product: any; // Product with catalog information
  availableStores: Array<{ id: number; name: string }>;
  onAssignToStores: (selection: StoreAssignmentSelection) => Promise<void>;
  onClose: () => void;
  designData?: {
    designId?: number;
    designName?: string;
    layers?: any[];
    styleOverrides?: any;
    styleId?: number;
  };
  productOverview?: {
    name: string;
    longDescription?: string;
    brand?: { name: string };
    defaultStyle?: {
      imageFilePathFront?: string;
      defaultSide?: { imageFilePath?: string };
    };
  };
}

// DraggableMainView component - same structure as ProductDesigner but simplified for preview
const DraggableMainView = ({ children, sharedTop, sharedLeft, sharedZoom }: { 
  children: React.ReactNode;
  sharedTop?: number;
  sharedLeft?: number;
  sharedZoom?: number;
}) => {
  // For preview mode, we don't need drag functionality, just the structure
  return (
    <div className="w-full h-full relative">
      <div 
        style={{ 
          transform: `translate(${sharedLeft || 0}px, ${sharedTop || 0}px) scale(${sharedZoom || 1})`,
          transformOrigin: 'top left'
        }}
      >
        {children}
      </div>
    </div>
  );
};

// CarouselItemMainView component - matches ProductDesigner structure
const CarouselItemMainView = ({ 
  styleOption, 
  overRideSide, 
  className = "",
  sharedTop = 0,
  sharedLeft = 0,
  sharedZoom = 1,
  setLayerControlsStyle,
  setLastClickedCarouselStyle,
  setLayerClickFocusedStyleId,
  setSharedTop,
  setSharedLeft
}: { 
  styleOption: any;
  overRideSide: any;
  className?: string;
  sharedTop?: number;
  sharedLeft?: number;
  sharedZoom?: number;
  setLayerControlsStyle?: (style: any) => void;
  setLastClickedCarouselStyle?: (style: any) => void;
  setLayerClickFocusedStyleId?: (id: any) => void;
  setSharedTop?: (top: number) => void;
  setSharedLeft?: (left: number) => void;
}) => {
  const originalContext = useContext(EditorContext);
  
  // Create modified context that matches ProductDesigner structure with layer controls
  const modifiedContext = useMemo(() => ({
    ...originalContext,
    controlMode: "preview",
    product: { id: "preview", name: "Product" },
    style: styleOption,
    side: overRideSide,
    setStyle: () => {},
    setSide: () => {},
    setControlMode: () => {},
    addLayer: () => {},
    updateLayer: () => {},
    removeLayer: () => {},
    layers: styleOption?.layers || [],
    setLayers: () => {},
    selectedLayer: null,
    setSelectedLayer: (layer: any) => {
      if (layer && setLayerControlsStyle && setLastClickedCarouselStyle && setLayerClickFocusedStyleId) {
        setLayerControlsStyle(styleOption);
        setLastClickedCarouselStyle(styleOption);
        setLayerClickFocusedStyleId(styleOption.id);
      }
      originalContext.setSelectedLayer?.(layer);
    },
    selectedLayers: [],
    setSelectedLayers: () => {},
    styleOverrides: styleOption?.styleOverrides || {},
    setStyleOverrides: () => {},
    showModal: false,
    setShowModal: () => {},
    quantity: 1,
    setQuantity: () => {},
    carouselMode: false,
    currentDesignId: styleOption?.designId || null,
    setCurrentDesignId: () => {},
    designState: {
      isSaved: true,
      isAutoSaving: false,
      lastSavedAt: new Date(),
      hasUnsavedChanges: false,
      name: styleOption?.designName || 'Custom Design'
    },
    setDesignState: () => {},
    designName: styleOption?.designName || 'Custom Design',
    setDesignName: () => {},
    saveDesign: () => Promise.resolve({
      id: styleOption?.designId || 1,
      uuid: 'mock-uuid',
      name: styleOption?.designName || 'Custom Design',
      description: '',
      productId: 'preview',
      styleId: styleOption?.styleId || 1,
      side: 'front',
      layers: styleOption?.layers || [],
      styleOverrides: styleOption?.styleOverrides || {},
      thumbnailUrl: '',
      isPublic: false,
      isTemplate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      userId: 1,
      sessionId: 'mock-session'
    }),
    loadDesign: () => Promise.resolve(true),
    createNewDesign: () => Promise.resolve(),
    autoSave: () => Promise.resolve()
  }), [styleOption, overRideSide, originalContext, setLayerControlsStyle, setLastClickedCarouselStyle, setLayerClickFocusedStyleId]);

  // Only show preview if there are layers to display
  if (!styleOption?.layers || styleOption.layers.length === 0) {
    return (
      <img
        src={overRideSide?.imageFilePath || '/placeholder-product.jpg'}
        alt="Product"
        className={className}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.src = '/placeholder-product.jpg';
        }}
      />
    );
  }

  return (
    <div className={className}>
      <EditorContext.Provider value={modifiedContext}>
        <DraggableMainView 
          sharedTop={sharedTop}
          sharedLeft={sharedLeft}
          sharedZoom={sharedZoom}
        >
          <MainView overRideSide={overRideSide} />
        </DraggableMainView>
      </EditorContext.Provider>
    </div>
  );
};

export const StoreAssignmentTable: React.FC<StoreAssignmentTableProps> = ({
  product,
  availableStores,
  onAssignToStores,
  onClose,
  designData,
  productOverview,
}) => {
  const [selectedStores, setSelectedStores] = useState<Set<number>>(new Set());
  const [customDescription, setCustomDescription] = useState<string>(productOverview?.longDescription || '');
  const [designName, setDesignName] = useState<string>(designData?.designName || 'Custom Design');
  const [isLoading, setIsLoading] = useState(false);

  // State for layer controls matching ProductDesigner structure
  const [layerControlsStyle, setLayerControlsStyle] = useState<any>(null);
  const [lastClickedCarouselStyle, setLastClickedCarouselStyle] = useState<any>(null);
  const [layerClickFocusedStyleId, setLayerClickFocusedStyleId] = useState<any>(null);
  
  // Shared positioning state for DraggableMainView
  const [sharedTop, setSharedTop] = useState<number>(0);
  const [sharedLeft, setSharedLeft] = useState<number>(0);

  // Toggle store selection
  const handleStoreToggle = useCallback((storeId: number) => {
    setSelectedStores(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(storeId)) {
        newSelected.delete(storeId);
      } else {
        newSelected.add(storeId);
      }
      return newSelected;
    });
  }, []);

  // Select all stores
  const handleSelectAllStores = useCallback(() => {
    if (selectedStores.size === availableStores.length) {
      setSelectedStores(new Set());
    } else {
      setSelectedStores(new Set(availableStores.map(store => store.id)));
    }
  }, [selectedStores.size, availableStores]);

  // Handle assignment to stores
  const handleAssignToStores = useCallback(async () => {
    if (selectedStores.size === 0) return;

    setIsLoading(true);
    try {
      const selection: StoreAssignmentSelection = {
        storeIds: Array.from(selectedStores),
        customDescription: customDescription.trim() || undefined,
        catalogId: product?.id || product?.catalogId,
        designId: designData?.designId,
        designName: designName.trim() || 'Custom Design',
      };

      await onAssignToStores(selection);
      onClose();
    } catch (error) {
      console.error('Error assigning product to stores:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStores, customDescription, product, designData, onAssignToStores, onClose]);

  // Get product image
  const getProductImage = () => {
    if (productOverview?.defaultStyle?.imageFilePathFront) {
      return productOverview.defaultStyle.imageFilePathFront;
    }
    if (productOverview?.defaultStyle?.defaultSide?.imageFilePath) {
      return productOverview.defaultStyle.defaultSide.imageFilePath;
    }
    if (product?.defaultStyle?.imageFilePathFront) {
      return product.defaultStyle.imageFilePathFront;
    }
    return '/placeholder-product.jpg';
  };

  const productImageUrl = getProductImage();
  const productName = productOverview?.name || product?.name || 'Product';
  const brandName = productOverview?.brand?.name || '';
  const allStoresSelected = selectedStores.size === availableStores.length && availableStores.length > 0;
  const hasSelectedStores = selectedStores.size > 0;

  return (
    <div className="w-full h-full bg-white dark:bg-gray-800 flex flex-col">
      {/* Header with Product Info */}
      <div className="border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
        {/* Main Header Row */}
        <div className="flex items-center justify-between p-4">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Add To Store
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Assign {productName} to stores
              {designData?.designName && (
                <span className="ml-1">with design "{designData.designName}"</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl font-bold p-2"
          >
            ×
          </button>
        </div>

        {/* Product Preview Section */}
        <div className="px-4 pb-4">
          <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {/* Product Preview */}
            <div className="flex-shrink-0">
              <CarouselItemMainView
                styleOption={{
                  id: designData?.styleId || 1,
                  name: "Design Style",
                  imageFilePath: productImageUrl,
                  layers: designData?.layers || [],
                  styleOverrides: designData?.styleOverrides || {},
                  designId: designData?.designId,
                  designName: designData?.designName
                }}
                overRideSide={{ 
                  side: "front",
                  imageFilePath: productImageUrl
                }}
                className="w-20 h-20 object-cover rounded-lg border border-gray-300 dark:border-gray-600"
                sharedTop={sharedTop}
                sharedLeft={sharedLeft}
                sharedZoom={0.5}
                setLayerControlsStyle={setLayerControlsStyle}
                setLastClickedCarouselStyle={setLastClickedCarouselStyle}
                setLayerClickFocusedStyleId={setLayerClickFocusedStyleId}
                setSharedTop={setSharedTop}
                setSharedLeft={setSharedLeft}
              />
            </div>
            
            {/* Product Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {productName}
                </h3>
                {brandName && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {brandName}
                  </span>
                )}
                {designData?.designName && (
                  <span className="text-sm text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                    Design: {designData.designName}
                  </span>
                )}
              </div>
              
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Design Name:
                </label>
                <input
                  type="text"
                  value={designName}
                  onChange={(e) => setDesignName(e.target.value)}
                  placeholder="Enter design name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Product Description
                </label>
                <HTMLEditor
                  value={customDescription}
                  onChange={setCustomDescription}
                  placeholder="Enter custom product description..."
                  className="w-full"
                  minHeight="100px"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Store Selection:
            </span>
            <button
              onClick={handleSelectAllStores}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                allStoresSelected 
                  ? "bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-800 dark:text-red-200" 
                  : "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-800 dark:text-blue-200"
              }`}
            >
              {allStoresSelected ? "Deselect All" : "Select All Stores"}
            </button>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedStores.size} of {availableStores.length} stores selected
          </div>
        </div>
      </div>

      {/* Store Selection List */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {availableStores.map(store => {
            const isSelected = selectedStores.has(store.id);
            
            return (
              <div
                key={store.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                    : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600'
                }`}
                onClick={() => handleStoreToggle(store.id)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center w-5 h-5 rounded border-2 transition-colors ${
                      isSelected
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-300 dark:border-gray-500'
                    }`}
                  >
                    {isSelected && <BsCheck2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">
                      {store.name}
                    </h3>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-200 dark:border-gray-600 p-4 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Product will be added to {selectedStores.size} store{selectedStores.size !== 1 ? 's' : ''}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignToStores}
              disabled={!hasSelectedStores || isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed dark:disabled:bg-gray-600"
            >
              {isLoading ? 'Adding...' : `Add To ${selectedStores.size} Store${selectedStores.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};