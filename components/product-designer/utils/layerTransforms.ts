/**
 * Layer transformation utilities for scaling and manipulating design layers
 */

export interface LayerTransform {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
}

export interface LayerType {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  size: number;
  rotation: number;
  color: string;
  font: string;
  text: string;
  url: string;
  type: string;
  side: string;
  [key: string]: unknown;
}

/**
 * Scale a single layer by a given factor
 */
export const scaleLayer = (layer: LayerType, scale: number): LayerType => {
  if (scale === 1) return layer;
  
  return {
    ...layer,
    position: {
      x: layer.position.x * scale,
      y: layer.position.y * scale
    },
    width: layer.width * scale,
    height: layer.height * scale,
    size: layer.size * scale,
    // Preserve other properties unchanged
    rotation: layer.rotation,
    color: layer.color,
    font: layer.font,
    text: layer.text,
    url: layer.url,
    type: layer.type,
    side: layer.side,
    id: layer.id
  };
};

/**
 * Scale an array of layers by a given factor
 */
export const scaleLayers = (layers: LayerType[], scale: number): LayerType[] => {
  if (scale === 1) return layers;
  
  return layers.map(layer => scaleLayer(layer, scale));
};

/**
 * Calculate the bounding box of all layers
 */
export const getLayersBoundingBox = (layers: LayerType[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} => {
  if (layers.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  layers.forEach(layer => {
    const { x, y } = layer.position;
    const width = layer.width || 0;
    const height = layer.height || 0;
    
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};

/**
 * Fit layers to a container by calculating the optimal scale
 */
export const fitLayersToContainer = (
  layers: LayerType[], 
  containerSize: { width: number; height: number },
  padding: number = 20
): { scale: number; scaledLayers: LayerType[] } => {
  if (layers.length === 0) {
    return { scale: 1, scaledLayers: [] };
  }
  
  const bounds = getLayersBoundingBox(layers);
  
  if (bounds.width === 0 || bounds.height === 0) {
    return { scale: 1, scaledLayers: layers };
  }
  
  const availableWidth = containerSize.width - (padding * 2);
  const availableHeight = containerSize.height - (padding * 2);
  
  const scaleX = availableWidth / bounds.width;
  const scaleY = availableHeight / bounds.height;
  
  // Use the smaller scale to ensure everything fits
  const optimalScale = Math.min(scaleX, scaleY, 2); // Cap at 2x scale
  
  return {
    scale: optimalScale,
    scaledLayers: scaleLayers(layers, optimalScale)
  };
};

/**
 * Center layers within a container
 */
export const centerLayers = (
  layers: LayerType[],
  containerSize: { width: number; height: number }
): LayerType[] => {
  if (layers.length === 0) return layers;
  
  const bounds = getLayersBoundingBox(layers);
  
  const offsetX = (containerSize.width - bounds.width) / 2 - bounds.minX;
  const offsetY = (containerSize.height - bounds.height) / 2 - bounds.minY;
  
  return layers.map(layer => ({
    ...layer,
    position: {
      x: layer.position.x + offsetX,
      y: layer.position.y + offsetY
    }
  }));
};

/**
 * Apply multiple transformations to layers
 */
export const transformLayers = (
  layers: LayerType[],
  transform: LayerTransform
): LayerType[] => {
  const { scale = 1, offsetX = 0, offsetY = 0, rotation = 0 } = transform;
  
  return layers.map(layer => ({
    ...layer,
    position: {
      x: (layer.position.x * scale) + offsetX,
      y: (layer.position.y * scale) + offsetY
    },
    width: layer.width * scale,
    height: layer.height * scale,
    size: layer.size * scale,
    rotation: layer.rotation + rotation
  }));
};

/**
 * Calculate scale needed to fit content in container while maintaining aspect ratio
 */
export const calculateFitScale = (
  contentSize: { width: number; height: number },
  containerSize: { width: number; height: number },
  maxScale: number = 2
): number => {
  if (contentSize.width === 0 || contentSize.height === 0) return 1;
  
  const scaleX = containerSize.width / contentSize.width;
  const scaleY = containerSize.height / contentSize.height;
  
  return Math.min(scaleX, scaleY, maxScale);
};

/**
 * Get preset scale options
 */
export const getPresetScales = (): { name: string; scale: number }[] => [
  { name: 'Tiny', scale: 0.25 },
  { name: 'Small', scale: 0.5 },
  { name: 'Medium', scale: 0.75 },
  { name: 'Normal', scale: 1.0 },
  { name: 'Large', scale: 1.25 },
  { name: 'Extra Large', scale: 1.5 },
  { name: 'Maximum', scale: 2.0 }
];