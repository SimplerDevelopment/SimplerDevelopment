// src/utils/errors.ts
var SDKError = class extends Error {
  constructor(message, status, response) {
    super(message);
    this.status = status;
    this.response = response;
    this.name = "SDKError";
  }
};
var NotFoundError = class extends SDKError {
  constructor(resource) {
    super(`${resource} not found`, 404);
    this.name = "NotFoundError";
  }
};
var UnauthorizedError = class extends SDKError {
  constructor() {
    super("Invalid API key", 401);
    this.name = "UnauthorizedError";
  }
};
var RateLimitError = class extends SDKError {
  constructor(retryAfter) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s`, 429);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
};

// src/utils/fetch.ts
async function apiFetch(opts, path, params) {
  const url = new URL(`/api/v1/sites/${opts.siteId}${path}`, opts.baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== void 0 && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const headers = {};
  if (opts.apiKey) {
    headers["x-api-key"] = opts.apiKey;
  }
  const response = await opts.customFetch(url.toString(), { headers });
  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 404) throw new NotFoundError(path);
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
    throw new RateLimitError(retryAfter);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new SDKError(
      body?.message || `Request failed with status ${response.status}`,
      response.status,
      body
    );
  }
  return response.json();
}

// src/resources/config.ts
var ConfigResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async get() {
    const res = await apiFetch(this.opts, "/config");
    return res.data;
  }
};

// src/resources/branding.ts
var BrandingResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async get() {
    const res = await apiFetch(this.opts, "/branding");
    return { branding: res.data, cssVars: res.cssVars };
  }
};

// src/resources/navigation.ts
var NavigationResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async get() {
    const res = await apiFetch(this.opts, "/navigation");
    return res.data;
  }
};

// src/resources/posts.ts
var PostsResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async list(params) {
    const res = await apiFetch(this.opts, "/posts", params);
    return { data: res.data, pagination: res.pagination };
  }
  async get(slug) {
    const res = await apiFetch(this.opts, `/posts/${encodeURIComponent(slug)}`);
    return res.data;
  }
};

// src/resources/pages.ts
var PagesResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async list(params) {
    const res = await apiFetch(this.opts, "/pages", params);
    return { data: res.data, pagination: res.pagination };
  }
};

// src/resources/categories.ts
var CategoriesResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async list() {
    const res = await apiFetch(this.opts, "/categories");
    return res.data;
  }
};

// src/resources/tags.ts
var TagsResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async list() {
    const res = await apiFetch(this.opts, "/tags");
    return res.data;
  }
};

// src/resources/media.ts
var MediaResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async list(params) {
    const res = await apiFetch(this.opts, "/media", params);
    return { data: res.data, pagination: res.pagination };
  }
};

// src/resources/products.ts
var ProductsResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async list(params) {
    const res = await apiFetch(this.opts, "/products", params);
    return { data: res.data, pagination: res.pagination };
  }
  async get(slug) {
    const res = await apiFetch(this.opts, `/products/${encodeURIComponent(slug)}`);
    return res.data;
  }
};

// src/resources/product-categories.ts
var ProductCategoriesResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async list() {
    const res = await apiFetch(this.opts, "/product-categories");
    return res.data;
  }
};

// src/resources/blocks.ts
var BlocksResource = class {
  constructor(opts) {
    this.opts = opts;
  }
  async list() {
    const res = await apiFetch(this.opts, "/blocks");
    return res.data;
  }
};

// src/client.ts
var DEFAULT_BASE_URL = "https://simplerdevelopment.com";
var SimplerDevelopment = class {
  constructor(options) {
    const opts = {
      baseUrl: options.baseUrl || DEFAULT_BASE_URL,
      siteId: options.siteId,
      apiKey: options.apiKey,
      customFetch: options.fetch || globalThis.fetch.bind(globalThis)
    };
    this.config = new ConfigResource(opts);
    this.branding = new BrandingResource(opts);
    this.navigation = new NavigationResource(opts);
    this.posts = new PostsResource(opts);
    this.pages = new PagesResource(opts);
    this.categories = new CategoriesResource(opts);
    this.tags = new TagsResource(opts);
    this.media = new MediaResource(opts);
    this.products = new ProductsResource(opts);
    this.productCategories = new ProductCategoriesResource(opts);
    this.blocks = new BlocksResource(opts);
  }
};
export {
  NotFoundError,
  RateLimitError,
  SDKError,
  SimplerDevelopment,
  UnauthorizedError
};
//# sourceMappingURL=index.mjs.map