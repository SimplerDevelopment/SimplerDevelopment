/**
 * Telling a QA recorder which build it is looking at.
 *
 * Bugcast records what the browser can see — clicks, console, failed requests,
 * video, narration. It cannot see which commit produced the bundle, which is the
 * first thing you want to know when reading a session back a week later.
 *
 * The contract is **standard User Timing**, not a Bugcast API: anything marked
 * with a `bugcast:` prefix is collected, and everything else on the performance
 * timeline is ignored. So this file imports nothing, ships ~200 bytes, and is
 * inert for every visitor who does not have the extension installed. There is no
 * SDK, no network call, and nothing to configure.
 *
 * `bugcast:session` is the one reserved name — session-scoped facts, merged on
 * write, which land in the recording's `session.json`. Any other `bugcast:*`
 * mark becomes a timestamped event on the recorded timeline instead.
 *
 * Route is deliberately NOT marked here: every event bugcast records already
 * carries its own `pageUrl`, so marking it again would be a second source of
 * truth for something already correct.
 */

type Detail = Record<string, unknown>;

/**
 * Instrumentation must never break the app it is instrumenting.
 *
 * `performance.mark(name, options)` is Baseline since May 2022, but this runs on
 * every visitor's first paint including whatever old WebView is in the long
 * tail, and a QA convenience is not worth an exception in the bootstrap path.
 */
function mark(name: string, detail?: Detail): void {
  try {
    performance.mark(`bugcast:${name}`, detail ? { detail } : undefined);
  } catch {
    // An engine that rejects the options object loses the annotation. Nothing
    // else about the page changes.
  }
}

/**
 * Facts about this session — merged, so later calls add keys without clobbering
 * earlier ones.
 *
 * Keep the payload small and free of anything sensitive. Bugcast caps it (depth
 * 4, 64 keys, 1024 chars per string) and runs it through the same redactor it
 * uses on response bodies, but that is best-effort heuristics and not a reason
 * to hand it a token.
 */
export const bugcastSession = (detail: Detail): void => mark('session', detail);

/** A thing that happened, timestamped onto the recorded timeline. */
export const bugcastEvent = (name: string, detail?: Detail): void => mark(name, detail);

/**
 * What we know about this build at bootstrap.
 *
 * `NEXT_PUBLIC_COMMIT_SHA` is inlined at build time by next.config.ts. It is
 * `local` on a dev machine with no git and on any build where the SHA could not
 * be determined — which is honest, and better than omitting the key and leaving
 * a reader unable to tell "no SHA" from "not instrumented".
 */
export function markBuild(): void {
  bugcastSession({
    buildSha: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'unknown',
    env: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  });
}
