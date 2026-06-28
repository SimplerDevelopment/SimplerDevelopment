'use client';

import { createContext } from "react";
import type React from "react";
import type { LayerData, ProductData, ProductSideData, ProductStyleData, StyleOverridesMap, QuantityMap } from "./designerTypes";

export interface DesignState {
  isSaved: boolean;
  isAutoSaving: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
  name: string;
}

export interface Design {
  id: number;
  uuid: string;
  name: string;
  description?: string;
  productId: string;
  styleId: number;
  side: string;
  layers: LayerData[];
  styleOverrides: StyleOverridesMap;
  thumbnailUrl?: string;
  isPublic: boolean;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  userId?: number;
  sessionId?: string;
}

export interface EditorContextType {
  /** sd2026 site/website id — scopes API URLs to /api/storefront/${websiteId}/... */
  websiteId: number;
  controlMode: string;
  product: ProductData | null;
  style: ProductStyleData | null;
  side: ProductSideData | null;
  setStyle: (style: ProductStyleData) => void;
  setSide: (side: ProductSideData) => void;
  setControlMode: (mode: string) => void;
  addLayer: (layer: LayerData) => void;
  updateLayer: (layer: LayerData) => void;
  removeLayer: (layer: LayerData) => void;
  layers: LayerData[];
  setLayers: (layers: LayerData[]) => void;
  selectedLayer: LayerData | null;
  setSelectedLayer: (layer: LayerData | null) => void;
  /** IDs of layers currently multi-selected */
  selectedLayers: string[];
  /** Set of layer IDs for multi-selection */
  setSelectedLayers: (layers: string[]) => void;
  styleOverrides: StyleOverridesMap;
  setStyleOverrides: (overrides: React.SetStateAction<StyleOverridesMap>) => void;
  quantity: QuantityMap;
  setQuantity: (quantity: QuantityMap) => void;
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  carouselMode: boolean;
  // Design persistence fields
  currentDesignId: number | null;
  setCurrentDesignId: (id: number | null) => void;
  designState: DesignState;
  setDesignState: (state: DesignState | ((prev: DesignState) => DesignState)) => void;
  designName: string;
  setDesignName: (name: string) => void;
  // Design management functions
  saveDesign: (name?: string) => Promise<Design | null>;
  loadDesign: (designId: number) => Promise<boolean>;
  createNewDesign: () => void;
  autoSave: () => Promise<void>;
}

export const EditorContext = createContext<EditorContextType>({
  websiteId: 0,
  controlMode: "welcome",
  product: null,
  style: null,
  side: null,
  setStyle: () => {},
  setSide: () => {},
  setControlMode: () => {},
  addLayer: () => {},
  updateLayer: () => {},
  removeLayer: () => {},
  layers: [],
  setLayers: () => {},
  selectedLayer: null,
  setSelectedLayer: () => {},
  /** IDs of layers currently multi-selected */
  selectedLayers: [],
  /** Set of layer IDs for multi-selection */
  setSelectedLayers: () => {},
  styleOverrides: {},
  setStyleOverrides: () => {},
  quantity: {},
  setQuantity: () => {},
  showModal: false,
  setShowModal: () => {},
  carouselMode: false,
  // Design persistence fields
  currentDesignId: null,
  setCurrentDesignId: () => {},
  designState: {
    isSaved: false,
    isAutoSaving: false,
    lastSavedAt: null,
    hasUnsavedChanges: false,
    name: "Untitled Design",
  },
  setDesignState: () => {},
  designName: "Untitled Design",
  setDesignName: () => {},
  // Design management functions
  saveDesign: async () => null,
  loadDesign: async () => false,
  createNewDesign: () => {},
  autoSave: async () => {},
});

export default EditorContext;
