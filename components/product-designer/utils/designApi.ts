// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
// Design API client for managing designs
import { SessionManager } from './sessionManager';

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
  deletedAt?: string;
}

export interface CreateDesignRequest {
  name?: string;
  description?: string;
  productId: string;
  styleId: number;
  side?: string;
  layers?: any[];
  styleOverrides?: any;
}

export interface UpdateDesignRequest {
  name?: string;
  description?: string;
  layers?: any[];
  styleOverrides?: any;
  side?: string;
  isPublic?: boolean;
  thumbnailUrl?: string;
}

export class DesignApi {
  // overridden by ProductDesigner via static init
  static baseUrl = '/api/designs';
  // sd2026 site/website id — used by helpers that build their own URLs
  // (claim-designs, generate-thumbnail) and don't go through baseUrl.
  static siteId: number = 0;

  static setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /**
   * Convenience: set base URL + siteId from the sd2026 site id.
   * Equivalent to setBaseUrl(`/api/storefront/${id}/designs`) plus
   * stashing the id for sibling helpers (claim, thumbnail).
   */
  static setSiteId(id: number) {
    this.siteId = id;
    this.baseUrl = `/api/storefront/${id}/designs`;
  }

  /**
   * Get query parameters for API calls (includes session ID for anonymous users)
   */
  private static getQueryParams(): URLSearchParams {
    const params = new URLSearchParams();
    const sessionId = SessionManager.getCurrentSessionId();
    
    if (sessionId) {
      params.set('sessionId', sessionId);
    }
    
    return params;
  }

  /**
   * Fetch user's designs
   */
  static async getDesigns(): Promise<Design[]> {
    const params = this.getQueryParams();
    const url = params.toString() ? `${this.baseUrl}?${params}` : this.baseUrl;
    
    const response = await fetch(url, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch designs: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get a specific design
   */
  static async getDesign(id: number, userId?: number): Promise<Design> {
    const params = this.getQueryParams();
    if (userId) {
      params.set('userId', userId.toString());
    }
    const url = params.toString() ? `${this.baseUrl}/${id}?${params}` : `${this.baseUrl}/${id}`;
    
    const response = await fetch(url, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch design: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new design
   */
  static async createDesign(data: CreateDesignRequest, userId?: number): Promise<Design> {
    const sessionId = SessionManager.getCurrentSessionId();
    
    // Prepare the payload with userId or sessionId
    const payload = {
      ...data,
      userId,
      sessionId: sessionId,
    };
    
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to create design: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Update an existing design
   */
  static async updateDesign(id: number, data: UpdateDesignRequest, userId?: number): Promise<Design> {
    const sessionId = SessionManager.getCurrentSessionId();
    
    // Include authorization data in the request body
    const payload = {
      ...data,
      userId,
      sessionId,
    };
    
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to update design: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a design
   */
  static async deleteDesign(id: number, userId?: number): Promise<void> {
    const sessionId = SessionManager.getCurrentSessionId();
    
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ userId, sessionId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to delete design: ${response.statusText}`);
    }
  }

  /**
   * Clone a design
   */
  static async cloneDesign(id: number, name: string): Promise<Design> {
    const params = this.getQueryParams();
    const url = params.toString() ? `${this.baseUrl}/${id}/clone?${params}` : `${this.baseUrl}/${id}/clone`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to clone design: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get count of anonymous designs for current session
   */
  static async getAnonymousDesignCount(): Promise<number> {
    const sessionId = SessionManager.getCurrentSessionId();
    
    if (!sessionId) return 0;

    const response = await fetch(`${this.baseUrl}/anonymous/count?sessionId=${sessionId}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to get design count: ${response.statusText}`);
    }

    const result = await response.json();
    return result.count;
  }

  /**
   * Claim (i.e. transfer ownership of) anonymous designs after the customer
   * signs up / signs in. Unlike a legacy endpoint, sd2026 does
   * NOT create the account here — sd2026 has its own signup flow. This just
   * re-points existing anonymous designs at the now-known customerId.
   *
   * Hits `/api/storefront/${siteId}/designs/claim` (see Wave 2I).
   */
  static async claimDesigns(payload: {
    sessionId: string;
    customerId: number;
  }): Promise<{ designsTransferred: number }> {
    if (!this.siteId) {
      throw new Error('DesignApi.claimDesigns requires DesignApi.setSiteId() first');
    }
    const response = await fetch(`/api/storefront/${this.siteId}/designs/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to claim designs: ${response.statusText}`);
    }

    const result = await response.json();

    // Clear session after successful claim
    SessionManager.clearSessionId();

    return result;
  }

  /**
   * Get public design by UUID
   */
  static async getPublicDesign(uuid: string): Promise<Design> {
    const response = await fetch(`${this.baseUrl}/public/${uuid}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch public design: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Generate shareable link for a design
   */
  static async shareDesign(id: number, isPublic = true): Promise<{
    design: Design;
    shareableUrl: string;
    uuid: string;
    isPublic: boolean;
  }> {
    const params = this.getQueryParams();
    const url = params.toString() ? `${this.baseUrl}/${id}/share?${params}` : `${this.baseUrl}/${id}/share`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ isPublic }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to share design: ${response.statusText}`);
    }

    return response.json();
  }
}

// Export utility functions for common operations
export const designUtils = {
  /**
   * Check if user should be prompted to create account
   */
  async shouldPromptSignup(): Promise<{ shouldPrompt: boolean; designCount: number }> {
    try {
      const count = await DesignApi.getAnonymousDesignCount();
      // Prompt after user has 2 or more designs
      return { shouldPrompt: count >= 2, designCount: count };
    } catch (error) {
      console.error('Failed to check design count:', error);
      return { shouldPrompt: false, designCount: 0 };
    }
  },

  /**
   * Auto-save design with debouncing
   */
  debounceAutoSave: (() => {
    let timeout: NodeJS.Timeout;
    return (designId: number, data: UpdateDesignRequest, delay = 2000) => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        try {
          await DesignApi.updateDesign(designId, data);
          console.log('Design auto-saved');
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }, delay);
    };
  })(),

  /**
   * Generate design thumbnail URL.
   * Builds an sd2026 storefront URL — DesignApi.setSiteId() must have been
   * called first. Falls back to legacy `/api/generate-image` only if no
   * siteId is wired (which means the editor was mounted without
   * ProductDesigner — should not happen in production).
   *
   * NOTE: the storefront generate-thumbnail endpoint is POST-only (it
   * accepts a data URL and uploads to S3). This helper still returns a GET
   * URL for legacy preview/<img> consumers — those callers should migrate
   * to POST. TODO(designer): remove once all callers POST.
   */
  generateThumbnailUrl(layers: any[], styleId: number): string {
    const base = DesignApi.siteId
      ? `/api/storefront/${DesignApi.siteId}/designs/generate-thumbnail`
      : '/api/generate-image';
    return `${base}?layers=${encodeURIComponent(JSON.stringify(layers))}&style=${styleId}&thumbnail=true`;
  },
};