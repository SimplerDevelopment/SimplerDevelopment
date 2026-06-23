'use client';

import { createContext } from "react";

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
  layers: any[];
  styleOverrides: any;
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
  product: any;
  style: any;
  side: any;
  setStyle: (style: any) => void;
  setSide: (side: any) => void;
  setControlMode: (mode: string) => void;
  addLayer: (layer: any) => void;
  updateLayer: (layer: any) => void;
  removeLayer: (layer: any) => void;
  layers: any[];
  setLayers: (layers: any[]) => void;
  selectedLayer: any;
  setSelectedLayer: (layer: any) => void;
  /** IDs of layers currently multi-selected */
  selectedLayers: string[];
  /** Set of layer IDs for multi-selection */
  setSelectedLayers: (layers: string[]) => void;
  styleOverrides: any;
  setStyleOverrides: (overrides: any) => void;
  quantity: any;
  setQuantity: (quantity: any) => void;
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
  setStyle: (_: any) => {},
  setSide: (_: any) => {},
  setControlMode: (_: any) => {},
  addLayer: (_: any) => {},
  updateLayer: (_: any) => {},
  removeLayer: (_: any) => {},
  layers: [] as any[],
  setLayers: (_: any) => {},
  selectedLayer: null,
  setSelectedLayer: (_: any) => {},
  /** IDs of layers currently multi-selected */
  selectedLayers: [] as string[],
  /** Set of layer IDs for multi-selection */
  setSelectedLayers: (_: string[]) => {},
  styleOverrides: {} as any,
  setStyleOverrides: (_: any) => {},
  quantity: {} as any,
  setQuantity: (_: any) => {},
  showModal: false,
  setShowModal: (_: any) => {},
  carouselMode: false,
  // Design persistence fields
  currentDesignId: null,
  setCurrentDesignId: (_: number | null) => {},
  designState: {
    isSaved: false,
    isAutoSaving: false,
    lastSavedAt: null,
    hasUnsavedChanges: false,
    name: "Untitled Design",
  },
  setDesignState: (_: any) => {},
  designName: "Untitled Design",
  setDesignName: (_: string) => {},
  // Design management functions
  saveDesign: async (_?: string) => null,
  loadDesign: async (_: number) => false,
  createNewDesign: () => {},
  autoSave: async () => {},
});

export default EditorContext;
