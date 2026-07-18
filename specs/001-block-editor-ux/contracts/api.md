# API Contracts: Block Editor UX Improvements

**Feature**: Block Editor UX Improvements
**Date**: 2026-01-27
**Purpose**: Define API endpoints and data contracts for editor operations

## Overview

The block editor UX improvements primarily enhance client-side functionality with minimal API changes. The existing API for saving posts remains unchanged, but this document defines the contract explicitly for reference.

---

## Existing API Endpoint (No Changes Required)

### Update Post

**Endpoint**: `PUT /api/posts/[id]` or `PATCH /api/posts/[id]`

**Description**: Update an existing post, including its block content.

**Request Headers**:
```http
Content-Type: application/json
Authorization: Bearer <session-token>
```

**Request Body**:
```typescript
interface UpdatePostRequest {
  id: number;                        // Post ID
  title?: string;                     // Post title
  slug?: string;                      // URL slug
  excerpt?: string;                   // Short description
  content: string;                    // JSON-serialized BlockEditorData
  coverImage?: string | null;         // Cover image URL
  published?: boolean;                // Publication status
  postTypeId?: number;                // Post type ID
  categoryIds?: number[];             // Associated categories
  tagIds?: number[];                  // Associated tags
}
```

**Content Field Format** (JSON string):
```typescript
// Deserialized from content field:
interface BlockEditorData {
  blocks: Block[];                    // Array of block objects
  version: string;                    // Format version ("1.0")
}
```

**Response** (Success - 200 OK):
```typescript
interface UpdatePostResponse {
  id: number;
  title: string;
  slug: string;
  content: string;                    // JSON string
  published: boolean;
  updatedAt: string;                  // ISO 8601 timestamp
  // ... other post fields
}
```

**Response** (Error - 400 Bad Request):
```typescript
interface ErrorResponse {
  error: string;                      // Error message
  details?: Record<string, string>; // Field-specific errors
}
```

**Example**:
```http
PATCH /api/posts/42
Content-Type: application/json

{
  "id": 42,
  "title": "My Post",
  "content": "{\"blocks\":[{\"id\":\"abc123\",\"type\":\"heading\",\"content\":\"Hello World\",\"level\":1,\"order\":1}],\"version\":\"1.0\"}"
}
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 42,
  "title": "My Post",
  "slug": "my-post",
  "content": "{\"blocks\":[...],\"version\":\"1.0\"}",
  "published": false,
  "updatedAt": "2026-01-27T10:30:00Z"
}
```

---

## Auto-Save Behavior

### Debounced Auto-Save

**Client-Side Implementation**:
- Wait 30 seconds after last edit before saving
- Reset timer on each edit
- Show save status indicator
- Handle concurrent edits gracefully

**API Call Frequency**:
- Maximum 1 save per 30 seconds during active editing
- No save if content hasn't changed
- Manual save (Cmd+S) bypasses debounce

**Error Handling**:
```typescript
// Client-side retry logic
async function autoSave(blocks: Block[]) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await updatePost({
        id: postId,
        content: JSON.stringify({ blocks, version: '1.0' })
      });
      return { success: true };
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        return { success: false, error };
      }
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}
```

---

## Content Validation

### Block Structure Validation

**Server-Side Validation** (existing):
```typescript
// Validates content is valid JSON
function validateBlockContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content);

    // Check required fields
    if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
      return false;
    }
    if (!parsed.version || typeof parsed.version !== 'string') {
      return false;
    }

    // Validate each block has required fields
    for (const block of parsed.blocks) {
      if (!block.id || !block.type || typeof block.order !== 'number') {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}
```

### Size Limits

**Content Size**:
- Maximum content length: 16 MB (PostgreSQL TEXT field limit)
- Recommended maximum: 5 MB for performance
- Client-side warning if content exceeds 5 MB

**Block Limits**:
- Maximum blocks per document: 1000 (soft limit)
- Maximum nesting depth: 3 levels (columns/tabs)
- Maximum characters per block: 100,000

---

## Client-Side State Management

### Editor Context API

**No server-side API** - Pure client-side React Context:

```typescript
interface EditorContextValue {
  // State
  blocks: Block[];
  selectedBlockId: string | null;
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;

  // Actions
  updateBlock: (id: string, updates: Partial<Block>) => void;
  addBlock: (block: Block, position?: number) => void;
  deleteBlock: (id: string) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  duplicateBlock: (id: string) => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Save
  save: () => Promise<void>;
  autoSave: () => void;
}
```

**Usage**:
```typescript
// In components
const { blocks, updateBlock, save, canUndo, undo } = useEditorContext();
```

---

## Media Upload API (Existing)

### Upload Media

**Endpoint**: `POST /api/media/upload`

**Description**: Upload an image or video file to S3, used when pasting images.

**Request Headers**:
```http
Content-Type: multipart/form-data
Authorization: Bearer <session-token>
```

**Request Body**:
```typescript
// FormData with file
{
  file: Blob;                         // Image or video file
  alt?: string;                       // Alt text
}
```

**Response** (Success - 200 OK):
```typescript
interface MediaUploadResponse {
  id: string;                         // Media ID (UUID)
  url: string;                        // S3 URL
  filename: string;                   // Original filename
  mimeType: string;                   // MIME type
  size: number;                       // File size in bytes
  createdAt: string;                  // ISO 8601 timestamp
}
```

**Used By**:
- Image block when pasting images from clipboard
- Rich content paste when converting `<img>` tags with data URIs

---

## WebSocket API (Future Enhancement - Not Implemented)

### Real-Time Collaboration (Optional Future Work)

**Not required for this feature**, but documenting for future reference:

**Endpoint**: `ws://localhost:3005/api/posts/[id]/collaborate`

**Message Types**:
```typescript
// Client → Server
interface BlockUpdateMessage {
  type: 'block_update';
  blockId: string;
  updates: Partial<Block>;
  userId: string;
}

// Server → Clients
interface BlockChangedBroadcast {
  type: 'block_changed';
  blockId: string;
  updates: Partial<Block>;
  userId: string;
  userName: string;
}
```

**Conflict Resolution**:
- Last-write-wins for now
- Operational Transformation (OT) or CRDTs for future

---

## Rate Limiting

### Save Endpoint Rate Limits

**Current Limits** (based on Next.js middleware):
- 10 requests per minute per session
- 100 requests per hour per session

**Client-Side Handling**:
```typescript
// Respect rate limits
const SAVE_COOLDOWN_MS = 6000; // 6 seconds minimum between saves

let lastSaveTime = 0;

async function throttledSave(blocks: Block[]) {
  const now = Date.now();
  const timeSinceLastSave = now - lastSaveTime;

  if (timeSinceLastSave < SAVE_COOLDOWN_MS) {
    // Wait before saving
    await new Promise(resolve =>
      setTimeout(resolve, SAVE_COOLDOWN_MS - timeSinceLastSave)
    );
  }

  lastSaveTime = Date.now();
  return await savePost({ id: postId, content: JSON.stringify({ blocks, version: '1.0' }) });
}
```

---

## Error Codes

### API Error Responses

| Status Code | Error Type | Description | Client Action |
|------------|-----------|-------------|---------------|
| 400 | `validation_error` | Invalid block structure | Show validation errors to user |
| 401 | `unauthorized` | Session expired | Redirect to login |
| 403 | `forbidden` | User doesn't have edit permissions | Show error, disable editing |
| 404 | `not_found` | Post doesn't exist | Redirect to posts list |
| 409 | `conflict` | Content modified by another user | Show merge conflict UI (future) |
| 413 | `content_too_large` | Content exceeds size limit | Warn user, suggest splitting post |
| 429 | `rate_limit_exceeded` | Too many save requests | Wait and retry, show countdown |
| 500 | `server_error` | Internal server error | Show error, offer retry |

---

## Caching Strategy

### Client-Side Caching

**localStorage Caching** (auto-save backup):
```typescript
// Save draft to localStorage every 10 seconds
setInterval(() => {
  localStorage.setItem(`draft-post-${postId}`, JSON.stringify({
    blocks,
    timestamp: Date.now()
  }));
}, 10000);

// Restore on page load
useEffect(() => {
  const draft = localStorage.getItem(`draft-post-${postId}`);
  if (draft) {
    const { blocks, timestamp } = JSON.parse(draft);
    if (Date.now() - timestamp < 24 * 60 * 60 * 1000) { // Within 24 hours
      // Offer to restore draft
      showRestoreDraftDialog(blocks);
    }
  }
}, [postId]);
```

---

## Summary

### Endpoint Changes

**None required** - All improvements are client-side enhancements.

### New Client-Side APIs

1. **EditorContext** - React Context for shared editor state
2. **useBlockHistory** - Hook for undo/redo
3. **useKeyboardShortcuts** - Hook for keyboard shortcuts
4. **richPasteParser** - Utility for parsing pasted content
5. **contentAnalyzer** - Utility for word/character counting

### Backward Compatibility

**100% compatible** - No breaking changes to existing API or data format.

### Performance Considerations

- Debounce auto-save to reduce API calls
- Rate limiting awareness in client
- localStorage backup for data safety
- Optimistic UI for better perceived performance
