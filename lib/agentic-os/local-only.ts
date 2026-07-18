// Agentic OS is a developer-only feature. It must NEVER be reachable in any
// non-development build — preview, staging, or production. The gate is a
// single, conservative check: NODE_ENV === 'development'. Next.js sets this
// automatically for `bun dev` / `next dev` and forces 'production' on every
// build output, so a preview/staging deploy cannot accidentally enable it.
//
// Use isLocalDev() in:
//   - The layout/page (return notFound() so the route doesn't exist server-side)
//   - Every API route under app/api/admin/agentic-os/** (404 short-circuit)
//   - Anywhere else that might surface the feature (e.g. sidebar nav)
export function isLocalDev(): boolean {
  return process.env.NODE_ENV === 'development';
}
