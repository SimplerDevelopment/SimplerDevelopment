'use client';

import React, { useEffect, useContext, useState, useCallback, useMemo, memo, lazy, Suspense, startTransition, useRef } from "react";
import { EditorContext } from "./EditorContext";
import { LoadingSpinner } from "./LoadingSpinner";
import { ScalableMainView } from "./ScalableMainView";
import { motion, AnimatePresence } from "framer-motion";
import "./product-designer.css";
import { DesignerTopBar } from "./DesignerTopBar";
import { MainView } from "./MainView";
import { DesignerCartTable, type CartSelection } from "./DesignerCartTable";
import { StoreAssignmentTable, type StoreAssignmentSelection } from "./StoreAssignmentTable";
import { BsArrowsFullscreen, BsChevronLeft, BsChevronRight, BsGrid3X3Gap, BsX } from "react-icons/bs";
import { AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import { DesignApi, designUtils, type Design } from "./utils/designApi";
import { SessionManager } from "./utils/sessionManager";
import { loadDesignFonts } from "./utils/fontLoader";
import type { LayerData, ProductData, ProductSideData, ProductStyleData, ProductSizeData, StyleOverridesMap } from "./designerTypes";

// Module-level fallback context so useContext is never called conditionally
interface CartContextValue { isAdminMode?: boolean; [key: string]: unknown; }
const _FallbackPDCartCtx = React.createContext<CartContextValue | null>(null);

// Local quantity-item shape (value + price per size bucket)
interface QuantityItem { value: number; price: number; }
type QuantityState = Record<string, QuantityItem>;

// Design objects from the API sometimes arrive in snake_case (list endpoint)
type DesignRecord = Design & { style_overrides?: StyleOverridesMap };

// Lazy load heavy components
const CenterPanel = lazy(() => import("./CenterPanel").then(m => ({ default: m.CenterPanel })));
const LeftPanel = lazy(() => import("./LeftPanel").then(m => ({ default: m.LeftPanel })));
const DesignsPage = lazy(() => import("./DesignsPage").then(m => ({ default: m.DesignsPage })));
const EditPhotoModal = lazy(() => import("./EditPhotoModal").then(m => ({ default: m.EditPhotoModal })));
const LoadDesignModal = lazy(() => import("./LoadDesignModal"));

// Component to add drag functionality to MainView within carousel items
interface DraggableMainViewProps {
  children: React.ReactNode;
  sharedTop: number;
  sharedLeft: number;
  setSharedTop: (v: number) => void;
  setSharedLeft: (v: number) => void;
  sharedZoom: number;
}
const DraggableMainView = ({ children, sharedTop, sharedLeft, setSharedTop, setSharedLeft, sharedZoom }: DraggableMainViewProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, left: 0, top: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start dragging if not clicking on a layer or other interactive element
    const target = e.target as HTMLElement;
    if (target.closest('.layer') || target.closest('button') || e.shiftKey) {
      return;
    }
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      left: sharedLeft,
      top: sharedTop
    });
    e.preventDefault();
  }, [sharedLeft, sharedTop]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    setSharedLeft(dragStart.left + deltaX);
    setSharedTop(dragStart.top + deltaY);
  }, [isDragging, dragStart, setSharedLeft, setSharedTop]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        userSelect: "none",
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="relative"
        style={{
          transform: `scale(${sharedZoom})`,
          top: sharedTop,
          left: sharedLeft,
        }}
      >
        {children}
      </div>
    </div>
  );
};

// Component to wrap MainView for carousel items with custom layer selection behavior
interface CarouselItemMainViewProps {
  styleOption: ProductStyleData;
  overRideSide: ProductSideData | undefined;
  setLayerControlsStyle: (s: ProductStyleData | null) => void;
  setLastClickedCarouselStyle: (s: ProductStyleData | null) => void;
  setLayerClickFocusedStyleId: (id: number | null) => void;
  sharedTop: number;
  sharedLeft: number;
  setSharedTop: (v: number) => void;
  setSharedLeft: (v: number) => void;
  sharedZoom: number;
}
const CarouselItemMainView = ({ styleOption, overRideSide, setLayerControlsStyle, setLastClickedCarouselStyle, setLayerClickFocusedStyleId, sharedTop, sharedLeft, setSharedTop, setSharedLeft, sharedZoom }: CarouselItemMainViewProps) => {
  const originalContext = useContext(EditorContext);
  
  // Create a modified context that sets the layerControlsStyle when a layer is selected
  const modifiedContext = useMemo(() => ({
    ...originalContext,
    setSelectedLayer: (layer: LayerData | null) => {
      // Set the layer controls to use this carousel item's style
      if (layer) {
        setLayerControlsStyle(styleOption);
        setLastClickedCarouselStyle(styleOption);
        // Set this carousel item as the layer-click focused style (highest priority)
        setLayerClickFocusedStyleId(styleOption.id);
      } else {
        setLayerControlsStyle(null);
        // Don't clear lastClickedCarouselStyle when deselecting (for layer controls)
        // But clear layerClickFocusedStyleId to revert to hover behavior
        setLayerClickFocusedStyleId(null);
      }
      // Call the original setSelectedLayer
      originalContext.setSelectedLayer(layer);
    }
  }), [originalContext, styleOption, setLayerControlsStyle, setLastClickedCarouselStyle, setLayerClickFocusedStyleId]);

  return (
    <EditorContext.Provider value={modifiedContext}>
      <DraggableMainView 
        sharedTop={sharedTop}
        sharedLeft={sharedLeft}
        setSharedTop={setSharedTop}
        setSharedLeft={setSharedLeft}
        sharedZoom={sharedZoom}
      >
        <MainView overRideSide={overRideSide} />
      </DraggableMainView>
    </EditorContext.Provider>
  );
};

export interface ProductDesignerProps {
  productId: string;
  /** sd2026 site/website id — used to scope API URLs (required) */
  websiteId: number;
  /** Optional override for the storefront designs API base URL.
   *  Defaults to `/api/storefront/${websiteId}/designs`. */
  apiBaseUrl?: string;
  /** sd2026 customer id (replaces legacy userId semantics) */
  customerId?: number | null;
  CartContext?: React.Context<CartContextValue | null>;
  /**
   * Optional callback invoked with saved or updated design data.
   * Receives id when updating an existing design.
   */
  onSaveDesign?: (data: {
    id?: number;
    name: string;
    styleId: number;
    layers: LayerData[];
    styleOverrides: StyleOverridesMap;
  }) => void;
  /** List of stores to which this design can be saved */
  stores?: Array<{ id: number; name: string }>;
  /**
   * @deprecated use customerId — kept as alias for legacy callers.
   * Current authenticated user ID.
   */
  userId?: number | null;
  /** Custom cart handler function - overrides default API call */
  onAddToCart?: (selections: CartSelection[]) => Promise<unknown>;
  /** Optional saved-design id to preload when the editor mounts. The
   *  storefront design route uses this to hand `?designId=...` from the URL
   *  to the editor without going through the legacy `loadDesignOnInit`
   *  localStorage handshake. */
  initialDesignId?: string;
}
export const ProductDesigner: React.FC<ProductDesignerProps> = ({
  productId,
  websiteId,
  apiBaseUrl,
  customerId,
  onSaveDesign,
  userId: legacyUserId,
  onAddToCart: customAddToCart,
  CartContext,
  stores,
  initialDesignId,
}) => {
  // Resolve customerId (preferred) falling back to legacy userId
  const userId = customerId ?? legacyUserId ?? null;

  // Initialise DesignApi base URL + siteId (once per mount; safe to call again).
  // setSiteId stamps both the storefront baseUrl and stashes the id for sibling
  // helpers like claimDesigns / generateThumbnailUrl. apiBaseUrl is an advanced
  // override that wins for baseUrl but still leaves siteId intact.
  React.useEffect(() => {
    DesignApi.setSiteId(websiteId);
    if (apiBaseUrl) {
      DesignApi.setBaseUrl(apiBaseUrl);
    }
  }, [apiBaseUrl, websiteId]);

  // Get admin context if available — always call useContext (no conditional hook calls)
  const cartContext = useContext(CartContext ?? _FallbackPDCartCtx);
  const isAdminMode = cartContext?.isAdminMode || false;
  const [product, setProduct] = React.useState<ProductData | null>(null);
  const [style, setStyle] = React.useState<ProductStyleData | null>(null);
  const [side, setSide] = React.useState<ProductSideData | null>(null);
  const [layers, setLayers] = React.useState<LayerData[]>([]);
  const [selectedLayer, setSelectedLayer] = React.useState<LayerData | null>(null);
  const [selectedLayers, setSelectedLayers] = React.useState<string[]>([]);
  const [controlMode, setControlMode] = React.useState("welcome");
  const [showModal, setShowModal] = React.useState(false);
  const [styleOverrides, setStyleOverrides] = React.useState<StyleOverridesMap>({});
  const [quantity, setQuantity] = React.useState<QuantityState>({});
  const [savedDesigns, setSavedDesigns] = React.useState<Design[]>([]);
  const [nameModalOpen, setNameModalOpen] = React.useState(false);
  const [loadModalOpen, setLoadModalOpen] = React.useState(false);
  const [designName, setDesignName] = React.useState("");
  const [responsiveTab, setResponsiveTab] = React.useState("options");
  const [selectedDesignId, setSelectedDesignId] = React.useState<number | "">(
    "",
  );
  const [page, setPage] = useState<"editor" | "designs">("editor");
  const [carouselMode, setCarouselMode] = useState(false);
  const [hoveredStyleId, setHoveredStyleId] = useState<number | null>(null);
  const [hoveredStyleIndex, setHoveredStyleIndex] = useState<number>(0);
  const [layerControlsStyle, setLayerControlsStyle] = useState<ProductStyleData | null>(null);
  const [lastClickedCarouselStyle, setLastClickedCarouselStyle] = useState<ProductStyleData | null>(null);
  const [layerClickFocusedStyleId, setLayerClickFocusedStyleId] = useState<number | null>(null);
  const [cartMode, setCartMode] = useState(false);
  const [persistedCartSelections, setPersistedCartSelections] = useState<Map<string, CartSelection>>(new Map());
  
  // Separate zoom/position states for regular editor and carousel modes
  const [regularViewZoom, setRegularViewZoom] = useState(0.85);
  const [regularViewTop, setRegularViewTop] = useState(0);
  const [regularViewLeft, setRegularViewLeft] = useState(0);
  
  const [carouselViewZoom, setCarouselViewZoom] = useState(0.75);
  const [carouselViewTop, setCarouselViewTop] = useState(0);
  const [carouselViewLeft, setCarouselViewLeft] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname === "/designs") {
      startTransition(() => {
        setPage("designs");
      });
    }
  }, []);
  
  // All useEffect hooks must be called after state declarations
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const designId = urlParams.get('designId');
    const layersParam = urlParams.get('layers');
    const styleOverridesParam = urlParams.get('styleOverrides');
    const nameParam = urlParams.get('name');

    if (designId && layersParam && styleOverridesParam) {
      try {
        const parsedLayers = JSON.parse(layersParam);
        const parsedStyleOverrides = JSON.parse(styleOverridesParam);

        // Load fonts before setting layers
        loadDesignFonts(parsedLayers).then(() => {
          console.log('Fonts loaded successfully for URL param design');
        }).catch((error) => {
          console.warn('Error loading fonts for URL param design:', error);
        });

        startTransition(() => {
          setSelectedDesignId(parseInt(designId));
          setLayers(parsedLayers);
          setStyleOverrides(parsedStyleOverrides);
          setDesignName(nameParam || `Design #${designId}`);
          setControlMode("welcome");
        });
      } catch (error) {
        console.error("Error parsing design data from URL:", error);
      }
    }
  }, []);

  // Progressive loading: fetch product detail then styles+sides.
  // Wave 2I: replaced legacy /api/catalog/product-overview +
  // /api/catalog/product-styles with the sd2026 storefront pair:
  //   GET /api/storefront/${websiteId}/products/${productId}        → product
  //   GET /api/storefront/${websiteId}/products/${productId}/styles → styles (+ nested sides)
  // We combine them client-side to preserve the editor's
  // { ...product, styles: [...], defaultStyle, defaultSide? } expectation.
  useEffect(() => {
    if (!websiteId || !productId) return;
    const pid = parseInt(productId, 10);
    if (Number.isNaN(pid)) return;

    const fetchProductOverview = async () => {
      try {
        // 1) Fetch product detail (envelope: { success, data }).
        const detailResponse = await fetch(
          `/api/storefront/${websiteId}/products/${pid}`
        );
        const detailJson = await detailResponse.json();
        const productData = detailJson?.data ?? detailJson;

        // 2) Fetch styles+sides in parallel-with-render.
        const stylesResponse = await fetch(
          `/api/storefront/${websiteId}/products/${pid}/styles`
        );
        const stylesJson = await stylesResponse.json();
        const allStyles = Array.isArray(stylesJson?.data)
          ? stylesJson.data
          : Array.isArray(stylesJson)
            ? stylesJson
            : [];

        // Default style = first style (DB has `order` ascending). The editor's
        // downstream code looks for either `isDefault` or just `styles[0]`.
        const defaultStyle = allStyles[0] ?? null;

        const combined = {
          ...productData,
          styles: allStyles,
          defaultStyle,
        };

        startTransition(() => {
          setProduct(combined);
        });
      } catch (error) {
        console.error("Error fetching product overview:", error);
      }
    };

    fetchProductOverview();
  }, [productId, websiteId]);

  useEffect(() => {
    if (!product?.styles) return;
    
    // Handle both old format (from product-details) and new format (from product-overview)
    let defaultStyle;
    if (product.defaultStyle) {
      // New format from product-overview - use the defaultStyle directly
      defaultStyle = product.defaultStyle;
    } else {
      // Old format from product-details - find the default style
      defaultStyle = product.styles.find((style) => style?.isDefault) || product.styles.filter(s => s)?.[0];
    }
    
    startTransition(() => {
      setStyle(defaultStyle);
    });
  }, [product]);

  useEffect(() => {
    if (!style) return;
    
    // Handle both old format and new format for sides
    let defaultSide;
    if (style.defaultSide) {
      // New format from product-overview - use the defaultSide directly
      defaultSide = style.defaultSide;
    } else if (style.sides) {
      // Old format from product-details - find the front side
      defaultSide = style.sides.find((side) => side.side === "front") || style.sides[0];
    }
    
    if (defaultSide) {
      startTransition(() => {
        setSide(defaultSide);
      });
    }
  }, [style]);

  useEffect(() => {
    if (!selectedLayer) return;
    startTransition(() => {
      setControlMode("layer");
    });
  }, [selectedLayer]);

  const fetchSavedDesigns = useCallback(async () => {
    if (!userId) return;
    try {
      // Wave 2I: legacy /api/designs?userId=... → DesignApi.getDesigns(),
      // which hits /api/storefront/${websiteId}/designs with the customer's
      // bearer token / anonymous session cookie. The storefront route
      // returns an envelope; unwrap it.
      const result = await DesignApi.getDesigns();
      const data: Design[] = Array.isArray((result as { data?: Design[] }).data) ? (result as { data: Design[] }).data : Array.isArray(result) ? result as Design[] : [];
      startTransition(() => {
        setSavedDesigns(data);
      });
    } catch (error) {
      console.error("Error fetching designs:", error);
    }
  }, [userId]);

  useEffect(() => {
    if (!loadModalOpen) return;
    fetchSavedDesigns();
  }, [loadModalOpen, fetchSavedDesigns]);

  
  // All hook definitions must be at the top before any early returns
  const addLayer = useCallback((layer) => {
    layer.id = Math.random().toString(36).substr(2, 9);
    layer.side = side?.side || 'front';
    const nLayers = [...layers, layer];

    // If it's a text layer with a font, load the font
    if (layer.type === 'text' && layer.font) {
      loadDesignFonts([layer]).then(() => {
        console.log(`Font "${layer.font}" loaded for new text layer`);
      }).catch((error) => {
        console.warn(`Error loading font "${layer.font}" for new text layer:`, error);
      });
    }

    setLayers(nLayers);
    setSelectedLayer(nLayers[nLayers.length - 1]);
  }, [layers, side]);

  const removeLayer = useCallback((layer) => {
    const nLayers = layers.filter((l) => l.id !== layer.id);
    setLayers(nLayers);
    setSelectedLayer(null);
    setControlMode("welcome");
  }, [layers]);

  const updateLayer = useCallback((layer) => {
    const nLayers = [...layers];
    const index = nLayers.findIndex((l) => l.id === layer.id);
    if (index !== -1) {
      const oldLayer = nLayers[index];
      nLayers[index] = layer;

      // If it's a text layer and the font changed, load the new font
      if (layer.type === 'text' && layer.font && oldLayer.font !== layer.font) {
        loadDesignFonts([layer]).then(() => {
          console.log(`Font "${layer.font}" loaded for updated text layer`);
        }).catch((error) => {
          console.warn(`Error loading font "${layer.font}" for updated text layer:`, error);
        });
      }

      setLayers(nLayers);
    }
  }, [layers]);

  const { totalQuantity, totalPrice } = useMemo(() => {
    const values = Object.values(quantity);
    const totalQuantity = values
      .map((item: QuantityItem) => item.value)
      .reduce((acc: number, curr: number) => acc + curr, 0);
    const totalPrice = values
      .map((item: QuantityItem) => item.value * item.price)
      .reduce((acc: number, curr: number) => acc + curr, 0);
    return { totalQuantity, totalPrice };
  }, [quantity]);

  // Create EditorContext value before any early returns to ensure hooks are called consistently
  // Design state management — must be declared BEFORE the auto-load effect that calls setDesignState
  const [currentDesignId, setCurrentDesignId] = useState<number | null>(null);

  const [designState, setDesignState] = useState({
    isSaved: false,
    isAutoSaving: false,
    lastSavedAt: null as Date | null,
    hasUnsavedChanges: false,
    name: designName || "Untitled Design",
  });

  // Check for design to auto-load from URL navigation
  useEffect(() => {
    const checkForDesignToLoad = () => {
      try {
        const loadDesignFlag = localStorage.getItem('loadDesignOnInit');
        if (!loadDesignFlag) return;

        const { designId, designData, timestamp } = JSON.parse(loadDesignFlag);
        
        // Check if the flag is not too old (within 5 minutes)
        const fiveMinutes = 5 * 60 * 1000;
        if (Date.now() - timestamp > fiveMinutes) {
          localStorage.removeItem('loadDesignOnInit');
          return;
        }

        // Auto-load the design
        console.log('Auto-loading design from URL:', designId);

        const layersToSet = designData.layers || [];

        // Load fonts before setting layers
        loadDesignFonts(layersToSet).then(() => {
          console.log('Fonts loaded successfully for auto-load design');
        }).catch((error) => {
          console.warn('Error loading fonts for auto-load design:', error);
        });

        // Set design state
        setCurrentDesignId(designData.id);
        setLayers(layersToSet);
        setStyleOverrides(designData.styleOverrides || {});
        setDesignName(designData.name || "");

        // Update design state
        setDesignState({
          isSaved: true,
          isAutoSaving: false,
          lastSavedAt: new Date(),
          hasUnsavedChanges: false,
          name: designData.name || "",
        });

        // Find and set the matching style if available
        if (product?.styles && designData.styleId) {
          const matchingStyle = product.styles.find((s: ProductStyleData) => s.id === designData.styleId);
          if (matchingStyle) {
            setStyle(matchingStyle);
          }
        }

        // Clear the flag after successful load
        localStorage.removeItem('loadDesignOnInit');
        
      } catch (error) {
        console.error('Error auto-loading design:', error);
        localStorage.removeItem('loadDesignOnInit');
      }
    };

    // Only try to auto-load once when component mounts and product is loaded
    if (product && !currentDesignId) {
      checkForDesignToLoad();
    }
  }, [product, currentDesignId]);

  // (designState useState moved above — declared before the auto-load effect)

  // Track changes to mark design as having unsaved changes
  useEffect(() => {
    if (currentDesignId && (layers.length > 0 || Object.keys(styleOverrides).length > 0)) {
      startTransition(() => {
        setDesignState(prev => ({
          ...prev,
          hasUnsavedChanges: true,
        }));
      });
    }
  }, [layers, styleOverrides, currentDesignId]);

  // Design management functions
  const saveDesign = useCallback(async (name?: string): Promise<Design | null> => {
    if (!product || !style) {
      console.error('Cannot save design: missing product or style');
      return null;
    }

    try {
      setDesignState(prev => ({ ...prev, isAutoSaving: true }));

      // Create combined name: Design Name + Product Name
      const designName = name || designState.name || 'Custom Design';
      const productName = product.name || 'Product';
      const combinedName = `${designName} - ${productName}`;
      
      let savedDesign: Design;

      if (currentDesignId) {
        // Update existing design - only send fields that can be updated
        const updateData = {
          name: combinedName,
          layers,
          styleOverrides,
          side: side?.side || 'front',
        };
        savedDesign = await DesignApi.updateDesign(currentDesignId, updateData, userId);
      } else {
        // Create new design - send all required fields
        const createData = {
          name: combinedName,
          productId: product.id,
          styleId: style.id,
          side: side?.side || 'front',
          layers,
          styleOverrides,
        };
        savedDesign = await DesignApi.createDesign(createData, userId);
        setCurrentDesignId(savedDesign.id);
      }

      setDesignState(prev => ({
        ...prev,
        isSaved: true,
        isAutoSaving: false,
        lastSavedAt: new Date(),
        hasUnsavedChanges: false,
        name: savedDesign.name,
      }));

      setDesignName(savedDesign.name);
      
      return savedDesign;
    } catch (error) {
      console.error('Error saving design:', error);
      setDesignState(prev => ({ ...prev, isAutoSaving: false }));
      return null;
    }
  }, [product, style, side, layers, styleOverrides, designState.name, currentDesignId]);

  const loadDesign = useCallback(async (designId: number): Promise<boolean> => {
    try {
      const design = await DesignApi.getDesign(designId, userId);
      const layersToSet = design.layers || [];

      // Load fonts before setting layers
      try {
        await loadDesignFonts(layersToSet);
        console.log('Fonts loaded successfully for loadDesign');
      } catch (error) {
        console.warn('Error loading fonts for loadDesign:', error);
      }

      // Load design data into editor
      setCurrentDesignId(design.id);
      setLayers(layersToSet);
      setStyleOverrides(design.styleOverrides || {});
      setDesignName(design.name);

      setDesignState({
        isSaved: true,
        isAutoSaving: false,
        lastSavedAt: new Date(design.updatedAt),
        hasUnsavedChanges: false,
        name: design.name,
      });

      // Find and set the style that matches the design
      if (product?.styles) {
        const matchingStyle = product.styles.find((s: ProductStyleData) => s.id === design.styleId);
        if (matchingStyle) {
          setStyle(matchingStyle);
        }
      }

      return true;
    } catch (error) {
      console.error('Error loading design:', error);
      return false;
    }
  }, [product, setLayers, setStyleOverrides, setDesignName, setStyle]);

  // React Compiler handles memoisation — plain function avoids "existing
  // memoisation could not be preserved" compiler warning.
  const createNewDesign = () => {
    setCurrentDesignId(null);
    setLayers([]);
    setStyleOverrides({});
    setDesignName("Untitled Design");
    setSelectedLayer(null);
    setControlMode("welcome");

    setDesignState({
      isSaved: false,
      isAutoSaving: false,
      lastSavedAt: null,
      hasUnsavedChanges: false,
      name: "Untitled Design",
    });
  };

  const autoSave = useCallback(async () => {
    if (currentDesignId && designState.hasUnsavedChanges && !designState.isAutoSaving) {
      await saveDesign();
    }
  }, [currentDesignId, designState.hasUnsavedChanges, designState.isAutoSaving, saveDesign]);

  // Session management for anonymous users
  useEffect(() => {
    // Initialize session for anonymous users
    SessionManager.getOrCreateSessionId();
  }, []);

  // Auto-save with debouncing
  useEffect(() => {
    if (!currentDesignId || !designState.hasUnsavedChanges || designState.isAutoSaving) {
      return;
    }

    const autoSaveTimer = setTimeout(() => {
      autoSave();
    }, 30000); // Auto-save after 30 seconds of inactivity

    return () => clearTimeout(autoSaveTimer);
  }, [layers, styleOverrides, currentDesignId, designState.hasUnsavedChanges, designState.isAutoSaving, autoSave]);

  // Prompt anonymous users to create accounts
  useEffect(() => {
    if (!userId && currentDesignId) {
      const checkSignupPrompt = async () => {
        try {
          const { shouldPrompt, designCount } = await designUtils.shouldPromptSignup();
          if (shouldPrompt) {
            // This would trigger a signup modal - for now just log
            console.log(`User has ${designCount} designs and should be prompted to create an account`);
          }
        } catch (error) {
          console.error('Error checking signup prompt:', error);
        }
      };

      const timer = setTimeout(checkSignupPrompt, 5000); // Check after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [userId, currentDesignId]);

  const editorContextValue = useMemo(() => ({
    websiteId,
    controlMode,
    setControlMode,
    product,
    side,
    style,
    setStyle,
    setSide,
    addLayer,
    layers,
    setSelectedLayer,
    selectedLayer,
    selectedLayers,
    setSelectedLayers,
    updateLayer,
    removeLayer,
    showModal,
    setShowModal,
    setStyleOverrides,
    styleOverrides,
    setLayers,
    quantity,
    setQuantity,
    carouselMode,
    // Design persistence state
    currentDesignId,
    setCurrentDesignId,
    designState,
    setDesignState,
    designName,
    setDesignName,
    // Design management functions
    saveDesign,
    loadDesign,
    createNewDesign,
    autoSave,
  }), [websiteId, controlMode, product, side, style, addLayer, layers, selectedLayer, selectedLayers, updateLayer, removeLayer, showModal, styleOverrides, quantity, carouselMode, currentDesignId, designState, designName, saveDesign, loadDesign, createNewDesign, autoSave]);

  // Memoize sorted sizes calculation to avoid calling hooks conditionally  
  const sortedSizes = useMemo(() => {
    const priority = [
      "XS", "S", "SM", "M", "L", "XL", "2XL", "3XL", 
      "4XL", "5XL", "6XL", "7XL", "8XL", "9XL"
    ];
    return [...(style?.sizes || [])]
      .reduce(
        (acc, size) => {
          if (
            !acc.some(
              (s) =>
                s.name.toUpperCase() ===
                size.name.toUpperCase(),
            )
          ) {
            acc.push(size);
          }
          return acc;
        },
        [] as ProductSizeData[],
      )
      .sort((a, b) => {
        return (
          priority.indexOf(a.name.toUpperCase()) -
          priority.indexOf(b.name.toUpperCase())
        );
      })
      .map((size, index) => (
        <div
          key={`${size.name}-${index}`}
          className="text-gray-800 dark:text-gray-200"
        >
          {size.name}
        </div>
      ));
  }, [style?.sizes]);

  const confirmSave = async () => {
    if (!designName || designName.trim() === "") {
      return; // Don't proceed if name is empty
    }

    setNameModalOpen(false);
    
    if (onSaveDesign) {
      onSaveDesign({
        id: typeof selectedDesignId === "number" ? selectedDesignId : undefined,
        name: designName.trim(),
        styleId: style?.id as number,
        layers,
        styleOverrides,
      });
    } else {
      // Handle internal save and redirect via DesignApi (Wave 2I).
      try {
        if (typeof selectedDesignId === "number" && selectedDesignId) {
          await DesignApi.updateDesign(selectedDesignId, {
            name: designName.trim(),
            layers,
            styleOverrides,
            side: side?.side ?? 'front',
          }, userId ?? undefined);
        } else if (product?.id && style?.id) {
          await DesignApi.createDesign({
            name: designName.trim(),
            productId: String(product.id),
            styleId: style.id,
            side: side?.side ?? 'front',
            layers,
            styleOverrides,
          }, userId ?? undefined);
        }

        // Refresh and navigate
        const result = await DesignApi.getDesigns();
        const data: Design[] = Array.isArray((result as { data?: Design[] }).data) ? (result as { data: Design[] }).data : Array.isArray(result) ? result as Design[] : [];
        startTransition(() => {
          setSavedDesigns(data);
          setPage("designs");
        });
      } catch (err) {
        console.error('Save/redirect failed:', err);
      }
    }

    // clear selection after save or clone
    setSelectedDesignId("");
  };

  // Save or update current design and redirect to designs page (Wave 2I:
  // routed through DesignApi → /api/storefront/${websiteId}/designs).
  const handleSaveAndRedirect = async () => {
    // Always prompt for name if not provided or empty
    if (!designName || designName.trim() === "") {
      setNameModalOpen(true);
      return;
    }

    try {
      if (typeof selectedDesignId === "number" && selectedDesignId) {
        await DesignApi.updateDesign(selectedDesignId, {
          name: designName.trim(),
          layers,
          styleOverrides,
          side: side?.side ?? 'front',
        }, userId ?? undefined);
      } else if (product?.id && style?.id) {
        await DesignApi.createDesign({
          name: designName.trim(),
          productId: String(product.id),
          styleId: style.id,
          side: side?.side ?? 'front',
          layers,
          styleOverrides,
        }, userId ?? undefined);
      }

      const result = await DesignApi.getDesigns();
      const data: Design[] = Array.isArray((result as { data?: Design[] }).data) ? (result as { data: Design[] }).data : Array.isArray(result) ? result as Design[] : [];
      startTransition(() => {
        setSavedDesigns(data);
        setPage("designs");
        setSelectedDesignId("");
      });
    } catch (err) {
      console.error('Save/redirect failed:', err);
    }
  };

  // handlers for editing or cloning designs
  const handleEdit = async (d: DesignRecord) => {
    const layersToSet = d.layers || [];

    // Load fonts before setting layers
    try {
      await loadDesignFonts(layersToSet);
      console.log('Fonts loaded successfully for edit design');
    } catch (error) {
      console.warn('Error loading fonts for edit design:', error);
    }

    startTransition(() => {
      setSelectedDesignId(d.id);
      setLayers(layersToSet);
      setStyleOverrides(d.style_overrides || {});
      setDesignName(d.name || "");
      setControlMode("welcome");
      setPage("editor");
    });
  };
  const handleClone = async (d: DesignRecord) => {
    const layersToSet = d.layers || [];

    // Load fonts before setting layers
    try {
      await loadDesignFonts(layersToSet);
      console.log('Fonts loaded successfully for clone design');
    } catch (error) {
      console.warn('Error loading fonts for clone design:', error);
    }

    startTransition(() => {
      setSelectedDesignId("");
      setLayers(layersToSet);
      setStyleOverrides(d.style_overrides || {});
      setDesignName(`${d.name || "Design"} (copy)`);
      setNameModalOpen(true);
      setControlMode("welcome");
      setPage("editor");
    });
  };

  const handleStoreAssignment = async (selection: StoreAssignmentSelection) => {
    console.log('Assigning designed product to stores:', selection);
    
    try {
      // Convert StoreAssignmentSelection to the format expected by the API
      const storeConfigurations = [];
      
      selection.storeIds.forEach(storeId => {
        const store = stores?.find(s => s.id === storeId);
        if (store) {
          storeConfigurations.push({
            storeId,
            storeName: store.name,
            quantities: [
              {
                sizeId: 1, // Default size - could be made configurable
                sizeName: "Default",
                quantity: 1 // Default quantity
              }
            ],
            customizations: {
              description: selection.customDescription || `Custom designed product`,
              tags: ["admin-assigned", "designed-product"]
            }
          });
        }
      });

      // Create design data for the assignment
      const designName = selection.designName || designState.name || 'Custom Design';
      const productName = product?.name || 'Product';
      const combinedName = `${designName} - ${productName}`;
      
      const designData = {
        name: combinedName,
        designName: designName, // Keep original design name for reference
        styleId: style?.id || 1,
        layers,
        styleOverrides,
        productId: product?.id?.toString() || productId,
        userId: userId,
        id: currentDesignId,
      };

      // TODO(designer): replace with sd2026 endpoint when available — admin
      // store-assignment is not yet ported. Wave 2E owns the admin pages.
      // For now, no-op safely so the editor doesn't crash.
      const response = await fetch('/api/catalog/assign-designed-product-to-store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          designData,
          storeConfigurations,
          userId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to assign designed product to stores');
      }

      // Show success message with detailed results
      const successCount = (result.summary?.successful as number | undefined) || (result.assignments?.filter((a: { success?: boolean }) => a.success).length) || 0;
      const totalStores = storeConfigurations.length;
      
      alert(`Successfully assigned "${designData.name}" to ${successCount}/${totalStores} store${totalStores !== 1 ? 's' : ''}!`);
      
      // Close the assignment interface
      setCartMode(false);
      
      return result;
      
    } catch (error) {
      console.error('Error assigning styles to stores:', error);
      alert(`Failed to assign styles to stores: ${error.message}`);
      throw error;
    }
  };

  const handleAddToCart = async (selections: CartSelection[]) => {
    console.log('Adding to cart:', selections);
    
    // Create enriched cart items with design context
    const enrichedSelections = selections.map(selection => ({
      ...selection,
      designContext: {
        layers,
        styleOverrides,
        designName: "Custom Design", // Could be from saved design
        productId: product?.id,
        designId: selectedDesignId,
      }
    }));
    
    console.log('Enriched cart items:', enrichedSelections);
    
    try {
      let result;
      
      if (customAddToCart) {
        // Use custom cart handler (for store integration)
        result = await customAddToCart(enrichedSelections);
      } else {
        // Storefront cart fallback: POST one line per selection to the
        // sd2026 endpoint `POST /api/storefront/${websiteId}/cart`. The
        // route was extended in Wave 2F to accept `designId` and de-dupe
        // by (productId, variantId, designId), so two different designs
        // on the same product land as two cart rows.
        const sessionId = (() => {
          if (typeof window === 'undefined') return '';
          let sid = localStorage.getItem('cart_session_id');
          if (!sid) {
            sid = crypto.randomUUID();
            localStorage.setItem('cart_session_id', sid);
          }
          return sid;
        })();

        const pid = productId ? parseInt(String(productId), 10) : null;
        if (!pid || Number.isNaN(pid)) {
          throw new Error('Missing productId — cannot add to cart');
        }

        // Post each selection in parallel; aggregate failures so a partial
        // success still reports something useful in the toast.
        const responses = await Promise.allSettled(
          enrichedSelections.map(async (sel) => {
            const res = await fetch(`/api/storefront/${websiteId}/cart`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                sessionId,
                productId: pid,
                // CartSelection.sizeId maps to product variant id when the
                // designer surfaced size as a variant; null is fine.
                variantId: sel.sizeId ?? null,
                quantity: sel.quantity,
                designId: selectedDesignId || null,
              }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.success === false) {
              throw new Error(json?.message || `HTTP ${res.status}`);
            }
            return { selection: sel, data: json.data };
          }),
        );

        const failures = responses
          .map((r, i) => (r.status === 'rejected' ? { i, reason: (r as PromiseRejectedResult).reason } : null))
          .filter((x): x is { i: number; reason: PromiseRejectedResult['reason'] } => x !== null);
        const successes = responses.filter(r => r.status === 'fulfilled').length;

        const totalItems = enrichedSelections
          .filter((_, i) => responses[i].status === 'fulfilled')
          .reduce((sum, s) => sum + (s.quantity || 0), 0);
        const totalPrice = enrichedSelections
          .filter((_, i) => responses[i].status === 'fulfilled')
          .reduce((sum, s) => sum + (s.price || 0) * (s.quantity || 0), 0);

        result = {
          success: failures.length === 0,
          summary: { totalItems, totalPrice },
          successes,
          failures: failures.map(f => ({
            selection: enrichedSelections[f.i],
            error: String(f.reason?.message || f.reason),
          })),
          error: failures.length
            ? `${failures.length} of ${enrichedSelections.length} item(s) failed to add`
            : undefined,
        };
      }
      
      if (result.success) {
        // Success - show success message
        alert(`Successfully added ${result.summary.totalItems} item(s) to cart!\nTotal: $${result.summary.totalPrice.toFixed(2)}`);
        
        // Close cart mode after successful add and clear persisted selections
        setCartMode(false);
        setPersistedCartSelections(new Map());
      } else {
        throw new Error(result.error || 'Failed to add items to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert(`Failed to add items to cart: ${error.message}`);
    }
  };

  if (page === "designs") {
    return (
      <div className="sd-product-designer" data-testid="product-designer">
        <Suspense fallback={<div className="flex items-center justify-center h-[90vh]">Loading designs...</div>}>
          <DesignsPage
            designs={savedDesigns}
            onEdit={handleEdit}
            onClone={handleClone}
            onClose={() => setPage("editor")}
          />
        </Suspense>
      </div>
    );
  }
  return (
    <div className="sd-product-designer" data-testid="product-designer">
      {nameModalOpen && (
        <div
          style={{
            zIndex: 9999,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          className="flex items-center justify-center bg-black bg-opacity-50"
        >
          <div
            style={{
              zIndex: 10000,
              position: 'relative',
            }}
            className="bg-white dark:bg-gray-800 p-6 rounded shadow-lg max-w-sm w-1/2">
            <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Name Your Design
            </h3>
            <input
              type="text"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-2 w-full mb-4 rounded"
              placeholder="Enter design name (required)"
              autoFocus
              data-testid="design-name-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && designName.trim()) {
                  confirmSave();
                }
              }}
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setNameModalOpen(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmSave}
                disabled={!designName.trim()}
                data-testid="design-name-confirm"
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {loadModalOpen && (
        <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"><div className="bg-white p-4 rounded">Loading...</div></div>}>
          <LoadDesignModal
            designs={savedDesigns}
            onSelect={async (d: DesignRecord) => {
              setLoadModalOpen(false);

              const layersToSet = d.layers || [];

              // Load fonts before setting layers
              try {
                await loadDesignFonts(layersToSet);
                console.log('Fonts loaded successfully for design layers');
              } catch (error) {
                console.warn('Error loading fonts for design:', error);
              }

              startTransition(() => {
                // Load design data directly with proper format handling
                setCurrentDesignId(d.id);
                setSelectedDesignId(d.id);
                setLayers(layersToSet);
                // Handle both camelCase and snake_case formats
                setStyleOverrides(d.styleOverrides || d.style_overrides || {});
                setDesignName(d.name || "");

                // Update design state
                setDesignState({
                  isSaved: true,
                  isAutoSaving: false,
                  lastSavedAt: d.updatedAt ? new Date(d.updatedAt) : new Date(),
                  hasUnsavedChanges: false,
                  name: d.name || "",
                });

                // Find and set the matching style if available
                if (product?.styles && d.styleId) {
                  const matchingStyle = product.styles.find((s: ProductStyleData) => s.id === d.styleId);
                  if (matchingStyle) {
                    setStyle(matchingStyle);
                  }
                }
              });
            }}
            onClose={() => setLoadModalOpen(false)}
          />
        </Suspense>
      )}
      <div className="h-full flex flex-col">
        <EditorContext.Provider
          value={editorContextValue}
        >
        <DesignerTopBar {...{controlMode,sortedSizes,
  selectedDesignId,
handleClone,
layers,
styleOverrides,
designName,
handleSaveAndRedirect,
setControlMode,
  setLoadModalOpen, userId, product, setStyle, style, setCarouselMode, setHoveredStyleId, setHoveredStyleIndex, carouselMode, hoveredStyleId, selectedLayer, updateLayer, removeLayer, addLayer, setSelectedLayer, setSide, layerControlsStyle, lastClickedCarouselStyle, cartMode, setCartMode, CartContext
  }} />
       
        <AnimatePresence mode="wait">
          {cartMode ? (
            <motion.div
              key="cart"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ 
                duration: 0.4, 
                ease: [0.4, 0, 0.2, 1],
                scale: { duration: 0.3 }
              }}
              className="flex-1"
            >
              {isAdminMode ? (
                <StoreAssignmentTable
                  product={product}
                  productOverview={product} // Pass the full product data as productOverview
                  availableStores={stores}
                  onAssignToStores={handleStoreAssignment}
                  onClose={() => setCartMode(false)}
                />
              ) : (
                <DesignerCartTable
                  product={product}
                  onAddToCart={handleAddToCart}
                  onClose={() => setCartMode(false)}
                  persistedSelections={persistedCartSelections}
                  onSelectionsChange={setPersistedCartSelections}
                  CartContext={CartContext}
                />
              )}
            </motion.div>
          ) : carouselMode ? (
            <motion.div
              key="carousel"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ 
                duration: 0.4, 
                ease: [0.4, 0, 0.2, 1] 
              }}
              className="flex-1 bg-black"
            >
              <StyleCarousel 
                product={product}
                hoveredStyleId={hoveredStyleId}
                style={style}
                onClose={() => setCarouselMode(false)}
                setHoveredStyleId={setHoveredStyleId}
                setStyle={setStyle}
                selectedLayer={selectedLayer}
                setLayerControlsStyle={setLayerControlsStyle}
                setLastClickedCarouselStyle={setLastClickedCarouselStyle}
                layerClickFocusedStyleId={layerClickFocusedStyleId}
                setLayerClickFocusedStyleId={setLayerClickFocusedStyleId}
                sharedZoom={carouselViewZoom}
                setSharedZoom={setCarouselViewZoom}
                sharedTop={carouselViewTop}
                setSharedTop={setCarouselViewTop}
                sharedLeft={carouselViewLeft}
                setSharedLeft={setCarouselViewLeft}
                designState={designState}
                setDesignState={setDesignState}
                designName={designName}
                setDesignName={setDesignName}
              />
            </motion.div>
          ) : (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.99 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0, 0.2, 1] 
              }}
              className="hidden md:flex sdEditor flex-1"
            >
              <Suspense fallback={<div className="w-64 bg-gray-100"><LoadingSpinner message="Loading tools..." /></div>}>
                <LeftPanel />
              </Suspense>
              <Suspense fallback={<div className="flex-1 bg-gray-50"><LoadingSpinner message="Loading design area..." className="h-full" /></div>}>
                <CenterPanel
                  zoom={regularViewZoom}
                  setZoom={setRegularViewZoom}
                  top={regularViewTop}
                  setTop={setRegularViewTop}
                  left={regularViewLeft}
                  setLeft={setRegularViewLeft}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div 
          className="md:hidden flex-1 flex flex-col"
          initial={{ opacity: carouselMode ? 0 : 1 }}
          animate={{ opacity: carouselMode ? 0 : 1 }}
          transition={{ duration: 0.3 }}
        >
          {!carouselMode && (
            <>
              <div className="flex border-b">
                <button
                  className={`flex-1 py-2 text-center ${
                    responsiveTab === "options"
                      ? "border-b-2 border-blue-500 font-bold"
                      : ""
                  }`}
                  onClick={() => setResponsiveTab("options")}
                  type="button"
                >
                  Options
                </button>
                <button
                  className={`flex-1 py-2 text-center ${
                    responsiveTab === "design"
                      ? "border-b-2 border-blue-500 font-bold"
                      : ""
                  }`}
                  onClick={() => setResponsiveTab("design")}
                  type="button"
                >
                  Design
                </button>
              </div>
              <div className="flex-1">
                <Suspense fallback={<div className="p-4 animate-pulse bg-gray-100 h-full">Loading...</div>}>
                  {responsiveTab === "options" ? <LeftPanel /> : <CenterPanel
                    zoom={regularViewZoom}
                    setZoom={setRegularViewZoom}
                    top={regularViewTop}
                    setTop={setRegularViewTop}
                    left={regularViewLeft}
                    setLeft={setRegularViewLeft}
                  />}
                </Suspense>
              </div>
            </>
          )}
        </motion.div>

        {showModal && (
          <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"><div className="bg-white p-4 rounded">Loading editor...</div></div>}>
            <EditPhotoModal selectedLayer={selectedLayer} />
          </Suspense>
        )}
        </EditorContext.Provider>
      </div>
    </div>
  );
};


interface ColorPickerProps {
  product: ProductData | null;
  setStyle: (s: ProductStyleData) => void;
  style: ProductStyleData | null;
  setCarouselMode: (v: boolean) => void;
  setHoveredStyleId: (id: number | null) => void;
  setHoveredStyleIndex: (i: number) => void;
  carouselMode: boolean;
  hoveredStyleId: number | null;
}
export const ColorPicker = ({product,setStyle,style,setCarouselMode,setHoveredStyleId,setHoveredStyleIndex,carouselMode,hoveredStyleId}: ColorPickerProps) => {
  const [carouselDismissedByClick, setCarouselDismissedByClick] = useState(false);
  

  const handleDoubleClick = (styleId: number, styleIndex: number) => {
    if (!carouselMode && !carouselDismissedByClick) {
      setCarouselMode(true);
      setHoveredStyleId(styleId);
      setHoveredStyleIndex(styleIndex);
    }
  };

  const toggleCarousel = () => {
    if (carouselMode) {
      setCarouselMode(false);
      setHoveredStyleId(null);
    } else {
      setCarouselMode(true);
      // Focus on current style when opening carousel
      setHoveredStyleId(style?.id || null);
      setHoveredStyleIndex(0);
    }
    setCarouselDismissedByClick(false);
  };

  const handleStyleHover = (styleId: number, styleIndex: number) => {
    console.log('🎯 Hovering style:', styleId, 'at index:', styleIndex);
    setHoveredStyleId(styleId);
    setHoveredStyleIndex(styleIndex);
  };

  const handleStyleClick = (s: ProductStyleData) => {
    setStyle(s);
    
    // Dismiss carousel when a style is clicked
    if (carouselMode) {
      setCarouselMode(false);
      setHoveredStyleId(null);
    }
    setCarouselDismissedByClick(true);
  };

  return  <div 
    className="flex flex-wrap items-center gap-2 max-w-[340px] overflow-x-auto"
  >
    {/* Carousel Toggle Button */}
    <button
      onClick={toggleCarousel}
      className={`w-8 h-8 rounded-lg border-2 transition-all duration-200 flex items-center justify-center ${
        carouselMode 
          ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700" 
          : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
      }`}
      title={carouselMode ? "Close style carousel" : "Open style carousel"}
      aria-label={carouselMode ? "Close style carousel" : "Open style carousel"}
      type="button"
    >
      {carouselMode ? <BsX size={18} /> : <BsGrid3X3Gap size={14} />}
    </button>

    {/* Color Style Buttons */}
    {product?.styles?.filter(s => s && s.id).map((s: ProductStyleData, idx: number) => (
      <button
        key={s.id}
        onClick={() => s && handleStyleClick(s)}
        onDoubleClick={() => s?.id && handleDoubleClick(s.id, idx)}
        onMouseEnter={() => {
          console.log(`Hovering color button - Index: ${idx}, ID: ${s?.id}, Name: ${s?.name || 'Unknown'}`);
          if (s?.id) {
            handleStyleHover(s.id, idx);
          }
        }}
        className={`w-6 h-6 rounded-full border-2 transition-colors duration-150 ${
          style && style.id === s.id
            ? "border-gray-800 dark:border-gray-100 ring-2 ring-blue-500"
            : carouselMode && setHoveredStyleId && s.id === hoveredStyleId
            ? "border-gray-600 ring-1 ring-blue-300"
            : "border-transparent"
        }`}
        style={{ backgroundColor: s.htmlColor1 ? `#${s.htmlColor1}` : '#cccccc' }}
        aria-label={`${s?.name || 'Style'} (Index: ${idx})`}
        title={`${s?.name || 'Style'} - Click to select, double-click to preview in carousel`}
        type="button"
      />
    ))}
  </div>
}

interface StyleCarouselProps {
  product: ProductData | null;
  hoveredStyleId: number | null;
  style: ProductStyleData | null;
  onClose: () => void;
  setHoveredStyleId: (id: number | null) => void;
  setStyle: (s: ProductStyleData) => void;
  selectedLayer: LayerData | null;
  setLayerControlsStyle: (s: ProductStyleData | null) => void;
  setLastClickedCarouselStyle: (s: ProductStyleData | null) => void;
  layerClickFocusedStyleId: number | null;
  setLayerClickFocusedStyleId: (id: number | null) => void;
  sharedZoom: number;
  setSharedZoom: (v: number | ((prev: number) => number)) => void;
  sharedTop: number;
  setSharedTop: (v: number) => void;
  sharedLeft: number;
  setSharedLeft: (v: number) => void;
  designState: { name: string; isSaved: boolean; isAutoSaving: boolean; lastSavedAt: Date | null; hasUnsavedChanges: boolean };
  setDesignState: React.Dispatch<React.SetStateAction<{ name: string; isSaved: boolean; isAutoSaving: boolean; lastSavedAt: Date | null; hasUnsavedChanges: boolean }>>;
  designName: string;
  setDesignName: (v: string) => void;
}
const StyleCarousel = ({ product, hoveredStyleId, style, onClose, setHoveredStyleId, setStyle, selectedLayer, setLayerControlsStyle, setLastClickedCarouselStyle, layerClickFocusedStyleId, setLayerClickFocusedStyleId, sharedZoom, setSharedZoom, sharedTop, setSharedTop, sharedLeft, setSharedLeft, designState, setDesignState, designName, setDesignName }: StyleCarouselProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [carouselScale, setCarouselScale] = useState(0.75);
  const [previewDimensions, setPreviewDimensions] = useState({ width: 350, height: 466 });
  const [localHoveredStyleId, setLocalHoveredStyleId] = useState<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [selectedSide, setSelectedSide] = useState<string>('front');
  
  // Get all unique side names from all styles
  const availableSides = useMemo(() => {
    const sideNames = new Set<string>();
    product?.styles?.forEach(style => {
      style.sides?.forEach(side => {
        if (side.side) {
          sideNames.add(side.side);
        }
      });
    });
    return Array.from(sideNames).sort((a, b) => {
      // Prioritize common sides
      const priority = ['front', 'back', 'left', 'right'];
      const aIndex = priority.indexOf(a);
      const bIndex = priority.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [product]);
  
  // Set default side when component mounts
  useEffect(() => {
    if (availableSides.length > 0 && !availableSides.includes(selectedSide)) {
      startTransition(() => { setSelectedSide(availableSides[0]); });
    }
  }, [availableSides, selectedSide]);
  
  // Priority: when layer is selected use layer-click focus, otherwise use original hover behavior
  const effectiveFocusedStyleId = selectedLayer 
    ? (layerClickFocusedStyleId || localHoveredStyleId || hoveredStyleId || style?.id)
    : (localHoveredStyleId || hoveredStyleId || style?.id);
  
  const handleStyleSelect = (styleOption: ProductStyleData) => {
    setStyle(styleOption);
    setHoveredStyleId(null);
    setLocalHoveredStyleId(null);
    setLayerClickFocusedStyleId(null);
    onClose();
  };
  
  // Check scroll position and update arrow states
  const updateScrollButtons = () => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth);
    }
  };
  
  // Scroll left/right handlers
  const scrollLeft = () => {
    if (containerRef.current) {
      const scrollAmount = previewDimensions.width + 32; // width + gap
      containerRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      
      // Update focused item to previous item only if a layer is selected
      if (selectedLayer) {
        const currentIndex = product.styles.findIndex(s => s.id === effectiveFocusedStyleId);
        if (currentIndex > 0) {
          const previousStyle = product.styles[currentIndex - 1];
          setLayerClickFocusedStyleId(previousStyle.id);
        }
      }
    }
  };
  
  const scrollRight = () => {
    if (containerRef.current) {
      const scrollAmount = previewDimensions.width + 32; // width + gap
      containerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      
      // Update focused item to next item only if a layer is selected
      if (selectedLayer) {
        const currentIndex = product.styles.findIndex(s => s.id === effectiveFocusedStyleId);
        if (currentIndex < product.styles.length - 1) {
          const nextStyle = product.styles[currentIndex + 1];
          setLayerClickFocusedStyleId(nextStyle.id);
        }
      }
    }
  };
  
  // Update scroll buttons on mount and when container changes
  useEffect(() => {
    updateScrollButtons();
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', updateScrollButtons);
      return () => container.removeEventListener('scroll', updateScrollButtons);
    }
  }, [previewDimensions]);
  
  // Scroll focused style into view when hovering from ColorPicker
  useEffect(() => {
    if (effectiveFocusedStyleId && containerRef.current) {
      const focusedElement = containerRef.current.querySelector(`[data-style-id="${effectiveFocusedStyleId}"]`);
      if (focusedElement) {
        focusedElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest',
          inline: 'center' 
        });
      }
    }
  }, [effectiveFocusedStyleId]);
  
  return (
    <div className="w-full h-screen bg-black flex flex-col overflow-hidden">
      {/* Header with controls */}
      <div className="flex items-center justify-between p-4 bg-gray-900">
        {/* Left controls: Side selector dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-white text-sm font-medium">View Side:</label>
          <select
            value={selectedSide}
            onChange={(e) => setSelectedSide(e.target.value)}
            className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableSides.map(side => (
              <option key={side} value={side}>
                {side.charAt(0).toUpperCase() + side.slice(1)}
              </option>
            ))}
          </select>
        </div>
        
        {/* Center controls: Design Title and Zoom */}
        <div className="flex items-center gap-4">
          {/* Design Title Input */}
          <div className="flex items-center gap-2">
            <label className="text-white text-sm font-medium">Design:</label>
            <input
              type="text"
              value={designState.name || ''}
              onChange={(e) => {
                setDesignState(prev => ({ ...prev, name: e.target.value }));
                setDesignName(e.target.value);
              }}
              placeholder="Enter design name..."
              className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            />
          </div>
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium">Zoom:</span>
          <button
            onMouseDown={() => {
              const interval = setInterval(() => {
                setSharedZoom((prevZoom) => Math.max(0.1, prevZoom - 0.1));
              }, 100);
              const onMouseUp = () => {
                clearInterval(interval);
                window.removeEventListener("mouseup", onMouseUp);
              };
              window.addEventListener("mouseup", onMouseUp);
            }}
            className="bg-gray-800 hover:bg-gray-700 text-white rounded p-2 transition-colors duration-200"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <AiOutlineZoomOut size={16} />
          </button>
          <span className="text-white text-sm min-w-[4rem] text-center">
            {Math.round(sharedZoom * 100)}%
          </span>
          <button
            onMouseDown={() => {
              const interval = setInterval(() => {
                setSharedZoom((prevZoom) => Math.min(3, prevZoom + 0.1));
              }, 100);
              const onMouseUp = () => {
                clearInterval(interval);
                window.removeEventListener("mouseup", onMouseUp);
              };
              window.addEventListener("mouseup", onMouseUp);
            }}
            className="bg-gray-800 hover:bg-gray-700 text-white rounded p-2 transition-colors duration-200"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <AiOutlineZoomIn size={16} />
          </button>
          <button
            onClick={() => setSharedZoom(0.75)}
            className="bg-gray-800 hover:bg-gray-700 text-white rounded px-2 py-1 text-sm transition-colors duration-200"
            title="Reset Zoom"
            aria-label="Reset Zoom"
          >
            Reset
          </button>
          </div>
        </div>
        
        {/* Right controls: Close Button */}
        <button
          onClick={() => {
            onClose();
            // Note: The dismissed state will be reset when hovering over ColorPicker again
          }}
          className="text-white hover:text-gray-300 text-xl font-bold px-3 py-1 hover:bg-gray-800 rounded transition-colors"
          title="Close Carousel"
        >
          ×
        </button>
      </div>

      {/* Carousel Content */}
      <div className="flex-1 flex items-center justify-center p-8 relative overflow-hidden" style={{ maxHeight: selectedLayer ? 'calc(100vh - 180px)' : 'calc(100vh - 120px)' }}>
        {/* Left Arrow */}
        <button
          onClick={scrollLeft}
          disabled={!canScrollLeft}
          className={`absolute left-4 z-20 bg-gray-800 hover:bg-gray-700 text-white rounded-full p-3 shadow-lg transition-all duration-200 ${
            canScrollLeft ? 'opacity-100' : 'opacity-30 cursor-not-allowed'
          }`}
          title="Scroll left"
          aria-label="Scroll carousel left"
        >
          <BsChevronLeft size={24} />
        </button>

        {/* Right Arrow */}
        <button
          onClick={scrollRight}
          disabled={!canScrollRight}
          className={`absolute right-4 z-20 bg-gray-800 hover:bg-gray-700 text-white rounded-full p-3 shadow-lg transition-all duration-200 ${
            canScrollRight ? 'opacity-100' : 'opacity-30 cursor-not-allowed'
          }`}
          title="Scroll right"
          aria-label="Scroll carousel right"
        >
          <BsChevronRight size={24} />
        </button>

        <div 
          ref={containerRef}
          className="flex gap-8 overflow-x-auto overflow-y-hidden max-w-full style-carousel scroll-smooth"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none'
          }}
        >
          {product.styles.map((styleOption: ProductStyleData) => {
            const isFocused = styleOption.id === effectiveFocusedStyleId;
            
            // Find the side that matches the selected side name
            const matchingSide = styleOption.sides?.find(side => side.side === selectedSide) || styleOption.sides?.[0];
            
            return (
              <div 
                key={styleOption.id}
                data-style-id={styleOption.id}
                className={`flex-shrink-0 transition-all duration-300 cursor-pointer relative ${
                  isFocused 
                    ? 'opacity-100 ring-4 ring-blue-500' 
                    : 'opacity-60'
                }`}
                style={{ 
                  width: `${previewDimensions.width}px`, 
                  height: `${previewDimensions.height}px` 
                }}
                onMouseEnter={() => {
                  setLocalHoveredStyleId(styleOption.id);
                  setHoveredStyleId(styleOption.id);
                }}
                onMouseLeave={() => {
                  setLocalHoveredStyleId(null);
                  setHoveredStyleId(null);
                }}
              >
                {/* Expand Icon */}
                <div className="flex justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStyleSelect(styleOption);
                  }}
                  className=" top-2 left-2 z-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 shadow-lg transition-colors duration-200 flex items-center justify-center"
                  title="Select this style"
                  aria-label="Select this style"
                >
                  <BsArrowsFullscreen size={16} /> 
                </button>
                <div className="text-white text-center mt-2 font-medium">
                  {styleOption.name}
                </div>
                </div>
                <div className="w-full h-full bg-white rounded-lg overflow-hidden shadow-lg">
                  <CarouselItemMainView 
                    styleOption={styleOption} 
                    overRideSide={matchingSide} 
                    setLayerControlsStyle={setLayerControlsStyle}
                    setLastClickedCarouselStyle={setLastClickedCarouselStyle}
                    setLayerClickFocusedStyleId={setLayerClickFocusedStyleId}
                    sharedTop={sharedTop}
                    sharedLeft={sharedLeft}
                    setSharedTop={setSharedTop}
                    setSharedLeft={setSharedLeft}
                    sharedZoom={sharedZoom}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

