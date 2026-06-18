interface SimplerDevelopmentConfig {
    siteId: number;
    apiKey?: string;
    baseUrl?: string;
    fetch?: typeof globalThis.fetch;
}
interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}
interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
    };
}
interface PagePaginatedResponse<T> {
    success: boolean;
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
interface Post {
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
interface PostSummary {
    id: number;
    title: string;
    slug: string;
    postType: string;
    excerpt: string | null;
    coverImage: string | null;
    publishedAt: string | null;
}
interface ListPostsParams {
    limit?: number;
    offset?: number;
    postType?: string;
    category?: string;
    tag?: string;
    search?: string;
}
interface Category {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    color?: string | null;
}
interface Tag {
    id: number;
    name: string;
    slug: string;
}
interface NavItem {
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
interface Branding {
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
interface BrandingResponse {
    success: boolean;
    data: Branding;
    cssVars: string;
}
interface Product {
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
interface ProductDetail {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    price: string;
    compareAtPrice: string | null;
    sku: string | null;
    featured: boolean;
    images: {
        id: number;
        url: string;
        alt: string | null;
        order: number;
    }[];
    options: {
        id: number;
        name: string;
        values: {
            id: number;
            value: string;
        }[];
    }[];
    variants: {
        id: number;
        sku: string | null;
        price: string;
        active: boolean;
    }[];
    bulkPricing: {
        minQuantity: number;
        type: string;
        value: string;
    }[];
    category: {
        id: number;
        name: string;
        slug: string;
    } | null;
}
interface ListProductsParams {
    category?: string;
    search?: string;
    sort?: 'newest' | 'price_asc' | 'price_desc' | 'featured';
    page?: number;
    limit?: number;
}
interface ProductCategory {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    parentId: number | null;
    order: number;
    productCount: number;
}
interface MediaItem {
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
interface ListMediaParams {
    limit?: number;
    offset?: number;
    mimeType?: string;
}
interface SiteConfig {
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
interface BlockDefinition {
    type: string;
    name: string;
    category: string;
    inputs: string[];
}

interface FetchOptions {
    baseUrl: string;
    siteId: number;
    apiKey?: string;
    customFetch: typeof globalThis.fetch;
}

declare class ConfigResource {
    private opts;
    constructor(opts: FetchOptions);
    get(): Promise<SiteConfig>;
}

declare class BrandingResource {
    private opts;
    constructor(opts: FetchOptions);
    get(): Promise<{
        branding: Branding;
        cssVars: string;
    }>;
}

declare class NavigationResource {
    private opts;
    constructor(opts: FetchOptions);
    get(): Promise<NavItem[]>;
}

declare class PostsResource {
    private opts;
    constructor(opts: FetchOptions);
    list(params?: ListPostsParams): Promise<{
        data: PostSummary[];
        pagination: PaginatedResponse<PostSummary>['pagination'];
    }>;
    get(slug: string): Promise<Post>;
}

declare class PagesResource {
    private opts;
    constructor(opts: FetchOptions);
    list(params?: {
        limit?: number;
        offset?: number;
        search?: string;
    }): Promise<{
        data: PostSummary[];
        pagination: PaginatedResponse<PostSummary>['pagination'];
    }>;
}

declare class CategoriesResource {
    private opts;
    constructor(opts: FetchOptions);
    list(): Promise<Category[]>;
}

declare class TagsResource {
    private opts;
    constructor(opts: FetchOptions);
    list(): Promise<Tag[]>;
}

declare class MediaResource {
    private opts;
    constructor(opts: FetchOptions);
    list(params?: ListMediaParams): Promise<{
        data: MediaItem[];
        pagination: PaginatedResponse<MediaItem>['pagination'];
    }>;
}

declare class ProductsResource {
    private opts;
    constructor(opts: FetchOptions);
    list(params?: ListProductsParams): Promise<{
        data: Product[];
        pagination: PagePaginatedResponse<Product>['pagination'];
    }>;
    get(slug: string): Promise<ProductDetail>;
}

declare class ProductCategoriesResource {
    private opts;
    constructor(opts: FetchOptions);
    list(): Promise<ProductCategory[]>;
}

declare class BlocksResource {
    private opts;
    constructor(opts: FetchOptions);
    list(): Promise<BlockDefinition[]>;
}

declare class SimplerDevelopment {
    readonly config: ConfigResource;
    readonly branding: BrandingResource;
    readonly navigation: NavigationResource;
    readonly posts: PostsResource;
    readonly pages: PagesResource;
    readonly categories: CategoriesResource;
    readonly tags: TagsResource;
    readonly media: MediaResource;
    readonly products: ProductsResource;
    readonly productCategories: ProductCategoriesResource;
    readonly blocks: BlocksResource;
    constructor(options: SimplerDevelopmentConfig);
}

declare class SDKError extends Error {
    status: number;
    response?: unknown | undefined;
    constructor(message: string, status: number, response?: unknown | undefined);
}
declare class NotFoundError extends SDKError {
    constructor(resource: string);
}
declare class UnauthorizedError extends SDKError {
    constructor();
}
declare class RateLimitError extends SDKError {
    retryAfter: number;
    constructor(retryAfter: number);
}

export { type ApiResponse, type BlockDefinition, type Branding, type BrandingResponse, type Category, type ListMediaParams, type ListPostsParams, type ListProductsParams, type MediaItem, type NavItem, NotFoundError, type PagePaginatedResponse, type PaginatedResponse, type Post, type PostSummary, type Product, type ProductCategory, type ProductDetail, RateLimitError, SDKError, SimplerDevelopment, type SimplerDevelopmentConfig, type SiteConfig, type Tag, UnauthorizedError };
