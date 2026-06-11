# Site Configuration API (Branding, Config, Navigation)

These three endpoints give your headless front-end everything it needs to render a site: resolved theme tokens as both a structured object and ready-to-inject CSS custom properties, site metadata, and the full navigation menu tree. All three are read-only GET requests scoped to a single site.

**Base URL:** `https://<your-domain>/api/v1/sites/{siteId}`

**Authentication:** Pass your API key as `Authorization: Bearer sd_live_<key>` or `x-api-key: sd_live_<key>`. If no key is supplied the request still proceeds but rate-limit enforcement is skipped. See [authentication.md](./authentication.md) for full details.

**CORS:** All three endpoints emit `Access-Control-Allow-Origin: *` and handle `OPTIONS` preflight automatically — safe to call from a browser.

---

## Endpoints

### `GET /api/v1/sites/{siteId}/branding`

Returns the resolved branding profile for a site plus a flat map of CSS custom property names to values, ready to inject as `:root` variables.

- **Auth:** API key (optional — unauthenticated calls are allowed; rate limiting applies when a key is present)
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | integer | Numeric ID of the target site |

- **Query params:** none

- **Response:**

  ```json
  {
    "success": true,
    "data": {
      "primaryColor": "#2563eb",
      "secondaryColor": "#1e40af",
      "accentColor": "#f59e0b",
      "backgroundColor": "#ffffff",
      "textColor": "#111827",
      "headingFont": "Inter",
      "bodyFont": "Inter",
      "logoUrl": "https://cdn.example.com/logo.png",
      "logoSquareUrl": "https://cdn.example.com/logo-sq.png",
      "logoRectUrl": "https://cdn.example.com/logo-rect.png",
      "logoIconUrl": "https://cdn.example.com/icon.png",
      "logoText": "Acme Corp",
      "logoAlt": "Acme Corp logo",
      "navTemplate": "classic",
      "navPosition": "top",
      "navBackground": "#ffffff",
      "navTextColor": "#111827",
      "borderRadius": "0.5rem",
      "linkColor": "#2563eb",
      "linkHoverColor": "#1e40af",
      "faviconUrl": "https://cdn.example.com/favicon.ico",
      "ogImageUrl": "https://cdn.example.com/og.png",
      "buttonStyle": {
        "primaryBg": "#2563eb",
        "primaryText": "#ffffff",
        "primaryHoverBg": "#1d4ed8",
        "secondaryBg": "transparent",
        "secondaryText": "#2563eb",
        "secondaryHoverBg": "#eff6ff",
        "borderRadius": "0.375rem",
        "variant": "filled"
      },
      "buttonPresets": [
        {
          "id": "a1b2c3d4-...",
          "name": "Primary CTA",
          "backgroundColor": "brand.primary",
          "color": "#ffffff",
          "borderRadius": "0.375rem",
          "fontWeight": "600",
          "textTransform": "none",
          "paddingX": "1.5rem",
          "paddingY": "0.75rem"
        }
      ],
      "typography": {
        "h1": { "font": "Inter", "size": "3rem", "weight": "700", "lineHeight": "1.1", "letterSpacing": "-0.02em" },
        "body": { "size": "1rem", "lineHeight": "1.6" }
      },
      "darkMode": {
        "primaryColor": "#60a5fa",
        "backgroundColor": "#0f172a",
        "textColor": "#f8fafc",
        "navBackground": "#0f172a",
        "navTextColor": "#f8fafc"
      }
    },
    "cssVars": {
      "--brand-primary": "#2563eb",
      "--brand-secondary": "#1e40af",
      "--brand-accent": "#f59e0b",
      "--brand-bg": "#ffffff",
      "--brand-text": "#111827",
      "--brand-nav-bg": "#ffffff",
      "--brand-nav-text": "#111827",
      "--brand-heading-font": "Inter",
      "--brand-body-font": "Inter",
      "--brand-border-radius": "0.5rem",
      "--brand-link-color": "#2563eb",
      "--brand-link-hover-color": "#1e40af",
      "--brand-btn-primary-bg": "#2563eb",
      "--brand-btn-primary-text": "#ffffff",
      "--brand-btn-primary-hover-bg": "#1d4ed8",
      "--brand-btn-secondary-bg": "transparent",
      "--brand-btn-secondary-text": "#2563eb",
      "--brand-btn-secondary-hover-bg": "#eff6ff",
      "--brand-btn-border-radius": "0.375rem",
      "--brand-btn-variant": "filled",
      "--brand-h1-size": "3rem",
      "--brand-h1-weight": "700",
      "--brand-h1-line-height": "1.1",
      "--brand-h1-letter-spacing": "-0.02em",
      "--brand-h1-font": "Inter"
    }
  }
  ```

  **`data` field reference:**

  | Field | Type | Notes |
  |---|---|---|
  | `primaryColor` | string | Hex color; defaults to `#2563eb` |
  | `secondaryColor` | string | Hex color; defaults to `#1e40af` |
  | `accentColor` | string | Hex color; defaults to `#f59e0b` |
  | `backgroundColor` | string | Hex color; defaults to `#ffffff` |
  | `textColor` | string | Hex color; defaults to `#111827` |
  | `headingFont` | string | Font family name; may be empty |
  | `bodyFont` | string | Font family name; may be empty |
  | `logoUrl` | string | Primary logo URL |
  | `logoSquareUrl` | string | Square/1:1 logo URL |
  | `logoRectUrl` | string | Rectangular/wide logo URL |
  | `logoIconUrl` | string | Icon-mark URL |
  | `logoText` | string | Text fallback for the logo |
  | `logoAlt` | string | Alt text for logo images |
  | `navTemplate` | string | Nav layout style (e.g. `"classic"`) |
  | `navPosition` | string | `"top"` or custom value |
  | `navBackground` | string | Hex color for nav background |
  | `navTextColor` | string | Hex color for nav text |
  | `borderRadius` | string \| undefined | CSS border-radius value |
  | `linkColor` | string \| undefined | Hex color for links |
  | `linkHoverColor` | string \| undefined | Hex color for hovered links |
  | `faviconUrl` | string \| undefined | Favicon URL |
  | `ogImageUrl` | string \| undefined | Default Open Graph image URL |
  | `buttonStyle` | object \| undefined | Global button style overrides (see shape above) |
  | `buttonPresets` | array \| undefined | Named button presets; `id` is a stable UUID |
  | `typography` | object \| undefined | Per-element type scale keyed by element name (e.g. `"h1"`, `"body"`) |
  | `darkMode` | object \| undefined | Dark-mode color overrides |

  **`cssVars` field:** A flat `Record<string, string>` of CSS custom property names to values. Only properties that have a value set are included — keys with empty or missing source values are omitted. Apply to `:root` or a wrapper element.

- **Errors:**

  | Status | Message | Cause |
  |---|---|---|
  | `400` | `"Invalid site ID"` | `siteId` path param is not a valid integer |
  | `401` | `"Invalid API key"` | Key supplied but not recognized or not authorized for this site |
  | `404` | `"Not found"` | No active site found for the given `siteId` |
  | `429` | `"Rate limit exceeded"` | Key has exceeded its per-minute request limit; check `Retry-After` header |

- **Example:**

  ```bash
  curl https://your-domain.com/api/v1/sites/42/branding \
    -H "Authorization: Bearer sd_live_yourkey"
  ```

---

### `GET /api/v1/sites/{siteId}/config`

Returns a combined site configuration bundle: site metadata, resolved branding, CSS variables, navigation tree, and store status — everything a headless renderer needs in a single request.

- **Auth:** API key (optional — same rules as `/branding`)
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | integer | Numeric ID of the target site |

- **Query params:** none

- **Response:**

  ```json
  {
    "success": true,
    "data": {
      "id": 42,
      "name": "Acme Corp",
      "domain": "acme.com",
      "subdomain": "acme",
      "description": "The Acme Corp website",
      "customLayout": null,
      "branding": {
        "primaryColor": "#2563eb",
        "secondaryColor": "#1e40af",
        "accentColor": "#f59e0b",
        "backgroundColor": "#ffffff",
        "textColor": "#111827",
        "headingFont": "Inter",
        "bodyFont": "Inter",
        "logoUrl": "https://cdn.example.com/logo.png",
        "logoSquareUrl": "https://cdn.example.com/logo-sq.png",
        "logoRectUrl": "https://cdn.example.com/logo-rect.png",
        "logoIconUrl": "https://cdn.example.com/icon.png",
        "logoText": "Acme Corp",
        "logoAlt": "Acme Corp logo",
        "navTemplate": "classic",
        "navPosition": "top",
        "navBackground": "#ffffff",
        "navTextColor": "#111827"
      },
      "cssVars": {
        "--brand-primary": "#2563eb",
        "--brand-secondary": "#1e40af",
        "--brand-accent": "#f59e0b",
        "--brand-bg": "#ffffff",
        "--brand-text": "#111827",
        "--brand-nav-bg": "#ffffff",
        "--brand-nav-text": "#111827"
      },
      "navigation": [
        {
          "id": 1,
          "label": "Home",
          "href": "/",
          "parentId": null,
          "sortOrder": 0,
          "openInNewTab": false,
          "isButton": false,
          "description": null,
          "icon": null,
          "featuredImage": null,
          "columnGroup": null,
          "children": []
        }
      ],
      "storeEnabled": false
    }
  }
  ```

  **Top-level `data` fields:**

  | Field | Type | Description |
  |---|---|---|
  | `id` | integer | Site ID |
  | `name` | string | Site display name |
  | `domain` | string \| null | Custom domain (e.g. `"acme.com"`) |
  | `subdomain` | string \| null | Platform subdomain |
  | `description` | string \| null | Site description |
  | `customLayout` | any \| null | Custom layout config; `null` if not set |
  | `branding` | object | Full `ResolvedBranding` object — same shape as `data` in `/branding` |
  | `cssVars` | object | CSS custom properties map — same shape as `cssVars` in `/branding` |
  | `navigation` | array | Full navigation tree — same shape as `data` in `/navigation` |
  | `storeEnabled` | boolean | `true` if an active store is configured for this site |

- **Errors:**

  | Status | Message | Cause |
  |---|---|---|
  | `400` | `"Invalid site ID"` | `siteId` is not a valid integer |
  | `401` | `"Invalid API key"` | Key supplied but invalid or not scoped to this site |
  | `404` | `"Not found"` | No active site found for the given `siteId` |
  | `429` | `"Rate limit exceeded"` | Per-minute rate limit exceeded; check `Retry-After` header |

- **Example:**

  ```bash
  curl https://your-domain.com/api/v1/sites/42/config \
    -H "Authorization: Bearer sd_live_yourkey"
  ```

---

### `GET /api/v1/sites/{siteId}/navigation`

Returns the navigation menu tree for a site. Items are returned as a nested tree (children embedded under their parent), sorted by `sortOrder`.

- **Auth:** API key (optional — same rules as `/branding`)
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | integer | Numeric ID of the target site |

- **Query params:** none

- **Response:**

  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "label": "Home",
        "href": "/",
        "parentId": null,
        "sortOrder": 0,
        "openInNewTab": false,
        "isButton": false,
        "description": null,
        "icon": null,
        "featuredImage": null,
        "columnGroup": null,
        "children": []
      },
      {
        "id": 2,
        "label": "Services",
        "href": "/services",
        "parentId": null,
        "sortOrder": 1,
        "openInNewTab": false,
        "isButton": false,
        "description": "What we offer",
        "icon": null,
        "featuredImage": "https://cdn.example.com/services-thumb.png",
        "columnGroup": 1,
        "children": [
          {
            "id": 5,
            "label": "Web Design",
            "href": "/services/web-design",
            "parentId": 2,
            "sortOrder": 0,
            "openInNewTab": false,
            "isButton": false,
            "description": null,
            "icon": "design_services",
            "featuredImage": null,
            "columnGroup": null,
            "children": []
          }
        ]
      },
      {
        "id": 3,
        "label": "Get Started",
        "href": "/contact",
        "parentId": null,
        "sortOrder": 2,
        "openInNewTab": false,
        "isButton": true,
        "description": null,
        "icon": null,
        "featuredImage": null,
        "columnGroup": null,
        "children": []
      }
    ]
  }
  ```

  **NavItem field reference:**

  | Field | Type | Description |
  |---|---|---|
  | `id` | integer | Unique nav item ID |
  | `label` | string | Display text for the link |
  | `href` | string | Link destination (relative or absolute) |
  | `parentId` | integer \| null | ID of the parent item; `null` for root-level items |
  | `sortOrder` | integer | Display order within siblings; ascending |
  | `openInNewTab` | boolean | Whether to open the link in a new tab |
  | `isButton` | boolean | Render as a CTA button instead of a plain link |
  | `description` | string \| null | Optional subtitle for mega-menu layouts |
  | `icon` | string \| null | Material Icon name for the item |
  | `featuredImage` | string \| null | Image URL for rich mega-menu cards |
  | `columnGroup` | integer \| null | Column grouping hint for multi-column dropdown layouts |
  | `children` | NavItem[] | Nested child items (recursive same shape); empty array if none |

- **Errors:**

  | Status | Message | Cause |
  |---|---|---|
  | `400` | `"Invalid site ID"` | `siteId` is not a valid integer |
  | `401` | `"Invalid API key"` | Key supplied but invalid or not scoped to this site |
  | `404` | `"Not found"` | No active site found for the given `siteId` |
  | `429` | `"Rate limit exceeded"` | Per-minute rate limit exceeded; check `Retry-After` header |

- **Example:**

  ```bash
  curl https://your-domain.com/api/v1/sites/42/navigation \
    -H "Authorization: Bearer sd_live_yourkey"
  ```

---

## Common patterns

### Inject CSS variables into a page

```js
const { cssVars } = await fetch('/api/v1/sites/42/branding', {
  headers: { Authorization: 'Bearer sd_live_yourkey' },
}).then(r => r.json());

const style = document.documentElement.style;
for (const [prop, value] of Object.entries(cssVars)) {
  style.setProperty(prop, value);
}
```

### Bootstrap a full headless render in one request

Use `/config` rather than calling the three endpoints separately — it fetches site metadata, branding, CSS vars, and navigation in parallel server-side and returns them in a single response.

```js
const { data } = await fetch('/api/v1/sites/42/config', {
  headers: { Authorization: 'Bearer sd_live_yourkey' },
}).then(r => r.json());

const { name, branding, cssVars, navigation, storeEnabled } = data;
```

### Render a nav tree recursively

The `children` array is always present (empty array when there are no children), so you can recurse without a null check:

```js
function renderItems(items) {
  return items.map(item => ({
    label: item.label,
    href: item.href,
    isButton: item.isButton,
    openInNewTab: item.openInNewTab,
    children: renderItems(item.children),
  }));
}
```
