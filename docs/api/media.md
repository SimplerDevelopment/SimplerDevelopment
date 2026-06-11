# Media API

The Media API lets you list and retrieve media assets that have been uploaded to a site. Use it to build galleries, populate image pickers, or sync your site's media library with external tools.

**Base URL:** `https://your-domain.com/api/v1`
**Authentication:** All endpoints require a valid API key. See [Authentication](./authentication.md) for details.

---

## Endpoints

### `GET /sites/{siteId}/media`

Returns a paginated list of media items belonging to the specified site. Results are ordered newest-first.

- **Auth:** API key required
- **Path params:**

  | Name     | Type    | Description                    |
  |----------|---------|--------------------------------|
  | `siteId` | integer | The numeric ID of the site.    |

- **Query params:**

  | Name       | Type    | Default | Description                                                                                                  |
  |------------|---------|---------|--------------------------------------------------------------------------------------------------------------|
  | `limit`    | integer | `20`    | Number of items to return. Maximum `100`.                                                                    |
  | `offset`   | integer | `0`     | Zero-based offset for pagination.                                                                            |
  | `mimeType` | string  | (none)  | Filter by MIME type prefix. For example, `image` matches `image/jpeg`, `image/png`, etc. Omit (or pass `all`) to return all types. |

- **Response:**

  ```json
  {
    "success": true,
    "data": [
      {
        "id": 42,
        "filename": "hero-banner.jpg",
        "mimeType": "image/jpeg",
        "url": "https://cdn.example.com/sites/7/hero-banner.jpg",
        "thumbnailUrl": "https://cdn.example.com/sites/7/hero-banner-thumb.jpg",
        "alt": "A sweeping mountain vista at sunrise",
        "caption": "Hero image for the homepage",
        "width": 1920,
        "height": 1080
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 143
    }
  }
  ```

  | Field                      | Type            | Description                                              |
  |----------------------------|-----------------|----------------------------------------------------------|
  | `data[].id`                | integer         | Unique media item ID.                                    |
  | `data[].filename`          | string          | Original filename as uploaded.                           |
  | `data[].mimeType`          | string          | MIME type, e.g. `image/png`, `video/mp4`.                |
  | `data[].url`               | string          | Full URL to the original file.                           |
  | `data[].thumbnailUrl`      | string \| null  | URL of a generated thumbnail, if available.              |
  | `data[].alt`               | string \| null  | Alt text for accessibility.                              |
  | `data[].caption`           | string \| null  | Optional caption associated with the media item.         |
  | `data[].width`             | integer \| null | Width in pixels (images/videos).                         |
  | `data[].height`            | integer \| null | Height in pixels (images/videos).                        |
  | `pagination.limit`         | integer         | The effective `limit` applied to this response.          |
  | `pagination.offset`        | integer         | The effective `offset` applied to this response.         |
  | `pagination.total`         | integer         | Total number of matching items across all pages.         |

- **Errors:**

  | Status | `message`         | Cause                                                      |
  |--------|-------------------|------------------------------------------------------------|
  | `400`  | `Invalid site ID` | `siteId` path segment is not a valid integer.              |
  | `401`  | *(from middleware)* | API key missing or invalid.                              |
  | `404`  | `Not found`       | No active site exists with the given `siteId`.             |

- **Example:**

  ```bash
  # List the first 10 images for site 7
  curl -G "https://your-domain.com/api/v1/sites/7/media" \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -d "limit=10" \
    -d "offset=0" \
    -d "mimeType=image"
  ```

  Paginate to the next page:

  ```bash
  curl -G "https://your-domain.com/api/v1/sites/7/media" \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -d "limit=10" \
    -d "offset=10"
  ```
