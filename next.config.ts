import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Limit static generation workers to avoid exhausting Postgres connections
  experimental: {
    workerThreads: false,
    cpus: 4,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.builder.io',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'localhost',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Turbopack configuration (Next.js 16+)
  turbopack: {
    // Empty config to acknowledge we're using Turbopack
    // GLTF/GLB files will be handled by default asset handling
  },
};

export default nextConfig;
