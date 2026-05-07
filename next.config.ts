import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Limit static generation workers to avoid exhausting Postgres connections
  experimental: {
    workerThreads: false,
    cpus: 4,
  },

  images: {
    remotePatterns: [
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

  // Static redirects — keep these in config, not as redirect-only page.tsx files.
  // Rendering a component that calls redirect() in Next.js 16 triggers a
  // performance.measure() warning because the RSC render aborts before the
  // end-mark is placed. Handling at the edge avoids the render entirely.
  async redirects() {
    return [
      { source: '/portal', destination: '/portal/dashboard', permanent: false },
      { source: '/portal/ai-activity', destination: '/portal/settings/ai', permanent: false },
      { source: '/portal/billing', destination: '/portal/settings/billing', permanent: false },
      { source: '/portal/invoices', destination: '/portal/settings/billing', permanent: false },
      { source: '/portal/settings', destination: '/portal/settings/profile', permanent: false },
      { source: '/portal/team', destination: '/portal/settings/team', permanent: false },
      { source: '/portal/tickets', destination: '/portal/settings/support', permanent: false },
      { source: '/portal/tools/pitch-decks', destination: '/portal/crm/proposals?tab=decks', permanent: false },
      // Public pitch-deck route renamed to /slides/. Keeps already-shared
      // /pitch-deck/<slug> URLs working on apex + every tenant host (this
      // runs before middleware, so the tenant rewrite never sees the old
      // path).
      { source: '/pitch-deck/:slug', destination: '/slides/:slug', permanent: true },
    ];
  },
};

export default nextConfig;
