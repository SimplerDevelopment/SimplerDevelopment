// Builder.io configuration
export const builderConfig = {
  apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY || '',
  models: {
    solution: 'solution',
    blogPost: 'blog-post',
    page: 'page',
  },
} as const;

// Validate API key is present
if (!builderConfig.apiKey && process.env.NODE_ENV !== 'test') {
  console.warn(
    'Warning: NEXT_PUBLIC_BUILDER_API_KEY is not set. Builder.io functionality will not work.'
  );
}
