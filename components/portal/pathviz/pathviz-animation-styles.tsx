'use client';

// Injects the Phase 5/6 keyframes once via a plain `<style>` tag — same
// "safe in RSC, no CSS-module/styled-jsx dependency" pattern already used by
// components/portal/dashboard/skeletons.tsx's WidgetSkeleton. Mounted once
// near the top of PathChartView; the classes it defines are then toggled by
// pathviz-node-types.tsx (mount/flash/shake) and pathviz-beacon-node.tsx
// (radar pulse), driven by usePathVizLiveReplay.ts's `animationHints`.
//
// Mockup-faithful timings (docs/design/path-visualizations-mockup-v3.html):
// mount ~0.55s ease-out-expo, status flash ~1s ring glow, error adds a brief
// shake, edges fade in over ~0.9s, beacon radar pulses continuously.
// Every rule is gated behind `prefers-reduced-motion: reduce`, which
// collapses everything to an instant (0.01ms) transition — same convention
// as app/globals.css's own `@media (prefers-reduced-motion: reduce)` blocks.

const CSS = `
.pv-mount {
  animation: pv-mount-in 0.55s cubic-bezier(.16,1,.3,1) both;
}
@keyframes pv-mount-in {
  0%   { opacity: 0; filter: blur(6px); transform: scale(0.92); }
  100% { opacity: 1; filter: blur(0); transform: scale(1); }
}

.pv-flash {
  animation: pv-flash-ring 1s ease-out;
}
@keyframes pv-flash-ring {
  0%   { box-shadow: 0 0 0 0 var(--nc, #22B8E6); }
  60%  { box-shadow: 0 0 0 6px color-mix(in srgb, var(--nc, #22B8E6) 35%, transparent); }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.pv-shake {
  animation: pv-flash-ring 1s ease-out, pv-shake-x 0.42s ease-in-out;
}
@keyframes pv-shake-x {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-3px); }
  40%      { transform: translateX(3px); }
  60%      { transform: translateX(-2px); }
  80%      { transform: translateX(2px); }
}

.pv-edge-fade {
  animation: pv-edge-fade-in 0.9s ease-out both;
}
@keyframes pv-edge-fade-in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

.pv-beacon-radar {
  animation: pv-radar-pulse 2.2s ease-out infinite;
}
.pv-beacon-radar.pv-beacon-radar-2 { animation-delay: 0.7s; }
.pv-beacon-radar.pv-beacon-radar-3 { animation-delay: 1.4s; }
@keyframes pv-radar-pulse {
  0%   { transform: scale(0.4); opacity: 0.55; }
  100% { transform: scale(1.8); opacity: 0; }
}

.pv-beacon-fade-in {
  animation: pv-edge-fade-in 0.3s ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .pv-mount, .pv-flash, .pv-shake, .pv-edge-fade, .pv-beacon-radar, .pv-beacon-fade-in {
    animation: none !important;
    transition: opacity 0.01ms !important;
    transform: none !important;
    filter: none !important;
  }
}
`;

export default function PathVizAnimationStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
