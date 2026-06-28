# Data Model: SimplerDevelopment.com

**Feature**: SimplerDevelopment.com Agency Website
**Date**: 2026-01-13
**Status**: Draft

## Overview

This document defines the data structures for all content types managed through Builder.io CMS. Since Builder.io is a headless CMS, these models represent the content schema rather than database tables.

---

## Content Models

### 1. Solution (Data Model)

Represents an agency service offering.

**Builder.io Model Configuration**:
- **Model Name**: `solution`
- **Model Type**: Data Model
- **URL Path Pattern**: `/solutions/[slug]`

**Fields**:

| Field Name | Type | Required | Description | Validation |
|------------|------|----------|-------------|------------|
| `title` | string | Yes | Solution/service name | Max 100 characters |
| `slug` | string | Yes | URL-friendly identifier | Lowercase, hyphenated, unique |
| `description` | longText | No | Brief description (preview text) | Max 300 characters |
| `image` | file | No | Featured image | JPEG, PNG, WebP only |
| `content` | richText | Yes | Full solution description with formatting | HTML content |
| `benefits` | list | No | Key benefits (bullet points) | Array of strings |
| `featured` | boolean | No | Display on homepage | Default: false |
| `order` | number | No | Display order in solutions index | Integer, default: 0 |
| `metaTitle` | string | No | SEO title tag | Max 60 characters |
| `metaDescription` | string | No | SEO meta description | Max 160 characters |
| `ogImage` | file | No | Open Graph share image | 1200x630px recommended |
| `publishedDate` | date | No | Publication date | ISO 8601 format |

**Relationships**:
- None (standalone content type)

**State Transitions**:
- Draft → Published → Archived
- Managed through Builder.io publishing workflow

**Validation Rules**:
- `slug` must be unique across all solutions
- `slug` must match pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- If `metaTitle` is empty, use `title` as fallback
- If `metaDescription` is empty, use first 160 chars of `description`

**Usage Example**:
```typescript
interface SolutionData {
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
```

---

### 2. Blog Post (Data Model)

Represents a thought leadership article or blog post.

**Builder.io Model Configuration**:
- **Model Name**: `blog-post`
- **Model Type**: Data Model
- **URL Path Pattern**: `/blog/[slug]`

**Fields**:

| Field Name | Type | Required | Description | Validation |
|------------|------|----------|-------------|------------|
| `title` | string | Yes | Article title | Max 100 characters |
| `slug` | string | Yes | URL-friendly identifier | Lowercase, hyphenated, unique |
| `excerpt` | longText | No | Short summary for previews | Max 300 characters |
| `author` | string | No | Author name | Max 50 characters |
| `authorImage` | file | No | Author photo | Square, min 200x200px |
| `coverImage` | file | Yes | Featured article image | Min 1200x630px |
| `content` | richText | Yes | Full article content | HTML content |
| `category` | string | No | Primary category | Predefined list |
| `tags` | list | No | Topic tags | Array of tag objects |
| `readTime` | number | No | Estimated reading time (minutes) | Auto-calculated or manual |
| `featured` | boolean | No | Display on homepage | Default: false |
| `metaTitle` | string | No | SEO title tag | Max 60 characters |
| `metaDescription` | string | No | SEO meta description | Max 160 characters |
| `ogImage` | file | No | Open Graph share image | 1200x630px, defaults to coverImage |
| `publishedAt` | date | Yes | Publication date/time | ISO 8601 format |

**Relationships**:
- Tags: Many-to-many (via tags list)
- Author: Reference to future Author model (currently string)
- Related posts: Can be added via custom field

**State Transitions**:
- Draft → Scheduled → Published → Archived
- `publishedAt` determines when post becomes visible

**Validation Rules**:
- `slug` must be unique across all blog posts
- `slug` must match pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- `publishedAt` must be in the past for published posts
- If `metaTitle` is empty, use `title` as fallback
- If `metaDescription` is empty, use `excerpt` or first 160 chars of content
- If `ogImage` is empty, use `coverImage` as fallback

**Tag Structure**:
```typescript
interface Tag {
  tag: string; // Tag name, e.g., "Design", "Automation", "Three.js"
}
```

**Usage Example**:
```typescript
interface BlogPostData {
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
```

---

### 3. Page (Page Model)

Represents visually editable pages like About.

**Builder.io Model Configuration**:
- **Model Name**: `page` (using default Builder.io page model)
- **Model Type**: Page Model
- **URL Path Pattern**: `/[path]`

**Default Fields**:
- Visual editor content blocks
- SEO metadata (title, description)
- Custom CSS/JavaScript
- Targeting rules
- A/B testing variants

**Custom Fields to Add**:

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `metaTitle` | string | No | SEO title (if different from page title) |
| `metaDescription` | string | No | SEO meta description |
| `ogImage` | file | No | Open Graph share image |

**Usage**:
- About page: `/about`
- Future custom pages as needed

**Validation Rules**:
- Page must have at least one content block
- URL path must be unique

---

### 4. Contact Inquiry (API Model)

Represents a contact form submission. Not stored in Builder.io - this is the API contract.

**Storage**: Email via Resend + optional database/CRM

**Fields**:

| Field Name | Type | Required | Description | Validation |
|------------|------|----------|-------------|------------|
| `name` | string | Yes | Sender's full name | Max 100 characters, min 2 |
| `email` | string | Yes | Sender's email address | Valid email format |
| `message` | string | Yes | Message content | Max 5000 characters, min 10 |
| `subject` | string | No | Message subject | Max 200 characters |
| `timestamp` | datetime | Auto | Submission time | ISO 8601, server-generated |
| `userAgent` | string | Auto | Browser user agent | For spam detection |
| `ipAddress` | string | Auto | Sender IP (hashed) | For rate limiting |

**Validation Rules** (Zod Schema):
```typescript
import { z } from 'zod';

export const contactFormSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  email: z.string()
    .email('Please enter a valid email address'),
  message: z.string()
    .min(10, 'Message must be at least 10 characters')
    .max(5000, 'Message must be less than 5000 characters'),
  subject: z.string()
    .max(200, 'Subject must be less than 200 characters')
    .optional(),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;
```

**Processing Flow**:
1. Client submits form via Server Action
2. Server validates with Zod schema
3. Rate limiting check (max 5 submissions per hour per IP)
4. Send email via Resend
5. Optional: Store in database or send to CRM
6. Return success/error response

---

## Common Patterns

### SEO Metadata Pattern

All content models follow this SEO metadata pattern:

```typescript
interface SEOMetadata {
  metaTitle?: string;      // Falls back to title
  metaDescription?: string; // Falls back to description/excerpt
  ogImage?: string;         // Falls back to image/coverImage
}
```

**Implementation in Next.js**:
```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const content = await fetchContent(params.slug);

  return {
    title: content.data?.metaTitle || content.data?.title,
    description: content.data?.metaDescription || content.data?.description,
    openGraph: {
      title: content.data?.metaTitle || content.data?.title,
      description: content.data?.metaDescription || content.data?.description,
      images: content.data?.ogImage || content.data?.image ? [content.data.ogImage || content.data.image] : [],
    },
  };
}
```

### Slug Generation Pattern

All sluggable content follows these rules:

```typescript
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-');      // Remove duplicate hyphens
}
```

**Builder.io Configuration**:
- Enable "Auto-generate" on slug field
- Set slug as required and unique
- Validate against regex: `^[a-z0-9]+(?:-[a-z0-9]+)*$`

### Image Optimization Pattern

All images from Builder.io are served via their CDN:

```typescript
// Builder.io image URL structure
const imageUrl = `https://cdn.builder.io/api/v1/image/assets/[PUBLIC_API_KEY]/[IMAGE_ID]`;

// With Next.js Image component
import Image from 'next/image';

<Image
  src={content.data?.image}
  alt={content.data?.title}
  width={1200}
  height={630}
  className="rounded-lg"
  priority={featured} // for above-fold images
/>
```

### Content Fetching Pattern

All Builder.io content follows this fetching pattern:

```typescript
import { fetchOneEntry, fetchEntries } from '@builder.io/sdk-react-nextjs';

// Single entry (detail page)
async function getContent(model: string, slug: string) {
  return await fetchOneEntry({
    model,
    apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
    userAttributes: {
      urlPath: `/${model}/${slug}`,
    },
  });
}

// Multiple entries (list page)
async function getContentList(model: string) {
  return await fetchEntries({
    model,
    apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
    options: {
      sort: {
        'data.publishedAt': -1, // Newest first
      },
    },
  });
}
```

---

## Builder.io Setup Checklist

### 1. Create Models in Builder.io Dashboard

- [ ] Create "solution" Data Model
- [ ] Add all solution fields with correct types
- [ ] Set slug field as required and unique
- [ ] Configure preview URL: `http://localhost:3000/solutions/[slug]`

- [ ] Create "blog-post" Data Model
- [ ] Add all blog post fields with correct types
- [ ] Set slug field as required and unique
- [ ] Configure preview URL: `http://localhost:3000/blog/[slug]`

- [ ] Configure default "page" model for About
- [ ] Add custom SEO fields to page model
- [ ] Configure preview URL: `http://localhost:3000/[path]`

### 2. Configure Field Validations

For each model:
- [ ] Set required fields
- [ ] Add max length constraints
- [ ] Enable unique constraint on slug
- [ ] Add regex validation for slug: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- [ ] Set default values where appropriate

### 3. Set Up Webhooks (Optional)

- [ ] Configure webhook for content.publish event
- [ ] Point to Next.js revalidate API route
- [ ] Enable on-demand ISR when content is published

---

## TypeScript Type Definitions

**File**: `lib/types/content.ts`

```typescript
// Base Builder.io content wrapper
export interface BuilderContent<T = any> {
  id: string;
  name?: string;
  data?: T;
  published?: 'published' | 'draft' | 'archived';
  createdDate?: number;
  lastUpdatedDate?: number;
}

// Solution content
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

// Blog post content
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

// Contact form
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
```

---

## Data Access Layer

**File**: `lib/builder/api.ts`

```typescript
import { fetchOneEntry, fetchEntries } from '@builder.io/sdk-react-nextjs';
import type { Solution, BlogPost } from '@/lib/types/content';

const BUILDER_API_KEY = process.env.NEXT_PUBLIC_BUILDER_API_KEY!;

// Solutions
export async function getSolution(slug: string): Promise<Solution | null> {
  return await fetchOneEntry({
    model: 'solution',
    apiKey: BUILDER_API_KEY,
    userAttributes: { urlPath: `/solutions/${slug}` },
  });
}

export async function getAllSolutions(): Promise<Solution[]> {
  const result = await fetchEntries({
    model: 'solution',
    apiKey: BUILDER_API_KEY,
    options: {
      sort: { 'data.order': 1 },
    },
  });
  return result;
}

export async function getFeaturedSolutions(): Promise<Solution[]> {
  const result = await fetchEntries({
    model: 'solution',
    apiKey: BUILDER_API_KEY,
    options: {
      query: { 'data.featured': true },
      sort: { 'data.order': 1 },
    },
  });
  return result;
}

// Blog posts
export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  return await fetchOneEntry({
    model: 'blog-post',
    apiKey: BUILDER_API_KEY,
    userAttributes: { urlPath: `/blog/${slug}` },
  });
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const result = await fetchEntries({
    model: 'blog-post',
    apiKey: BUILDER_API_KEY,
    options: {
      sort: { 'data.publishedAt': -1 },
    },
  });
  return result;
}

export async function getFeaturedBlogPosts(limit: number = 3): Promise<BlogPost[]> {
  const result = await fetchEntries({
    model: 'blog-post',
    apiKey: BUILDER_API_KEY,
    options: {
      query: { 'data.featured': true },
      sort: { 'data.publishedAt': -1 },
      limit,
    },
  });
  return result;
}
```

---

## Summary

This data model defines:
- **3 Builder.io content models**: Solution, Blog Post, Page
- **1 API model**: Contact Inquiry
- Type-safe TypeScript interfaces for all models
- Validation rules and constraints
- Data access layer with helper functions
- SEO metadata patterns
- Image optimization patterns

All models are designed to work seamlessly with Next.js 16 App Router, Builder.io's visual editor, and the project's SEO requirements.
