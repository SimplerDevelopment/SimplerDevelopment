/**
 * Loading skeleton for the survey detail route segment.
 *
 * Next.js 16 App Router wraps `'use client'` pages that call
 * `useSearchParams()` at the top level in an automatic Suspense with a null
 * fallback. On a cold dev-server (CI, first access), the JS bundle takes
 * 15–30 s to compile before the client can hydrate, leaving `<main>` empty
 * for that window. This `loading.tsx` replaces the null fallback with the
 * same spinner the page itself shows while `loading === true`, so users (and
 * e2e tests) always see activity rather than a blank pane.
 *
 * The spinner matches the one inside `SurveyDetailPage`'s `if (loading)`
 * branch so the transition is seamless.
 */
export default function SurveyDetailLoading() {
  return (
    <div className="max-w-5xl mx-auto flex items-center justify-center py-20">
      <span className="material-icons text-3xl animate-spin text-primary">progress_activity</span>
    </div>
  );
}
