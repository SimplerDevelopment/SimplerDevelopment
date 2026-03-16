# Block Editor Guide: Formatting Blog Post Content

This guide explains how to properly format blog post content using the block-based content system.

## Table of Contents
- [Understanding the Data Structure](#understanding-the-data-structure)
- [Using the Blocks API](#using-the-blocks-api)
- [Creating Blog Post Content](#creating-blog-post-content)
- [Block Examples](#block-examples)
- [Best Practices](#best-practices)

---

## Understanding the Data Structure

Blog post content is stored as JSON in the `content` field of the `posts` table. The structure follows this format:

```json
{
  "blocks": [
    {
      "id": "unique-block-id",
      "type": "block-type",
      "order": 0,
      ...additionalFields
    }
  ],
  "version": "1.0"
}
```

### Key Components:

- **blocks**: Array of block objects that make up the content
- **version**: Schema version for future compatibility
- **id**: Unique identifier for each block (use `block-${Date.now()}-${Math.random()}` format)
- **type**: Block type identifier (e.g., 'text', 'heading', 'image')
- **order**: Position of the block in the content (0-indexed)

---

## Using the Blocks API

The `/api/blocks` endpoint provides metadata about all available blocks and their required fields.

### Fetching Block Information

```javascript
const response = await fetch('/api/blocks');
const { data } = await response.json();

// Get all available blocks
const blocks = data.blocks;

// Get blocks by category
const basicBlocks = blocks.filter(b => b.category === 'basic');
const mediaBlocks = blocks.filter(b => b.category === 'media');
const layoutBlocks = blocks.filter(b => b.category === 'layout');
const componentBlocks = blocks.filter(b => b.category === 'component');

// Find specific block info
const textBlock = blocks.find(b => b.type === 'text');
console.log(textBlock.inputs); // See all required/optional fields
```

### Understanding Block Inputs

Each block has an `inputs` array that defines its fields:

```javascript
{
  name: 'content',           // Field name
  type: 'string',            // Data type: string, number, boolean, array, select
  required: true,            // Whether field is mandatory
  description: 'The text',   // What this field does
  options: [...],            // Available options (for select type)
  default: 'value'           // Default value if not provided
}
```

---

## Creating Blog Post Content

### Step 1: Start with the Container

```json
{
  "blocks": [],
  "version": "1.0"
}
```

### Step 2: Add Blocks

Each block must include:
1. **id** - Unique identifier
2. **type** - Block type from the API
3. **order** - Sequential position
4. **Required fields** - Based on block type

### Example: Simple Blog Post

```json
{
  "blocks": [
    {
      "id": "block-1705432123456-abc123",
      "type": "heading",
      "order": 0,
      "content": "Introduction to Next.js",
      "level": 1,
      "alignment": "left"
    },
    {
      "id": "block-1705432123457-def456",
      "type": "text",
      "order": 1,
      "content": "Next.js is a powerful React framework that enables server-side rendering and static site generation.",
      "alignment": "left",
      "size": "base"
    },
    {
      "id": "block-1705432123458-ghi789",
      "type": "image",
      "order": 2,
      "url": "https://example.com/nextjs-logo.png",
      "alt": "Next.js Logo",
      "caption": "The Next.js framework logo",
      "width": "large",
      "alignment": "center"
    }
  ],
  "version": "1.0"
}
```

---

## Block Examples

### Text Block
```json
{
  "id": "block-123",
  "type": "text",
  "order": 0,
  "content": "This is a paragraph of text.",
  "alignment": "left",
  "size": "base"
}
```

**Required:** `content`
**Optional:** `alignment` (left|center|right), `size` (sm|base|lg|xl)

---

### Heading Block
```json
{
  "id": "block-124",
  "type": "heading",
  "order": 1,
  "content": "Section Title",
  "level": 2,
  "alignment": "left"
}
```

**Required:** `content`, `level` (1-6)
**Optional:** `alignment` (left|center|right)

---

### Image Block
```json
{
  "id": "block-125",
  "type": "image",
  "order": 2,
  "url": "/api/media/proxy/media/image-uuid.png",
  "alt": "Descriptive alt text",
  "caption": "Image caption (optional)",
  "width": "full",
  "alignment": "center"
}
```

**Required:** `url`, `alt`
**Optional:** `caption`, `width` (small|medium|large|full), `alignment`

---

### Quote Block
```json
{
  "id": "block-126",
  "type": "quote",
  "order": 3,
  "content": "The best way to predict the future is to invent it.",
  "author": "Alan Kay",
  "citation": "Stanford University, 1971"
}
```

**Required:** `content`
**Optional:** `author`, `citation`

---

### Code Block
```json
{
  "id": "block-127",
  "type": "code",
  "order": 4,
  "code": "const greeting = 'Hello, World!';\nconsole.log(greeting);",
  "language": "javascript"
}
```

**Required:** `code`
**Optional:** `language` (javascript|python|html|css|etc.)

---

### YouTube Block
```json
{
  "id": "block-128",
  "type": "youtube",
  "order": 5,
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "caption": "Tutorial video"
}
```

**Required:** `url` (supports youtube.com/watch, youtu.be, or embed URLs)
**Optional:** `caption`

---

### Button Block
```json
{
  "id": "block-129",
  "type": "button",
  "order": 6,
  "text": "Learn More",
  "url": "/learn-more",
  "variant": "primary",
  "size": "md",
  "alignment": "center",
  "openInNewTab": false
}
```

**Required:** `text`, `url`
**Optional:** `variant` (primary|secondary|outline), `size` (sm|md|lg), `alignment`, `openInNewTab`

---

### Columns Block (Advanced)
```json
{
  "id": "block-130",
  "type": "columns",
  "order": 7,
  "gap": "md",
  "columns": [
    {
      "id": "col-1",
      "width": 50,
      "blocks": [
        {
          "id": "nested-block-1",
          "type": "text",
          "order": 0,
          "content": "Left column content"
        }
      ]
    },
    {
      "id": "col-2",
      "width": 50,
      "blocks": [
        {
          "id": "nested-block-2",
          "type": "text",
          "order": 0,
          "content": "Right column content"
        }
      ]
    }
  ]
}
```

**Required:** `columns` (array of column objects)
**Optional:** `gap` (sm|md|lg)

---

### Tabs Block (Advanced)
```json
{
  "id": "block-131",
  "type": "tabs",
  "order": 8,
  "tabs": [
    {
      "id": "tab-1",
      "label": "Overview",
      "blocks": [
        {
          "id": "tab-block-1",
          "type": "text",
          "order": 0,
          "content": "Overview content here"
        }
      ]
    },
    {
      "id": "tab-2",
      "label": "Details",
      "blocks": [
        {
          "id": "tab-block-2",
          "type": "text",
          "order": 0,
          "content": "Detailed information here"
        }
      ]
    }
  ]
}
```

**Required:** `tabs` (array of tab objects with label and blocks)

---

### Accordion Block
```json
{
  "id": "block-132",
  "type": "accordion",
  "order": 9,
  "title": "Frequently Asked Questions",
  "items": [
    {
      "id": "item-1",
      "title": "What is Next.js?",
      "content": "Next.js is a React framework for building web applications."
    },
    {
      "id": "item-2",
      "title": "How do I get started?",
      "content": "Install Next.js using: npm install next react react-dom"
    }
  ]
}
```

**Required:** `items` (array of items with title and content)
**Optional:** `title`

---

### Spacer Block
```json
{
  "id": "block-133",
  "type": "spacer",
  "order": 10,
  "height": "lg"
}
```

**Required:** `height` (sm|md|lg|xl)

---

### Divider Block
```json
{
  "id": "block-134",
  "type": "divider",
  "order": 11,
  "style": "solid"
}
```

**Optional:** `style` (solid|dashed|dotted)

---

## Best Practices

### 1. Generate Unique IDs
```javascript
function generateBlockId() {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### 2. Maintain Sequential Order
```javascript
const blocks = [
  { id: '1', order: 0, ... },
  { id: '2', order: 1, ... },
  { id: '3', order: 2, ... },
];
```

### 3. Use Appropriate Block Types
- **Headings** - Use for structure (H1 for title, H2 for sections, H3 for subsections)
- **Text** - For paragraphs and body content
- **Quote** - For highlighting important quotes
- **Code** - For code snippets (always include language)
- **Images** - Always include alt text for accessibility

### 4. Content Structure Example
```
H1 - Article Title
Text - Introduction paragraph
Image - Feature image
H2 - First Section
Text - Section content
Code - Code example (if applicable)
H2 - Second Section
Text - More content
Quote - Key takeaway
Text - Conclusion
Button - Call to action
```

### 5. Nested Blocks (Columns/Tabs)
- Each nested block needs its own unique ID
- Nested blocks must include `order` field
- Use consistent widths for columns (should total 100%)
- Keep nested content simple - avoid deeply nested structures

### 6. Media URLs
- Use the media API proxy: `/api/media/proxy/media/{filename}`
- Always provide alt text for images
- Use appropriate width settings for responsive design
- Test video/YouTube URLs before publishing

### 7. Validation
Before saving content, ensure:
- [ ] All required fields are present for each block type
- [ ] All IDs are unique
- [ ] Order values are sequential (0, 1, 2, ...)
- [ ] URLs are valid
- [ ] Image alt text is descriptive
- [ ] Code blocks have language specified
- [ ] Version is set to "1.0"

---

## Complete Example: Tutorial Blog Post

```json
{
  "blocks": [
    {
      "id": "block-1705432100000-a1b2c3",
      "type": "heading",
      "order": 0,
      "content": "Getting Started with React Hooks",
      "level": 1,
      "alignment": "left"
    },
    {
      "id": "block-1705432100001-d4e5f6",
      "type": "text",
      "order": 1,
      "content": "React Hooks revolutionized how we write React components. In this tutorial, we'll explore the most commonly used hooks and how to use them effectively.",
      "alignment": "left",
      "size": "base"
    },
    {
      "id": "block-1705432100002-g7h8i9",
      "type": "image",
      "order": 2,
      "url": "/api/media/proxy/media/react-hooks-banner.png",
      "alt": "React Hooks concept diagram",
      "caption": "The React Hooks API",
      "width": "large",
      "alignment": "center"
    },
    {
      "id": "block-1705432100003-j0k1l2",
      "type": "heading",
      "order": 3,
      "content": "What are Hooks?",
      "level": 2,
      "alignment": "left"
    },
    {
      "id": "block-1705432100004-m3n4o5",
      "type": "text",
      "order": 4,
      "content": "Hooks are functions that let you use state and other React features without writing a class component. They were introduced in React 16.8.",
      "alignment": "left",
      "size": "base"
    },
    {
      "id": "block-1705432100005-p6q7r8",
      "type": "heading",
      "order": 5,
      "content": "useState Hook",
      "level": 2,
      "alignment": "left"
    },
    {
      "id": "block-1705432100006-s9t0u1",
      "type": "text",
      "order": 6,
      "content": "The useState hook allows you to add state to functional components:",
      "alignment": "left",
      "size": "base"
    },
    {
      "id": "block-1705432100007-v2w3x4",
      "type": "code",
      "order": 7,
      "code": "import { useState } from 'react';\n\nfunction Counter() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <button onClick={() => setCount(count + 1)}>\n      Count: {count}\n    </button>\n  );\n}",
      "language": "javascript"
    },
    {
      "id": "block-1705432100008-y5z6a7",
      "type": "quote",
      "order": 8,
      "content": "Hooks don't replace your knowledge of React concepts. Instead, Hooks provide a more direct API to the React concepts you already know.",
      "author": "React Documentation"
    },
    {
      "id": "block-1705432100009-b8c9d0",
      "type": "divider",
      "order": 9,
      "style": "solid"
    },
    {
      "id": "block-1705432100010-e1f2g3",
      "type": "heading",
      "order": 10,
      "content": "Try It Yourself",
      "level": 2,
      "alignment": "left"
    },
    {
      "id": "block-1705432100011-h4i5j6",
      "type": "text",
      "order": 11,
      "content": "Ready to start using hooks in your projects? Check out our interactive examples:",
      "alignment": "left",
      "size": "base"
    },
    {
      "id": "block-1705432100012-k7l8m9",
      "type": "button",
      "order": 12,
      "text": "View Live Examples",
      "url": "/examples/react-hooks",
      "variant": "primary",
      "size": "lg",
      "alignment": "center",
      "openInNewTab": false
    }
  ],
  "version": "1.0"
}
```

---

## Troubleshooting

### Content Not Rendering
- Check that JSON is valid (no trailing commas, proper quotes)
- Verify all required fields are present
- Ensure `type` values match available block types from `/api/blocks`

### Images Not Loading
- Verify image URLs are correct
- Check that images are uploaded to media library
- Ensure image URLs use the media proxy endpoint

### Nested Blocks Not Working
- Verify nested blocks have unique IDs
- Check that parent block type supports nesting (columns, tabs, accordion)
- Ensure nested blocks are in the correct structure

### Styling Issues
- Review alignment and size options for the block type
- Check that variant/style values are from the allowed options
- Verify width settings for responsive design

---

## API Reference

### GET /api/blocks
Returns all available block types with their input specifications.

**Response:**
```json
{
  "success": true,
  "data": {
    "blocks": [...],
    "categories": [...]
  }
}
```

Use this endpoint to:
- Discover available block types
- Validate block structure
- Build dynamic block editors
- Generate documentation
