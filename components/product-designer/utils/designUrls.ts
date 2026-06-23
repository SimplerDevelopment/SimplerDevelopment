// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
/**
 * Utility functions for generating design URLs
 */

export interface DesignUrlParams {
  catalogProductId: string;
  designId: number;
}

/**
 * Generate a URL for accessing a specific design
 */
export function generateDesignUrl(params: DesignUrlParams): string {
  const { catalogProductId, designId } = params;
  return `/account/catalog/${catalogProductId}/design/${designId}`;
}

/**
 * Parse design URL parameters from the current URL
 */
export function parseDesignUrl(pathname: string): DesignUrlParams | null {
  // Match pattern: /account/catalog/[catalogProductId]/design/[designId]
  const match = pathname.match(/\/account\/catalog\/([^\/]+)\/design\/(\d+)/);
  
  if (!match) return null;
  
  const [, catalogProductId, designIdStr] = match;
  const designId = parseInt(designIdStr, 10);
  
  if (isNaN(designId)) return null;
  
  return {
    catalogProductId,
    designId,
  };
}

/**
 * Check if the current URL is a design URL
 */
export function isDesignUrl(pathname: string): boolean {
  return parseDesignUrl(pathname) !== null;
}

/**
 * Generate a shareable design URL with optional query parameters
 */
export function generateShareableDesignUrl(
  params: DesignUrlParams,
  options?: {
    baseUrl?: string;
    utm?: {
      source?: string;
      medium?: string;
      campaign?: string;
    };
  }
): string {
  const baseUrl = options?.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const designPath = generateDesignUrl(params);
  
  const url = new URL(designPath, baseUrl);
  
  // Add UTM parameters if provided
  if (options?.utm) {
    const { source, medium, campaign } = options.utm;
    if (source) url.searchParams.set('utm_source', source);
    if (medium) url.searchParams.set('utm_medium', medium);
    if (campaign) url.searchParams.set('utm_campaign', campaign);
  }
  
  return url.toString();
}

/**
 * Copy design URL to clipboard
 */
export async function copyDesignUrlToClipboard(
  params: DesignUrlParams,
  options?: {
    utm?: {
      source?: string;
      medium?: string;
      campaign?: string;
    };
  }
): Promise<boolean> {
  try {
    const url = generateShareableDesignUrl(params, options);
    await navigator.clipboard.writeText(url);
    return true;
  } catch (error) {
    console.error('Failed to copy design URL:', error);
    return false;
  }
}

/**
 * Navigate to a design URL
 */
export function navigateToDesign(
  params: DesignUrlParams,
  router: any, // Next.js router
  options?: {
    replace?: boolean;
    shallow?: boolean;
  }
): Promise<boolean> {
  const url = generateDesignUrl(params);
  
  if (options?.replace) {
    return router.replace(url, undefined, { shallow: options.shallow });
  } else {
    return router.push(url, undefined, { shallow: options.shallow });
  }
}

/**
 * Extract design info from saved design for URL generation
 */
export function getDesignUrlFromSavedDesign(design: any): string | null {
  if (!design.id || !design.productId) {
    return null;
  }
  
  return generateDesignUrl({
    catalogProductId: design.productId.toString(),
    designId: design.id,
  });
}