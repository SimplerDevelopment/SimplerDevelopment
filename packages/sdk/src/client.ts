import type { SimplerDevelopmentConfig } from './types';
import type { FetchOptions } from './utils/fetch';
import { ConfigResource } from './resources/config';
import { BrandingResource } from './resources/branding';
import { NavigationResource } from './resources/navigation';
import { PostsResource } from './resources/posts';
import { PagesResource } from './resources/pages';
import { CategoriesResource } from './resources/categories';
import { TagsResource } from './resources/tags';
import { MediaResource } from './resources/media';
import { ProductsResource } from './resources/products';
import { ProductCategoriesResource } from './resources/product-categories';
import { BlocksResource } from './resources/blocks';

const DEFAULT_BASE_URL = 'https://simplerdevelopment.com';

export class SimplerDevelopment {
  readonly config: ConfigResource;
  readonly branding: BrandingResource;
  readonly navigation: NavigationResource;
  readonly posts: PostsResource;
  readonly pages: PagesResource;
  readonly categories: CategoriesResource;
  readonly tags: TagsResource;
  readonly media: MediaResource;
  readonly products: ProductsResource;
  readonly productCategories: ProductCategoriesResource;
  readonly blocks: BlocksResource;

  constructor(options: SimplerDevelopmentConfig) {
    const opts: FetchOptions = {
      baseUrl: options.baseUrl || DEFAULT_BASE_URL,
      siteId: options.siteId,
      apiKey: options.apiKey,
      customFetch: options.fetch || globalThis.fetch.bind(globalThis),
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
}
