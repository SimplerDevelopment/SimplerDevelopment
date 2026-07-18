# Database Documentation

This project uses PostgreSQL with Drizzle ORM for database management.

## Setup

### 1. Install PostgreSQL

Make sure you have PostgreSQL installed on your system. You can download it from [postgresql.org](https://www.postgresql.org/download/) or use a cloud provider like:
- [Neon](https://neon.tech/)
- [Supabase](https://supabase.com/)
- [Railway](https://railway.app/)
- [Vercel Postgres](https://vercel.com/storage/postgres)

### 2. Configure Environment Variables

Copy `.env.local` and update the `DATABASE_URL` with your actual PostgreSQL connection string:

```env
DATABASE_URL=postgresql://username:password@host:port/database
```

### 3. Run Migrations

Generate and run migrations to create the database schema:

```bash
# Generate migration files from schema
npm run db:generate

# Push schema to database (for development)
npm run db:push

# Or run migrations (for production)
npm run db:migrate
```

### 4. Optional: Launch Drizzle Studio

Drizzle Studio is a visual database browser:

```bash
npm run db:studio
```

## Database Schema

### Tables

#### posts
- `id` - Serial primary key
- `title` - Post title (max 255 chars)
- `slug` - URL-friendly slug (unique)
- `excerpt` - Short description
- `content` - Full post content
- `cover_image` - Cover image URL
- `published` - Published status (boolean)
- `published_at` - Publication date
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

#### categories
- `id` - Serial primary key
- `name` - Category name (unique)
- `slug` - URL-friendly slug (unique)
- `description` - Category description
- `created_at` - Creation timestamp

#### tags
- `id` - Serial primary key
- `name` - Tag name (unique)
- `slug` - URL-friendly slug (unique)
- `created_at` - Creation timestamp

#### post_categories
- `id` - Serial primary key
- `post_id` - Foreign key to posts
- `category_id` - Foreign key to categories

#### post_tags
- `id` - Serial primary key
- `post_id` - Foreign key to posts
- `tag_id` - Foreign key to tags

## API Endpoints

> **Internal routes — not the external API.** The endpoints documented in this section (`/api/posts`, `/api/categories`, `/api/tags`) are **session-cookie-authenticated internal routes** used by the portal UI. They are not intended for third-party integrations and will reject requests that do not carry a valid portal session.
>
> **External/third-party integrations should use the REST v1 API** (`/api/v1/sites/{siteId}/...`) authenticated with `sd_live_` API keys. See the [API overview](../api/README.md) and the [CMS Content API reference](../api/cms-content.md) for details.

### Posts

#### List Posts
```
GET /api/posts
Query params:
  - published: true|false
  - limit: number (default: 10)
  - offset: number (default: 0)
  - sortBy: createdAt|publishedAt (default: createdAt)
  - sortOrder: asc|desc (default: desc)

Response:
{
  "success": true,
  "data": [...],
  "pagination": { "limit": 10, "offset": 0 }
}
```

#### Get Single Post
```
GET /api/posts/[id]

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Create Post
```
POST /api/posts
Body:
{
  "title": "Post Title",
  "slug": "post-title",
  "excerpt": "Short description",
  "content": "Full content",
  "coverImage": "https://example.com/image.jpg",
  "published": false,
  "publishedAt": "2026-01-14T12:00:00Z",
  "categoryIds": [1, 2],
  "tagIds": [1, 3, 5]
}

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Update Post
```
PUT /api/posts/[id]
Body: (all fields optional)
{
  "title": "Updated Title",
  "content": "Updated content",
  ...
}

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Delete Post
```
DELETE /api/posts/[id]

Response:
{
  "success": true,
  "message": "Post deleted successfully"
}
```

### Categories

#### List Categories
```
GET /api/categories

Response:
{
  "success": true,
  "data": [...]
}
```

#### Get Single Category
```
GET /api/categories/[id]

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Create Category
```
POST /api/categories
Body:
{
  "name": "Category Name",
  "slug": "category-name",
  "description": "Category description"
}

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Update Category
```
PUT /api/categories/[id]
Body: (all fields optional)
{
  "name": "Updated Name",
  ...
}

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Delete Category
```
DELETE /api/categories/[id]

Response:
{
  "success": true,
  "message": "Category deleted successfully"
}
```

### Tags

#### List Tags
```
GET /api/tags

Response:
{
  "success": true,
  "data": [...]
}
```

#### Get Single Tag
```
GET /api/tags/[id]

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Create Tag
```
POST /api/tags
Body:
{
  "name": "Tag Name",
  "slug": "tag-name"
}

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Update Tag
```
PUT /api/tags/[id]
Body: (all fields optional)
{
  "name": "Updated Name",
  ...
}

Response:
{
  "success": true,
  "data": { ... }
}
```

#### Delete Tag
```
DELETE /api/tags/[id]

Response:
{
  "success": true,
  "message": "Tag deleted successfully"
}
```

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": [] // Only for validation errors (array of Zod issues)
}
```

Common status codes:
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `500` - Internal Server Error

## Usage Example

```typescript
// Creating a blog post
const response = await fetch('/api/posts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'My First Post',
    slug: 'my-first-post',
    content: 'This is the content of my first post.',
    published: true,
    publishedAt: new Date().toISOString(),
  }),
});

const data = await response.json();
console.log(data);
```
