// ---- Config ----

export interface SimplerDevelopmentConfig {
  siteId: number;
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

// ---- API Response Envelope ----

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface PagePaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---- Posts & Pages ----

export interface Post {
  id: number;
  title: string;
  slug: string;
  postType: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  published: boolean;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: string | null;
  categories: Category[];
  tags: Tag[];
}

export interface PostSummary {
  id: number;
  title: string;
  slug: string;
  postType: string;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: string | null;
}

export interface ListPostsParams {
  limit?: number;
  offset?: number;
  postType?: string;
  category?: string;
  tag?: string;
  search?: string;
}

// ---- Categories & Tags ----

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

// ---- Navigation ----

export interface NavItem {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  sortOrder: number;
  openInNewTab: boolean;
  isButton: boolean;
  description: string | null;
  icon: string | null;
  featuredImage: string | null;
  columnGroup: number | null;
  children: NavItem[];
}

// ---- Branding ----

export interface Branding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  logoUrl: string | null;
  logoSquareUrl: string | null;
  logoRectUrl: string | null;
  logoIconUrl: string | null;
  logoText: string | null;
  logoAlt: string | null;
  headingFont: string;
  bodyFont: string;
  navTemplate: string;
  navPosition: string;
  navBackground: string | null;
  navTextColor: string | null;
  borderRadius: string;
  linkColor: string | null;
  linkHoverColor: string | null;
  buttonStyle: Record<string, string> | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  darkMode: Record<string, unknown> | null;
  typography: Record<string, unknown> | null;
}

export interface BrandingResponse {
  success: boolean;
  data: Branding;
  cssVars: string;
}

// ---- Products ----

export interface Product {
  id: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  price: string;
  compareAtPrice: string | null;
  featured: boolean;
  categoryId: number | null;
  image: string | null;
  categoryName: string | null;
  createdAt: string;
}

export interface ProductDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  featured: boolean;
  images: { id: number; url: string; alt: string | null; order: number }[];
  options: { id: number; name: string; values: { id: number; value: string }[] }[];
  variants: { id: number; sku: string | null; price: string; active: boolean }[];
  bulkPricing: { minQuantity: number; type: string; value: string }[];
  category: { id: number; name: string; slug: string } | null;
}

export interface ListProductsParams {
  category?: string;
  search?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'featured';
  page?: number;
  limit?: number;
}

// ---- Product Categories ----

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: number | null;
  order: number;
  productCount: number;
}

// ---- Media ----

export interface MediaItem {
  id: number;
  filename: string;
  mimeType: string;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
}

export interface ListMediaParams {
  limit?: number;
  offset?: number;
  mimeType?: string;
}

// ---- Site Config ----

export interface SiteConfig {
  id: number;
  name: string;
  domain: string | null;
  subdomain: string | null;
  description: string | null;
  customLayout: boolean;
  branding: Branding;
  cssVars: string;
  navigation: NavItem[];
  storeEnabled: boolean;
}

// ---- Blocks ----

export interface BlockDefinition {
  type: string;
  name: string;
  category: string;
  inputs: string[];
}
