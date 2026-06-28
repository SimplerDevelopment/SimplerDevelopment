import type React from "react";

export interface LayerPosition {
  x: number;
  y: number;
}

export interface LayerData {
  id: string | number;
  type: string;
  side?: string;
  position?: LayerPosition;
  rotation?: number;
  width?: number;
  height?: number;
  size?: number;
  color?: string;
  font?: string;
  text?: string;
  name?: string;
  url?: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>> | null;
  iconPack?: string;
  iconName?: string;
  selected?: boolean;
  [key: string]: unknown;
}

export interface ProductSideData {
  id: string | number;
  side: string;
  thumbnail?: string;
  imageFilePath?: string;
  [key: string]: unknown;
}

export interface ProductSizeData {
  id: number;
  name: string;
  price?: number;
  active?: boolean;
  [key: string]: unknown;
}

export interface ProductStyleData {
  id: number;
  name: string;
  htmlColor1?: string;
  htmlColor2?: string;
  sides?: ProductSideData[];
  sizes?: ProductSizeData[];
  [key: string]: unknown;
}

export interface ProductData {
  id: number;
  name: string;
  styles?: ProductStyleData[];
  [key: string]: unknown;
}

export type StyleOverridesMap = Record<
  string | number,
  Record<string | number, { color?: string; colors?: Record<string, string>; [key: string]: unknown }>
>;

export type QuantityMap = Record<string, number | string>;
