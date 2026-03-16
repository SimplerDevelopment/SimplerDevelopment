// Builder.io specific types
export interface BuilderImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface BuilderBlock {
  '@type': string;
  component?: {
    name: string;
    options?: Record<string, any>;
  };
  children?: BuilderBlock[];
}

export interface BuilderPageData {
  title?: string;
  description?: string;
  blocks?: BuilderBlock[];
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: BuilderImage;
}

// Builder.io API response types
export interface BuilderResponse<T = any> {
  results: T[];
}
