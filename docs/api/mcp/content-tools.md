# MCP Tools — Content & Storefront

These tools let you manage every layer of your site's content from an MCP client: websites and pages, media, navigation, taxonomies, reusable block templates, custom post types, branding profiles, and your storefront (products, orders, customers, discounts, and reviews). Most write tools run through an **approval workflow** — when your API key is configured to require approval, mutations return a `pending: true` response with an `approval.url` you or a reviewer must click before the change goes live.

For authentication setup and scope reference, see [MCP Overview](./overview.md).

---

## Approval responses

When a write tool is staged for approval instead of applied immediately, the response shape is:

```json
{
  "pending": true,
  "pendingId": 42,
  "summary": "Create post \"About Us\" on website 7",
  "status": "pending",
  "approval": {
    "url": "https://app.simplerdevelopment.com/approve/abc123",
    "expiresAt": "2026-06-05T08:00:00.000Z"
  }
}
```

Tools that always mint an approval URL (even on direct-apply keys) also return `approval` on success — you can share that link with a reviewer to preview the result.

---

## Websites

### `sites_list`

List all websites owned by your account.

- **Auth:** `sites:read`
- **Inputs:** none

**Response**

```json
[
  {
    "id": 7,
    "clientId": 3,
    "name": "Acme Corp",
    "domain": "acme.com",
    "active": true,
    "publicAccess": true,
    "brandingProfileId": 2,
    "createdAt": "2025-01-10T12:00:00.000Z"
  }
]
```

**Tool call example**

```json
{ "name": "sites_list", "arguments": {} }
```

---

### `sites_update`

Update metadata on a website (name, domain, description, active flag, public-access gating, branding profile). DNS/Vercel provisioning is **not** triggered.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | Website id |
| `name` | `string` | no | |
| `domain` | `string \| null` | no | |
| `description` | `string \| null` | no | |
| `active` | `boolean` | no | |
| `publicAccess` | `boolean` | no | |
| `brandingProfileId` | `number \| null` | no | |

**Response** — the updated website row, plus `approval` if staged.

**Tool call example**

```json
{
  "name": "sites_update",
  "arguments": { "id": 7, "name": "Acme Corp v2", "active": true }
}
```

---

### `sites_get_custom_code`

Get the site-wide custom CSS and JS. Cascade order is: site → CPT → per-post.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

**Response**

```json
{ "customCss": "body { font-size: 16px; }", "customJs": "" }
```

---

### `sites_update_custom_code`

Stage changes to site-wide custom CSS/JS. Changes are written to draft fields and do **not** go live until you call `sites_publish_custom_code`.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | |
| `customCss` | `string` | no | Empty string = stage a clear |
| `customJs` | `string` | no | Empty string = stage a clear |

**Response**

```json
{
  "draftCustomCss": "body { color: red; }",
  "draftCustomJs": "",
  "liveCustomCss": "body { color: black; }",
  "liveCustomJs": "",
  "draftUpdatedAt": "2026-06-04T10:00:00.000Z",
  "note": "Wrote to draft fields. Call sites_publish_custom_code to make changes live."
}
```

---

### `sites_publish_custom_code`

Promote the draft site-wide CSS/JS to live. Copies `draft_custom_css` → `custom_css` and `draft_custom_js` → `custom_js`, then clears the draft fields.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

**Response**

```json
{ "customCss": "body { color: red; }", "customJs": "" }
```

---

## Posts & Pages

### `posts_list`

List content posts for a website. Returns a **slim projection** (no content blob) by default.

- **Auth:** `sites:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | no | |
| `postType` | `string` | no | `blog`, `page`, etc. |
| `publishedOnly` | `boolean` | no | |
| `limit` | `number` | no | Default 50 |
| `includeContent` | `boolean` | no | Default `false` — each block-rich post can be multi-MB |

**Response**

```json
[
  {
    "id": 101,
    "websiteId": 7,
    "title": "About Us",
    "slug": "about-us",
    "postType": "page",
    "published": true,
    "publishedAt": "2026-01-15T09:00:00.000Z",
    "excerpt": null,
    "createdAt": "2026-01-10T08:00:00.000Z"
  }
]
```

---

### `posts_get`

Fetch a single post by id. Prefer this over `posts_list` when you need one post in full.

- **Auth:** `sites:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | |
| `includeContent` | `boolean` | no | Default `false` |

**Response** — the post row (plus `content` / `customCss` / `customJs` / SEO fields if `includeContent: true`).

**Tool call example**

```json
{ "name": "posts_get", "arguments": { "id": 101, "includeContent": true } }
```

---

### `posts_create`

Create a blog post or page. Mints an **approval URL** you can share with a reviewer.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `title` | `string` | yes | |
| `slug` | `string` | yes | |
| `blocks` | `array` | no | Preferred — structured block array |
| `content` | `string` | no | Plain text/HTML fallback; wrapped in a single text block |
| `excerpt` | `string` | no | |
| `postType` | `string` | no | Default `blog` |
| `published` | `boolean` | no | |
| `customCss` | `string` | no | Per-post CSS injected at render time |
| `customJs` | `string` | no | Per-post JS injected at render time |
| `includeContent` | `boolean` | no | Echo full body in response; default `false` |

**Response**

```json
{
  "id": 202,
  "websiteId": 7,
  "title": "New Landing Page",
  "slug": "new-landing",
  "postType": "page",
  "published": false,
  "approval": {
    "url": "https://app.simplerdevelopment.com/approve/xyz789",
    "expiresAt": "2026-06-05T10:00:00.000Z"
  }
}
```

---

### `posts_update`

Update a post. Supports full SEO fields. Mints an approval URL.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | |
| `title` | `string` | no | |
| `blocks` | `array` | no | |
| `content` | `string` | no | |
| `excerpt` | `string` | no | |
| `published` | `boolean` | no | |
| `customCss` | `string \| null` | no | Pass `null` to clear |
| `customJs` | `string \| null` | no | Pass `null` to clear |
| `seoTitle` | `string \| null` | no | |
| `seoDescription` | `string \| null` | no | |
| `ogImage` | `string \| null` | no | |
| `canonicalUrl` | `string \| null` | no | |
| `noIndex` | `boolean` | no | |
| `includeContent` | `boolean` | no | Default `false` |

**Response** — updated slim post row + `approval`.

---

### `posts_fork`

Duplicate a published post into a new draft tied to the original via `parentPostId`. Edit the fork, share its approval URL for review, and publish it when approved without taking the live page down.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | Source post id |
| `titleSuffix` | `string` | no | Default ` (fork)` |

**Response**

```json
{
  "id": 203,
  "title": "About Us (fork)",
  "slug": "about-us-fork-1abc2",
  "parentPostId": 101,
  "published": false,
  "approval": { "url": "https://app.simplerdevelopment.com/approve/forklink" }
}
```

---

### `posts_delete`

Permanently delete a post. Revisions cascade.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

**Response** — `{ "success": true, "id": 101 }` or a pending approval envelope.

---

### `posts_upload_html`

Upload a single HTML/XHTML file (base64-encoded) as a draft `page` post wrapping an `html-embed` block. Nav/header tags are stripped, referenced assets are imported to media, and the cleaned file is stored in S3. Max 1 MB decoded. Restricted to staff-role API keys.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `filename` | `string` | yes | Must end in `.html`, `.htm`, or `.xhtml` |
| `contentBase64` | `string` | yes | Base64-encoded HTML; decoded ≤ 1 MB |
| `sourceUrl` | `string` | no | Used to resolve relative asset refs |

**Response**

```json
{
  "id": 204,
  "title": "my-page",
  "slug": "my-page",
  "postType": "page",
  "published": false,
  "importedAssets": 3,
  "skippedAssets": 1,
  "url": "https://media.example.com/media/uuid.html"
}
```

---

### `posts_upload_html_zip`

Upload a zip archive (base64-encoded) containing `index.html` + supporting assets as a draft `page`. Every file is uploaded to S3; relative refs resolve through a shared media-proxy prefix. Limits: 50 MB uncompressed, 200 files, 10 MB per file. Restricted to staff-role API keys.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `filename` | `string` | yes | Must end in `.zip` |
| `contentBase64` | `string` | yes | Base64-encoded zip; decoded ≤ 50 MB |

**Response** — same shape as `posts_upload_html` plus `bundleFileCount` (number of files extracted from the zip) and `bundlePrefix` (the shared S3 key prefix for all extracted files).

---

### `posts_list_revisions`

Revision history for a post (autosaves, manual saves, publishes).

- **Auth:** `sites:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `postId` | `number` | yes | |
| `limit` | `number` | no | Default 25, max 100 |

**Response** — array of revision rows ordered newest-first.

---

## Taxonomies (Categories & Tags)

### `taxonomies_list`

List categories and tags for a website.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |

**Response**

```json
{
  "categories": [{ "id": 5, "name": "News", "slug": "news", "color": "#2563eb" }],
  "tags": [{ "id": 12, "name": "announcement", "slug": "announcement" }]
}
```

---

### `taxonomies_create_category`

Create a category on a website. May be staged for approval.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `name` | `string` | yes | |
| `slug` | `string` | no | Derived from name if omitted |
| `description` | `string` | no | |
| `color` | `string` | no | Hex color, e.g. `#2563eb` |

---

### `taxonomies_create_tag`

Create a tag on a website.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `name` | `string` | yes | |
| `slug` | `string` | no | Derived from name if omitted |

---

### `posts_set_taxonomies`

Replace the categories and/or tags assigned to a post. Call `taxonomies_list` first to look up ids. Omitted arrays are left unchanged.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `postId` | `number` | yes |
| `categoryIds` | `number[]` | no |
| `tagIds` | `number[]` | no |

**Response**

```json
{ "postId": 101, "categoryIds": [5], "tagIds": [12, 14] }
```

---

## Media

### `media_list`

List uploaded media assets for your account.

- **Auth:** `media:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `limit` | `number` | no | Default 50 |

**Response** — array of media rows (id, filename, mimeType, fileSize, url, alt, caption, createdAt).

---

### `media_upload_from_url`

Fetch a public URL and store the file in your media library. Max 25 MB. SSRF-guarded — internal/private URLs are rejected.

- **Auth:** `media:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `url` | `string` | yes | Public `http(s)` URL |
| `filename` | `string` | no | Overrides the filename derived from the URL path |
| `alt` | `string` | no | |
| `caption` | `string` | no | |
| `websiteId` | `number` | no | Scope to a specific site |
| `brandingProfileId` | `number` | no | |

**Response** — the new media row including `url` (the internal URL to use in posts, decks, emails).

**Tool call example**

```json
{
  "name": "media_upload_from_url",
  "arguments": {
    "url": "https://example.com/hero.jpg",
    "alt": "Hero image",
    "websiteId": 7
  }
}
```

---

### `media_upload_presign`

Mint a short-lived S3 PUT URL for a direct local-file upload. After your `curl --upload-file` succeeds, call `media_register` to create the media row.

Allowed MIME types: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif`, `image/svg+xml`, `application/pdf`, `video/mp4`, `video/webm`, `video/quicktime`, `audio/mpeg`, `audio/ogg`, `audio/wav`. Max 25 MB.

- **Auth:** `media:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `filename` | `string` | yes | |
| `mimeType` | `string` | yes | Must be in the allow-list |
| `fileSize` | `number` | yes | Exact byte count, max 25 MB |

**Response**

```json
{
  "mediaKey": "media/uuid.jpg",
  "storedFilename": "uuid.jpg",
  "uploadUrl": "https://s3.amazonaws.com/bucket/media/uuid.jpg?X-Amz-...",
  "requiredHeaders": { "Content-Type": "image/jpeg", "Content-Length": "204800" },
  "expiresAt": "2026-06-04T09:05:00.000Z"
}
```

**Typical two-step flow**

```bash
# Step 1 — presign
RESULT=$(mcp call media_upload_presign '{"filename":"hero.jpg","mimeType":"image/jpeg","fileSize":204800}')
UPLOAD_URL=$(echo $RESULT | jq -r '.uploadUrl')
MEDIA_KEY=$(echo $RESULT | jq -r '.mediaKey')

# Step 2 — upload directly to S3
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --upload-file ./hero.jpg

# Step 3 — register
mcp call media_register "{\"mediaKey\":\"$MEDIA_KEY\",\"originalFilename\":\"hero.jpg\",\"mimeType\":\"image/jpeg\"}"
```

---

### `media_register`

Finalize a presigned-upload flow: HEAD the S3 object, verify the size cap, and insert a media row. Pairs with `media_upload_presign`.

- **Auth:** `media:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `mediaKey` | `string` | yes | Must start with `media/` |
| `originalFilename` | `string` | yes | |
| `mimeType` | `string` | yes | |
| `alt` | `string` | no | |
| `caption` | `string` | no | |
| `websiteId` | `number` | no | |
| `brandingProfileId` | `number` | no | |

**Response** — the new media row.

---

### `media_delete`

Permanently delete a media asset from the library (does not remove the S3 object).

- **Auth:** `media:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

**Response** — `{ "success": true, "id": 55 }`

---

## Navigation

Nav changes use a **draft overlay**: `nav_create`, `nav_update`, and `nav_delete` all write to a `draft` JSON field and leave the live nav untouched until you call `nav_publish` or `nav_publish_all`.

### `nav_list`

List nav items for a website, sorted by `sortOrder`. Hierarchical via `parentId`.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |

**Response** — array of nav rows including `draft` overlay if pending.

---

### `nav_create`

Stage a new nav item (draft only — hidden from the live nav until `nav_publish`).

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `label` | `string` | yes | |
| `href` | `string` | yes | |
| `parentId` | `number` | no | For nested items |
| `sortOrder` | `number` | no | |
| `openInNewTab` | `boolean` | no | |
| `isButton` | `boolean` | no | Renders as a CTA button |
| `description` | `string` | no | |
| `icon` | `string` | no | Material Icon name |

---

### `nav_update`

Stage changes to a nav item into its draft overlay. Live columns are untouched until `nav_publish`.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |
| `label` | `string` | no |
| `href` | `string` | no |
| `parentId` | `number \| null` | no |
| `sortOrder` | `number` | no |
| `openInNewTab` | `boolean` | no |
| `isButton` | `boolean` | no |
| `description` | `string \| null` | no |
| `icon` | `string \| null` | no |

---

### `nav_delete`

Stage a tombstone on a nav item (`draft.pendingDelete`). The row and live nav are unchanged until `nav_publish` runs.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

### `nav_publish`

Promote a single nav item's draft to live. If `pendingDelete`: row is removed. If `pendingCreate`: item becomes visible. Otherwise: draft fields are applied to live columns.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

### `nav_publish_all`

Promote every nav row with a non-null draft on a website in one call. Same per-row semantics as `nav_publish`.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |

**Response**

```json
{ "websiteId": 7, "count": 3, "items": [{ "id": 10, "published": true }, { "id": 11, "deleted": true }] }
```

---

## Block Templates

Block templates are reusable block trees you can insert into any post. They follow the same **draft overlay pattern** as navigation: create/update/delete stage into a `draft` jsonb field; `block_templates_publish` makes them live.

`scope` values:
- `block` — copy-on-insert; post gets its own detached copy.
- `section` — copy-on-insert at section level.
- `global` — posts embed a live reference; when you update and publish the template, all embedders sync automatically (version is bumped).

### `block_templates_list`

List reusable block templates. Returns global (platform-curated) + your client's own templates.

- **Auth:** `sites:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `category` | `"custom" \| "section" \| "global"` | no | |
| `scope` | `"block" \| "section" \| "global"` | no | |

**Response** — slim projection (no `blocks` JSON blob). Call `block_templates_get` for the full tree.

---

### `block_templates_get`

Fetch a full template including its `blocks` JSON.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

### `block_templates_create`

Create a new reusable block template (starts as a draft — hidden from the picker until published).

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | |
| `slug` | `string` | yes | Lowercase alphanumeric + hyphens; globally unique |
| `blocks` | `array` | yes | At least one block |
| `description` | `string` | no | |
| `category` | `string` | no | Default `custom` |
| `scope` | `"block" \| "section" \| "global"` | no | Default `block` |
| `thumbnail` | `string` | no | URL |
| `tags` | `string[]` | no | |
| `lockedFields` | `string[]` | no | Field paths that can't be edited when the template is reused |

**Response** — new template row + `approval` URL.

---

### `block_templates_update`

Stage changes to a block template into its draft overlay. Live columns and `version` are untouched until `block_templates_publish`.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |
| `name` | `string` | no |
| `description` | `string \| null` | no |
| `category` | `string` | no |
| `scope` | `"block" \| "section" \| "global"` | no |
| `blocks` | `array` | no |
| `thumbnail` | `string \| null` | no |
| `tags` | `string[]` | no |
| `lockedFields` | `string[]` | no |

---

### `block_templates_delete`

Stage a tombstone on a block template. Blocked if any posts currently embed it as a global template — remove or convert those usages first.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

### `block_templates_publish`

Promote a block template's draft to live. If `pendingDelete`: row is removed. If `pendingCreate`: template appears in picker. Otherwise: draft fields applied to live columns; `version` is bumped when `blocks` changed (triggers sync on global embedders).

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

### `block_templates_fork`

Duplicate a published block template into a new draft tied to the original via `parent_template_id`. Use when you want to build a variant without modifying the source. Returns the new template id + an approval URL.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | Source template id |
| `nameSuffix` | `string` | no | Default ` (fork)` |
| `slugSuffix` | `string` | no | Appended before the unique fork tag in the new slug |

---

## Custom Domains

### `website_domains_list`

List custom domains attached to a website.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |

**Response**

```json
[{ "id": 3, "websiteId": 7, "domain": "acme.com", "isPrimary": true, "status": "pending" }]
```

---

### `website_domains_add`

Attach a custom domain to a website. Starts in `pending` status until DNS verification. Does **not** provision DNS records — you must configure them externally.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `domain` | `string` | yes | |
| `isPrimary` | `boolean` | no | Unsets the existing primary if `true` |

---

### `website_domains_remove`

Detach a custom domain. Does not affect external DNS.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

## Environment Variables

### `website_env_vars_list`

List env vars for a website environment. **Values are included — treat output as secrets.**

- **Auth:** `sites:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `environment` | `string` | no | Default `production` |

**Response** — array of `{ id, key, value, syncedToVercel }` rows, sorted by key.

---

### `website_env_vars_set`

Upsert an env var (creates or overwrites). Sets `syncedToVercel: false` — actual Vercel sync happens via the portal UI.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `environment` | `string` | no | Default `production` |
| `key` | `string` | yes | |
| `value` | `string` | yes | |

---

### `website_env_vars_delete`

Remove an env var by id.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

## Custom Post Types

Custom post types (CPTs) extend the CMS beyond `blog` and `page`. You can define custom field schemas, a block-tree template that wraps every post, and per-type CSS/JS. Reads use `sites:read`; writes use `sites:write`. Only site-owned CPTs are editable; built-in/global types (managed by admins) are read-only.

### `post_types_list`

List CPTs available on a website (site-specific + global built-ins).

- **Auth:** `sites:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `siteOnly` | `boolean` | no | `true` = exclude global built-ins |

---

### `post_types_get`

Fetch a single CPT including its template and custom code.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |

---

### `post_types_create`

Create a new CPT scoped to a website. Slug must be unique within the site and must not collide with global types.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `name` | `string` | yes | |
| `slug` | `string` | yes | Lowercase alphanumeric + hyphens |
| `description` | `string \| null` | no | |
| `icon` | `string` | no | Material Icon name; default `article` |

**Response** — the new post type row.

---

### `post_types_update`

Update the name, slug, description, icon, or active flag of a site-owned CPT.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |
| `name` | `string` | no |
| `slug` | `string` | no |
| `description` | `string \| null` | no |
| `icon` | `string` | no |
| `active` | `boolean` | no |

---

### `post_types_delete`

Permanently delete a site-owned CPT. Posts of that type cascade to deletion.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |

---

### `post_types_get_template`

Get the block-tree template that wraps every post of this CPT. The template always contains exactly one `{ type: "post-content" }` placeholder — at render time the post's own blocks are substituted in. Returns `{ template, defaulted: true }` if no template has been saved yet.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |

---

### `post_types_update_template`

Replace the block-tree template for a CPT. The server enforces "exactly one post-content placeholder" — extras are dropped (first wins), and a placeholder is prepended if absent. Pass `template: null` to reset to the default starter.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `typeId` | `number` | yes | |
| `template` | `object \| null` | no | `{ blocks: [...], version?: string }` |

---

### `post_types_get_code`

Get the type-wide custom CSS and JS that cascades to every post of this CPT.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |

**Response** — `{ "customCss": "...", "customJs": "..." }`

---

### `post_types_update_code`

Update the type-wide custom CSS/JS. Pass an empty string to clear a field; omit to leave unchanged.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |
| `customCss` | `string` | no |
| `customJs` | `string` | no |

---

### `post_types_fields_list`

List custom field definitions for a CPT, ordered by `order`. Children of `repeater`/`group` fields have `parentId` set.

- **Auth:** `sites:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |

---

### `post_types_fields_create`

Add a custom field to a CPT.

- **Auth:** `sites:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `typeId` | `number` | yes | |
| `name` | `string` | yes | |
| `slug` | `string` | yes | |
| `fieldType` | `string` | yes | `text`, `textarea`, `number`, `date`, `select`, `checkbox`, `url`, `email`, `image`, `user_select`, `repeater`, `group` |
| `parentId` | `number \| null` | no | For children of `repeater`/`group` fields |
| `options` | `string[]` | no | Required for `select` type |
| `required` | `boolean` | no | |
| `defaultValue` | `string \| null` | no | |
| `helpText` | `string \| null` | no | |
| `order` | `number` | no | |

---

### `post_types_fields_update`

Update a custom field. Reparenting (`parentId`) requires the new parent to be a `repeater` or `group` on the same CPT.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |
| `fieldId` | `number` | yes |
| (any field from `fields_create`)| — | no |

---

### `post_types_fields_delete`

Delete a custom field. Stored values cascade. For `repeater`/`group` parents, child fields cascade too.

- **Auth:** `sites:write`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |
| `typeId` | `number` | yes |
| `fieldId` | `number` | yes |

---

## Branding

Branding profiles hold your color palette, fonts, logos, and brand voice copy. Reads use `branding:read`; writes use `branding:write`.

### `branding_list_profiles`

List all branding profiles for your account.

- **Auth:** `branding:read`
- **Inputs:** none

**Response** — array of profile rows (id, name, isDefault, colors, fonts, logo URLs).

---

### `branding_get_profile`

Fetch a full branding profile (colors, fonts, logos, button style). Omit `profileId` to get the default profile.

- **Auth:** `branding:read`

| Input | Type | Required |
|---|---|---|
| `profileId` | `number` | no |

---

### `branding_get_messaging`

Fetch brand voice and copy context: tagline, value proposition, elevator pitch, tone, voice samples, differentiators.

- **Auth:** `branding:read`

| Input | Type | Required |
|---|---|---|
| `profileId` | `number` | no |

**Response**

```json
{
  "tagline": "Build better, ship faster.",
  "valueProposition": "...",
  "elevatorPitch": "...",
  "toneOfVoice": "confident, approachable",
  "keyDifferentiators": ["no-code", "AI-first"],
  "targetAudience": "SMB agencies"
}
```

---

### `branding_audit`

Run the rule-based consistency audit on a branding profile. Returns WCAG contrast issues, missing-field warnings, and structural problems.

- **Auth:** `branding:read`

| Input | Type | Required |
|---|---|---|
| `profileId` | `number` | yes |

---

### `branding_check_contrast`

Compute the WCAG contrast ratio between two CSS colors. Returns the ratio plus AA/AAA pass/fail.

- **Auth:** `branding:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `foreground` | `string` | yes | Hex, rgb, or rgba |
| `background` | `string` | yes | Hex, rgb, or rgba |

**Response**

```json
{ "ratio": 4.56, "aa": true, "aaa": false }
```

---

### `branding_create_profile`

Create a new branding profile.

- **Auth:** `branding:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | |
| `isDefault` | `boolean` | no | `true` = unsets any existing default |
| `primaryColor` | `string` | no | Default `#2563eb` |
| `secondaryColor` | `string` | no | Default `#1e40af` |
| `accentColor` | `string` | no | Default `#f59e0b` |
| `backgroundColor` | `string` | no | Default `#ffffff` |
| `textColor` | `string` | no | Default `#111827` |
| `headingFont` | `string` | no | |
| `bodyFont` | `string` | no | |
| `logoUrl` | `string` | no | |
| `logoText` | `string` | no | |
| `logoSquareUrl` | `string` | no | |
| `logoRectUrl` | `string` | no | |
| `logoIconUrl` | `string` | no | |
| `logoAlt` | `string` | no | |

---

### `branding_update_profile`

Update any combination of colors, fonts, logos, or the `isDefault` flag on an existing profile.

- **Auth:** `branding:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `profileId` | `number` | yes | |
| `name` | `string` | no | |
| `isDefault` | `boolean` | no | |
| `primaryColor` / `secondaryColor` / `accentColor` / `backgroundColor` / `textColor` | `string` | no | |
| `headingFont` / `bodyFont` | `string \| null` | no | |
| `logoUrl` / `logoText` / `logoSquareUrl` / `logoRectUrl` / `logoIconUrl` / `logoAlt` | `string \| null` | no | |
| `borderRadius` | `string` | no | |
| `linkColor` / `linkHoverColor` | `string \| null` | no | |

---

### `branding_delete_profile`

Permanently delete a branding profile. Sites that referenced it fall back to the client default.

- **Auth:** `branding:write`

| Input | Type | Required |
|---|---|---|
| `profileId` | `number` | yes |

---

### `branding_update_messaging`

Update brand voice / copy context (tagline, elevator pitch, value prop, tone, audience, differentiators). Creates the row if it does not exist yet. Pass `profileId` to scope messaging to a specific profile; omit for the client-level default.

- **Auth:** `branding:write`

| Input | Type | Required |
|---|---|---|
| `profileId` | `number` | no |
| `companyName` | `string` | no |
| `tagline` | `string` | no |
| `missionStatement` | `string` | no |
| `visionStatement` | `string` | no |
| `valueProposition` | `string` | no |
| `elevatorPitch` | `string` | no |
| `boilerplate` | `string` | no |
| `toneOfVoice` | `string` | no |
| `brandPersonality` | `string` | no |
| `writingStyle` | `string` | no |
| `keyDifferentiators` | `string[]` | no |
| `targetAudience` | `string` | no |
| `industry` | `string` | no |

---

## Storefront

Storefront tools are website-scoped — all reads require `store:read`, all writes require `store:write`.

### Products

#### `store_products_list`

List products for a website. Filter by status, category, featured flag, or search term.

- **Auth:** `store:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `status` | `"draft" \| "active" \| "archived"` | no | |
| `categoryId` | `number` | no | |
| `featured` | `boolean` | no | |
| `search` | `string` | no | Case-insensitive match on name or SKU |
| `limit` | `number` | no | Default 100, max 500 |

---

#### `store_products_get`

Fetch a product including all its images and variants.

- **Auth:** `store:read`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

**Response**

```json
{
  "product": { "id": 1, "name": "T-Shirt", "price": 2999, "status": "active" },
  "images": [{ "id": 10, "url": "...", "order": 0 }],
  "variants": [{ "id": 20, "name": "Large / Red", "price": 2999 }]
}
```

---

#### `store_products_create`

Create a new product. Price is in **cents**. Starts in `draft` status — use `store_products_update` to activate.

- **Auth:** `store:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `name` | `string` | yes | |
| `price` | `number` | yes | Cents |
| `slug` | `string` | no | Derived from name if omitted |
| `description` | `string` | no | |
| `shortDescription` | `string` | no | |
| `compareAtPrice` | `number` | no | Cents |
| `sku` | `string` | no | |
| `categoryId` | `number` | no | |
| `trackInventory` | `boolean` | no | Default `true` |
| `quantity` | `number` | no | Default `0` |
| `weight` | `number` | no | |
| `weightUnit` | `"g" \| "kg" \| "oz" \| "lb"` | no | |
| `tags` | `string[]` | no | |
| `featured` | `boolean` | no | |
| `status` | `"draft" \| "active" \| "archived"` | no | Default `draft` |

---

#### `store_products_update`

Update any mutable field on a product. For images and variants, use their dedicated tools.

- **Auth:** `store:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | |
| `name` | `string` | no | |
| `slug` | `string` | no | |
| `description` | `string \| null` | no | |
| `shortDescription` | `string \| null` | no | |
| `price` | `number` | no | Cents |
| `compareAtPrice` | `number \| null` | no | |
| `sku` | `string \| null` | no | |
| `categoryId` | `number \| null` | no | |
| `trackInventory` | `boolean` | no | |
| `quantity` | `number` | no | Absolute quantity — for delta use `store_products_adjust_inventory` |
| `tags` | `string[]` | no | |
| `featured` | `boolean` | no | |
| `status` | `"draft" \| "active" \| "archived"` | no | |

---

#### `store_products_delete`

Permanently delete a product. Images and variants cascade. Order items retain historical data via `productName`/`variantName`.

- **Auth:** `store:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

#### `store_products_adjust_inventory`

Adjust product quantity by a positive or negative delta. Use `store_products_update` to SET an absolute quantity.

- **Auth:** `store:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | |
| `delta` | `number` | yes | e.g. `-3` to decrement, `+10` to restock. Returns error if result would go below 0. |

---

#### `store_product_options_create`

Add a product option axis (e.g. "Size", "Color"). Use `store_product_option_values_create` to add its values.

- **Auth:** `store:write`

| Input | Type | Required |
|---|---|---|
| `productId` | `number` | yes |
| `name` | `string` | yes |
| `order` | `number` | no |

---

#### `store_product_option_values_create`

Add a value (e.g. "Red", "Large") to an existing product option.

- **Auth:** `store:write`

| Input | Type | Required |
|---|---|---|
| `optionId` | `number` | yes |
| `value` | `string` | yes |
| `label` | `string` | no |
| `order` | `number` | no |

---

#### `store_product_variants_create`

Create a product variant. `optionValues` ties the variant to specific option values (e.g. Size=Large, Color=Red). Price in cents.

- **Auth:** `store:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `productId` | `number` | yes | |
| `name` | `string` | yes | |
| `price` | `number` | yes | Cents |
| `sku` | `string` | no | |
| `compareAtPrice` | `number` | no | |
| `quantity` | `number` | no | |
| `optionValues` | `Array<{ optionId: number, valueId: number }>` | no | |
| `image` | `string` | no | URL |

---

#### `store_product_variants_update`

Update any mutable field on a variant.

- **Auth:** `store:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |
| `name` | `string` | no |
| `sku` | `string \| null` | no |
| `price` | `number` | no |
| `compareAtPrice` | `number \| null` | no |
| `quantity` | `number` | no |
| `active` | `boolean` | no |
| `image` | `string \| null` | no |

---

### Product Categories

#### `store_categories_list`

List product categories for a website.

- **Auth:** `store:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |

---

#### `store_categories_create`

Create a product category. Supports parent/child hierarchy via `parentId`.

- **Auth:** `store:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `name` | `string` | yes | |
| `slug` | `string` | no | Derived from name if omitted |
| `description` | `string` | no | |
| `parentId` | `number` | no | |
| `image` | `string` | no | URL |

---

### Orders

#### `store_orders_list`

List orders for a website. Filter by status, payment status, customer email, or date.

- **Auth:** `store:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `status` | `string` | no | `pending`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded` |
| `paymentStatus` | `string` | no | `pending`, `paid`, `failed`, `refunded` |
| `customerEmail` | `string` | no | |
| `since` | `string` | no | ISO datetime — only orders created after this |
| `limit` | `number` | no | Default 100, max 500 |

---

#### `store_orders_get`

Fetch order detail: the order row, line items, and full status history.

- **Auth:** `store:read`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

**Response**

```json
{
  "order": { "id": 55, "orderNumber": "ORD-0055", "status": "processing", "total": 5998 },
  "items": [{ "id": 1, "productName": "T-Shirt", "quantity": 2, "unitPrice": 2999 }],
  "history": [{ "status": "pending", "createdAt": "..." }, { "status": "processing", "createdAt": "..." }]
}
```

---

#### `store_orders_update_status`

Transition an order through fulfillment states. Stamps `shippedAt`/`deliveredAt` automatically. Does **not** send customer notifications.

- **Auth:** `store:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | |
| `status` | `string` | yes | `pending`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded` |
| `note` | `string` | no | Stored in status history |
| `trackingNumber` | `string` | no | |
| `trackingUrl` | `string` | no | |
| `shippingMethod` | `string` | no | |

---

#### `store_analytics_get`

Return order and revenue aggregates for a storefront over a time window: total revenue, order count, average order value, and order counts by status. The `siteId` must belong to the authenticated client.

- **Auth:** `store:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `siteId` | `number` | yes | Website whose store to analyse |
| `days` | `number` | no | Look-back window in days, 1–365 (default 30) |

**Response**

```json
{
  "totalRevenue": 124900,
  "totalOrders": 42,
  "averageOrderValue": 2974,
  "ordersByStatus": { "processing": 5, "shipped": 30, "delivered": 7 },
  "windowDays": 30
}
```

---

#### `store_orders_add_note`

Append or overwrite the internal staff-only note on an order. Does not affect customer-facing fields.

- **Auth:** `store:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | `number` | yes | |
| `note` | `string` | yes | |
| `mode` | `"append" \| "replace"` | no | Default `append` |

---

### Customers

#### `store_customers_list`

List storefront customers. Filter by status or search by email/name.

- **Auth:** `store:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `status` | `"active" \| "disabled"` | no | |
| `search` | `string` | no | |
| `limit` | `number` | no | Default 100, max 500 |

**Response** — slim projection: id, email, first/last name, phone, status, `orderCount`, `totalSpent`.

---

#### `store_customers_get`

Fetch a store customer (PII-included but no password hash). Returns up to 10 recent orders.

- **Auth:** `store:read`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

### Discounts

#### `store_discounts_list`

List discount codes for a website.

- **Auth:** `store:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `activeOnly` | `boolean` | no | Default `false` |

---

#### `store_discounts_create`

Create a discount code. `percent` amounts are in basis points (1000 = 10%); `fixed_amount` amounts are in cents.

- **Auth:** `store:write`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `code` | `string` | yes | Stored uppercased |
| `discountType` | `"percent" \| "fixed_amount" \| "free_shipping"` | yes | |
| `amount` | `number` | yes | Basis points for `percent`; cents for `fixed_amount`; `0` for `free_shipping` |
| `description` | `string` | no | |
| `minOrderAmount` | `number` | no | Cents |
| `maxUses` | `number` | no | |
| `startsAt` | `string` | no | ISO datetime |
| `expiresAt` | `string` | no | ISO datetime |
| `applicableTo` | `"store" \| "booking" \| "both"` | no | Default `store` |

---

#### `store_discounts_toggle`

Flip the `active` flag on a discount code.

- **Auth:** `store:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |
| `active` | `boolean` | yes |

---

#### `store_discounts_delete`

Permanently delete a discount code.

- **Auth:** `store:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |

---

### Reviews

#### `store_reviews_list`

List product reviews across a website. Filter by approval status and/or product.

- **Auth:** `store:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `status` | `"pending" \| "approved" \| "rejected"` | no | |
| `productId` | `number` | no | |
| `limit` | `number` | no | Default 100, max 500 |

---

#### `store_reviews_moderate`

Approve or reject a product review.

- **Auth:** `store:write`

| Input | Type | Required |
|---|---|---|
| `id` | `number` | yes |
| `action` | `"approve" \| "reject"` | yes |

---

### Customer Support Messages

#### `store_customer_messages_list`

List customer support messages for a website.

- **Auth:** `store:read`

| Input | Type | Required | Notes |
|---|---|---|---|
| `websiteId` | `number` | yes | |
| `status` | `string` | no | e.g. `open`, `replied` |
| `limit` | `number` | no | Default 50, max 200 |

---

#### `store_customer_messages_reply`

Post a staff reply on a customer support thread. Does **not** email the customer.

- **Auth:** `store:write`

| Input | Type | Required |
|---|---|---|
| `messageId` | `number` | yes |
| `body` | `string` | yes |

---

### Store Settings

#### `store_settings_get`

Get storefront configuration for a website (currency, tax, shipping, payout schedule, enabled flag).

- **Auth:** `store:read`

| Input | Type | Required |
|---|---|---|
| `websiteId` | `number` | yes |

---

## Common Errors

| Response field | Meaning |
|---|---|
| `{ "error": "Site not found" }` | `websiteId` doesn't exist or belongs to another client |
| `{ "error": "Permission denied" }` | Resource belongs to a different tenant |
| `Permission denied: this API key lacks the "X" scope.` (isError) | Your API key is missing the required scope |
| `{ "error": "Post not found" }` | `id` not found |
| `{ "error": "Could not create (likely duplicate slug): ..." }` | Unique constraint violation |
| `{ "pending": true, ... }` | Write staged for approval; follow `approval.url` |
