import { SimplerDevelopment } from '@simplerdevelopment/sdk';

export const sd = new SimplerDevelopment({
  siteId: Number(process.env.NEXT_PUBLIC_SITE_ID),
  apiKey: process.env.SD_API_KEY,
  baseUrl: process.env.SD_API_URL || 'https://simplerdevelopment.com',
});
