// Base Builder.io content wrapper
export interface BuilderContent<T = any> {
  id: string;
  name?: string;
  data?: T;
  published?: 'published' | 'draft' | 'archived';
  createdDate?: number;
  lastUpdatedDate?: number;
}

// Solution content model
export interface SolutionData {
  title: string;
  slug: string;
  description?: string;
  image?: string;
  content: string;
  benefits?: string[];
  featured?: boolean;
  order?: number;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  publishedDate?: string;
}

export type Solution = BuilderContent<SolutionData>;

// Blog post content model
export interface Tag {
  tag: string;
}

export interface BlogPostData {
  title: string;
  slug: string;
  excerpt?: string;
  author?: string;
  authorImage?: string;
  coverImage: string;
  content: string;
  category?: string;
  tags?: Tag[];
  readTime?: number;
  featured?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  publishedAt: string;
}

export type BlogPost = BuilderContent<BlogPostData>;

// Contact form data
export interface ContactFormData {
  name: string;
  email: string;
  message: string;
  subject?: string;
}

export interface ContactInquiry extends ContactFormData {
  timestamp: string;
  userAgent?: string;
  ipAddress?: string;
}
