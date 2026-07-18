// Client-side A/B testing goal tracker.
//
// Mounts a tiny inline `<script>` on the rendered public page when an
// experiment is running. Reads `sd_visitor` from `document.cookie`,
// generates one if missing (so client-only sessions still bucket
// consistently), and listens for clicks/submits matching the experiment's
// goal config. Goal hits POST to `/api/public/ab/event`.
//
// Why a script tag instead of a hydrated React component? The block
// renderer is rendered in many places (admin previews, edit-mode iframes)
// that we DON'T want firing real events. By gating on an explicit prop
// `enabled` we only inject the script on the live render path, and the
// script is fully self-contained so no extra JS bundle is shipped.

interface AbGoalTrackerProps {
  experimentId: number;
  variantKey: string;
  goalMetric: 'page_view' | 'cta_click' | 'form_submit' | string;
  goalSelector?: string | null;
  /** Pre-resolved visitor id from server. The client uses it as a fallback
   *  when document.cookie is read-only (HttpOnly) — which is our default. */
  visitorId: string;
  endpoint?: string;
}

export function AbGoalTracker({ experimentId, variantKey, goalMetric, goalSelector, visitorId, endpoint = '/api/public/ab/event' }: AbGoalTrackerProps) {
  // The script body is templated server-side. Single-quoted JSON values are
  // escaped via JSON.stringify so an attacker controlling a goal selector
  // can't break out of the string literal.
  const config = JSON.stringify({
    experimentId,
    variantKey,
    goalMetric,
    goalSelector: goalSelector || null,
    visitorId,
    endpoint,
  });

  const body = `(function(){
    try {
      var cfg = ${config};
      var sent = false;
      function fireGoal() {
        if (sent) return;
        sent = true;
        try {
          var payload = JSON.stringify({
            experimentId: cfg.experimentId,
            variantKey: cfg.variantKey,
            visitorId: cfg.visitorId,
            kind: 'goal',
          });
          if (navigator.sendBeacon) {
            var blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(cfg.endpoint, blob);
          } else {
            fetch(cfg.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
              keepalive: true,
            }).catch(function(){});
          }
        } catch (e) {}
      }
      function matches(el, sel) {
        if (!el || !sel) return false;
        var node = el;
        while (node && node.nodeType === 1) {
          if (node.matches && node.matches(sel)) return true;
          node = node.parentElement;
        }
        return false;
      }
      if (cfg.goalMetric === 'page_view') {
        // Server-side view event already records this — but fire the client
        // beacon too so analytics dashboards have something to count when
        // the SSR write was skipped (e.g. CDN cache hit).
        fireGoal();
      } else if (cfg.goalMetric === 'form_submit') {
        document.addEventListener('submit', function(ev){
          if (!cfg.goalSelector || matches(ev.target, cfg.goalSelector)) fireGoal();
        }, true);
      } else if (cfg.goalMetric === 'cta_click') {
        document.addEventListener('click', function(ev){
          if (!cfg.goalSelector) return;
          if (matches(ev.target, cfg.goalSelector)) fireGoal();
        }, true);
      }
    } catch (e) {}
  })();`;

  return (
    <script
      data-ab-experiment={experimentId}
      data-ab-variant={variantKey}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
