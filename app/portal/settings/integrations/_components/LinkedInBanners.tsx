/**
 * The LinkedIn connected / error banners, moved verbatim out of the
 * integrations page (pinned) for PUX-214. Server-safe; no state.
 */
export default function LinkedInBanners({ justConnected, errorMessage }: { justConnected: boolean; errorMessage?: string | null }) {
  return (
    <>
      {justConnected && (
        <div className="border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 rounded-xl p-4 flex items-start gap-3">
          <span className="material-icons text-base mt-0.5">check_circle</span>
          <div className="text-sm">
            LinkedIn connected. You can now schedule and publish posts directly from SimplerDevelopment.
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 rounded-xl p-4 flex items-start gap-3">
          <span className="material-icons text-base mt-0.5">error</span>
          <div className="text-sm">
            LinkedIn returned an error: <code className="font-mono">{errorMessage}</code>. Try again, or contact support if it persists.
          </div>
        </div>
      )}
    </>
  );
}
