'use client';

/**
 * Animated mission-console for the hero — the still illustration, but with the
 * screens running a website, CRM, project board, email campaign and AI chat.
 *
 * The source was shot on a green screen (#39AF21) and is keyed to a VP9 WebM
 * with a real alpha channel, so the console sits directly on the hero ground
 * with no plate behind it. Keying notes, in case this is ever re-cut:
 *   - similarity 0.12. Lower (0.09) leaves a green fringe along the silhouette;
 *     higher (0.18+) starts eating the console itself, whose teal body is
 *     chroma-adjacent to the key.
 *   - NO despill. It looks like the right call and is not: the artwork is
 *     genuinely green-ish, so despill pulls the teal panels magenta.
 *   - the first ~24 frames are a black-to-green fade that cannot key cleanly,
 *     so the encode starts at 1.0s.
 *
 * WHY THE ALPHA PROBE: Safari plays VP9 WebM but does not composite its alpha.
 * Feature-detecting with canPlayType is therefore a trap — it reports
 * "probably", the video plays, and the user gets a bright green rectangle in
 * the hero. So instead the first decoded frame is drawn to a 1x1 canvas and its
 * corner alpha is read. Transparent → reveal the video. Anything else → leave
 * the static poster up and never show the video at all. The poster is the same
 * keyed frame, so the fallback is not a downgrade in composition, only in
 * motion.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(onChange: () => void): () => void {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false, // server: assume motion is fine, the client corrects on mount
  );
}

export default function HeroConsole({ className = '' }: { className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [alphaOk, setAlphaOk] = useState(false);
  const reduced = usePrefersReducedMotion();

  // Read the alpha of a corner pixel from the first decoded frame. Same-origin
  // asset, so the canvas is not tainted; the try/catch is for the case where a
  // browser refuses the read anyway — failing closed keeps the poster.
  useEffect(() => {
    const v = video.current;
    if (!v || reduced) return;

    const probe = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        // Sample a 24px corner block — background in every frame of the clip.
        ctx.drawImage(v, 0, 0, 24, 24, 0, 0, 1, 1);
        setAlphaOk(ctx.getImageData(0, 0, 1, 1).data[3] === 0);
      } catch {
        setAlphaOk(false);
      }
    };

    if (v.readyState >= 2) probe();
    else v.addEventListener('loadeddata', probe, { once: true });
    return () => v.removeEventListener('loadeddata', probe);
  }, [reduced]);

  // Loops continuously, but only while it is actually on screen — a hero that
  // keeps decoding video after the visitor has scrolled to the footer is just
  // burning battery. Resumes rather than rewinds on re-entry: for an ambient
  // loop, dropping back in mid-cycle reads as "still running", where a hard
  // restart draws attention to itself every time the hero scrolls back.
  useEffect(() => {
    const v = video.current;
    if (!v || !alphaOk) return;

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          // Autoplay can still be refused (low-power mode); the poster is
          // underneath, so a rejection degrades to the still rather than a gap.
          void v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [alphaOk]);

  return (
    <div className={`relative w-full max-w-[959px] self-center ${className}`}>
      {/* self-center is load-bearing: the parent is a flex row, so a stretched
          wrapper made the poster sit at the top while the absolutely-placed
          video centred itself vertically — the two drew the console at
          different heights and it ghosted. Sizing the wrapper to the poster
          makes inset-0 line the video up exactly. */}
      {/* The poster is the LCP candidate and always renders; the video fades in
          over it only once alpha is confirmed. Identical first frame, so the
          handover is invisible. */}
      <Image
        src="/retro/hero-console-poster.webp"
        alt=""
        width={1128}
        height={320}
        priority
        className="h-auto w-full object-contain"
      />
      {!reduced && (
        <video
          ref={video}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
            alphaOk ? 'opacity-100' : 'opacity-0'
          }`}
          src="/retro/hero-console.webm"
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
        />
      )}
    </div>
  );
}
