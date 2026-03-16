# API Contracts: Builder.io CMS Integration

**Feature**: SimplerDevelopment.com Agency Website
**Date**: 2026-01-13
**Version**: 1.0

## Overview

This document defines the API contracts for Builder.io CMS integration, including content schemas, API endpoints, and response formats for all content models.

---

## Base Configuration

### Environment Variables

```bash
NEXT_PUBLIC_BUILDER_API_KEY=your_public_api_key_here
```

### Base URLs

- **Content API**: `https://cdn.builder.io/api/v3/content/`
- **Image API**: `https://cdn.builder.io/api/v1/image/`
- **Dashboard**: `https://builder.io/`

---

## Content Models

### 1. Solution Model

**Model ID**: `solution`
**Model Type**: Data Model

#### Create Model (Builder.io Dashboard)

```json
{
  "name": "solution",
  "kind": "data",
  "fields": [
    {
      "name": "title",
      "type": "string",
      "required": true,
      "helperText": "Service/solution name (max 100 characters)"
    },
    {
      "name": "slug",
      "type": "string",
      "required": true,
      "helperText": "URL-friendly identifier (auto-generated from title)",
      "regex": "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    },
    {
      "name": "description",
      "type": "longText",
      "helperText": "Brief description for preview cards (max 300 characters)"
    },
    {
      "name": "image",
      "type": "file",
      "allowedFileTypes": ["jpeg", "png", "webp"],
      "helperText": "Featured image for solution"
    },
    {
      "name": "content",
      "type": "richText",
      "required": true,
      "helperText": "Full solution description with rich formatting"
    },
    {
      "name": "benefits",
      "type": "list",
      "subFields": [
        {
          "name": "benefit",
          "type": "string"
        }
      ],
      "helperText": "Key benefits (bullet points)"
    },
    {
      "name": "featured",
      "type": "boolean",
      "defaultValue": false,
      "helperText": "Display on homepage featured section"
    },
    {
      "name": "order",
      "type": "number",
      "defaultValue": 0,
      "helperText": "Display order (lower numbers first)"
    },
    {
      "name": "metaTitle",
      "type": "string",
      "helperText": "SEO title tag (max 60 characters, falls back to title)"
    },
    {
      "name": "metaDescription",
      "type": "string",
      "helperText": "SEO meta description (max 160 characters)"
    },
    {
      "name": "ogImage",
      "type": "file",
      "allowedFileTypes": ["jpeg", "png", "webp"],
      "helperText": "Open Graph image (1200x630px recommended)"
    },
    {
      "name": "publishedDate",
      "type": "date",
      "helperText": "Publication date"
    }
  ]
}
```

#### Fetch Single Solution

**Endpoint**: `GET /api/v3/content/solution`

**Parameters**:
```typescript
{
  apiKey: string;
  query: {
    'data.slug': string;
  }
}
```

**Example Request**:
```typescript
const solution = await fetchOneEntry({
  model: 'solution',
  apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
  userAttributes: {
    urlPath: `/solutions/${slug}`,
  },
});
```

**Response Format**:
```json
{
  "id": "abc123",
  "name": "Design Automation",
  "data": {
    "title": "Design Automation",
    "slug": "design-automation",
    "description": "Streamline your design workflow with automated processes",
    "image": "https://cdn.builder.io/api/v1/image/assets/.../xyz789",
    "content": "<p>Full rich text content...</p>",
    "benefits": [
      { "benefit": "Save 40% time on repetitive tasks" },
      { "benefit": "Reduce design errors" },
      { "benefit": "Scale faster" }
    ],
    "featured": true,
    "order": 1,
    "metaTitle": "Design Automation Services | SimplerDevelopment",
    "metaDescription": "Automate your design workflow with our expert services",
    "ogImage": "https://cdn.builder.io/api/v1/image/assets/.../og123",
    "publishedDate": "2026-01-13T00:00:00.000Z"
  },
  "published": "published",
  "createdDate": 1736726400000,
  "lastUpdatedDate": 1736726400000
}
```

#### Fetch All Solutions

**Endpoint**: `GET /api/v3/content/solution`

**Parameters**:
```typescript
{
  apiKey: string;
  limit?: number;
  offset?: number;
  sort?: {
    'data.order': 1 | -1;
  };
  query?: {
    'data.featured'?: boolean;
  };
}
```

**Example Request**:
```typescript
const solutions = await fetchEntries({
  model: 'solution',
  apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
  options: {
    sort: { 'data.order': 1 },
    query: { 'data.featured': true },
  },
});
```

**Response Format**:
```json
{
  "results": [
    {
      "id": "abc123",
      "data": { /* Solution data */ }
    },
    {
      "id": "def456",
      "data": { /* Solution data */ }
    }
  ]
}
```

---

### 2. Blog Post Model

**Model ID**: `blog-post`
**Model Type**: Data Model

#### Create Model (Builder.io Dashboard)

```json
{
  "name": "blog-post",
  "kind": "data",
  "fields": [
    {
      "name": "title",
      "type": "string",
      "required": true,
      "helperText": "Article title (max 100 characters)"
    },
    {
      "name": "slug",
      "type": "string",
      "required": true,
      "helperText": "URL-friendly identifier",
      "regex": "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    },
    {
      "name": "excerpt",
      "type": "longText",
      "helperText": "Short summary for previews (max 300 characters)"
    },
    {
      "name": "author",
      "type": "string",
      "helperText": "Author name (max 50 characters)"
    },
    {
      "name": "authorImage",
      "type": "file",
      "allowedFileTypes": ["jpeg", "png", "webp"],
      "helperText": "Author photo (square, min 200x200px)"
    },
    {
      "name": "coverImage",
      "type": "file",
      "required": true,
      "allowedFileTypes": ["jpeg", "png", "webp"],
      "helperText": "Featured article image (min 1200x630px)"
    },
    {
      "name": "content",
      "type": "richText",
      "required": true,
      "helperText": "Full article content"
    },
    {
      "name": "category",
      "type": "string",
      "enum": ["Design", "Development", "Automation", "Case Study", "Tutorial"],
      "helperText": "Primary category"
    },
    {
      "name": "tags",
      "type": "list",
      "subFields": [
        {
          "name": "tag",
          "type": "string"
        }
      ],
      "helperText": "Topic tags"
    },
    {
      "name": "readTime",
      "type": "number",
      "helperText": "Estimated reading time in minutes"
    },
    {
      "name": "featured",
      "type": "boolean",
      "defaultValue": false,
      "helperText": "Display on homepage"
    },
    {
      "name": "metaTitle",
      "type": "string",
      "helperText": "SEO title tag (max 60 characters)"
    },
    {
      "name": "metaDescription",
      "type": "string",
      "helperText": "SEO meta description (max 160 characters)"
    },
    {
      "name": "ogImage",
      "type": "file",
      "allowedFileTypes": ["jpeg", "png", "webp"],
      "helperText": "Open Graph image (defaults to coverImage)"
    },
    {
      "name": "publishedAt",
      "type": "date",
      "required": true,
      "helperText": "Publication date and time"
    }
  ]
}
```

#### Fetch Single Blog Post

**Endpoint**: `GET /api/v3/content/blog-post`

**Parameters**:
```typescript
{
  apiKey: string;
  query: {
    'data.slug': string;
  }
}
```

**Example Request**:
```typescript
const post = await fetchOneEntry({
  model: 'blog-post',
  apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
  userAttributes: {
    urlPath: `/blog/${slug}`,
  },
});
```

**Response Format**:
```json
{
  "id": "blog123",
  "name": "Getting Started with Three.js",
  "data": {
    "title": "Getting Started with Three.js in Next.js",
    "slug": "getting-started-threejs-nextjs",
    "excerpt": "Learn how to integrate Three.js into your Next.js applications",
    "author": "Jane Doe",
    "authorImage": "https://cdn.builder.io/api/v1/image/assets/.../author123",
    "coverImage": "https://cdn.builder.io/api/v1/image/assets/.../cover123",
    "content": "<p>Full article content...</p>",
    "category": "Tutorial",
    "tags": [
      { "tag": "Three.js" },
      { "tag": "Next.js" },
      { "tag": "WebGL" }
    ],
    "readTime": 8,
    "featured": true,
    "metaTitle": "Getting Started with Three.js in Next.js | Blog",
    "metaDescription": "Step-by-step guide to integrating Three.js in Next.js apps",
    "ogImage": "https://cdn.builder.io/api/v1/image/assets/.../og123",
    "publishedAt": "2026-01-13T10:00:00.000Z"
  },
  "published": "published"
}
```

#### Fetch All Blog Posts

**Endpoint**: `GET /api/v3/content/blog-post`

**Parameters**:
```typescript
{
  apiKey: string;
  limit?: number;
  offset?: number;
  sort?: {
    'data.publishedAt': 1 | -1;
  };
  query?: {
    'data.featured'?: boolean;
    'data.category'?: string;
  };
}
```

**Example Request**:
```typescript
const posts = await fetchEntries({
  model: 'blog-post',
  apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
  options: {
    sort: { 'data.publishedAt': -1 }, // Newest first
    limit: 10,
  },
});
```

---

### 3. Page Model (About Page)

**Model ID**: `page`
**Model Type**: Page Model (using Builder.io default)

#### Fetch Page by URL Path

**Endpoint**: `GET /api/v3/content/page`

**Parameters**:
```typescript
{
  apiKey: string;
  userAttributes: {
    urlPath: string;
  };
}
```

**Example Request**:
```typescript
const page = await fetchOneEntry({
  model: 'page',
  apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
  userAttributes: {
    urlPath: '/about',
  },
});
```

**Response Format**:
```json
{
  "id": "page123",
  "name": "About Us",
  "data": {
    "title": "About SimplerDevelopment",
    "blocks": [
      {
        "@type": "@builder.io/sdk:Element",
        "component": {
          "name": "Text",
          "options": {
            "text": "<h1>About Us</h1>"
          }
        }
      }
    ],
    "metaTitle": "About Us | SimplerDevelopment",
    "metaDescription": "Learn about our mission and team",
    "ogImage": "https://cdn.builder.io/api/v1/image/assets/.../about-og"
  }
}
```

---

## Contact Form API Contract

### Endpoint

**Route**: `POST /api/contact`
**File**: `/Users/dancoyle/simplerdevelopment2026/app/api/contact/route.ts`

### Request Schema

```typescript
{
  name: string;      // 2-100 characters
  email: string;     // Valid email format
  message: string;   // 10-5000 characters
  subject?: string;  // 0-200 characters
}
```

### Validation (Zod)

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
```

### Response Format

**Success (200)**:
```json
{
  "success": true,
  "message": "Thank you for your message. We'll get back to you soon!"
}
```

**Validation Error (400)**:
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email": ["Please enter a valid email address"],
    "message": ["Message must be at least 10 characters"]
  }
}
```

**Rate Limit Error (429)**:
```json
{
  "success": false,
  "message": "Too many requests. Please try again later."
}
```

**Server Error (500)**:
```json
{
  "success": false,
  "message": "Failed to send message. Please try again."
}
```

### Implementation Example

```typescript
// app/api/contact/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { contactFormSchema } from '@/lib/validations';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = contactFormSchema.parse(body);

    // Send email
    await resend.emails.send({
      from: 'website@simplerdevelopment.com',
      to: 'hello@simplerdevelopment.com',
      subject: validatedData.subject || `Contact from ${validatedData.name}`,
      html: `
        <p><strong>From:</strong> ${validatedData.name} (${validatedData.email})</p>
        <p><strong>Message:</strong></p>
        <p>${validatedData.message}</p>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "Thank you for your message. We'll get back to you soon!",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: 'Validation failed',
          errors: error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to send message. Please try again.',
      },
      { status: 500 }
    );
  }
}
```

---

## Image API

### Base Image URL

```
https://cdn.builder.io/api/v1/image/assets/[PUBLIC_API_KEY]/[IMAGE_ID]
```

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `width` | number | Output width in pixels | `?width=800` |
| `height` | number | Output height in pixels | `?height=600` |
| `quality` | number | JPEG quality (1-100) | `?quality=80` |
| `format` | string | Output format | `?format=webp` |
| `fit` | string | Resize mode | `?fit=cover` |

### Example Usage with Next.js Image

```typescript
import Image from 'next/image';

<Image
  src="https://cdn.builder.io/api/v1/image/assets/PUBLIC_KEY/IMAGE_ID"
  alt="Description"
  width={1200}
  height={630}
  quality={85}
  format="webp"
/>
```

---

## Rate Limits & Quotas

### Builder.io API Limits

- **Free Plan**: 25,000 API calls/month
- **Growth Plan**: 250,000 API calls/month
- **Enterprise Plan**: Custom limits

### Recommended Caching Strategy

```typescript
// Enable ISR with 60-second revalidation
export const revalidate = 60;

// Or use on-demand revalidation via webhooks
// POST /api/revalidate?path=/solutions/[slug]
```

---

## Error Handling

### Builder.io API Errors

```typescript
try {
  const content = await fetchOneEntry({
    model: 'solution',
    apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
    userAttributes: { urlPath: `/solutions/${slug}` },
  });

  if (!content) {
    notFound(); // Next.js 404
  }

  return content;
} catch (error) {
  console.error('Failed to fetch from Builder.io:', error);
  throw new Error('Content unavailable');
}
```

### Fallback Content

```typescript
// Provide fallback when Builder.io is unavailable
const content = await getSolution(slug).catch(() => ({
  data: {
    title: 'Content Temporarily Unavailable',
    description: 'Please try again later',
  },
}));
```

---

## Testing Contracts

### Mock Builder.io Responses

```typescript
// __mocks__/builder-io.ts
export const mockSolution = {
  id: 'test-solution',
  data: {
    title: 'Test Solution',
    slug: 'test-solution',
    description: 'A test solution',
    content: '<p>Test content</p>',
    metaTitle: 'Test Solution | SimplerDevelopment',
  },
};

export const mockBlogPost = {
  id: 'test-post',
  data: {
    title: 'Test Post',
    slug: 'test-post',
    excerpt: 'A test blog post',
    coverImage: 'https://example.com/image.jpg',
    content: '<p>Test content</p>',
    publishedAt: '2026-01-13T00:00:00.000Z',
  },
};
```

### Integration Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getSolution } from '@/lib/builder/api';
import { mockSolution } from '@/__mocks__/builder-io';

describe('Builder.io API', () => {
  it('fetches solution by slug', async () => {
    vi.mock('@builder.io/sdk-react-nextjs', () => ({
      fetchOneEntry: vi.fn().mockResolvedValue(mockSolution),
    }));

    const solution = await getSolution('test-solution');
    expect(solution.data?.title).toBe('Test Solution');
  });
});
```

---

## Summary

This document defines:
- Builder.io content model schemas for Solutions, Blog Posts, and Pages
- API endpoints and request/response formats
- Contact form API contract with validation
- Image optimization patterns
- Rate limits and caching strategies
- Error handling approaches
- Testing patterns with mocks

All contracts are designed to work seamlessly with Next.js 16 App Router, TypeScript, and the project's performance requirements.
