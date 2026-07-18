// Session management utilities for anonymous users
export class SessionManager {
  private static readonly SESSION_KEY = 'design_session_id';
  private static readonly SESSION_PREFIX = 'anon_';

  /**
   * Get or create a session ID for anonymous users
   */
  static getOrCreateSessionId(): string {
    if (typeof window === 'undefined') {
      // Server-side: generate temporary session ID
      return this.generateSessionId();
    }

    let sessionId = localStorage.getItem(this.SESSION_KEY);
    
    if (!sessionId) {
      sessionId = this.generateSessionId();
      localStorage.setItem(this.SESSION_KEY, sessionId);
    }
    
    return sessionId;
  }

  /**
   * Generate a new session ID
   */
  private static generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${this.SESSION_PREFIX}${timestamp}_${random}`;
  }

  /**
   * Clear the current session ID
   */
  static clearSessionId(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.SESSION_KEY);
    }
  }

  /**
   * Get the current session ID without creating a new one
   */
  static getCurrentSessionId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.SESSION_KEY);
  }

  /**
   * Check if current session ID is valid format
   */
  static isValidSessionId(sessionId: string): boolean {
    return sessionId.startsWith(this.SESSION_PREFIX) && sessionId.length > 10;
  }

  /**
   * Transfer session to authenticated user (called after login/signup)
   */
  static async transferSessionToUser(userId: number): Promise<void> {
    const sessionId = this.getCurrentSessionId();
    
    if (!sessionId) return;

    try {
      // The API will handle the actual transfer
      // We just need to clear the local session after successful transfer
      this.clearSessionId();
    } catch (error) {
      console.error('Failed to transfer session:', error);
      // Don't clear session if transfer failed
    }
  }

  /**
   * Get session metadata for debugging
   */
  static getSessionInfo(): {
    sessionId: string | null;
    isValid: boolean;
    createdAt: Date | null;
  } {
    const sessionId = this.getCurrentSessionId();
    
    if (!sessionId) {
      return { sessionId: null, isValid: false, createdAt: null };
    }

    const isValid = this.isValidSessionId(sessionId);
    let createdAt: Date | null = null;

    if (isValid) {
      try {
        // Extract timestamp from session ID
        const timestampStr = sessionId.replace(this.SESSION_PREFIX, '').split('_')[0];
        const timestamp = parseInt(timestampStr);
        createdAt = new Date(timestamp);
      } catch (error) {
        // Invalid format
      }
    }

    return { sessionId, isValid, createdAt };
  }
}

// Export a hook for React components
export const useSessionManager = () => {
  return {
    getOrCreateSessionId: SessionManager.getOrCreateSessionId,
    getCurrentSessionId: SessionManager.getCurrentSessionId,
    clearSessionId: SessionManager.clearSessionId,
    isValidSessionId: SessionManager.isValidSessionId,
    getSessionInfo: SessionManager.getSessionInfo,
    transferSessionToUser: SessionManager.transferSessionToUser,
  };
};