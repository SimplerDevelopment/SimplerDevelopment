import { describe, it, expect } from 'vitest';
import {
  blogCategories,
  blogPosts,
  getBlogPostBySlug,
  getAllBlogPosts,
  getFeaturedBlogPosts,
  getBlogPostsByCategory,
  getCategoryBySlug,
  getAllCategories,
  type BlogCategory,
  type BlogPost,
} from '../../lib/data/blog';

describe('blogCategories', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(blogCategories)).toBe(true);
    expect(blogCategories.length).toBeGreaterThan(0);
  });

  it('every category has the required shape', () => {
    for (const cat of blogCategories) {
      expect(typeof cat.slug).toBe('string');
      expect(cat.slug.length).toBeGreaterThan(0);
      expect(typeof cat.name).toBe('string');
      expect(cat.name.length).toBeGreaterThan(0);
      expect(typeof cat.description).toBe('string');
      expect(cat.description.length).toBeGreaterThan(0);
      expect(typeof cat.color).toBe('string');
      // Color is a hex value starting with #
      expect(cat.color.startsWith('#')).toBe(true);
    }
  });

  it('category slugs are unique', () => {
    const slugs = blogCategories.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('contains expected known categories', () => {
    const slugs = blogCategories.map((c) => c.slug);
    expect(slugs).toContain('design');
    expect(slugs).toContain('development');
    expect(slugs).toContain('ai-automation');
    expect(slugs).toContain('growth');
    expect(slugs).toContain('case-studies');
  });
});

describe('blogPosts', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(blogPosts)).toBe(true);
    expect(blogPosts.length).toBeGreaterThan(0);
  });

  it('every post has the required shape', () => {
    for (const post of blogPosts) {
      expect(typeof post.id).toBe('string');
      expect(post.id.length).toBeGreaterThan(0);
      expect(typeof post.slug).toBe('string');
      expect(post.slug.length).toBeGreaterThan(0);
      expect(typeof post.title).toBe('string');
      expect(post.title.length).toBeGreaterThan(0);
      expect(typeof post.excerpt).toBe('string');
      expect(post.excerpt.length).toBeGreaterThan(0);
      expect(typeof post.content).toBe('string');
      expect(post.content.length).toBeGreaterThan(0);
      expect(typeof post.category).toBe('string');
      expect(typeof post.author).toBe('string');
      expect(post.author.length).toBeGreaterThan(0);
      expect(typeof post.publishedAt).toBe('string');
      // publishedAt should be parseable as a date
      expect(Number.isNaN(new Date(post.publishedAt).getTime())).toBe(false);
      expect(typeof post.readTime).toBe('number');
      expect(post.readTime).toBeGreaterThan(0);
      expect(Array.isArray(post.tags)).toBe(true);
      for (const t of post.tags) {
        expect(typeof t.tag).toBe('string');
        expect(t.tag.length).toBeGreaterThan(0);
      }
    }
  });

  it('post ids are unique', () => {
    const ids = blogPosts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('post slugs are unique', () => {
    const slugs = blogPosts.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every post.category matches a known category slug', () => {
    const categorySlugs = new Set(blogCategories.map((c) => c.slug));
    for (const post of blogPosts) {
      expect(categorySlugs.has(post.category)).toBe(true);
    }
  });

  it('at least one post is marked featured', () => {
    expect(blogPosts.some((p) => p.featured === true)).toBe(true);
  });
});

describe('getBlogPostBySlug', () => {
  it('returns the matching post when slug exists', () => {
    const post = getBlogPostBySlug('modern-web-design-trends-2026');
    expect(post).toBeDefined();
    expect(post?.slug).toBe('modern-web-design-trends-2026');
    expect(post?.id).toBe('1');
  });

  it('returns undefined for an unknown slug', () => {
    expect(getBlogPostBySlug('this-slug-does-not-exist')).toBeUndefined();
  });

  it('returns undefined for an empty slug', () => {
    expect(getBlogPostBySlug('')).toBeUndefined();
  });

  it('resolves every real slug', () => {
    for (const post of blogPosts) {
      const found = getBlogPostBySlug(post.slug);
      expect(found).toBeDefined();
      expect(found?.id).toBe(post.id);
    }
  });
});

describe('getAllBlogPosts', () => {
  it('returns all posts', () => {
    expect(getAllBlogPosts().length).toBe(blogPosts.length);
  });

  it('returns posts sorted by publishedAt descending', () => {
    const all = getAllBlogPosts();
    for (let i = 1; i < all.length; i++) {
      const prev = new Date(all[i - 1].publishedAt).getTime();
      const curr = new Date(all[i].publishedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});

describe('getFeaturedBlogPosts', () => {
  it('returns only featured posts', () => {
    const featured = getFeaturedBlogPosts();
    expect(featured.length).toBeGreaterThan(0);
    for (const post of featured) {
      expect(post.featured).toBe(true);
    }
  });

  it('returns featured posts sorted by publishedAt descending', () => {
    const featured = getFeaturedBlogPosts();
    for (let i = 1; i < featured.length; i++) {
      const prev = new Date(featured[i - 1].publishedAt).getTime();
      const curr = new Date(featured[i].publishedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('count matches the number of featured posts in the dataset', () => {
    const expected = blogPosts.filter((p) => p.featured === true).length;
    expect(getFeaturedBlogPosts().length).toBe(expected);
  });
});

describe('getBlogPostsByCategory', () => {
  it('returns posts for a category that has entries', () => {
    const designPosts = getBlogPostsByCategory('design');
    expect(designPosts.length).toBeGreaterThan(0);
    for (const post of designPosts) {
      expect(post.category).toBe('design');
    }
  });

  it('returns posts for the development category', () => {
    const devPosts = getBlogPostsByCategory('development');
    expect(devPosts.length).toBeGreaterThan(0);
    for (const post of devPosts) {
      expect(post.category).toBe('development');
    }
  });

  it('returns an empty array for an unknown category', () => {
    expect(getBlogPostsByCategory('not-a-real-category')).toEqual([]);
  });

  it('returns posts sorted by publishedAt descending', () => {
    const devPosts = getBlogPostsByCategory('development');
    for (let i = 1; i < devPosts.length; i++) {
      const prev = new Date(devPosts[i - 1].publishedAt).getTime();
      const curr = new Date(devPosts[i].publishedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});

describe('getCategoryBySlug', () => {
  it('returns the matching category when slug exists', () => {
    const cat = getCategoryBySlug('design');
    expect(cat).toBeDefined();
    expect(cat?.slug).toBe('design');
    expect(cat?.name).toBe('Design');
  });

  it('returns undefined for an unknown slug', () => {
    expect(getCategoryBySlug('nonexistent')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getCategoryBySlug('')).toBeUndefined();
  });

  it('resolves every defined category slug', () => {
    for (const cat of blogCategories) {
      const found = getCategoryBySlug(cat.slug);
      expect(found).toBeDefined();
      expect(found?.name).toBe(cat.name);
    }
  });
});

describe('getAllCategories', () => {
  it('returns all categories', () => {
    expect(getAllCategories().length).toBe(blogCategories.length);
  });

  it('returns the exact blogCategories array contents', () => {
    expect(getAllCategories()).toEqual(blogCategories);
  });
});

describe('type interfaces', () => {
  it('BlogCategory and BlogPost types accept conforming literals', () => {
    const cat: BlogCategory = {
      slug: 's',
      name: 'n',
      description: 'd',
      color: '#000000',
    };
    const post: BlogPost = {
      id: 'x',
      slug: 'y',
      title: 't',
      excerpt: 'e',
      content: 'c',
      category: 'design',
      author: 'a',
      publishedAt: '2026-01-01',
      readTime: 1,
      tags: [{ tag: 'one' }],
    };
    expect(cat.slug).toBe('s');
    expect(post.id).toBe('x');
  });
});
