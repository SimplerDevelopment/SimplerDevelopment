# Blocks API

Page content in SimplerDevelopment is composed of **typed JSON blocks** — structured data units like headings, hero sections, galleries, and eCommerce grids that are assembled into pages in the visual editor. This endpoint lets you fetch the platform's full block catalog so you can discover available block types, their categories, and the input fields each one accepts. Use it to drive a custom block picker, validate content payloads, or understand what `type` values are valid when constructing page content programmatically.

**Base URL:** `https://app.simplerdevelopment.com/api/v1`

**Authentication:** Requests may include an API key. When a key is present it is validated and rate-limited. See [Authentication](./authentication.md) for how to obtain and pass your key.

---

## What is a block?

A block is a JSON object stored in a page's `content` array. Every block has a `type` field (e.g. `"hero"`, `"card-grid"`, `"booking"`) plus a set of typed inputs specific to that block. For example, a `heading` block accepts `content`, `level`, and `alignment`; a `hero` block accepts `title`, `subtitle`, `backgroundImage`, `ctaLabel`, and `ctaUrl`.

The endpoint below returns the catalog of all available block types — the platform equivalent of a schema registry. It does **not** return the content of a specific page; use the Pages API for that.

---

## Endpoints

### `GET /sites/{siteId}/blocks`

Returns the full catalog of available block types for a site, including each block's display name, category, and accepted input fields.

- **Auth:** API key optional (validated and rate-limited when provided)
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | string | Site ID. Used to scope API key validation; the block catalog returned is the same for all sites. |

- **Query params:** none

- **Request body:** none

- **Response:**

  ```json
  {
    "success": true,
    "data": [
      {
        "type": "text",
        "name": "Paragraph",
        "category": "basic",
        "inputs": ["content", "alignment", "size"]
      },
      {
        "type": "heading",
        "name": "Heading",
        "category": "basic",
        "inputs": ["content", "level", "alignment"]
      },
      {
        "type": "hero",
        "name": "Hero",
        "category": "component",
        "inputs": ["title", "subtitle", "backgroundImage", "ctaLabel", "ctaUrl"]
      },
      {
        "type": "product-grid",
        "name": "Product Grid",
        "category": "ecommerce",
        "inputs": ["category", "limit", "columns"]
      }
    ]
  }
  ```

  Each object in `data` has this shape:

  | Field | Type | Description |
  |---|---|---|
  | `type` | string | Machine identifier used as the `type` field in block JSON (e.g. `"hero"`, `"columns"`). |
  | `name` | string | Human-readable display name. |
  | `category` | string | Grouping: `"basic"`, `"layout"`, `"component"`, `"media"`, or `"ecommerce"`. |
  | `inputs` | string[] | List of accepted input field names for this block type. |

- **Errors:**

  | Status | Description |
  |---|---|
  | `401 Unauthorized` | Invalid API key. |
  | `429 Too Many Requests` | API key rate limit exceeded. Response includes `Retry-After` header. |

- **Example:**

  ```bash
  curl https://app.simplerdevelopment.com/api/v1/sites/site_abc123/blocks \
    -H "Authorization: Bearer YOUR_API_KEY"
  ```

---

## Block categories

The catalog groups blocks into five categories:

| Category | Examples |
|---|---|
| `basic` | Paragraph, Heading, Image, Button, Spacer, Divider, Quote |
| `layout` | Columns, Section, Tabs, Accordion |
| `component` | Hero, Call to Action, Services Grid, Card Grid, Stats, Testimonials, Gallery, Featured Content, Blog Posts |
| `media` | Video, YouTube |
| `ecommerce` | Product Grid, Featured Products, Product Categories, Product Detail, Store Banner |

---

## Using block metadata to construct page content

When you create or update a page's content via the Pages API, the `content` array must contain valid block objects. Use this endpoint to discover which `type` values are recognized and what `inputs` each type accepts. For example, if `inputs` for `"button"` lists `["label", "url", "variant", "size"]`, a valid button block in page content looks like:

```json
{
  "type": "button",
  "label": "Get Started",
  "url": "/contact",
  "variant": "primary",
  "size": "lg"
}
```

Blocks with inputs not listed here are not guaranteed to render — always build content from the catalog returned by this endpoint.
