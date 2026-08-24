import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Media served from a SimplerDevelopment site's library lives on the
    // portal's own domain / S3 bucket. Widen this to whatever host your
    // SD_API_URL serves media from before enabling next/image optimisation.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
