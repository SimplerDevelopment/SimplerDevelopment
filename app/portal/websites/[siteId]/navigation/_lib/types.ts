// ─── Shared types & constants for the navigation editor ─────────────────────

export interface NavItem {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  sortOrder: number;
  openInNewTab: boolean;
  isButton: boolean;
  // Mega menu fields
  description?: string;
  icon?: string;
  featuredImage?: string;
  columnGroup?: number;
  // Draft overlay (server-managed). Null when row is in sync with live.
  // Mirrors lib/db/schema/sites.ts SiteNavigationDraft. The editor reads it
  // to render the draft / pendingDelete badges; client-side mutations only
  // touch the live fields above — the server merges them into draft on PUT.
  draft?: NavDraft | null;
}

export interface NavDraft {
  label?: string;
  href?: string;
  parentId?: number | null;
  sortOrder?: number;
  openInNewTab?: boolean;
  isButton?: boolean;
  description?: string | null;
  icon?: string | null;
  featuredImage?: string | null;
  columnGroup?: number | null;
  pendingCreate?: boolean;
  pendingDelete?: boolean;
  updatedAt?: string;
  updatedBy?: number;
}

export interface Branding {
  logoUrl: string;
  logoAlt: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  navTemplate: string;
  navPosition: string;
  navBackground: string;
  navTextColor: string;
}

export interface NavTemplate {
  id: string;
  label: string;
  description: string;
}

export const TEMPLATES: NavTemplate[] = [
  { id: 'classic', label: 'Classic', description: 'Logo left, links right' },
  { id: 'centered', label: 'Centered', description: 'Logo centered, links below' },
  { id: 'minimal', label: 'Minimal', description: 'Clean and simple' },
  { id: 'modern', label: 'Modern', description: 'Bold with accent line' },
  { id: 'transparent', label: 'Transparent', description: 'Overlay on hero' },
  { id: 'mega', label: 'Mega Menu', description: 'Full-width dropdowns' },
  { id: 'none', label: 'None', description: 'Hide the top navigation entirely' },
];

export const DEFAULT_BRANDING: Branding = {
  logoUrl: '',
  logoAlt: '',
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  navTemplate: 'classic',
  navPosition: 'top',
  navBackground: '#ffffff',
  navTextColor: '#111827',
};

export type Viewport = 'desktop' | 'tablet' | 'mobile';

export const VIEWPORT_WIDTHS: Record<Viewport, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};
